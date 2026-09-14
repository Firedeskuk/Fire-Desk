/*
  Dexie database "firedesk" on IndexedDB. docs/SYNC-PROTOCOL.md section 2.

  Mirror tables carry the same columns as Supabase plus one local column
  `origin`: "server" (came from a download) or "local" (created or patched on
  this device and not yet confirmed by the server).

  Sync tables are local only: outbox, blobs, sync_state, session.

  Nothing outside lib/local may write to these tables. Screens use the
  functions in lib/local/index.ts, the sync worker uses the same functions.
*/

import Dexie, { type EntityTable } from "dexie";
import type {
  Asset,
  Building,
  Finding,
  FindingPhoto,
  Floor,
  Inspection,
  InspectionAnswer,
  Json,
  MirrorTable,
  PriceListItem,
  Project,
  RemedialItem,
  RemedialPhoto,
  SurveyTemplate,
  SurveyTemplateItem,
  SyncEntity,
  UserRole,
} from "@/lib/supabase/types";

export type Origin = "server" | "local";

export type Mirror<T> = T & { origin: Origin };

export type OutboxOp = "upsert" | "patch" | "upload_photo";
export type OutboxStatus = "pending" | "sending" | "done" | "failed";

export type PhotoUploadPayload = {
  /* key in the blobs table, same as the storage path */
  blob_key: string;
  bucket: "photos";
  storage_path: string;
  building_id: string;
  parent_id: string;
  content_type: string;
};

export type OutboxRow = {
  /* auto increment, defines send order */
  seq?: number;
  id: string;
  created_at: string;
  op: OutboxOp;
  entity: SyncEntity;
  record_id: string;
  /* upsert: whole row, patch: changed fields plus updated_at, upload_photo: PhotoUploadPayload */
  payload: Record<string, Json | undefined> | PhotoUploadPayload;
  depends_on: string[];
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  /* ISO time before which the row is not retried, null = now */
  next_attempt_at: string | null;
  done_at: string | null;
  /* for the failed list and for "pending changes in this building" */
  building_id: string | null;
  /* short human label, for example "Door 2F-05", shown in the failed list */
  label: string | null;
};

export type BlobRow = {
  path: string;
  blob: Blob;
  bytes: number;
  content_type: string;
  kind: "photo" | "floorplan";
  created_at: string;
};

export type SyncStateRow = {
  building_id: string;
  downloaded_at: string;
  role_scope: UserRole;
  building_name: string;
};

export type SessionRow = {
  key: string;
  value: Json;
};

export class FireDeskDB extends Dexie {
  buildings!: EntityTable<Mirror<Building>, "id">;
  floors!: EntityTable<Mirror<Floor>, "id">;
  assets!: EntityTable<Mirror<Asset>, "id">;
  projects!: EntityTable<Mirror<Project>, "id">;
  survey_templates!: EntityTable<Mirror<SurveyTemplate>, "id">;
  survey_template_items!: EntityTable<Mirror<SurveyTemplateItem>, "id">;
  price_list_items!: EntityTable<Mirror<PriceListItem>, "id">;
  inspections!: EntityTable<Mirror<Inspection>, "id">;
  inspection_answers!: EntityTable<Mirror<InspectionAnswer>, "id">;
  findings!: EntityTable<Mirror<Finding>, "id">;
  finding_photos!: EntityTable<Mirror<FindingPhoto>, "id">;
  remedial_items!: EntityTable<Mirror<RemedialItem>, "id">;
  remedial_photos!: EntityTable<Mirror<RemedialPhoto>, "id">;

  outbox!: EntityTable<OutboxRow, "seq">;
  blobs!: EntityTable<BlobRow, "path">;
  sync_state!: EntityTable<SyncStateRow, "building_id">;
  session!: EntityTable<SessionRow, "key">;

  constructor(name = "firedesk") {
    super(name);
    this.version(1).stores({
      buildings: "id, client_id",
      floors: "id, building_id",
      assets: "id, building_id, floor_id, qr_code, next_due_date",
      projects: "id, building_id",
      survey_templates: "id, work_type",
      survey_template_items: "id, template_id",
      price_list_items: "id, code",
      inspections: "id, asset_id, completed_at",
      inspection_answers: "id, inspection_id",
      findings: "id, asset_id, building_id, inspection_id, status",
      finding_photos: "id, finding_id",
      remedial_items: "id, building_id, finding_id, asset_id, status",
      remedial_photos: "id, remedial_item_id",
      outbox: "++seq, id, status, entity, record_id, building_id, [status+seq]",
      blobs: "path, kind",
      sync_state: "building_id",
      session: "key",
    });
  }
}

export const MIRROR_TABLES: MirrorTable[] = [
  "buildings",
  "floors",
  "assets",
  "projects",
  "survey_templates",
  "survey_template_items",
  "price_list_items",
  "inspections",
  "inspection_answers",
  "findings",
  "finding_photos",
  "remedial_items",
  "remedial_photos",
];

export const SYNC_ENTITIES: SyncEntity[] = [
  "assets",
  "inspections",
  "inspection_answers",
  "findings",
  "finding_photos",
  "remedial_items",
  "remedial_photos",
];

export const ALL_TABLE_NAMES = [...MIRROR_TABLES, "outbox", "blobs", "sync_state", "session"] as const;

let instance: FireDeskDB | null = null;

export function db(): FireDeskDB {
  if (!instance) instance = new FireDeskDB();
  return instance;
}

/* Tests use this to start from an empty database. */
export async function resetDbForTests(): Promise<void> {
  if (instance) {
    await instance.delete();
    instance.close();
    instance = null;
  }
}
