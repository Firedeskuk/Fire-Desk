/*
  "Download building". docs/SYNC-PROTOCOL.md section 3.

  One RPC, download_building, returns the whole tree the caller may see. Every
  array is written into the mirror tables with origin "server" in one Dexie
  transaction. Rows with origin "local" are never touched. Floor plan images
  are fetched through short lived signed URLs into the blobs table afterwards,
  outside the database transaction, so the plan opens offline.
*/

import type { DownloadBuildingResult } from "@/lib/supabase/types";
import type { SyncStateRow } from "@/lib/local/db";
import { list, replaceServerRows, setSyncState, transaction } from "@/lib/local";
import { hasBlob, putBlob } from "@/lib/local/blobs";

export type DownloadClient = {
  rpc: (
    fn: "download_building",
    args: { p_building_id: string },
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
};

export type DownloadResult = {
  state: SyncStateRow;
  counts: Record<string, number>;
  warnings: string[];
};

export type DownloadOptions = {
  client: DownloadClient;
  fetchImpl?: typeof fetch;
};

function friendlyRpcError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("not found or not allowed")) return "This building is not available to you.";
  if (m.includes("not signed in")) return "Session expired. Sign in again.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")) {
    return "No connection. Downloading a building needs network.";
  }
  return message;
}

export async function downloadBuilding(buildingId: string, options: DownloadOptions): Promise<DownloadResult> {
  const { client } = options;
  const fetchImpl = options.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);

  const { data, error } = await client.rpc("download_building", { p_building_id: buildingId });
  if (error) throw new Error(friendlyRpcError(error.message));
  if (!data || typeof data !== "object") throw new Error("Empty answer from the server");

  const tree = data as DownloadBuildingResult;
  const counts: Record<string, number> = {};
  const warnings: string[] = [];

  await transaction(async () => {
    // remember the parents we knew before, so stale photo rows get replaced too
    const previousFindingIds = (await list("findings", { building_id: buildingId }, { includeDeleted: true })).map(
      (f) => f.id,
    );
    const previousRemedialIds = (
      await list("remedial_items", { building_id: buildingId }, { includeDeleted: true })
    ).map((r) => r.id);

    await replaceServerRows("buildings", [tree.building], { ids: [buildingId] });
    await replaceServerRows("floors", tree.floors ?? [], { buildingId });
    await replaceServerRows("assets", tree.assets ?? [], { buildingId });
    await replaceServerRows("remedial_items", tree.remedial_items ?? [], { buildingId });
    await replaceServerRows("remedial_photos", tree.remedial_photos ?? [], {
      parentField: "remedial_item_id",
      parentIds: [...new Set([...previousRemedialIds, ...(tree.remedial_items ?? []).map((r) => r.id)])],
    });
    counts.floors = (tree.floors ?? []).length;
    counts.assets = (tree.assets ?? []).length;
    counts.remedial_items = (tree.remedial_items ?? []).length;
    counts.remedial_photos = (tree.remedial_photos ?? []).length;

    if (tree.role !== "remedial") {
      await replaceServerRows("projects", tree.projects ?? [], { buildingId });
      await replaceServerRows("findings", tree.findings ?? [], { buildingId });
      await replaceServerRows("finding_photos", tree.finding_photos ?? [], {
        parentField: "finding_id",
        parentIds: [...new Set([...previousFindingIds, ...(tree.findings ?? []).map((f) => f.id)])],
      });
      await replaceServerRows("survey_templates", tree.survey_templates ?? [], { all: true });
      await replaceServerRows("survey_template_items", tree.survey_template_items ?? [], { all: true });
      await replaceServerRows("price_list_items", tree.price_list_items ?? [], { all: true });
      counts.projects = (tree.projects ?? []).length;
      counts.findings = (tree.findings ?? []).length;
      counts.finding_photos = (tree.finding_photos ?? []).length;
      counts.survey_templates = (tree.survey_templates ?? []).length;
      counts.survey_template_items = (tree.survey_template_items ?? []).length;
      counts.price_list_items = (tree.price_list_items ?? []).length;
    }
  });

  // floor plans, outside the transaction (network)
  for (const floor of tree.floors ?? []) {
    const path = floor.floor_plan_path;
    if (!path) continue;
    try {
      if (await hasBlob(path)) continue;
      if (!fetchImpl) {
        warnings.push(`Floor plan for ${floor.name} not cached: fetch not available`);
        continue;
      }
      const signed = await client.storage.from("floorplans").createSignedUrl(path, 600);
      if (signed.error || !signed.data?.signedUrl) {
        warnings.push(`Floor plan for ${floor.name} not cached: ${signed.error?.message ?? "no URL"}`);
        continue;
      }
      const res = await fetchImpl(signed.data.signedUrl);
      if (!res.ok) {
        warnings.push(`Floor plan for ${floor.name} not cached: HTTP ${res.status}`);
        continue;
      }
      const blob = await res.blob();
      await putBlob(path, blob, "floorplan", blob.type || "image/jpeg");
    } catch (err) {
      warnings.push(`Floor plan for ${floor.name} not cached: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  const state: SyncStateRow = {
    building_id: buildingId,
    downloaded_at: tree.downloaded_at ?? new Date().toISOString(),
    role_scope: tree.role,
    building_name: tree.building?.name ?? "",
  };
  await setSyncState(state);

  return { state, counts, warnings };
}

/* Age of a download as the list shows it: "3 h ago", "just now". */
export function describeAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "Not downloaded";
  const ms = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "Downloaded";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Downloaded just now";
  if (minutes < 60) return `Downloaded ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Downloaded ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `Downloaded ${days} ${days === 1 ? "day" : "days"} ago`;
}
