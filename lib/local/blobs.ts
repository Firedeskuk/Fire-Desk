/*
  Photo binaries and cached floor plan images, keyed by storage path.
  A photo blob is released after the server confirmed both the file and the
  row (docs/SYNC-PROTOCOL.md section 5, point 5). Floor plan blobs stay until
  the building is removed from the phone.
*/

import { db, type BlobRow } from "./db";

export async function putBlob(
  path: string,
  blob: Blob,
  kind: BlobRow["kind"],
  contentType?: string,
): Promise<void> {
  await db().blobs.put({
    path,
    blob,
    bytes: blob.size,
    content_type: contentType ?? blob.type ?? "application/octet-stream",
    kind,
    created_at: new Date().toISOString(),
  });
}

export async function getBlob(path: string): Promise<Blob | undefined> {
  const row = await db().blobs.get(path);
  return row?.blob;
}

export async function hasBlob(path: string): Promise<boolean> {
  return (await db().blobs.where("path").equals(path).count()) > 0;
}

/* Called after a confirmed upload. Safe to call twice. */
export async function release(path: string): Promise<void> {
  await db().blobs.delete(path);
}

export async function releaseMany(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await db().blobs.bulkDelete(paths);
}

/* Bytes held in the blobs table, split by kind. */
export async function blobUsage(): Promise<{ photos: number; floorplans: number; total: number }> {
  let photos = 0;
  let floorplans = 0;
  await db().blobs.each((row) => {
    if (row.kind === "photo") photos += row.bytes;
    else floorplans += row.bytes;
  });
  return { photos, floorplans, total: photos + floorplans };
}

/* Object URL for an <img>. Caller revokes it when done. */
export async function blobUrl(path: string): Promise<string | null> {
  const blob = await getBlob(path);
  if (!blob) return null;
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  return URL.createObjectURL(blob);
}
