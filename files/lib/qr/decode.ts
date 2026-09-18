/*
  QR decoding for the field scanner. A thin wrapper around jsqr (pure
  JavaScript, works offline, no WASM, no network), plus the camera helpers
  and the frame loop that the scanner component drives. No React in this
  file, so the loop can be unit tested with fake video and canvas objects.

  The loop draws the current video frame on an offscreen canvas at most 10
  times a second. The next frame is scheduled only after the previous one
  was decoded, so a slow phone never queues work. Frames are scaled down to
  a long edge of MAX_FRAME_EDGE pixels before decoding, which is plenty for a
  50 mm label at arm's length and keeps jsqr fast.
*/

import jsQR from "jsqr";

/* At most 10 frames a second. */
export const MIN_INTERVAL_MS = 100;

/* Long edge of the frame handed to jsqr. */
export const MAX_FRAME_EDGE = 800;

/* HTMLMediaElement.HAVE_CURRENT_DATA: at least one frame is available. */
const HAVE_CURRENT_DATA = 2;

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/* Decode one frame of RGBA pixels. The QR text, trimmed, or null. */
export function decodeImageData(data: Uint8ClampedArray, width: number, height: number): string | null {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return null;
  const found = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
  const value = found ? found.data.trim() : "";
  return value.length > 0 ? value : null;
}

/* The parts of a video element the loop reads, so tests can pass a fake. */
export type FrameSource = {
  readonly readyState: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
};

/* The parts of a canvas and its 2d context the loop uses. */
export type FrameCanvas = {
  width: number;
  height: number;
};

export type FrameContext<S> = {
  drawImage(source: S, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray };
};

/* Size of the decode canvas for a video of the given size. */
export function frameSize(videoWidth: number, videoHeight: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(videoWidth, videoHeight));
  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  };
}

/*
  Draw the current frame of the video on the canvas and decode it. Null when
  the video has no frame yet or no QR code is in view.
*/
export function decodeFrame<S extends FrameSource>(
  video: S,
  canvas: FrameCanvas,
  context: FrameContext<S>,
): string | null {
  if (video.readyState < HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) return null;
  const { width, height } = frameSize(video.videoWidth, video.videoHeight);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  context.drawImage(video, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  return decodeImageData(image.data, width, height);
}

export type ScanOptions<S> = {
  /* milliseconds between frames, never below MIN_INTERVAL_MS */
  intervalMs?: number;
  /* canvas and context to draw on, created from the document when missing */
  canvas?: FrameCanvas;
  context?: FrameContext<S>;
};

/*
  Watch the video and call onDecoded with the first QR value seen. Returns a
  function that stops the loop. The loop stops itself after the first value.
  Throws when the browser has no 2d canvas, the caller then falls back to
  typing the code.
*/
export function scanFrames<S extends FrameSource>(
  video: S,
  onDecoded: (value: string) => void,
  options: ScanOptions<S> = {},
): () => void {
  const intervalMs = Math.max(MIN_INTERVAL_MS, options.intervalMs ?? MIN_INTERVAL_MS);
  let canvas = options.canvas;
  let context = options.context;
  if (!canvas || !context) {
    const element = document.createElement("canvas");
    const ctx = element.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("This browser cannot read camera frames.");
    canvas = element;
    context = ctx as unknown as FrameContext<S>;
  }
  const drawCanvas = canvas;
  const drawContext = context;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = () => {
    timer = null;
    if (stopped) return;
    let value: string | null = null;
    try {
      value = decodeFrame(video, drawCanvas, drawContext);
    } catch {
      // drawImage throws while the stream is still starting, try the next frame
      value = null;
    }
    if (stopped) return;
    if (value !== null) {
      stopped = true;
      onDecoded(value);
      return;
    }
    timer = setTimeout(tick, intervalMs);
  };

  timer = setTimeout(tick, intervalMs);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export type CameraProblem = "unsupported" | "refused" | "missing" | "busy" | "failed";

export class CameraError extends Error {
  readonly problem: CameraProblem;

  constructor(problem: CameraProblem, message: string) {
    super(message);
    this.name = "CameraError";
    this.problem = problem;
  }
}

export function cameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices) &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export function describeCameraError(err: unknown): CameraError {
  if (err instanceof CameraError) return err;
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new CameraError("refused", "Camera permission was refused.");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new CameraError("missing", "No back camera was found on this device.");
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return new CameraError("busy", "The camera is in use by another app.");
  }
  const message = err instanceof Error && err.message ? err.message : "The camera could not be opened.";
  return new CameraError("failed", message);
}

/*
  Open the back camera into the video element and start playing. Rejects
  with a CameraError when the browser has no camera API, the permission was
  refused or no camera was found.
*/
export async function openBackCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!cameraSupported()) {
    throw new CameraError("unsupported", "This browser cannot open the camera.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (err) {
    throw describeCameraError(err);
  }
  video.srcObject = stream;
  video.muted = true;
  video.setAttribute("playsinline", "true");
  try {
    await video.play();
  } catch {
    // autoplay refused, the frames still arrive once the element is on screen
  }
  return stream;
}

/* Stop every track of the stream on the video element and detach it. */
export function stopCamera(video: HTMLVideoElement | null): void {
  if (!video) return;
  const source = video.srcObject;
  if (source && typeof source === "object" && "getTracks" in source) {
    (source as MediaStream).getTracks().forEach((track) => track.stop());
  }
  video.srcObject = null;
}
