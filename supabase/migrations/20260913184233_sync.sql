-- Fire Desk, sync layer and server side rules
-- File: supabase/migrations/20260913184233_sync.sql
-- Requires 20260913184137_init.sql. Implements section 11 of docs/SYNC-PROTOCOL.md.
-- Review first, then apply.

-- ---------------------------------------------------------------------------
-- 1. received_at on every table the field writes to
-- ---------------------------------------------------------------------------

alter table assets             add column received_at timestamptz;
alter table inspections        add column received_at timestamptz;
alter table inspection_answers add column received_at timestamptz;
alter table findings           add column received_at timestamptz;
alter table finding_photos     add column received_at timestamptz;
alter table remedial_items     add column received_at timestamptz;
alter table remedial_photos    add column received_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. updated_at: keep a value the caller set on purpose (field rows carry
--    device time), fill in now() only when the caller did not change it.
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at is null or new.updated_at = old.updated_at then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Profile row on sign up. Role comes from invitation metadata, default inspector.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role := 'inspector';
begin
  begin
    v_role := coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'inspector');
  exception when others then
    v_role := 'inspector';
  end;

  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. RLS gap from 20260913184137_init: the field patches a few asset fields (qr_code, location...)
-- ---------------------------------------------------------------------------

create policy assets_inspector_update on assets for update
  using (is_inspector()) with check (is_inspector());

-- ---------------------------------------------------------------------------
-- 5. Asset history (golden thread) and derived data. All security definer,
--    so a field insert can write history rows the inspector could not write directly.
-- ---------------------------------------------------------------------------

create or replace function on_asset_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into asset_events (asset_id, event_type, ref_id, occurred_at, actor_id, summary)
  values (new.id, 'created', new.id, new.created_at, new.created_by,
          'Asset created: ' || new.ref || coalesce(', ' || new.subtype, ''));
  return new;
end;
$$;

create trigger assets_created
  after insert on assets
  for each row execute function on_asset_created();

create or replace function on_inspection_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completed_at is not null and (tg_op = 'INSERT' or old.completed_at is null) then
    update assets a
       set next_due_date = case
                             when a.cycle_months is null then null
                             else (new.completed_at + make_interval(months => a.cycle_months))::date
                           end
     where a.id = new.asset_id;

    insert into asset_events (asset_id, event_type, ref_id, occurred_at, actor_id, summary)
    values (new.asset_id, 'inspected', new.id, new.completed_at, new.inspector_id,
            'Inspection completed: ' || coalesce(new.overall_result::text, 'no result'));
  end if;
  return new;
end;
$$;

create trigger inspections_completed
  after insert or update of completed_at on inspections
  for each row execute function on_inspection_completed();

-- Decision 13 Sep 2026: a remedial item is created straight from the finding, no approval gate.
create or replace function on_finding_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into asset_events (asset_id, event_type, ref_id, occurred_at, actor_id, summary)
  values (new.asset_id, 'finding_raised', new.id, new.created_at, new.created_by,
          'Finding (' || new.severity::text || '): ' || left(new.description, 200));

  insert into remedial_items (building_id, finding_id, asset_id, floor_id, description, status, created_by)
  values (new.building_id, new.id, new.asset_id, new.floor_id, new.description, 'todo', new.created_by);

  return new;
end;
$$;

create trigger findings_created
  after insert on findings
  for each row execute function on_finding_created();

create or replace function on_remedial_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    if new.asset_id is not null then
      insert into asset_events (asset_id, event_type, ref_id, occurred_at, actor_id, summary)
      values (new.asset_id, 'remedial_done', new.id, coalesce(new.done_at, now()), new.done_by,
              'Remedial done: ' || left(new.description, 200));
    end if;

    if new.finding_id is not null then
      update findings
         set status = 'resolved'
       where id = new.finding_id and status <> 'cancelled';
    end if;
  end if;
  return new;
end;
$$;

create trigger remedial_items_done
  after update of status on remedial_items
  for each row execute function on_remedial_done();

create or replace function on_certificate_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into asset_events (asset_id, event_type, ref_id, occurred_at, actor_id, summary)
  select a.id, 'certificate_issued', new.id,
         coalesce(new.issued_at::timestamptz, now()), new.uploaded_by,
         'NAPFIS certificate ' || coalesce(new.number, '')
    from assets a
    left join projects p on p.id = new.project_id
   where a.building_id = new.building_id
     and a.deleted_at is null
     and (p.work_type is null or a.work_type = p.work_type);
  return new;
end;
$$;

create trigger certificates_created
  after insert on certificates
  for each row execute function on_certificate_created();

-- ---------------------------------------------------------------------------
-- 6. download_building: one JSON tree for the phone. Runs as the caller, so
--    RLS decides what each role gets. Remedial gets the works list only.
-- ---------------------------------------------------------------------------

create or replace function download_building(p_building_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role     user_role := current_role_of_user();
  v_building jsonb;
  v_result   jsonb;
begin
  if v_role is null then
    raise exception 'Not signed in or profile inactive' using errcode = '42501';
  end if;

  select to_jsonb(b) into v_building
    from buildings b
   where b.id = p_building_id and b.deleted_at is null;

  if v_building is null then
    raise exception 'Building not found or not allowed' using errcode = '42501';
  end if;

  v_result := jsonb_build_object(
    'downloaded_at', now(),
    'role', v_role,
    'building', v_building,
    'floors', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.sort_order, f.name)
        from floors f where f.building_id = p_building_id), '[]'::jsonb),
    'assets', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.ref)
        from assets a where a.building_id = p_building_id and a.deleted_at is null), '[]'::jsonb),
    'remedial_items', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
        from remedial_items r
       where r.building_id = p_building_id and r.deleted_at is null
         and r.status in ('todo', 'in_progress')), '[]'::jsonb),
    'remedial_photos', coalesce((
      select jsonb_agg(to_jsonb(p))
        from remedial_photos p
        join remedial_items r on r.id = p.remedial_item_id
       where r.building_id = p_building_id and p.deleted_at is null
         and r.status in ('todo', 'in_progress')), '[]'::jsonb)
  );

  if v_role <> 'remedial' then
    v_result := v_result || jsonb_build_object(
      'projects', coalesce((
        select jsonb_agg(to_jsonb(p) order by p.created_at)
          from projects p
         where p.building_id = p_building_id and p.deleted_at is null
           and p.status in ('planned', 'in_progress')), '[]'::jsonb),
      'findings', coalesce((
        select jsonb_agg(to_jsonb(f) order by f.created_at)
          from findings f
         where f.building_id = p_building_id and f.deleted_at is null
           and f.status in ('open', 'quoted', 'in_progress')), '[]'::jsonb),
      'finding_photos', coalesce((
        select jsonb_agg(to_jsonb(p))
          from finding_photos p
          join findings f on f.id = p.finding_id
         where f.building_id = p_building_id and p.deleted_at is null
           and f.status in ('open', 'quoted', 'in_progress')), '[]'::jsonb),
      'survey_templates', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.work_type, t.name)
          from survey_templates t where t.active), '[]'::jsonb),
      'survey_template_items', coalesce((
        select jsonb_agg(to_jsonb(i) order by i.template_id, i.sort_order)
          from survey_template_items i
          join survey_templates t on t.id = i.template_id
         where t.active), '[]'::jsonb),
      'price_list_items', coalesce((
        select jsonb_agg(to_jsonb(p) order by p.code)
          from price_list_items p where p.active), '[]'::jsonb)
    );
  end if;

  return v_result;
end;
$$;

revoke all on function download_building(uuid) from public;
grant execute on function download_building(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. sync_push: applies a batch of outbox rows. One transaction for the batch,
--    one subtransaction per row, so a bad row reports an error and the rest go in.
--    Runs as the caller, RLS applies to every insert and update.
--
--    Input: array of { id, op, entity, record_id, payload }
--      op = 'upsert'  payload is the whole row from the device
--      op = 'patch'   payload holds only the changed fields
--    Output: array of { id, status, message }, status = ok | ignored_older | error
-- ---------------------------------------------------------------------------

create or replace function sync_push(p_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_change    jsonb;
  v_id        text;
  v_op        text;
  v_entity    text;
  v_record_id uuid;
  v_payload   jsonb;
  v_set       text;
  v_count     integer;
  v_results   jsonb  := '[]'::jsonb;
  v_allowed   text[] := array[
    'assets', 'inspections', 'inspection_answers', 'findings',
    'finding_photos', 'remedial_items', 'remedial_photos'
  ];
begin
  if current_role_of_user() is null then
    raise exception 'Not signed in or profile inactive' using errcode = '42501';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'changes must be a JSON array';
  end if;

  for v_change in select * from jsonb_array_elements(p_changes) loop
    v_id      := v_change ->> 'id';
    v_op      := v_change ->> 'op';
    v_entity  := v_change ->> 'entity';
    v_payload := coalesce(v_change -> 'payload', '{}'::jsonb);

    begin
      if not (v_entity = any (v_allowed)) then
        raise exception 'entity % not allowed', coalesce(v_entity, 'null');
      end if;

      v_record_id := (v_change ->> 'record_id')::uuid;
      if v_record_id is null then
        raise exception 'record_id missing';
      end if;

      -- fields the device may never set
      v_payload := (v_payload - 'received_at' - 'origin') || jsonb_build_object('id', v_record_id);

      if v_op = 'upsert' then
        v_payload := v_payload
          || jsonb_build_object('received_at', now())
          || jsonb_build_object('created_by', coalesce(v_payload ->> 'created_by', auth.uid()::text));

        select string_agg(format('%I = excluded.%I', c.column_name, c.column_name), ', ')
          into v_set
          from information_schema.columns c
         where c.table_schema = 'public'
           and c.table_name = v_entity
           and c.column_name not in ('id', 'created_at', 'created_by')
           and c.is_generated = 'NEVER';

        execute format(
          'insert into %I select * from jsonb_populate_record(null::%I, $1)
             on conflict (id) do update set %s
             where excluded.updated_at >= %I.updated_at',
          v_entity, v_entity, v_set, v_entity)
        using v_payload;

        get diagnostics v_count = row_count;

        v_results := v_results || jsonb_build_object(
          'id', v_id,
          'status', case when v_count > 0 then 'ok' else 'ignored_older' end);

      elsif v_op = 'patch' then
        select string_agg(
                 format('%I = (%L::jsonb ->> %L)::%s',
                        c.column_name, v_payload::text, c.column_name,
                        format_type(a.atttypid, a.atttypmod)),
                 ', ')
          into v_set
          from information_schema.columns c
          join pg_attribute a
            on a.attrelid = ('public.' || quote_ident(v_entity))::regclass
           and a.attname = c.column_name
         where c.table_schema = 'public'
           and c.table_name = v_entity
           and c.column_name not in ('id', 'created_at', 'created_by', 'received_at', 'updated_at')
           and c.is_generated = 'NEVER'
           and v_payload ? c.column_name;

        if v_set is null then
          raise exception 'patch has no known fields';
        end if;

        execute format('update %I set %s, received_at = now() where id = $1', v_entity, v_set)
        using v_record_id;

        get diagnostics v_count = row_count;

        if v_count > 0 then
          v_results := v_results || jsonb_build_object('id', v_id, 'status', 'ok');
        else
          v_results := v_results || jsonb_build_object(
            'id', v_id, 'status', 'error', 'message', 'record not found or not allowed');
        end if;

      else
        raise exception 'op % not allowed', coalesce(v_op, 'null');
      end if;

    exception when others then
      v_results := v_results || jsonb_build_object(
        'id', v_id, 'status', 'error', 'message', sqlerrm);
    end;
  end loop;

  return v_results;
end;
$$;

revoke all on function sync_push(jsonb) from public;
grant execute on function sync_push(jsonb) to authenticated;

-- End of 20260913184233_sync.sql
