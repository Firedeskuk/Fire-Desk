/*
  The one small local data interface the app uses.
  docs/SYNC-PROTOCOL.md section 2 and 4.

  Screens call get, list, put, patch, putPhoto and transaction. put, patch and
  putPhoto write the mirror row and append the outbox row inside one Dexie
  transaction, so "what I see" and "what will be sent" can never drift apart.
  The sync worker uses replaceServerRows, markSynced and the sync_state
  helpers. No other module writes a mirror table.

  This is also the swap point for a native shell later: replace the Dexie
  calls here, keep the exported functions.
*/

import type { Table } from "dexie";
import type { Json, MirrorRowOf, MirrorTable, SyncEntity } from "@/lib/supabase/types";
import { MIRROR_TABLES, db, type Mirror, type Origin, type SyncStateRow } from "./db";
import { blobUsage, putBlob, release } from "./blobs";
import {
  countPending,
  countPendingForBuilding,
  enqueuePatch,
  enqueuePhoto,
  enqueueUpsert,
  notifyOutboxChanged,
} from "./outbox";

export type Row<T extends MirrorTable> = Mirror<MirrorRowOf<T>>;

export type WriteOptions = {
  /* building the change belongs to, for the failed list and building counts */
  buildingId?: string | null;
  /* short label shown to the user when the row fails, for example "Door 2F-05" */
  label?: string | null;
  /* outbox row ids that must be done before this one is sent */
  dependsOn?: string[];
};

/* Indexed columns per table, so list() can use an index instead of a scan. */
const INDEXED: Record<MirrorTable, string[]> = {
  buildings: ["id", "client_id"],
  floors: ["id", "building_id"],
  assets: ["id", "building_id", "floor_id", "qr_code", "next_due_date"],
  projects: ["id", "building_id"],
  survey_templates: ["id", "work_type"],
  survey_template_items: ["id", "template_id"],
  price_list_items: ["id", "code"],
  inspections: ["id", "asset_id", "completed_at"],
  inspection_answers: ["id", "inspection_id"],
  findings: ["id", "asset_id", "building_id", "inspection_id", "status"],
  finding_photos: ["id", "finding_id"],
  remedial_items: ["id", "building_id", "finding_id", "asset_id", "status"],
  remedial_photos: ["id", "remedial_item_id"],
};

function tableOf<T extends MirrorTable>(table: T): Table<Row<T>, string> {
  return db().table(table) as Table<Row<T>, string>;
}

/* Untyped view of a table, for updates where the generic row type gets in the way. */
function looseTable(table: MirrorTable): Table<Record<string, unknown>, string> {
  return db().table(table) as Table<Record<string, unknown>, string>;
}

function stripOrigin<T extends object>(row: T & { origin?: Origin }): Record<string, Json | undefined> {
  const copy: Record<string, unknown> = { ...row };
  delete copy.origin;
  return copy as Record<string, Json | undefined>;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function get<T extends MirrorTable>(table: T, id: string): Promise<Row<T> | undefined> {
  return tableOf(table).get(id);
}

export type ListOptions = {
  includeDeleted?: boolean;
};

/*
  Rows matching every key in `where` (equality). The first indexed key is
  used through the index, the rest are filtered in memory. Soft deleted rows
  are left out unless includeDeleted is set.
*/
export async function list<T extends MirrorTable>(
  table: T,
  where?: Partial<MirrorRowOf<T>>,
  options: ListOptions = {},
): Promise<Row<T>[]> {
  const t = tableOf(table);
  const criteria = Object.entries(where ?? {}).filter(([, v]) => v !== undefined) as [string, unknown][];
  const indexedKey = criteria.find(([k, v]) => INDEXED[table].includes(k) && v !== null)?.[0];

  let collection = indexedKey
    ? t.where(indexedKey).equals(criteria.find(([k]) => k === indexedKey)![1] as string | number)
    : t.toCollection();

  const rest = criteria.filter(([k]) => k !== indexedKey);
  if (rest.length > 0 || !options.includeDeleted) {
    collection = collection.filter((row) => {
      const r = row as Record<string, unknown>;
      if (!options.includeDeleted && r.deleted_at) return false;
      return rest.every(([k, v]) => r[k] === v);
    });
  }
  return collection.toArray();
}

export async function count<T extends MirrorTable>(table: T, where?: Partial<MirrorRowOf<T>>): Promise<number> {
  return (await list(table, where)).length;
}

// ---------------------------------------------------------------------------
// Writes from the field: mirror row and outbox row in one transaction
// ---------------------------------------------------------------------------

/*
  Runs fn inside one read write transaction over every table. Nested calls
  join the outer transaction, so a screen can wrap several put and patch calls
  and they all commit or none does.
*/
export async function transaction<R>(fn: () => Promise<R>): Promise<R> {
  const d = db();
  return d.transaction("rw", d.tables, fn);
}

/* Whole row insert or replace. Returns the outbox row id. */
export async function put<T extends SyncEntity>(
  table: T,
  row: MirrorRowOf<T>,
  options: WriteOptions = {},
): Promise<string> {
  return transaction(async () => {
    const now = new Date().toISOString();
    const full = {
      ...row,
      created_at: row.created_at ?? now,
      updated_at: row.updated_at ?? now,
      origin: "local" as const,
    } as unknown as Row<T>;
    await tableOf(table).put(full);
    return enqueueUpsert(table, full.id, stripOrigin(full), {
      dependsOn: options.dependsOn,
      buildingId: options.buildingId ?? readBuildingId(full),
      label: options.label,
    });
  });
}

/* Only the changed fields. updated_at is set here and travels with the patch. */
export async function patch<T extends SyncEntity>(
  table: T,
  id: string,
  fields: Partial<MirrorRowOf<T>>,
  options: WriteOptions = {},
): Promise<string> {
  return transaction(async () => {
    const t = tableOf(table);
    const existing = await t.get(id);
    if (!existing) {
      throw new Error(`Cannot patch ${table} ${id}: not on this device`);
    }
    const changes = { ...fields, updated_at: new Date().toISOString() };
    await looseTable(table).update(id, { ...changes, origin: "local" });
    return enqueuePatch(table, id, changes as Record<string, Json | undefined>, {
      dependsOn: options.dependsOn,
      buildingId: options.buildingId ?? readBuildingId(existing),
      label: options.label,
    });
  });
}

/*
  A photo: blob, mirror row and two outbox rows (upload first, then the row
  that depends on the upload), all in one transaction.
*/
export async function putPhoto<T extends "finding_photos" | "remedial_photos">(
  table: T,
  row: MirrorRowOf<T>,
  blob: Blob,
  buildingId: string,
  options: WriteOptions = {},
): Promise<{ uploadId: string; rowId: string }> {
  return transaction(async () => {
    const now = new Date().toISOString();
    const full = {
      ...row,
      created_at: row.created_at ?? now,
      updated_at: row.updated_at ?? now,
      bytes: row.bytes ?? blob.size,
      origin: "local" as const,
    } as unknown as Row<T>;
    const parentId =
      table === "finding_photos"
        ? (full as Row<"finding_photos">).finding_id
        : (full as Row<"remedial_photos">).remedial_item_id;

    await putBlob(full.storage_path, blob, "photo", "image/jpeg");
    await tableOf(table).put(full);
    const uploadId = await enqueuePhoto(
      table,
      full.id,
      {
        storage_path: full.storage_path,
        building_id: buildingId,
        parent_id: parentId,
        content_type: "image/jpeg",
      },
      { buildingId, label: options.label },
    );
    const rowId = await enqueueUpsert(table, full.id, stripOrigin(full), {
      dependsOn: [...(options.dependsOn ?? []), uploadId],
      buildingId,
      label: options.label,
    });
    return { uploadId, rowId };
  });
}

function readBuildingId(row: unknown): string | null {
  const r = row as Record<string, unknown>;
  return typeof r.building_id === "string" ? r.building_id : null;
}

// ---------------------------------------------------------------------------
// Used by lib/sync only
// ---------------------------------------------------------------------------

export type ReplaceScope = {
  /* replace exactly these ids (the building row) */
  ids?: string[];
  /* replace every server row with this building_id */
  buildingId?: string;
  /* replace server rows whose parentField is in parentIds (photos) */
  parentField?: "finding_id" | "remedial_item_id";
  parentIds?: string[];
  /* replace every server row in the table (templates, prices) */
  all?: boolean;
};

/*
  Download: server rows replace the previous server rows in the given scope.
  Rows with origin "local" are never touched, and an incoming row whose id is
  still local on this device is skipped until the outbox confirms it.
*/
export async function replaceServerRows<T extends MirrorTable>(
  table: T,
  rows: MirrorRowOf<T>[],
  scope: ReplaceScope,
): Promise<void> {
  await transaction(async () => {
    const t = tableOf(table);

    let stale: Row<T>[] = [];
    if (scope.all) {
      stale = await t.toArray();
    } else if (scope.ids && scope.ids.length > 0) {
      stale = (await t.bulkGet(scope.ids)).filter((r): r is Row<T> => Boolean(r));
    } else if (scope.buildingId && INDEXED[table].includes("building_id")) {
      stale = await t.where("building_id").equals(scope.buildingId).toArray();
    } else if (scope.parentField && scope.parentIds && scope.parentIds.length > 0) {
      stale = await t.where(scope.parentField).anyOf(scope.parentIds).toArray();
    }

    const staleServerIds = stale.filter((r) => r.origin === "server").map((r) => r.id);
    if (staleServerIds.length > 0) await t.bulkDelete(staleServerIds);

    const incomingIds = rows.map((r) => r.id);
    const existing = incomingIds.length > 0 ? await t.bulkGet(incomingIds) : [];
    const localIds = new Set(existing.filter((r) => r && r.origin === "local").map((r) => r!.id));

    const toPut = rows
      .filter((r) => !localIds.has(r.id))
      .map((r) => ({ ...r, origin: "server" as const }) as Row<T>);
    if (toPut.length > 0) await t.bulkPut(toPut);
  });
}

/*
  Server confirmed a row. Origin flips to server unless another outbox row
  for the same record is still waiting.
*/
export async function markSynced(table: SyncEntity, id: string): Promise<void> {
  await transaction(async () => {
    const still = await db()
      .outbox.where("record_id")
      .equals(id)
      .filter((r) => r.status === "pending" || r.status === "sending")
      .count();
    if (still > 0) return;
    await looseTable(table).update(id, { origin: "server" });
  });
}

export async function setSyncState(row: SyncStateRow): Promise<void> {
  await db().sync_state.put(row);
}

export async function getSyncState(buildingId: string): Promise<SyncStateRow | undefined> {
  return db().sync_state.get(buildingId);
}

export async function listSyncState(): Promise<SyncStateRow[]> {
  return db().sync_state.toArray();
}

export async function setSessionValue(key: string, value: Json): Promise<void> {
  await db().session.put({ key, value });
}

export async function getSessionValue(key: string): Promise<Json | undefined> {
  return (await db().session.get(key))?.value;
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/*
  "Remove building from this phone". Refused while the building still has
  unsent changes. Deletes every row and blob that belongs to the building.
*/
export async function removeBuilding(buildingId: string): Promise<void> {
  const pendingHere = await countPendingForBuilding(buildingId);
  if (pendingHere > 0) {
    throw new Error(
      `${pendingHere} ${pendingHere === 1 ? "change is" : "changes are"} not yet sent for this building. Sync first.`,
    );
  }

  await transaction(async () => {
    const d = db();
    const floors = await d.floors.where("building_id").equals(buildingId).toArray();
    const assets = await d.assets.where("building_id").equals(buildingId).toArray();
    const assetIds = assets.map((a) => a.id);
    const findings = await d.findings.where("building_id").equals(buildingId).toArray();
    const findingIds = findings.map((f) => f.id);
    const remedials = await d.remedial_items.where("building_id").equals(buildingId).toArray();
    const remedialIds = remedials.map((r) => r.id);

    const inspections = assetIds.length ? await d.inspections.where("asset_id").anyOf(assetIds).toArray() : [];
    const inspectionIds = inspections.map((i) => i.id);
    const findingPhotos = findingIds.length
      ? await d.finding_photos.where("finding_id").anyOf(findingIds).toArray()
      : [];
    const remedialPhotos = remedialIds.length
      ? await d.remedial_photos.where("remedial_item_id").anyOf(remedialIds).toArray()
      : [];

    const blobPaths = [
      ...floors.map((f) => f.floor_plan_path).filter((p): p is string => Boolean(p)),
      ...findingPhotos.map((p) => p.storage_path),
      ...remedialPhotos.map((p) => p.storage_path),
    ];

    if (inspectionIds.length) await d.inspection_answers.where("inspection_id").anyOf(inspectionIds).delete();
    if (inspectionIds.length) await d.inspections.bulkDelete(inspectionIds);
    if (findingPhotos.length) await d.finding_photos.bulkDelete(findingPhotos.map((p) => p.id));
    if (remedialPhotos.length) await d.remedial_photos.bulkDelete(remedialPhotos.map((p) => p.id));
    if (findingIds.length) await d.findings.bulkDelete(findingIds);
    if (remedialIds.length) await d.remedial_items.bulkDelete(remedialIds);
    if (assetIds.length) await d.assets.bulkDelete(assetIds);
    await d.projects.where("building_id").equals(buildingId).delete();
    if (floors.length) await d.floors.bulkDelete(floors.map((f) => f.id));
    await d.buildings.delete(buildingId);
    await d.outbox.where("building_id").equals(buildingId).delete();
    await d.sync_state.delete(buildingId);
    for (const path of blobPaths) await release(path);
    notifyOutboxChanged();
  });
}

/* Logout: everything goes. Refused while the outbox is not empty. */
export async function clearAll(): Promise<void> {
  const pendingCount = await countPending();
  if (pendingCount > 0) {
    throw new Error(`${pendingCount} ${pendingCount === 1 ? "change is" : "changes are"} not yet sent. Sync first.`);
  }
  await transaction(async () => {
    const d = db();
    for (const name of MIRROR_TABLES) await d.table(name).clear();
    await d.outbox.clear();
    await d.blobs.clear();
    await d.sync_state.clear();
    await d.session.clear();
    notifyOutboxChanged();
  });
}

export type StorageUsage = {
  /* bytes used by the whole origin as the browser reports it, null if unknown */
  usage: number | null;
  quota: number | null;
  /* bytes held in the blobs table */
  photos: number;
  floorplans: number;
};

export async function storageUsage(): Promise<StorageUsage> {
  const blobs = await blobUsage();
  let usage: number | null = null;
  let quota: number | null = null;
  try {
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      usage = est.usage ?? null;
      quota = est.quota ?? null;
    }
  } catch {
    // not available, fall back to blob totals only
  }
  return { usage, quota, photos: blobs.photos, floorplans: blobs.floorplans };
}

export { countPending, countPendingForBuilding } from "./outbox";
