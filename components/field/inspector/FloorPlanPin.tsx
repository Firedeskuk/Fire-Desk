"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { blobUrl } from "@/lib/local/blobs";
import { useAsync } from "@/lib/useAsync";

type Props = {
  /* storage path of the floor plan image, null when the floor has none */
  floorPlanPath: string | null;
  pinX: number | null;
  pinY: number | null;
  disabled?: boolean;
  /* x and y relative to the image, 0 to 1, rounded to 3 decimals */
  onPin: (x: number, y: number) => void | Promise<void>;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/*
  Floor plan with one pin. The image comes from the blobs table (cached by
  "Download building"), so it opens with zero network. A tap stores the
  position relative to the image box.
*/
export default function FloorPlanPin({ floorPlanPath, pinX, pinY, disabled, onPin }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const plan = useAsync<string | null>(
    async () => (floorPlanPath ? blobUrl(floorPlanPath) : null),
    [floorPlanPath],
  );
  const url = plan.data;

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  function place(e: MouseEvent<HTMLDivElement>) {
    if (disabled) return;
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = round3(clamp01((e.clientX - rect.left) / rect.width));
    const y = round3(clamp01((e.clientY - rect.top) / rect.height));
    void onPin(x, y);
  }

  if (!floorPlanPath) {
    return <p className="muted">No floor plan for this floor</p>;
  }
  if (plan.loading && !url) {
    return <p className="muted">Loading floor plan</p>;
  }
  if (!url) {
    return <p className="muted">Floor plan not on this phone. Refresh the building when online.</p>;
  }

  const x = pinX === null ? null : Number(pinX);
  const y = pinY === null ? null : Number(pinY);
  const hasPin = x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y);

  return (
    <div>
      <div className="plan" onClick={place} aria-label="Floor plan, tap to place the pin">
        {/* blob URL from IndexedDB, next/image cannot optimise it */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={url} alt="Floor plan" draggable={false} />
        {hasPin ? <span className="plan-pin" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} /> : null}
      </div>
      <p className="muted small" style={{ marginTop: 6, marginBottom: 0 }}>
        {hasPin ? "Tap the plan to move the pin" : "Tap the plan to place the pin"}
      </p>
    </div>
  );
}
