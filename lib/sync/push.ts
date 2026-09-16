/*
  The sync worker. docs/SYNC-PROTOCOL.md section 5 and 7.

  One worker at a time (Web Lock "firedesk-sync"). Takes ready outbox rows in
  seq order, batches upsert and patch rows (max 50) into RPC sync_push,
  uploads photos one at a time to bucket "photos", marks rows done or failed
  with backoff, refreshes the Supabase session before sending.

  The Supabase client is injected so the worker can be tested with a fake.
*/

import type { Json, SyncEntity, SyncPushChange, SyncPushResult } from "@/lib/supabase/types";
import type { OutboxRow, PhotoUploadPayload } from "@/lib/local/db";
import {
  failNow,
  markDone,
  markFailed,
  markSending,
  purgeDone,
  ready,
  recoverStaleSending,
  releaseSending,
} from "@/lib/local/outbox";
import { getBlob, release } from "@/lib/local/blobs";
import { markSynced } from "@/lib/local";
import { refreshSyncCounts, setSyncStatus } from "./status";

export const BATCH_SIZE = 50;
export const LOCK_NAME = "firedesk-sync";

/* The slice of the Supabase client the worker needs. SupabaseClient satisfies it. */
export type SyncClient = {
  auth: {
    refreshSession: () => Promise<{ error: { message: string } | null }>;
  };
  rpc: (
    fn: "sync_push",
    args: { p_changes: Json },
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Blob,
        options?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: { message: string; statusCode?: string | number } | null }>;
    };
  };
};

export type SyncRunResult = {
  ran: boolean;
  reason?: "offline" | "locked" | "auth" | "connection" | "no-client";
  sent: number;
  failed: number;
};

export type RunSyncOptions = {
  client?: SyncClient;
  now?: () => Date;
};

let defaultClientFactory: (() => SyncClient | null) | null = null;

/* lib/sync/triggers.ts sets this once, so push.ts itself never imports supabase-js. */
export function setSyncClientFactory(factory: () => SyncClient | null): void {
  defaultClientFactory = factory;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function looksLikeNetworkError(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("load failed") ||
    m.includes("fetch failed") ||
    m.includes("econnreset") ||
    m.includes("timed out") ||
    m.includes("timeout")
  );
}

export function looksLikeAuthError(message: string | undefined | null, code?: string | null): boolean {
  if (code === "PGRST301" || code === "42501" || code === "401") return true;
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("jwt") ||
    m.includes("not signed in") ||
    m.includes("session missing") ||
    m.includes("refresh token") ||
    m.includes("invalid token") ||
    m.includes("unauthorized")
  );
}

// ---------------------------------------------------------------------------
// Lock
// ---------------------------------------------------------------------------

let memoryLock = false;

async function withSyncLock<R>(fn: () => Promise<R>): Promise<R | null> {
  if (typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function") {
    return navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) return null;
      return fn();
    });
  }
  if (memoryLock) return null;
  memoryLock = true;
  try {
    return await fn();
  } finally {
    memoryLock = false;
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

function toChange(row: OutboxRow, nowIso: string): SyncPushChange {
  const payload = { ...(row.payload as Record<string, Json | undefined>) };
  // a photo row travels after its upload, so uploaded_at can be filled in now
  if (
    row.op === "upsert" &&
    (row.entity === "finding_photos" || row.entity === "remedial_photos") &&
    !payload.uploaded_at
  ) {
    payload.uploaded_at = nowIso;
  }
  return {
    id: row.id,
    op: row.op as "upsert" | "patch",
    entity: row.entity,
    record_id: row.record_id,
    payload,
  };
}

async function afterRowDone(row: OutboxRow): Promise<void> {
  await markDone(row.id);
  await markSynced(row.entity as SyncEntity, row.record_id);
  if (row.op === "upsert" && (row.entity === "finding_photos" || row.entity === "remedial_photos")) {
    const path = (row.payload as Record<string, Json | undefined>).storage_path;
    if (typeof path === "string") await release(path);
  }
}

type StepOutcome = "continue" | "stop-connection" | "stop-auth";

async function sendBatch(
  client: SyncClient,
  rows: OutboxRow[],
  now: () => Date,
  counters: { sent: number; failed: number },
): Promise<StepOutcome> {
  const ids = rows.map((r) => r.id);
  await markSending(ids);

  const changes = rows.map((r) => toChange(r, now().toISOString()));
  let data: unknown;
  let error: { message: string; code?: string } | null = null;
  try {
    const res = await client.rpc("sync_push", { p_changes: changes as unknown as Json });
    data = res.data;
    error = res.error;
  } catch (err) {
    error = { message: err instanceof Error ? err.message : String(err) };
  }

  if (error) {
    if (looksLikeNetworkError(error.message) || !isOnline()) {
      await releaseSending(ids);
      return "stop-connection";
    }
    if (looksLikeAuthError(error.message, error.code)) {
      await releaseSending(ids);
      return "stop-auth";
    }
    for (const id of ids) await markFailed(id, error.message, now());
    counters.failed += ids.length;
    return "continue";
  }

  const results = Array.isArray(data) ? (data as SyncPushResult[]) : [];
  const byId = new Map(results.map((r) => [r.id, r]));
  for (const row of rows) {
    const r = byId.get(row.id);
    if (r && (r.status === "ok" || r.status === "ignored_older")) {
      await afterRowDone(row);
      counters.sent += 1;
    } else {
      const message = r?.message || (r ? `server returned ${r.status}` : "no result from server for this row");
      await markFailed(row.id, message, now());
      counters.failed += 1;
    }
  }
  return "continue";
}

async function sendPhoto(
  client: SyncClient,
  row: OutboxRow,
  now: () => Date,
  counters: { sent: number; failed: number },
): Promise<StepOutcome> {
  const payload = row.payload as PhotoUploadPayload;
  const blob = await getBlob(payload.blob_key);
  if (!blob) {
    await failNow(row.id, "Photo file is no longer on this device");
    counters.failed += 1;
    return "continue";
  }

  await markSending([row.id]);
  let error: { message: string; statusCode?: string | number } | null = null;
  try {
    const res = await client.storage.from(payload.bucket).upload(payload.storage_path, blob, {
      contentType: payload.content_type || "image/jpeg",
      upsert: true,
    });
    error = res.error;
  } catch (err) {
    error = { message: err instanceof Error ? err.message : String(err) };
  }

  if (error) {
    const alreadyThere =
      String(error.statusCode ?? "") === "409" || error.message.toLowerCase().includes("already exists");
    if (alreadyThere) {
      await markDone(row.id);
      counters.sent += 1;
      return "continue";
    }
    if (looksLikeNetworkError(error.message) || !isOnline()) {
      await releaseSending([row.id]);
      return "stop-connection";
    }
    if (looksLikeAuthError(error.message, String(error.statusCode ?? ""))) {
      await releaseSending([row.id]);
      return "stop-auth";
    }
    await markFailed(row.id, error.message, now());
    counters.failed += 1;
    return "continue";
  }

  await markDone(row.id);
  counters.sent += 1;
  return "continue";
}

/*
  One sync run. Returns without doing anything when offline or when another
  tab holds the lock. Never throws: every problem lands in the status store.
*/
export async function runSync(options: RunSyncOptions = {}): Promise<SyncRunResult> {
  const now = options.now ?? (() => new Date());
  const client = options.client ?? (defaultClientFactory ? defaultClientFactory() : null);

  if (!isOnline()) {
    setSyncStatus({ online: false });
    await refreshSyncCounts();
    return { ran: false, reason: "offline", sent: 0, failed: 0 };
  }
  if (!client) {
    return { ran: false, reason: "no-client", sent: 0, failed: 0 };
  }

  const outcome = await withSyncLock(async (): Promise<SyncRunResult> => {
    const counters = { sent: 0, failed: 0 };
    setSyncStatus({ online: true, syncing: true, lastError: null, progress: null });

    try {
      await recoverStaleSending();

      // refresh the session first, the access token may have expired offline
      try {
        const { error } = await client.auth.refreshSession();
        if (error) {
          if (looksLikeNetworkError(error.message)) {
            setSyncStatus({ lastError: "Connection lost, will retry" });
            return { ran: true, reason: "connection", ...counters };
          }
          setSyncStatus({ authProblem: true, lastError: "Session expired. Sign in again to sync." });
          return { ran: true, reason: "auth", ...counters };
        }
      } catch (err) {
        setSyncStatus({ lastError: err instanceof Error ? err.message : "Could not refresh the session" });
        return { ran: true, reason: "connection", ...counters };
      }
      setSyncStatus({ authProblem: false });

      let total = (await ready(now())).length;
      let guard = 0;
      while (guard < 500) {
        guard += 1;
        const rows = await ready(now());
        if (rows.length === 0) break;
        total = Math.max(total, counters.sent + counters.failed + rows.length);
        setSyncStatus({ progress: { sent: counters.sent, total } });

        const batch = rows.filter((r) => r.op !== "upload_photo").slice(0, BATCH_SIZE);
        const photo = rows.find((r) => r.op === "upload_photo");

        let step: StepOutcome = "continue";
        if (batch.length > 0) {
          step = await sendBatch(client, batch, now, counters);
        } else if (photo) {
          step = await sendPhoto(client, photo, now, counters);
        }

        if (step === "stop-connection") {
          setSyncStatus({ lastError: "Connection lost, will retry" });
          return { ran: true, reason: "connection", ...counters };
        }
        if (step === "stop-auth") {
          setSyncStatus({ authProblem: true, lastError: "Session expired. Sign in again to sync." });
          return { ran: true, reason: "auth", ...counters };
        }

        // after a batch, send one photo before re-reading the queue, so photos
        // interleave with rows instead of waiting for every batch
        if (batch.length > 0 && photo) {
          const photoStep = await sendPhoto(client, photo, now, counters);
          if (photoStep === "stop-connection") {
            setSyncStatus({ lastError: "Connection lost, will retry" });
            return { ran: true, reason: "connection", ...counters };
          }
          if (photoStep === "stop-auth") {
            setSyncStatus({ authProblem: true, lastError: "Session expired. Sign in again to sync." });
            return { ran: true, reason: "auth", ...counters };
          }
        }
      }

      setSyncStatus({ lastSyncAt: now().toISOString() });
      await purgeDone(now());
      return { ran: true, ...counters };
    } catch (err) {
      setSyncStatus({ lastError: err instanceof Error ? err.message : "Sync failed" });
      return { ran: true, reason: "connection", ...counters };
    } finally {
      setSyncStatus({ syncing: false, progress: null });
      await refreshSyncCounts();
    }
  });

  if (outcome === null) {
    return { ran: false, reason: "locked", sent: 0, failed: 0 };
  }
  return outcome;
}
