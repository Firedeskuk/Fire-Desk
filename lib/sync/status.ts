/*
  A tiny store for the sync indicator (docs/SYNC-PROTOCOL.md section 9).
  Plain module state with subscribers, read from React through
  useSyncExternalStore. The worker and the triggers write it, the pill reads it.
*/

import { useSyncExternalStore } from "react";
import { countFailed, countPending } from "@/lib/local/outbox";

export type SyncProgress = { sent: number; total: number };

export type SyncStatus = {
  online: boolean;
  pendingCount: number;
  failedCount: number;
  syncing: boolean;
  progress: SyncProgress | null;
  lastError: string | null;
  lastSyncAt: string | null;
  /* the server rejected the session, the user must sign in again */
  authProblem: boolean;
};

const INITIAL: SyncStatus = {
  online: true,
  pendingCount: 0,
  failedCount: 0,
  syncing: false,
  progress: null,
  lastError: null,
  lastSyncAt: null,
  authProblem: false,
};

let state: SyncStatus = INITIAL;
const listeners = new Set<() => void>();

export function getSyncStatus(): SyncStatus {
  return state;
}

export function setSyncStatus(partial: Partial<SyncStatus>): void {
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* Re-reads the outbox counts. Cheap, called after every write and every run. */
export async function refreshSyncCounts(): Promise<void> {
  try {
    const [pendingCount, failedCount] = await Promise.all([countPending(), countFailed()]);
    setSyncStatus({ pendingCount, failedCount });
  } catch {
    // database not open yet, the next call will get it
  }
}

export function resetSyncStatusForTests(): void {
  state = INITIAL;
}

function serverSnapshot(): SyncStatus {
  return INITIAL;
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, serverSnapshot);
}

export type PillTone = "green" | "grey" | "yellow" | "red";

/* Text and colour of the header pill from the current status. */
export function describeSyncStatus(s: SyncStatus): { text: string; tone: PillTone } {
  if (s.failedCount > 0 || s.authProblem) {
    return { text: "Sync problem, tap", tone: "red" };
  }
  if (s.syncing) {
    const p = s.progress;
    return {
      text: p && p.total > 0 ? `Syncing ${Math.min(p.sent + 1, p.total)} of ${p.total}` : "Syncing",
      tone: "yellow",
    };
  }
  if (!s.online) {
    return { text: s.pendingCount > 0 ? `Offline, ${s.pendingCount} to sync` : "Offline", tone: "grey" };
  }
  if (s.pendingCount > 0) {
    return { text: `Online, ${s.pendingCount} to sync`, tone: "green" };
  }
  return { text: "Online", tone: "green" };
}
