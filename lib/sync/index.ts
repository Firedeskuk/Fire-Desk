/*
  Public surface of lib/sync for screens. Field screens import from here (and
  from lib/local) and never from lib/supabase directly.
*/

import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import type { Building } from "@/lib/supabase/types";
import { replaceServerRows } from "@/lib/local";
import { listFailed, retryFailed } from "@/lib/local/outbox";
import { downloadBuilding, type DownloadResult } from "./download";
import { refreshSyncCounts, setSyncStatus } from "./status";
import { syncNow } from "./triggers";

export { syncNow, installSyncTriggers } from "./triggers";
export { useSyncStatus, describeSyncStatus, getSyncStatus, type SyncStatus } from "./status";
export { describeAge } from "./download";
export { runSync } from "./push";

function requireClient() {
  if (!supabaseConfigured()) {
    throw new Error("Supabase is not configured. Add the keys to .env.local and restart.");
  }
  return getSupabase();
}

/* Download or refresh one building on this device. Needs network. */
export async function downloadBuildingNow(buildingId: string): Promise<DownloadResult> {
  const client = requireClient();
  const result = await downloadBuilding(buildingId, { client });
  await refreshSyncCounts();
  return result;
}

/*
  The list of buildings the user may see, fetched online and kept in the
  local buildings table with origin server. Downloaded buildings keep their
  floors and assets, this only refreshes the building rows themselves.
*/
export async function refreshBuildingList(): Promise<Building[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("buildings")
    .select("*")
    .is("deleted_at", null)
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Building[];
  await replaceServerRows("buildings", rows, { all: true });
  return rows;
}

/* Failed rows for the "Sync problem" panel. */
export async function listFailedRows() {
  return listFailed();
}

/* Retry button: failed rows go back to pending and a run starts. */
export async function retryFailedRows(): Promise<void> {
  await retryFailed();
  setSyncStatus({ lastError: null });
  await refreshSyncCounts();
  void syncNow();
}
