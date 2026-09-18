/*
  Where a scanned or typed value leads. Matches against the local assets
  mirror only (lib/local, index on qr_code), never against Supabase, so the
  scanner works with zero network. An asset is on this phone only when its
  building was downloaded, so "not found" means "download the building".

  Two entry points:
  - findAssetByCode: the scanned payload, which is the value of
    assets.qr_code exactly, nothing encoded around it.
  - findAssetByRef: the typed fallback, the door number printed under the
    QR (GF-01). Decision of 18 Sep 2026: typing takes the door number only.
    Case, spaces and dashes do not matter. The building on screen wins,
    otherwise the number must be unique among the downloaded buildings.
*/

import { get, list, type Row } from "@/lib/local";

export type AssetMatch = Row<"assets">;

export type QrMatch =
  /* the asset belongs to the building on screen */
  | { kind: "here"; asset: AssetMatch }
  /* the asset belongs to another downloaded building */
  | { kind: "elsewhere"; asset: AssetMatch; buildingName: string }
  /* a typed door number that exists in more than one downloaded building, none of them on screen */
  | { kind: "ambiguous"; count: number }
  | { kind: "not_found" };

export const NOT_FOUND_MESSAGE = "Door not found on this phone. Download its building first.";

export function ambiguousMessage(ref: string, count: number): string {
  return `${ref} is in ${count} downloaded buildings. Open the building first.`;
}

export function normaliseCode(raw: string): string {
  return raw.trim();
}

/* Door numbers compare by letters and digits only: "gf 01", "gf01" and "GF-01" are the same door. */
export function normaliseRef(raw: string): string {
  return raw.replace(/[^0-9a-z]/gi, "").toUpperCase();
}

async function place(asset: AssetMatch, currentBuildingId: string | null): Promise<QrMatch> {
  if (currentBuildingId && asset.building_id === currentBuildingId) return { kind: "here", asset };
  const building = await get("buildings", asset.building_id);
  return { kind: "elsewhere", asset, buildingName: building?.name ?? "another building" };
}

/* A scanned payload: the exact qr_code value, through the index. */
export async function findAssetByCode(raw: string, currentBuildingId: string | null): Promise<QrMatch> {
  const code = normaliseCode(raw);
  if (!code) return { kind: "not_found" };
  const rows = await list("assets", { qr_code: code });
  const asset = rows.find((a) => a.building_id === currentBuildingId) ?? rows[0];
  if (!asset) return { kind: "not_found" };
  return place(asset, currentBuildingId);
}

/* A typed door number: the reference printed under the QR. */
export async function findAssetByRef(raw: string, currentBuildingId: string | null): Promise<QrMatch> {
  const wanted = normaliseRef(raw);
  if (!wanted) return { kind: "not_found" };
  const candidates = (await list("assets")).filter((a) => normaliseRef(a.ref) === wanted);
  if (candidates.length === 0) return { kind: "not_found" };
  const here = currentBuildingId ? candidates.find((a) => a.building_id === currentBuildingId) : undefined;
  if (here) return { kind: "here", asset: here };
  const buildings = new Set(candidates.map((a) => a.building_id));
  if (buildings.size > 1) return { kind: "ambiguous", count: buildings.size };
  return place(candidates[0], currentBuildingId);
}
