/*
  When the worker runs (docs/SYNC-PROTOCOL.md section 5):
  the browser reports the connection is back, the app comes to the
  foreground, every 60 seconds while online and the outbox is not empty, and
  when the user taps "Sync now".

  Installed once from the field layout through <SyncBoot />. This is the only
  place in lib/sync that knows about the real Supabase client.
*/

import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { countPending, recoverStaleSending, subscribeOutbox } from "@/lib/local/outbox";
import { runSync, setSyncClientFactory, type SyncClient, type SyncRunResult } from "./push";
import { refreshSyncCounts, setSyncStatus } from "./status";

export const SYNC_INTERVAL_MS = 60_000;
/* a local write while online starts a run shortly after, so the counter drops fast */
export const AFTER_WRITE_DELAY_MS = 1_500;

let installed = false;
let uninstall: (() => void) | null = null;
let inFlight: Promise<SyncRunResult> | null = null;

function realClient(): SyncClient | null {
  if (!supabaseConfigured()) return null;
  return getSupabase() as unknown as SyncClient;
}

/* Manual call. Concurrent calls share one run. */
export function syncNow(): Promise<SyncRunResult> {
  if (inFlight) return inFlight;
  inFlight = runSync()
    .catch((err): SyncRunResult => {
      setSyncStatus({ lastError: err instanceof Error ? err.message : "Sync failed" });
      return { ran: false, sent: 0, failed: 0 };
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function installSyncTriggers(): () => void {
  if (installed && uninstall) return uninstall;
  if (typeof window === "undefined") return () => undefined;

  installed = true;
  setSyncClientFactory(realClient);
  setSyncStatus({ online: navigator.onLine !== false });

  const onOnline = () => {
    setSyncStatus({ online: true });
    void syncNow();
  };
  const onOffline = () => {
    setSyncStatus({ online: false });
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") void syncNow();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisibility);

  // every local write: refresh the pill counts, and while online start a run soon
  let afterWrite: number | null = null;
  const unsubscribeOutbox = subscribeOutbox(() => {
    void refreshSyncCounts();
    if (navigator.onLine === false) return;
    if (afterWrite !== null) window.clearTimeout(afterWrite);
    afterWrite = window.setTimeout(() => {
      afterWrite = null;
      void syncNow();
    }, AFTER_WRITE_DELAY_MS);
  });

  const timer = window.setInterval(async () => {
    if (navigator.onLine === false) return;
    try {
      if ((await countPending()) > 0) void syncNow();
    } catch {
      // database not ready
    }
  }, SYNC_INTERVAL_MS);

  // start up: rows left in "sending" by a killed app go back to pending, then one run
  void recoverStaleSending()
    .then(() => refreshSyncCounts())
    .then(() => syncNow());

  uninstall = () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearInterval(timer);
    if (afterWrite !== null) window.clearTimeout(afterWrite);
    unsubscribeOutbox();
    installed = false;
    uninstall = null;
  };
  return uninstall;
}
