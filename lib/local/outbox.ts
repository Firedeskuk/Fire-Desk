/*
  Outbox: the queue of changes waiting to go to the server.
  docs/SYNC-PROTOCOL.md section 4 and 5.

  Rows are appended by lib/local/index.ts inside the same Dexie transaction as
  the mirror write. The sync worker (lib/sync/push.ts) reads them in seq order
  and marks them done or failed. Nothing else touches this table.
*/

import Dexie from "dexie";
import type { Json, SyncEntity } from "@/lib/supabase/types";
import { db, type OutboxRow, type PhotoUploadPayload } from "./db";
import { newId } from "./session";

/*
  Change listeners. lib/sync/status.ts subscribes so the header pill can
  refresh its counts after every local write, without lib/local knowing
  anything about lib/sync. Inside a transaction the listeners fire when the
  transaction has committed, so they never read half written state.
*/
const outboxListeners = new Set<() => void>();

export function subscribeOutbox(listener: () => void): () => void {
  outboxListeners.add(listener);
  return () => {
    outboxListeners.delete(listener);
  };
}

function fireOutboxListeners(): void {
  // outside any transaction zone: a listener that reads the database must
  // never be bound to the transaction that just finished
  Dexie.ignoreTransaction(() => {
    outboxListeners.forEach((l) => {
      try {
        l();
      } catch {
        // a listener must never break a write
      }
    });
  });
}

function fireLater(): void {
  if (typeof setTimeout === "function") setTimeout(fireOutboxListeners, 0);
  else fireOutboxListeners();
}

export function notifyOutboxChanged(): void {
  const tx = Dexie.currentTransaction;
  if (tx) {
    tx.on("complete", fireLater);
  } else {
    fireLater();
  }
}

export const MAX_ATTEMPTS = 10;
export const DONE_RETENTION_DAYS = 7;

/* 5 s, 30 s, 2 min, 10 min, then every hour. attempts is the count so far. */
export function backoffMs(attempts: number): number {
  const steps = [5_000, 30_000, 120_000, 600_000];
  if (attempts <= 0) return 0;
  if (attempts <= steps.length) return steps[attempts - 1];
  return 3_600_000;
}

export type EnqueueOptions = {
  dependsOn?: string[];
  buildingId?: string | null;
  label?: string | null;
};

function baseRow(
  op: OutboxRow["op"],
  entity: SyncEntity,
  recordId: string,
  payload: OutboxRow["payload"],
  options: EnqueueOptions = {},
): OutboxRow {
  return {
    id: newId(),
    created_at: new Date().toISOString(),
    op,
    entity,
    record_id: recordId,
    payload,
    depends_on: options.dependsOn ?? [],
    status: "pending",
    attempts: 0,
    last_error: null,
    next_attempt_at: null,
    done_at: null,
    building_id: options.buildingId ?? null,
    label: options.label ?? null,
  };
}

/* Whole row upsert. Returns the outbox row id, for depends_on of later rows. */
export async function enqueueUpsert(
  entity: SyncEntity,
  recordId: string,
  payload: Record<string, Json | undefined>,
  options?: EnqueueOptions,
): Promise<string> {
  const row = baseRow("upsert", entity, recordId, payload, options);
  await db().outbox.add(row);
  notifyOutboxChanged();
  return row.id;
}

/* Only the changed fields plus updated_at. */
export async function enqueuePatch(
  entity: SyncEntity,
  recordId: string,
  fields: Record<string, Json | undefined>,
  options?: EnqueueOptions,
): Promise<string> {
  const payload = { ...fields };
  if (payload.updated_at === undefined) payload.updated_at = new Date().toISOString();
  const row = baseRow("patch", entity, recordId, payload, options);
  await db().outbox.add(row);
  notifyOutboxChanged();
  return row.id;
}

/* Upload of a compressed jpeg kept in the blobs table. */
export async function enqueuePhoto(
  entity: "finding_photos" | "remedial_photos",
  photoId: string,
  upload: Omit<PhotoUploadPayload, "bucket" | "blob_key">,
  options?: EnqueueOptions,
): Promise<string> {
  const payload: PhotoUploadPayload = {
    ...upload,
    bucket: "photos",
    blob_key: upload.storage_path,
  };
  const row = baseRow("upload_photo", entity, photoId, payload, options);
  await db().outbox.add(row);
  notifyOutboxChanged();
  return row.id;
}

/* All rows not yet done, in seq order. Includes rows that are backing off. */
export async function pending(): Promise<OutboxRow[]> {
  const rows = await db().outbox.where("status").anyOf(["pending", "sending"]).sortBy("seq");
  return rows;
}

/* Rows the worker may send now: pending, dependencies done, backoff over. */
export async function ready(now: Date = new Date()): Promise<OutboxRow[]> {
  const rows = await db().outbox.where("status").equals("pending").sortBy("seq");
  if (rows.length === 0) return [];

  const depIds = new Set<string>();
  rows.forEach((r) => r.depends_on.forEach((d) => depIds.add(d)));
  const doneIds = new Set<string>();
  if (depIds.size > 0) {
    const deps = await db().outbox.where("id").anyOf([...depIds]).toArray();
    deps.forEach((d) => {
      if (d.status === "done") doneIds.add(d.id);
    });
  }

  const nowIso = now.toISOString();
  return rows.filter((r) => {
    if (r.next_attempt_at && r.next_attempt_at > nowIso) return false;
    return r.depends_on.every((d) => doneIds.has(d));
  });
}

export async function markSending(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db().outbox.where("id").anyOf(ids).modify({ status: "sending" });
}

export async function markDone(id: string): Promise<void> {
  await db()
    .outbox.where("id")
    .equals(id)
    .modify({ status: "done", done_at: new Date().toISOString(), last_error: null });
  notifyOutboxChanged();
}

/* Back to pending with backoff, or failed after MAX_ATTEMPTS. */
export async function markFailed(id: string, error: string, now: Date = new Date()): Promise<void> {
  await db()
    .outbox.where("id")
    .equals(id)
    .modify((row) => {
      row.attempts += 1;
      row.last_error = error.slice(0, 500);
      if (row.attempts >= MAX_ATTEMPTS) {
        row.status = "failed";
        row.next_attempt_at = null;
      } else {
        row.status = "pending";
        row.next_attempt_at = new Date(now.getTime() + backoffMs(row.attempts)).toISOString();
      }
    });
  notifyOutboxChanged();
}

/* A dropped connection: rows go back to pending without counting an attempt. */
export async function releaseSending(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db().outbox.where("id").anyOf(ids).modify({ status: "pending" });
}

/* On start up, any row left in "sending" by a killed app goes back to pending. */
export async function recoverStaleSending(): Promise<number> {
  return db().outbox.where("status").equals("sending").modify({ status: "pending" });
}

export async function countPending(): Promise<number> {
  return db().outbox.where("status").anyOf(["pending", "sending"]).count();
}

export async function countPendingForBuilding(buildingId: string): Promise<number> {
  return db()
    .outbox.where("building_id")
    .equals(buildingId)
    .filter((r) => r.status === "pending" || r.status === "sending")
    .count();
}

export async function countFailed(): Promise<number> {
  return db().outbox.where("status").equals("failed").count();
}

export async function listFailed(): Promise<OutboxRow[]> {
  return db().outbox.where("status").equals("failed").sortBy("seq");
}

/* User tapped retry: failed rows get a fresh set of attempts. */
export async function retryFailed(): Promise<number> {
  const n = await db()
    .outbox.where("status")
    .equals("failed")
    .modify({ status: "pending", attempts: 0, next_attempt_at: null });
  notifyOutboxChanged();
  return n;
}

/* Done rows are kept 7 days for debugging, then purged. */
export async function purgeDone(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - DONE_RETENTION_DAYS * 86_400_000).toISOString();
  return db()
    .outbox.where("status")
    .equals("done")
    .filter((r) => (r.done_at ?? r.created_at) < cutoff)
    .delete();
}

export async function getOutboxRow(id: string): Promise<OutboxRow | undefined> {
  return db().outbox.where("id").equals(id).first();
}

/* A row that can never succeed (for example the photo file is gone): failed at once. */
export async function failNow(id: string, error: string): Promise<void> {
  await db()
    .outbox.where("id")
    .equals(id)
    .modify({ status: "failed", attempts: MAX_ATTEMPTS, last_error: error.slice(0, 500), next_attempt_at: null });
  notifyOutboxChanged();
}
