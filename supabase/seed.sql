-- Fire Desk, sample seed data
-- File: supabase/seed.sql
--
-- What it creates (invented names only, no real client, address or phone):
--   * one client "Sample Housing Ltd" (adjustment 95 percent)
--   * one building "Test House", postcode AB1 2CD, with three floors
--   * 20 fire doors (GF-01 to GF-07, 1F-01 to 1F-07, 2F-01 to 2F-06) and
--     5 fire stopping penetrations (FS-01 to FS-05), due dates relative to
--     today so the dashboard always shows overdue, due soon and fine
--   * one doors survey template with 10 yes no questions
--   * one fire stopping survey template with 6 yes no questions
--   * 15 price list items with realistic UK prices
--
-- What it does not create: profiles, auth users, inspections, findings,
-- remedial items. The app creates those (a remedial item is created by a
-- trigger when a finding is inserted).
--
-- How to run: Supabase Dashboard, SQL Editor, paste the whole file, Run.
-- Requires both migrations (20260913184137_init.sql, 20260913184233_sync.sql).
--
-- Safe to run more than once: every row has a fixed uuid and every insert
-- ends with "on conflict (id) do nothing", so a second run inserts nothing.
-- The due dates are computed from current_date at the moment of the first
-- run and are not moved by later runs.
--
-- Door split: the task asks for 20 doors GF-01 to 2F-06 and leaves the per
-- floor split open. Chosen here: GF-01 to GF-07, 1F-01 to 1F-07, 2F-01 to
-- 2F-06.

-- ---------------------------------------------------------------------------
-- 1. Client
-- ---------------------------------------------------------------------------

insert into clients (id, name, contact_name, contact_email, contact_phone, adjustment_pct, active)
values (
  '00000000-0000-4000-8000-000000000001',
  'Sample Housing Ltd',
  'Sam Sample',
  'sam@example.com',
  null,
  95,
  true
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Building and floors
-- ---------------------------------------------------------------------------

insert into buildings (id, client_id, name, address, postcode, adjustment_pct, notes, active)
values (
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000001',
  'Test House',
  '1 Example Street, Sampletown',
  'AB1 2CD',
  100,
  'Sample building for demos and testing. Not a real place.',
  true
)
on conflict (id) do nothing;

insert into floors (id, building_id, name, sort_order, floor_plan_path)
values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000010', 'Ground', 0, null),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000010', 'First',  1, null),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000010', 'Second', 2, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Assets: 20 fire doors
--    Due dates relative to current_date:
--      overdue more than 14 days (red):   GF-01, GF-02, GF-03, 1F-01, 1F-02
--      overdue 1 to 14 days (yellow):     GF-04, GF-05, 1F-03, 1F-04
--      due within 30 days (green, soon):  GF-06, GF-07, 1F-05, 2F-01, 2F-02
--      fine, 60 to 300 days ahead:        1F-06, 1F-07, 2F-03, 2F-04, 2F-05, 2F-06
--    The insert fires the assets_created trigger, which writes one
--    asset_events row per door. That is expected.
-- ---------------------------------------------------------------------------

insert into assets (id, building_id, floor_id, work_type, ref, subtype, location, qr_code, cycle_months, next_due_date, status)
values
  -- Ground floor
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011', 'doors', 'GF-01', 'FD30', 'Flat 1 entrance',      'FD-TH-GF-01', 12, current_date - 45,  'active'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011', 'doors', 'GF-02', 'FD30', 'Flat 2 entrance',      'FD-TH-GF-02', 12, current_date - 30,  'active'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011', 'doors', 'GF-03', 'FD60', 'Riser cupboard',       'FD-TH-GF-03', 6,  current_date - 21,  'active'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011', 'doors', 'GF-04', 'FD30', 'Stair lobby',          'FD-TH-GF-04', 6,  current_date - 10,  'active'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011', 'doors', 'GF-05', 'FD30', 'Flat 3 entrance',      'FD-TH-GF-05', 12, current_date - 3,   'active'),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011', 'doors', 'GF-06', 'FD60', 'Plant room',           'FD-TH-GF-06', 6,  current_date + 12,  'active'),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011', 'doors', 'GF-07', 'FD30', 'Bin store',            'FD-TH-GF-07', 12, current_date + 25,  'active'),
  -- First floor
  ('00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000012', 'doors', '1F-01', 'FD30', 'Flat 4 entrance',      'FD-TH-1F-01', 12, current_date - 60,  'active'),
  ('00000000-0000-4000-8000-000000000109', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000012', 'doors', '1F-02', 'FD30', 'Flat 5 entrance',      'FD-TH-1F-02', 12, current_date - 20,  'active'),
  ('00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000012', 'doors', '1F-03', 'FD30', 'Flat 6 entrance',      'FD-TH-1F-03', 12, current_date - 14,  'active'),
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000012', 'doors', '1F-04', 'FD60', 'Riser cupboard',       'FD-TH-1F-04', 6,  current_date - 1,   'active'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000012', 'doors', '1F-05', 'FD30', 'Stair lobby',          'FD-TH-1F-05', 6,  current_date + 5,   'active'),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000012', 'doors', '1F-06', 'FD30', 'Flat 7 entrance',      'FD-TH-1F-06', 12, current_date + 90,  'active'),
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000012', 'doors', '1F-07', 'FD30', 'Corridor cross door',  'FD-TH-1F-07', 6,  current_date + 150, 'active'),
  -- Second floor
  ('00000000-0000-4000-8000-000000000115', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013', 'doors', '2F-01', 'FD30', 'Flat 8 entrance',      'FD-TH-2F-01', 12, current_date + 18,  'active'),
  ('00000000-0000-4000-8000-000000000116', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013', 'doors', '2F-02', 'FD30', 'Flat 9 entrance',      'FD-TH-2F-02', 12, current_date + 28,  'active'),
  ('00000000-0000-4000-8000-000000000117', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013', 'doors', '2F-03', 'FD60', 'Riser cupboard',       'FD-TH-2F-03', 6,  current_date + 60,  'active'),
  ('00000000-0000-4000-8000-000000000118', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013', 'doors', '2F-04', 'FD30', 'Stair lobby',          'FD-TH-2F-04', 6,  current_date + 200, 'active'),
  ('00000000-0000-4000-8000-000000000119', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013', 'doors', '2F-05', 'FD30', 'Flat 10 entrance',     'FD-TH-2F-05', 12, current_date + 240, 'active'),
  ('00000000-0000-4000-8000-000000000120', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013', 'doors', '2F-06', 'FD30', 'Roof access',          'FD-TH-2F-06', 12, current_date + 300, 'active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Assets: 5 fire stopping penetrations, mixed due dates
-- ---------------------------------------------------------------------------

insert into assets (id, building_id, floor_id, work_type, ref, subtype, location, qr_code, cycle_months, next_due_date, status)
values
  ('00000000-0000-4000-8000-000000000121', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011', 'fs', 'FS-01', 'Cable bunch',    'Ground floor riser, rear wall',   'FD-TH-FS-01', 12, current_date - 25,  'active'),
  ('00000000-0000-4000-8000-000000000122', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000012', 'fs', 'FS-02', 'Pipe 110 mm',    'First floor riser, soil stack',   'FD-TH-FS-02', 12, current_date - 7,   'active'),
  ('00000000-0000-4000-8000-000000000123', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000012', 'fs', 'FS-03', 'Cable tray',     'First floor corridor ceiling',    'FD-TH-FS-03', 12, current_date + 20,  'active'),
  ('00000000-0000-4000-8000-000000000124', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013', 'fs', 'FS-04', 'Ductwork',       'Second floor plant cupboard',     'FD-TH-FS-04', 12, current_date + 120, 'active'),
  ('00000000-0000-4000-8000-000000000125', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011', 'fs', 'FS-05', 'Mixed services', 'Ground floor electrical intake',  'FD-TH-FS-05', 12, current_date + 270, 'active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Survey templates
-- ---------------------------------------------------------------------------

insert into survey_templates (id, work_type, name, version, active)
values
  ('00000000-0000-4000-8000-000000000201', 'doors', 'Fire door inspection',     1, true),
  ('00000000-0000-4000-8000-000000000202', 'fs',    'Fire stopping inspection', 1, true)
on conflict (id) do nothing;

-- Doors: 10 yes no questions, answering "no" raises a finding.
insert into survey_template_items (id, template_id, question, answer_type, group_name, sort_order, required, options, fail_values)
values
  ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000201', 'Gaps between door leaf and frame within 2 to 4 mm',               'yes_no', 'Door', 1,  true, null, array['no']),
  ('00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000000201', 'Self closer shuts the door fully from 75 mm open',                'yes_no', 'Door', 2,  true, null, array['no']),
  ('00000000-0000-4000-8000-000000000213', '00000000-0000-4000-8000-000000000201', 'Intumescent strips and cold smoke seals intact and continuous',   'yes_no', 'Door', 3,  true, null, array['no']),
  ('00000000-0000-4000-8000-000000000214', '00000000-0000-4000-8000-000000000201', 'Fire door signage present on both sides',                         'yes_no', 'Door', 4,  true, null, array['no']),
  ('00000000-0000-4000-8000-000000000215', '00000000-0000-4000-8000-000000000201', 'Door leaf free from damage, holes or warping',                    'yes_no', 'Door', 5,  true, null, array['no']),
  ('00000000-0000-4000-8000-000000000216', '00000000-0000-4000-8000-000000000201', 'Frame secure and free from damage',                               'yes_no', 'Door', 6,  true, null, array['no']),
  ('00000000-0000-4000-8000-000000000217', '00000000-0000-4000-8000-000000000201', 'Hinges: three fire rated hinges, all screws present',             'yes_no', 'Door', 7,  true, null, array['no']),
  ('00000000-0000-4000-8000-000000000218', '00000000-0000-4000-8000-000000000201', 'Glazing and beading intact, fire rated',                          'yes_no', 'Door', 8,  true, null, array['no']),
  ('00000000-0000-4000-8000-000000000219', '00000000-0000-4000-8000-000000000201', 'Door not wedged or held open',                                    'yes_no', 'Door', 9,  true, null, array['no']),
  ('00000000-0000-4000-8000-000000000220', '00000000-0000-4000-8000-000000000201', 'Threshold gap under 10 mm',                                       'yes_no', 'Door', 10, true, null, array['no'])
on conflict (id) do nothing;

-- Fire stopping: 6 yes no questions, answering "no" raises a finding.
insert into survey_template_items (id, template_id, question, answer_type, group_name, sort_order, required, options, fail_values)
values
  ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-000000000202', 'Penetration fully sealed with a tested system',                   'yes_no', 'Fire stopping', 1, true, null, array['no']),
  ('00000000-0000-4000-8000-000000000222', '00000000-0000-4000-8000-000000000202', 'Fire stopping product undamaged and in place',                    'yes_no', 'Fire stopping', 2, true, null, array['no']),
  ('00000000-0000-4000-8000-000000000223', '00000000-0000-4000-8000-000000000202', 'No new unsealed services through the seal',                       'yes_no', 'Fire stopping', 3, true, null, array['no']),
  ('00000000-0000-4000-8000-000000000224', '00000000-0000-4000-8000-000000000202', 'Identification label present with product and date',              'yes_no', 'Fire stopping', 4, true, null, array['no']),
  ('00000000-0000-4000-8000-000000000225', '00000000-0000-4000-8000-000000000202', 'Seal depth and thickness match the manufacturer detail',           'yes_no', 'Fire stopping', 5, true, null, array['no']),
  ('00000000-0000-4000-8000-000000000226', '00000000-0000-4000-8000-000000000202', 'Surrounding construction sound',                                  'yes_no', 'Fire stopping', 6, true, null, array['no'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Price list, 15 items, UK prices excluding VAT
--    unit: item, m2, hour
-- ---------------------------------------------------------------------------

insert into price_list_items (id, code, name, work_type, unit, default_price, active)
values
  ('00000000-0000-4000-8000-000000000301', 'DR-001', 'Replace intumescent strip and smoke seal per door', 'doors', 'item', 45.00,   true),
  ('00000000-0000-4000-8000-000000000302', 'DR-002', 'Adjust or replace door closer',                     'doors', 'item', 85.00,   true),
  ('00000000-0000-4000-8000-000000000303', 'DR-003', 'Replace fire door signage per sign',                'doors', 'item', 12.50,   true),
  ('00000000-0000-4000-8000-000000000304', 'DR-004', 'Fit three fire rated hinges',                       'doors', 'item', 95.00,   true),
  ('00000000-0000-4000-8000-000000000305', 'DR-005', 'Replace glazing bead and fire rated glass',         'doors', 'item', 220.00,  true),
  ('00000000-0000-4000-8000-000000000306', 'DR-006', 'Install new FD30 doorset',                          'doors', 'item', 950.00,  true),
  ('00000000-0000-4000-8000-000000000307', 'DR-007', 'Install new FD60 doorset',                          'doors', 'item', 1450.00, true),
  ('00000000-0000-4000-8000-000000000308', 'DR-008', 'Ease and adjust door leaf',                         'doors', 'item', 65.00,   true),
  ('00000000-0000-4000-8000-000000000309', 'DR-009', 'Fit drop down threshold seal',                      'doors', 'item', 75.00,   true),
  ('00000000-0000-4000-8000-000000000310', 'DR-010', 'Fill and make good frame',                          'doors', 'item', 55.00,   true),
  ('00000000-0000-4000-8000-000000000311', 'FS-001', 'Fire stop cable penetration small',                 'fs',    'item', 60.00,   true),
  ('00000000-0000-4000-8000-000000000312', 'FS-002', 'Fire stop pipe penetration up to 110 mm',           'fs',    'item', 95.00,   true),
  ('00000000-0000-4000-8000-000000000313', 'FS-003', 'Fire batt seal per square metre',                   'fs',    'm2',   180.00,  true),
  ('00000000-0000-4000-8000-000000000314', 'FS-004', 'Intumescent pipe collar 110 mm',                    'fs',    'item', 70.00,   true),
  ('00000000-0000-4000-8000-000000000315', 'GN-001', 'Labour per hour',                                   null,    'hour', 55.00,   true)
on conflict (id) do nothing;

-- End of seed.sql
