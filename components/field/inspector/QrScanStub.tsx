"use client";

import { useEffect, useRef, useState } from "react";

/*
  "Scan QR" stub. Opens the back camera in a small panel so the flow can be
  tried on a phone. Decoding comes in a later step, no QR library tonight.
  Tracks are stopped on Close and when the screen unmounts.
*/
export default function QrScanStub() {
  const [open, setOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  async function start() {
    setError(null);
    setOpen(true);
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("This browser cannot open the camera.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setStream(s);
    } catch (err) {
      setError(describeCameraError(err));
    }
  }

  function close() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setOpen(false);
  }

  return (
    <>
      <button type="button" className="btn" onClick={start}>
        Scan QR
      </button>
      {open ? (
        <div className="sync-panel" role="dialog" aria-label="Scan QR">
          <div className="card stack">
            <div className="card-title">Scan QR</div>
            {stream ? (
              <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", borderRadius: 10 }} />
            ) : null}
            {!stream && !error ? <p className="muted">Starting the camera</p> : null}
            {error ? <p className="error">{error}</p> : null}
            <p className="muted">QR decoding comes in a later step</p>
            <button type="button" className="btn btn-block" onClick={close}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function describeCameraError(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was refused. Allow the camera for this site and try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No back camera was found on this device.";
  }
  if (name === "NotReadableError") {
    return "The camera is in use by another app.";
  }
  return err instanceof Error && err.message ? err.message : "The camera could not be opened.";
}
