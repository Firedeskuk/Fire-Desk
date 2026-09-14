-- Fire Desk, initial database schema
-- File: supabase/migrations/20260913184137_init.sql
-- Target project: Fire Desk (application database), region eu-west-2
-- Nothing is run automatically. Review first, then apply.
--
-- Conventions used here:
--   * all names, comments and copy in English
--   * every primary key is a uuid, so a phone can generate it offline
--   * field tables carry created_by, device_id and deleted_at (soft delete, nothing is hard deleted)
--   * percentages are stored as "100 = no change", so 90 means minus 10 percent

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

create type user_role         as enum ('manager', 'admin', 'inspector', 'remedial');
create type work_type         as enum ('doors', 'fs');
create type project_status    as enum ('planned', 'in_progress', 'completed', 'cancelled');
create type asset_status      as enum ('active', 'removed', 'replaced');
create type answer_type       as enum ('yes_no', 'text', 'number', 'select', 'photo');
create type inspection_result as enum ('pass', 'fail', 'partial');
create type finding_severity  as enum ('low', 'medium', 'high');
create type finding_status    as enum ('open', 'quoted', 'in_progress', 'resolved', 'cancelled');
create type remedial_status   as enum ('todo', 'in_progress', 'done', 'cancelled');
create type quote_status      as enum ('draft', 'sent', 'accepted', 'rejected', 'superseded');
create type report_type       as enum ('inspection', 'remedial', 'handover');
create type report_status     as enum ('draft', 'qc', 'issued');
create type photo_kind        as enum ('before', 'after', 'general');
create type asset_event_type  as enum ('created', 'details_changed', 'inspected', 'finding_raised',
                                       'remedial_done', 'certificate_issued', 'removed');

-- ---------------------------------------------------------------------------
-- 2. Shared helpers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. People and access
-- ---------------------------------------------------------------------------

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'inspector',
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A remedial team member is assigned to a whole building, never to single defects.
create table building_assignments (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  building_id uuid not null,
  created_at  timestamptz not null default now(),
  unique (profile_id, building_id)
);

-- ---------------------------------------------------------------------------
-- 4. Clients, buildings, floors, assets
-- ---------------------------------------------------------------------------

create table clients (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  contact_name       text,
  contact_email      text,
  contact_phone      text,
  -- 100 = list price, 90 = minus 10 percent
  adjustment_pct     numeric(6,3) not null default 100 check (adjustment_pct > 0),
  -- stage 2 invoicing, columns only, no screens in the MVP
  vat_number         text,
  payment_terms_days integer,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create table buildings (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients (id) on delete restrict,
  name           text not null,
  address        text,
  postcode       text,
  adjustment_pct numeric(6,3) not null default 100 check (adjustment_pct > 0),
  notes          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

alter table building_assignments
  add constraint building_assignments_building_fk
  foreign key (building_id) references buildings (id) on delete cascade;

-- Floors are optional. A building can hold assets with no floor set.
create table floors (
  id              uuid primary key default gen_random_uuid(),
  building_id     uuid not null references buildings (id) on delete cascade,
  name            text not null,
  sort_order      integer not null default 0,
  floor_plan_path text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (building_id, name)
);

-- An asset is a fire door or a fire stopping penetration. It keeps its history for life.
create table assets (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings (id) on delete restrict,
  floor_id      uuid references floors (id) on delete set null,
  work_type     work_type not null,
  ref           text not null,                       -- door or item number, for example 2F-05
  subtype       text,                                -- FD30, FD60, cable bunch, pipe
  location      text,
  qr_code       text unique,
  cycle_months  integer check (cycle_months in (3, 6, 12)),  -- null = NA
  next_due_date date,
  status        asset_status not null default 'active',
  spec          jsonb not null default '{}'::jsonb,
  created_by    uuid references profiles (id),
  device_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (building_id, ref)
);

create index assets_building_idx on assets (building_id);
create index assets_due_idx      on assets (next_due_date) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 5. Projects and survey templates
-- ---------------------------------------------------------------------------

create table projects (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients (id) on delete restrict,
  building_id uuid not null references buildings (id) on delete restrict,
  work_type   work_type not null,
  name        text not null,
  status      project_status not null default 'planned',
  start_date  date,
  end_date    date,
  created_by  uuid references profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table survey_templates (
  id         uuid primary key default gen_random_uuid(),
  work_type  work_type not null,
  name       text not null,
  version    integer not null default 1,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version)
);

create table survey_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references survey_templates (id) on delete cascade,
  question    text not null,
  answer_type answer_type not null default 'yes_no',
  group_name  text,
  sort_order  integer not null default 0,
  required    boolean not null default true,
  options     jsonb,                                  -- for answer_type = select
  fail_values text[],                                 -- answers that raise a finding
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index survey_template_items_template_idx on survey_template_items (template_id, sort_order);

-- ---------------------------------------------------------------------------
-- 6. Inspections and findings (written offline on the phone)
-- ---------------------------------------------------------------------------

create table inspections (
  id             uuid primary key default gen_random_uuid(),
  asset_id       uuid not null references assets (id) on delete restrict,
  project_id     uuid references projects (id) on delete set null,
  template_id    uuid references survey_templates (id),
  inspector_id   uuid references profiles (id),
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  overall_result inspection_result,
  notes          text,
  created_by     uuid references profiles (id),
  device_id      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index inspections_asset_idx on inspections (asset_id, started_at desc);

create table inspection_answers (
  id               uuid primary key default gen_random_uuid(),
  inspection_id    uuid not null references inspections (id) on delete cascade,
  template_item_id uuid references survey_template_items (id),
  question_text    text not null,          -- copied in, so an edited template never rewrites history
  value            text,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (inspection_id, template_item_id)
);

-- Findings are always appended, never replaced by a sync.
create table findings (
  id                    uuid primary key default gen_random_uuid(),
  inspection_id         uuid references inspections (id) on delete set null,
  asset_id              uuid not null references assets (id) on delete restrict,
  building_id           uuid not null references buildings (id) on delete restrict,
  floor_id              uuid references floors (id) on delete set null,
  description           text not null,
  severity              finding_severity not null default 'medium',
  pin_x                 numeric(6,3),      -- 0 to 1, relative position on the floor plan
  pin_y                 numeric(6,3),
  suggested_price_item_id uuid,
  qty                   numeric(10,2) not null default 1,
  status                finding_status not null default 'open',
  created_by            uuid references profiles (id),
  device_id             text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create index findings_asset_idx    on findings (asset_id);
create index findings_building_idx on findings (building_id, status);

-- ---------------------------------------------------------------------------
-- 7. Pricing, quotes, remedial works
-- ---------------------------------------------------------------------------

create table price_list_items (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  work_type     work_type,
  unit          text not null default 'item',
  default_price numeric(10,2) not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table findings
  add constraint findings_price_item_fk
  foreign key (suggested_price_item_id) references price_list_items (id) on delete set null;

create table quotes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects (id) on delete set null,
  building_id uuid not null references buildings (id) on delete restrict,
  client_id   uuid not null references clients (id) on delete restrict,
  number      text not null unique,
  version     integer not null default 1,
  is_current  boolean not null default true,
  status      quote_status not null default 'draft',
  notes       text,
  total       numeric(12,2) not null default 0,
  created_by  uuid references profiles (id),
  sent_at     timestamptz,
  accepted_at timestamptz,
  -- stage 2 invoicing, columns only, no screens in the MVP
  invoice_ref text,
  invoiced_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index quotes_building_idx on quotes (building_id, is_current);

-- The percentages are copied into the line, so editing the price list later
-- never changes a quote that was already sent.
create table quote_lines (
  id               uuid primary key default gen_random_uuid(),
  quote_id         uuid not null references quotes (id) on delete cascade,
  finding_id       uuid references findings (id) on delete set null,
  price_item_id    uuid references price_list_items (id) on delete set null,
  description      text not null,
  qty              numeric(10,2) not null default 1,
  default_price    numeric(10,2) not null default 0,
  client_pct       numeric(6,3) not null default 100,
  building_pct     numeric(6,3) not null default 100,
  calculated_price numeric(12,2)
    generated always as (
      round(default_price * qty * (client_pct / 100) * (building_pct / 100), 2)
    ) stored,
  override_price   numeric(12,2),
  final_price      numeric(12,2)
    generated always as (
      coalesce(override_price, round(default_price * qty * (client_pct / 100) * (building_pct / 100), 2))
    ) stored,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index quote_lines_quote_idx on quote_lines (quote_id, sort_order);

-- A remedial item is created straight from a finding, no approval gate.
create table remedial_items (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings (id) on delete restrict,
  finding_id    uuid references findings (id) on delete set null,
  quote_line_id uuid references quote_lines (id) on delete set null,
  asset_id      uuid references assets (id) on delete set null,
  floor_id      uuid references floors (id) on delete set null,
  description   text not null,
  detail        text,                        -- product or method, for example Quelfire QSS-FW100-01
  status        remedial_status not null default 'todo',
  assigned_to   uuid references profiles (id) on delete set null,
  done_by       uuid references profiles (id) on delete set null,
  done_at       timestamptz,
  created_by    uuid references profiles (id),
  device_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index remedial_items_building_idx on remedial_items (building_id, status);

-- ---------------------------------------------------------------------------
-- 8. Photos (two tables by decision, one shared view for searching)
-- ---------------------------------------------------------------------------

create table finding_photos (
  id           uuid primary key default gen_random_uuid(),
  finding_id   uuid not null references findings (id) on delete cascade,
  kind         photo_kind not null default 'before',
  storage_path text not null,
  width        integer,
  height       integer,
  bytes        integer,
  taken_at     timestamptz,
  uploaded_at  timestamptz,
  created_by   uuid references profiles (id),
  device_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table remedial_photos (
  id               uuid primary key default gen_random_uuid(),
  remedial_item_id uuid not null references remedial_items (id) on delete cascade,
  kind             photo_kind not null default 'after',
  storage_path     text not null,
  width            integer,
  height           integer,
  bytes            integer,
  taken_at         timestamptz,
  uploaded_at      timestamptz,
  created_by       uuid references profiles (id),
  device_id        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index finding_photos_finding_idx   on finding_photos (finding_id);
create index remedial_photos_item_idx     on remedial_photos (remedial_item_id);

create view all_photos as
  select 'finding'::text as source, p.id, p.finding_id as parent_id, f.building_id, f.asset_id,
         p.kind, p.storage_path, p.taken_at, p.uploaded_at, p.created_by, p.created_at, p.deleted_at
  from finding_photos p
  join findings f on f.id = p.finding_id
  union all
  select 'remedial'::text, p.id, p.remedial_item_id, r.building_id, r.asset_id,
         p.kind, p.storage_path, p.taken_at, p.uploaded_at, p.created_by, p.created_at, p.deleted_at
  from remedial_photos p
  join remedial_items r on r.id = p.remedial_item_id;

-- ---------------------------------------------------------------------------
-- 9. Reports, certificates, asset history
-- ---------------------------------------------------------------------------

create table reports (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects (id) on delete set null,
  building_id uuid not null references buildings (id) on delete restrict,
  type        report_type not null default 'inspection',
  status      report_status not null default 'draft',
  pdf_path    text,
  issued_at   timestamptz,
  sent_to     text,
  created_by  uuid references profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table certificates (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings (id) on delete restrict,
  project_id  uuid references projects (id) on delete set null,
  number      text,
  file_path   text not null,
  issued_at   date,
  uploaded_by uuid references profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (building_id, project_id)
);

-- Golden thread of information. Written by the application, never edited.
create table asset_events (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references assets (id) on delete cascade,
  event_type  asset_event_type not null,
  ref_id      uuid,                     -- inspection, finding, remedial item or certificate
  occurred_at timestamptz not null default now(),
  actor_id    uuid references profiles (id),
  summary     text not null,
  created_at  timestamptz not null default now()
);

create index asset_events_asset_idx on asset_events (asset_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 10. updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'clients', 'buildings', 'floors', 'assets', 'projects',
    'survey_templates', 'survey_template_items', 'inspections', 'inspection_answers',
    'findings', 'price_list_items', 'quotes', 'quote_lines', 'remedial_items',
    'finding_photos', 'remedial_photos', 'reports', 'certificates'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
         for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Row level security
-- ---------------------------------------------------------------------------

create or replace function current_role_of_user()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid() and active = true
$$;

create or replace function is_office()
returns boolean
language sql
stable
as $$
  select current_role_of_user() in ('manager', 'admin')
$$;

create or replace function is_inspector()
returns boolean
language sql
stable
as $$
  select current_role_of_user() = 'inspector'
$$;

create or replace function is_remedial()
returns boolean
language sql
stable
as $$
  select current_role_of_user() = 'remedial'
$$;

create or replace function has_building(b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from building_assignments
    where profile_id = auth.uid() and building_id = b
  )
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'building_assignments', 'clients', 'buildings', 'floors', 'assets',
    'projects', 'survey_templates', 'survey_template_items', 'inspections',
    'inspection_answers', 'findings', 'price_list_items', 'quotes', 'quote_lines',
    'remedial_items', 'finding_photos', 'remedial_photos', 'reports', 'certificates',
    'asset_events'
  ]
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Everyone signed in can read their own profile, office manages the rest.
create policy profiles_self_read   on profiles for select using (id = auth.uid() or is_office());
create policy profiles_office_all  on profiles for all    using (is_office()) with check (is_office());

-- Office has full access to everything.
do $$
declare t text;
begin
  foreach t in array array[
    'building_assignments', 'clients', 'buildings', 'floors', 'assets', 'projects',
    'survey_templates', 'survey_template_items', 'inspections', 'inspection_answers',
    'findings', 'price_list_items', 'quotes', 'quote_lines', 'remedial_items',
    'finding_photos', 'remedial_photos', 'reports', 'certificates', 'asset_events'
  ]
  loop
    execute format(
      'create policy %I_office_all on %I for all using (is_office()) with check (is_office())', t, t);
  end loop;
end $$;

-- Inspector: reads the register, writes inspections, findings and their photos.
create policy clients_inspector_read   on clients              for select using (is_inspector());
create policy buildings_inspector_read on buildings            for select using (is_inspector());
create policy floors_inspector_read    on floors               for select using (is_inspector());
create policy assets_inspector_read    on assets               for select using (is_inspector());
create policy projects_inspector_read  on projects             for select using (is_inspector());
create policy templates_inspector_read on survey_templates     for select using (is_inspector());
create policy items_inspector_read     on survey_template_items for select using (is_inspector());
create policy prices_inspector_read    on price_list_items     for select using (is_inspector());
create policy events_inspector_read    on asset_events         for select using (is_inspector());

create policy assets_inspector_write      on assets             for insert with check (is_inspector());
create policy inspections_inspector_write on inspections        for all
  using (is_inspector()) with check (is_inspector());
create policy answers_inspector_write     on inspection_answers for all
  using (is_inspector()) with check (is_inspector());
create policy findings_inspector_write    on findings           for all
  using (is_inspector()) with check (is_inspector());
create policy finding_photos_inspector    on finding_photos     for all
  using (is_inspector()) with check (is_inspector());

-- Remedial team: only assigned buildings, only the works list, never inspections or findings.
create policy buildings_remedial_read on buildings for select
  using (is_remedial() and has_building(id));

create policy floors_remedial_read on floors for select
  using (is_remedial() and has_building(building_id));

create policy assets_remedial_read on assets for select
  using (is_remedial() and has_building(building_id));

create policy remedial_items_read on remedial_items for select
  using (is_remedial() and has_building(building_id));

create policy remedial_items_update on remedial_items for update
  using (is_remedial() and has_building(building_id))
  with check (is_remedial() and has_building(building_id));

create policy remedial_photos_rw on remedial_photos for all
  using (
    is_remedial() and exists (
      select 1 from remedial_items r
      where r.id = remedial_photos.remedial_item_id and has_building(r.building_id)
    )
  )
  with check (
    is_remedial() and exists (
      select 1 from remedial_items r
      where r.id = remedial_photos.remedial_item_id and has_building(r.building_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 12. Storage buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('photos', 'photos', false),
  ('floorplans', 'floorplans', false),
  ('reports', 'reports', false),
  ('certificates', 'certificates', false)
on conflict (id) do nothing;

create policy storage_read_signed_in on storage.objects for select to authenticated
  using (bucket_id in ('photos', 'floorplans', 'reports', 'certificates'));

create policy storage_write_signed_in on storage.objects for insert to authenticated
  with check (bucket_id in ('photos', 'floorplans', 'reports', 'certificates'));

-- End of 20260913184137_init.sql
