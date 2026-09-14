"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useFieldParams } from "@/lib/useFieldParams";
import FieldHeader from "@/components/field/FieldHeader";
import PhotoThumbs from "@/components/field/remedial/PhotoThumbs";
import RemedialStatusPill from "@/components/field/remedial/RemedialStatusPill";
import { describePlace, workLabel } from "@/components/field/remedial/remedialStatus";
import type { Asset, Floor, RemedialItem, RemedialPhoto } from "@/lib/supabase/types";
import { get, list, patch, putPhoto } from "@/lib/local";
import { getCurrentUserId, getDeviceId, newId } from "@/lib/local/session";
import { compressPhoto } from "@/lib/photos/compress";
import { syncNow } from "@/lib/sync";
import { formatDateTime } from "@/lib/due";
import { useAsync } from "@/lib/useAsync";

type Loaded = {
  item: RemedialItem | null;
  asset: Asset | null;
  floor: Floor | null;
  photos: RemedialPhoto[];
};

async function load(itemId: string): Promise<Loaded> {
  const item = await get("remedial_items", itemId);
  if (!item) return { item: null, asset: null, floor: null, photos: [] };
  const [asset, photos] = await Promise.all([
    item.asset_id ? get("assets", item.asset_id) : Promise.resolve(undefined),
    list("remedial_photos", { remedial_item_id: itemId }),
  ]);
  const floorId = item.floor_id ?? asset?.floor_id ?? null;
  const floor = floorId ? await get("floors", floorId) : undefined;
  return { item, asset: asset ?? null, floor: floor ?? null, photos };
}

/*
  /works/[buildingId]/items/[itemId]: one work item. Start, Photo after and
  Mark done. Every write goes through lib/local (mirror row plus outbox row
  in one transaction) and works with zero network. Ids come from the real URL
  (useFieldParams), so the offline shell /works/_/items/_ still shows the
  right item. Writes take the building id from the item row, never from the
  URL, so the storage path and the outbox building are always right. Mark
  done needs at least one photo after (CLAUDE.md section 7).
*/
export default function WorkItemPage() {
  const { buildingId, itemId } = useFieldParams<{ buildingId: string; itemId: string }>();
  const state = useAsync(() => load(itemId), [itemId]);
  const [busy, setBusy] = useState<"start" | "photo" | "done" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const data = state.data;
  const item = data?.item ?? null;
  const asset = data?.asset ?? null;
  const floor = data?.floor ?? null;
  const photos = data?.photos ?? [];
  const label = item ? workLabel(asset, item) : "Work item";

  async function start() {
    if (!item) return;
    setBusy("start");
    setError(null);
    setNotice(null);
    try {
      await patch("remedial_items", item.id, { status: "in_progress" }, { buildingId: item.building_id, label });
      state.reload();
      void syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the item");
    } finally {
      setBusy(null);
    }
  }

  async function markDone() {
    if (!item || photos.length === 0) return;
    setBusy("done");
    setError(null);
    setNotice(null);
    try {
      const now = new Date().toISOString();
      await patch(
        "remedial_items",
        item.id,
        { status: "done", done_by: getCurrentUserId(), done_at: now },
        { buildingId: item.building_id, label },
      );
      state.reload();
      setNotice("Marked done. It will be sent on the next sync.");
      void syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark the item done");
    } finally {
      setBusy(null);
    }
  }

  function pickPhoto() {
    fileInput.current?.click();
  }

  async function onPhotoPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !item) return;
    setBusy("photo");
    setError(null);
    setNotice(null);
    try {
      const compressed = await compressPhoto(file);
      const photoId = newId();
      const now = new Date().toISOString();
      const row: RemedialPhoto = {
        id: photoId,
        remedial_item_id: item.id,
        kind: "after",
        storage_path: `photos/${item.building_id}/${item.id}/${photoId}.jpg`,
        width: compressed.width || null,
        height: compressed.height || null,
        bytes: compressed.bytes,
        taken_at: now,
        uploaded_at: null,
        created_by: getCurrentUserId(),
        device_id: getDeviceId(),
        created_at: now,
        updated_at: now,
        deleted_at: null,
        received_at: null,
      };
      await putPhoto("remedial_photos", row, compressed.blob, item.building_id, { label });
      state.reload();
      void syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the photo");
    } finally {
      setBusy(null);
    }
  }

  const place = describePlace(asset, floor, null);
  const isDone = item?.status === "done";
  const canStart = item?.status === "todo";
  const canMarkDone = item ? item.status === "todo" || item.status === "in_progress" : false;

  return (
    <>
      <FieldHeader title="Work item" back={`/works/${buildingId}`} />
      <main className="page-narrow">
        {state.loading && !data ? <p className="muted">Loading</p> : null}
        {state.error ? <p className="error">{state.error}</p> : null}
        {data && !item ? (
          <section className="card">
            <p className="muted">This work item is not on this phone. Refresh the building while online.</p>
          </section>
        ) : null}

        {item ? (
          <>
            <section className="card stack" aria-label="Work item">
              <div className="row" style={{ borderBottom: "none", padding: 0 }}>
                <div className="row-main">
                  <h2>{item.description}</h2>
                </div>
                <RemedialStatusPill status={item.status} />
              </div>
              {item.detail ? (
                <div>
                  <div className="label">Detail</div>
                  <div>{item.detail}</div>
                </div>
              ) : null}
              {asset ? (
                <div>
                  <div className="label">{asset.work_type === "doors" ? "Door" : "Penetration"}</div>
                  <div>{place}</div>
                </div>
              ) : floor ? (
                <div>
                  <div className="label">Floor</div>
                  <div>{floor.name}</div>
                </div>
              ) : null}
              {isDone && item.done_at ? (
                <div>
                  <div className="label">Done</div>
                  <div>{formatDateTime(item.done_at)}</div>
                </div>
              ) : null}
            </section>

            <section className="card stack" aria-label="Photos after">
              <div className="card-title">Photos after</div>
              {photos.length > 0 ? (
                <PhotoThumbs photos={photos} />
              ) : (
                <p className="muted">No photo after yet.</p>
              )}
            </section>

            <section className="card stack" aria-label="Actions">
              <input
                ref={fileInput}
                className="sr-only"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPhotoPicked}
                tabIndex={-1}
                aria-hidden="true"
              />
              <div className="btn-row">
                {canStart ? (
                  <button type="button" className="btn" onClick={start} disabled={busy !== null}>
                    {busy === "start" ? "Starting" : "Start"}
                  </button>
                ) : null}
                <button type="button" className="btn" onClick={pickPhoto} disabled={busy !== null}>
                  {busy === "photo" ? "Saving photo" : "Photo after"}
                </button>
                {canMarkDone ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={markDone}
                    disabled={busy !== null || photos.length === 0}
                  >
                    {busy === "done" ? "Saving" : "Mark done"}
                  </button>
                ) : null}
              </div>
              {canMarkDone && photos.length === 0 ? (
                <p className="muted small">Add a photo after before marking done</p>
              ) : null}
              {notice ? <p className="notice">{notice}</p> : null}
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : null}
            </section>
          </>
        ) : null}
      </main>
    </>
  );
}
