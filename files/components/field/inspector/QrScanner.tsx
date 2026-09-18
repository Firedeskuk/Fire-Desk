"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { describeCameraError, openBackCamera, scanFrames, stopCamera } from "@/lib/qr/decode";

/* scan: decoded from the camera, the exact qr_code value. typed: the door number. */
export type ScanSource = "scan" | "typed";

type Props = {
  /*
    Called with the decoded or typed value. Resolves to a message when the
    value led nowhere (shown here, the user carries on), or to null when the
    screen moves on and this scanner is closed by its owner.
  */
  onScan: (value: string, source: ScanSource) => Promise<string | null>;
  onClose: () => void;
};

/* camera: full screen video with the frame loop, typing: the door number input */
type Mode = "camera" | "typing";

/* camera path only */
type Phase = "starting" | "scanning" | "checking";

/* pause after a value led nowhere, so the same label is not looked up 10 times a second */
const RESUME_MS = 2000;

export const CAMERA_FALLBACK_MESSAGE = "Camera not available. Type the door code instead.";
export const TYPE_MESSAGE = "Type the door number printed under the QR.";

/*
  Full screen camera view with a square viewfinder, a "Type the door number"
  button and a 48 px Close button. The frame loop lives in lib/qr/decode.ts.
  Typing is the same screen without the video: a text input and a Find
  button that go through the same onScan path, plus "Use the camera" to go
  back when the camera works. Typing is also where the screen lands when the
  camera is refused or missing. The camera is stopped while typing, on
  Close and on unmount.
*/
export default function QrScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const [mode, setMode] = useState<Mode>("camera");
  const [phase, setPhase] = useState<Phase>("starting");
  /* null until the first camera attempt settled, then whether "Use the camera" makes sense */
  const [cameraWorks, setCameraWorks] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  /* bumps to restart the frame loop after a value led nowhere */
  const [round, setRound] = useState(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  /* camera: open while in camera mode, stopped when typing and on unmount */
  useEffect(() => {
    if (mode !== "camera") return undefined;
    const video = videoRef.current;
    let cancelled = false;
    if (!video) {
      queueMicrotask(() => {
        if (cancelled) return;
        setMessage(CAMERA_FALLBACK_MESSAGE);
        setCameraWorks(false);
        setMode("typing");
      });
      return () => {
        cancelled = true;
      };
    }
    openBackCamera(video)
      .then((stream) => {
        if (cancelled) {
          // the user left camera mode while the camera was opening
          stream.getTracks().forEach((track) => track.stop());
          if (video.srcObject === stream) video.srcObject = null;
          return;
        }
        setCameraWorks(true);
        setPhase("scanning");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const problem = describeCameraError(err);
        setMessage(
          problem.problem === "unsupported" ? CAMERA_FALLBACK_MESSAGE : `${problem.message} ${CAMERA_FALLBACK_MESSAGE}`,
        );
        setCameraWorks(false);
        setMode("typing");
      });
    return () => {
      cancelled = true;
      stopCamera(video);
    };
  }, [mode]);

  /* frame loop: runs while the camera is scanning, restarted per round */
  useEffect(() => {
    if (mode !== "camera" || phase !== "scanning") return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    let alive = true;
    let resume: ReturnType<typeof setTimeout> | null = null;
    let stop: () => void;
    try {
      stop = scanFrames(video, (value) => {
        if (!alive) return;
        setPhase("checking");
        onScanRef
          .current(value, "scan")
          .then((result) => {
            if (!alive || result === null) return;
            setMessage(result);
            resume = setTimeout(() => {
              if (!alive) return;
              setRound((r) => r + 1);
              setPhase("scanning");
            }, RESUME_MS);
          })
          .catch((err: unknown) => {
            if (!alive) return;
            setMessage(err instanceof Error ? err.message : "The code could not be checked.");
            setMode("typing");
          });
      });
    } catch (err) {
      const problem = describeCameraError(err);
      queueMicrotask(() => {
        if (!alive) return;
        setMessage(`${problem.message} ${CAMERA_FALLBACK_MESSAGE}`);
        setCameraWorks(false);
        setMode("typing");
      });
      return () => {
        alive = false;
      };
    }
    return () => {
      alive = false;
      stop();
      if (resume !== null) clearTimeout(resume);
    };
  }, [mode, phase, round]);

  function switchToTyping() {
    setMessage(TYPE_MESSAGE);
    setPhase("starting");
    setMode("typing");
  }

  function switchToCamera() {
    setMessage(null);
    setPhase("starting");
    setMode("camera");
  }

  /* the typed door number goes through the same onScan path */
  async function find(e: FormEvent) {
    e.preventDefault();
    const value = typed.trim();
    if (!value) {
      setMessage(TYPE_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const result = await onScanRef.current(value, "typed");
      if (result !== null) setMessage(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "The door number could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  const cameraText =
    phase === "starting" ? "Starting the camera" : phase === "checking" ? "Checking" : (message ?? "Point the camera at the label");

  return (
    <div className="scanner" role="dialog" aria-label="Scan QR">
      <video ref={videoRef} className="scanner-video" autoPlay playsInline muted hidden={mode === "typing"} />
      {mode === "typing" ? (
        <div className="scanner-fallback">
          <form className="card stack" onSubmit={find} noValidate>
            <div className="card-title">Scan QR</div>
            <p className="scanner-fallback-text">{message ?? TYPE_MESSAGE}</p>
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="GF-01"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              aria-label="Door number"
              disabled={busy}
            />
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Checking" : "Find"}
            </button>
            {cameraWorks ? (
              <button type="button" className="btn btn-block" onClick={switchToCamera} disabled={busy}>
                Use the camera
              </button>
            ) : null}
            <button type="button" className="btn btn-block" onClick={onClose}>
              Close
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="scanner-frame" aria-hidden="true" />
          <div className="scanner-bottom">
            <p className="scanner-message">{cameraText}</p>
            <button type="button" className="btn btn-block" onClick={switchToTyping}>
              Type the door number
            </button>
            <button type="button" className="btn btn-block" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}
