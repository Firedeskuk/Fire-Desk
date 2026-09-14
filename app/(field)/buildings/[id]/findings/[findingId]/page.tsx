"use client";

import { useState, type FocusEvent } from "react";
import Link from "next/link";
import FieldHeader from "@/components/field/FieldHeader";
import FloorPlanPin from "@/components/field/inspector/FloorPlanPin";
import PhotoCapture from "@/components/field/inspector/PhotoCapture";
import PhotoThumbs from "@/components/field/inspector/PhotoThumbs";
import PillButton from "@/components/field/inspector/PillButton";
import { get, list, patch, putPhoto, type Row } from "@/lib/local";
import { getCurrentUserId, getDeviceId, newId } from "@/lib/local/session";
import { compressPhoto } from "@/lib/photos/compress";
import { useAsync } from "@/lib/useAsync";
import { useFieldParams } from "@/lib/useFieldParams";
import {
  assetHref,
  assetLabel,
  assetNoun,
  buildingHref,
  severityLabel,
  severityTone,
  type AssetRow,
  type FindingPhotoRow,
  type FindingRow,
  type Severity,
} from "@/components/field/inspector/inspection";

const SEVERITIES: Severity[] = ["low", "medium", "high"];

type Loaded = {
  finding: FindingRow | undefined;
  asset: AssetRow | undefined;
  floor: Row<"floors"> | undefined;
  photos: FindingPhotoRow[];
};

/*
  /buildings/[id]/findings/[findingId]: one finding. Description, severity,
  photos before, and the pin on the floor plan. Every change is a patch or a
  photo through lib/local, so the finding is safe even when a photo fails.
*/
export default function FindingPage() {
  const { id, findingId } = useFieldParams<{ id: string; findingId: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = useAsync<Loaded>(async () => {
    const finding = await get("findings", findingId);
    if (!finding) return { finding, asset: undefined, floor: undefined, photos: [] };
    const asset = await get("assets", finding.asset_id);
    const floorId = finding.floor_id ?? asset?.floor_id ?? null;
    const [floor, photoRows] = await Promise.all([
      floorId ? get("floors", floorId) : Promise.resolve(undefined),
      list("finding_photos", { finding_id: finding.id }),
    ]);
    const photos = [...photoRows].sort((a, b) =>
      (a.taken_at ?? a.created_at).localeCompare(b.taken_at ?? b.created_at),
    );
    return { finding, asset, floor, photos };
  }, [id, findingId]);

  const loaded = data.data;
  const finding = loaded?.finding;
  const asset = loaded?.asset;
  const label = asset ? assetLabel(asset) : "Finding";
  const back = asset ? assetHref(id, asset.id) : buildingHref(id);

  /* Runs one write, reloads the screen, shows a readable error when it fails. */
  async function run(work: () => Promise<unknown>, failText: string) {
    setBusy(true);
    setError(null);
    try {
      await work();
      data.reload();
    } catch (err) {
      setError(`${failText}: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  function saveDescription(e: FocusEvent<HTMLTextAreaElement>) {
    if (!finding) return;
    const next = e.currentTarget.value.trim();
    if (!next) {
      setError("The description cannot be empty.");
      return;
    }
    if (next === finding.description) return;
    void run(
      () => patch("findings", finding.id, { description: next }, { buildingId: finding.building_id, label }),
      "Description not saved",
    );
  }

  function setSeverity(severity: Severity) {
    if (!finding || finding.severity === severity) return;
    void run(
      () => patch("findings", finding.id, { severity }, { buildingId: finding.building_id, label }),
      "Severity not saved",
    );
  }

  function setPin(x: number, y: number) {
    if (!finding) return;
    void run(
      () => patch("findings", finding.id, { pin_x: x, pin_y: y }, { buildingId: finding.building_id, label }),
      "Pin not saved",
    );
  }

  async function addPhoto(file: File) {
    if (!finding) return;
    await run(async () => {
      const compressed = await compressPhoto(file);
      const now = new Date().toISOString();
      const userId = getCurrentUserId();
      const photoId = newId();
      await putPhoto(
        "finding_photos",
        {
          id: photoId,
          finding_id: finding.id,
          kind: "before",
          storage_path: `photos/${finding.building_id}/${finding.id}/${photoId}.jpg`,
          width: compressed.width || null,
          height: compressed.height || null,
          bytes: compressed.bytes,
          taken_at: now,
          uploaded_at: null,
          created_by: userId,
          device_id: getDeviceId(),
          created_at: now,
          updated_at: now,
          deleted_at: null,
          received_at: null,
        },
        compressed.blob,
        finding.building_id,
        { label },
      );
    }, "Photo not saved, the finding itself is saved");
  }

  if (!loaded) {
    return (
      <>
        <FieldHeader title={`Finding, ${label}`} back={back} />
        <main className="page-narrow stack">
          {data.error ? <p className="error">{data.error}</p> : <p className="muted">Loading</p>}
        </main>
      </>
    );
  }

  if (!finding) {
    return (
      <>
        <FieldHeader title="Finding" back={back} />
        <main className="page-narrow stack">
          <section className="card stack">
            <p className="muted">This finding is not on this phone.</p>
            <Link className="btn btn-block" href={buildingHref(id)}>
              Back to building
            </Link>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <FieldHeader title={`Finding, ${label}`} back={back} />
      <main className="page-narrow stack">
        <section className="card" aria-label="Finding">
          {finding.status === "cancelled" ? (
            <p className="notice">This finding was cancelled because the answer was changed.</p>
          ) : null}
          <label className="field">
            <span className="label">Description</span>
            <textarea
              key={`${finding.id}:${finding.description}`}
              className="textarea"
              defaultValue={finding.description}
              disabled={busy}
              onBlur={saveDescription}
            />
          </label>
          <div className="label">Severity</div>
          <div className="answers">
            {SEVERITIES.map((s) => (
              <PillButton
                key={s}
                tone={severityTone(s)}
                pressed={finding.severity === s}
                disabled={busy}
                onClick={() => setSeverity(s)}
              >
                {severityLabel(s)}
              </PillButton>
            ))}
          </div>
        </section>

        <section className="card stack" aria-label="Photos">
          <div className="card-title">Photos before</div>
          <PhotoThumbs photos={loaded.photos} />
          <PhotoCapture onFile={addPhoto} disabled={busy} label={busy ? "Saving" : "Take photo"} />
        </section>

        <section className="card stack" aria-label="Floor plan">
          <div className="card-title">Floor plan</div>
          <FloorPlanPin
            floorPlanPath={loaded.floor?.floor_plan_path ?? null}
            pinX={finding.pin_x}
            pinY={finding.pin_y}
            disabled={busy}
            onPin={setPin}
          />
        </section>

        {error ? <p className="error">{error}</p> : null}

        <Link className="btn btn-primary btn-block" href={back}>
          {asset ? `Back to ${assetNoun(asset)}` : "Back to building"}
        </Link>
      </main>
    </>
  );
}
