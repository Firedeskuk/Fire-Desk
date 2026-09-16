/*
  Hand written TypeScript types for the Fire Desk database.
  Source of truth: supabase/migrations/20260913184137_init.sql and
  supabase/migrations/20260913184233_sync.sql. Keep in step with them.
  Enums are string unions. Every row type mirrors the table columns.
*/

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type UserRole = "manager" | "admin" | "inspector" | "remedial";
export type WorkType = "doors" | "fs";
export type ProjectStatus = "planned" | "in_progress" | "completed" | "cancelled";
export type AssetStatus = "active" | "removed" | "replaced";
export type AnswerType = "yes_no" | "text" | "number" | "select" | "photo";
export type InspectionResult = "pass" | "fail" | "partial";
export type FindingSeverity = "low" | "medium" | "high";
export type FindingStatus = "open" | "quoted" | "in_progress" | "resolved" | "cancelled";
export type RemedialStatus = "todo" | "in_progress" | "done" | "cancelled";
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "superseded";
export type ReportType = "inspection" | "remedial" | "handover";
export type ReportStatus = "draft" | "qc" | "issued";
export type PhotoKind = "before" | "after" | "general";
export type AssetEventType =
  | "created"
  | "details_changed"
  | "inspected"
  | "finding_raised"
  | "remedial_done"
  | "certificate_issued"
  | "removed";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type BuildingAssignment = {
  id: string;
  profile_id: string;
  building_id: string;
  created_at: string;
}

export type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  adjustment_pct: number;
  vat_number: string | null;
  payment_terms_days: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type Building = {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  adjustment_pct: number;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type Floor = {
  id: string;
  building_id: string;
  name: string;
  sort_order: number;
  floor_plan_path: string | null;
  created_at: string;
  updated_at: string;
}

export type Asset = {
  id: string;
  building_id: string;
  floor_id: string | null;
  work_type: WorkType;
  ref: string;
  subtype: string | null;
  location: string | null;
  qr_code: string | null;
  cycle_months: 3 | 6 | 12 | null;
  next_due_date: string | null;
  status: AssetStatus;
  spec: Json;
  created_by: string | null;
  device_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  received_at: string | null;
}

export type Project = {
  id: string;
  client_id: string;
  building_id: string;
  work_type: WorkType;
  name: string;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type SurveyTemplate = {
  id: string;
  work_type: WorkType;
  name: string;
  version: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type SurveyTemplateItem = {
  id: string;
  template_id: string;
  question: string;
  answer_type: AnswerType;
  group_name: string | null;
  sort_order: number;
  required: boolean;
  options: Json | null;
  fail_values: string[] | null;
  created_at: string;
  updated_at: string;
}

export type Inspection = {
  id: string;
  asset_id: string;
  project_id: string | null;
  template_id: string | null;
  inspector_id: string | null;
  started_at: string;
  completed_at: string | null;
  overall_result: InspectionResult | null;
  notes: string | null;
  created_by: string | null;
  device_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  received_at: string | null;
}

export type InspectionAnswer = {
  id: string;
  inspection_id: string;
  template_item_id: string | null;
  question_text: string;
  value: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  received_at: string | null;
}

export type Finding = {
  id: string;
  inspection_id: string | null;
  asset_id: string;
  building_id: string;
  floor_id: string | null;
  description: string;
  severity: FindingSeverity;
  pin_x: number | null;
  pin_y: number | null;
  suggested_price_item_id: string | null;
  qty: number;
  status: FindingStatus;
  created_by: string | null;
  device_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  received_at: string | null;
}

export type PriceListItem = {
  id: string;
  code: string;
  name: string;
  work_type: WorkType | null;
  unit: string;
  default_price: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type Quote = {
  id: string;
  project_id: string | null;
  building_id: string;
  client_id: string;
  number: string;
  version: number;
  is_current: boolean;
  status: QuoteStatus;
  notes: string | null;
  total: number;
  created_by: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  invoice_ref: string | null;
  invoiced_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type QuoteLine = {
  id: string;
  quote_id: string;
  finding_id: string | null;
  price_item_id: string | null;
  description: string;
  qty: number;
  default_price: number;
  client_pct: number;
  building_pct: number;
  calculated_price: number | null; // generated by the database
  override_price: number | null;
  final_price: number | null; // generated by the database
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type RemedialItem = {
  id: string;
  building_id: string;
  finding_id: string | null;
  quote_line_id: string | null;
  asset_id: string | null;
  floor_id: string | null;
  description: string;
  detail: string | null;
  status: RemedialStatus;
  assigned_to: string | null;
  done_by: string | null;
  done_at: string | null;
  created_by: string | null;
  device_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  received_at: string | null;
}

export type FindingPhoto = {
  id: string;
  finding_id: string;
  kind: PhotoKind;
  storage_path: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  taken_at: string | null;
  uploaded_at: string | null;
  created_by: string | null;
  device_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  received_at: string | null;
}

export type RemedialPhoto = {
  id: string;
  remedial_item_id: string;
  kind: PhotoKind;
  storage_path: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  taken_at: string | null;
  uploaded_at: string | null;
  created_by: string | null;
  device_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  received_at: string | null;
}

export type Report = {
  id: string;
  project_id: string | null;
  building_id: string;
  type: ReportType;
  status: ReportStatus;
  pdf_path: string | null;
  issued_at: string | null;
  sent_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type Certificate = {
  id: string;
  building_id: string;
  project_id: string | null;
  number: string | null;
  file_path: string;
  issued_at: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type AssetEvent = {
  id: string;
  asset_id: string;
  event_type: AssetEventType;
  ref_id: string | null;
  occurred_at: string;
  actor_id: string | null;
  summary: string;
  created_at: string;
}

/* View all_photos: finding photos and remedial photos in one list. */
export type AllPhoto = {
  source: "finding" | "remedial";
  id: string;
  parent_id: string;
  building_id: string;
  asset_id: string | null;
  kind: PhotoKind;
  storage_path: string;
  taken_at: string | null;
  uploaded_at: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

// ---------------------------------------------------------------------------
// RPC shapes (20260913184233_sync.sql)
// ---------------------------------------------------------------------------

/* Result of download_building(p_building_id). Remedial users get no
   projects, findings, templates or prices. */
export type DownloadBuildingResult = {
  downloaded_at: string;
  role: UserRole;
  building: Building;
  floors: Floor[];
  assets: Asset[];
  remedial_items: RemedialItem[];
  remedial_photos: RemedialPhoto[];
  projects?: Project[];
  findings?: Finding[];
  finding_photos?: FindingPhoto[];
  survey_templates?: SurveyTemplate[];
  survey_template_items?: SurveyTemplateItem[];
  price_list_items?: PriceListItem[];
}

export type SyncEntity =
  | "assets"
  | "inspections"
  | "inspection_answers"
  | "findings"
  | "finding_photos"
  | "remedial_items"
  | "remedial_photos";

export type SyncPushChange = {
  id: string;
  op: "upsert" | "patch";
  entity: SyncEntity;
  record_id: string;
  payload: Record<string, Json | undefined>;
}

export type SyncPushResult = {
  id: string;
  status: "ok" | "ignored_older" | "error";
  message?: string;
}

// ---------------------------------------------------------------------------
// Database type for createClient<Database>
// Insert and Update are loose on purpose: the server fills defaults and the
// field sends whole rows through sync_push, not through the table API.
// ---------------------------------------------------------------------------

type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<Profile>;
      building_assignments: TableDef<BuildingAssignment>;
      clients: TableDef<Client>;
      buildings: TableDef<Building>;
      floors: TableDef<Floor>;
      assets: TableDef<Asset>;
      projects: TableDef<Project>;
      survey_templates: TableDef<SurveyTemplate>;
      survey_template_items: TableDef<SurveyTemplateItem>;
      inspections: TableDef<Inspection>;
      inspection_answers: TableDef<InspectionAnswer>;
      findings: TableDef<Finding>;
      price_list_items: TableDef<PriceListItem>;
      quotes: TableDef<Quote>;
      quote_lines: TableDef<QuoteLine>;
      remedial_items: TableDef<RemedialItem>;
      finding_photos: TableDef<FindingPhoto>;
      remedial_photos: TableDef<RemedialPhoto>;
      reports: TableDef<Report>;
      certificates: TableDef<Certificate>;
      asset_events: TableDef<AssetEvent>;
    };
    Views: {
      all_photos: {
        Row: AllPhoto;
        Relationships: [];
      };
    };
    Functions: {
      download_building: {
        Args: { p_building_id: string };
        Returns: Json;
      };
      sync_push: {
        Args: { p_changes: Json };
        Returns: Json;
      };
      current_role_of_user: {
        Args: Record<string, never>;
        Returns: UserRole | null;
      };
    };
    Enums: {
      user_role: UserRole;
      work_type: WorkType;
      project_status: ProjectStatus;
      asset_status: AssetStatus;
      answer_type: AnswerType;
      inspection_result: InspectionResult;
      finding_severity: FindingSeverity;
      finding_status: FindingStatus;
      remedial_status: RemedialStatus;
      quote_status: QuoteStatus;
      report_type: ReportType;
      report_status: ReportStatus;
      photo_kind: PhotoKind;
      asset_event_type: AssetEventType;
    };
    CompositeTypes: Record<string, never>;
  };
}

/* Names of the tables mirrored on the phone (docs/SYNC-PROTOCOL.md section 2). */
export type MirrorTable =
  | "buildings"
  | "floors"
  | "assets"
  | "projects"
  | "survey_templates"
  | "survey_template_items"
  | "price_list_items"
  | "inspections"
  | "inspection_answers"
  | "findings"
  | "finding_photos"
  | "remedial_items"
  | "remedial_photos";

export type MirrorRowOf<T extends MirrorTable> = Database["public"]["Tables"][T]["Row"];
