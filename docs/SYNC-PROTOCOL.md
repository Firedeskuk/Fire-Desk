# Fire Desk sync protocol (proposal, v1)

Companion to BRIEFING.md and BRIEFING-2-platform.md. Decision recorded 13 Sep 2026: custom sync queue on IndexedDB (Dexie), PowerSync kept as plan B. This document says exactly how the queue works, so that the sync module can be written once and tested against it. No sync code is written before this document is approved.

Language rule as always: Polish to Piotr, English to Tomasz, English in code and copy.

---

## 1. Principles

1. On the phone, local data is the truth. The field app reads and writes IndexedDB only. It never calls a Supabase table directly. All server contact goes through one module, `lib/sync`.
2. Every record gets a uuid on the device at creation. The server never assigns ids to field data.
3. Every write to the server is an idempotent upsert. Sending the same change twice is harmless. This is what makes "resume after signal drops" simple.
4. Inspections, answers, findings and photos are append-only. The field creates them and may complete them, but never rewrites history.
5. A small set of fields on assets and remedial items may be patched from the field (see 6). Patches carry only the changed fields, so two people touching different fields never clobber each other.
6. Nothing is ever hard deleted. A delete is a patch that sets `deleted_at`.
7. The server is the truth for derived data: next due date, asset history, quote totals. The device may compute a provisional value to show the inspector, the server recomputes it on arrival.
8. Sync never blocks the UI. The inspector moves to the next door while photos upload in the background.

## 2. Local storage (Dexie on IndexedDB)

Two kinds of tables.

Mirror tables, same columns as Supabase, filled by "download building":

- `buildings`, `floors`, `assets`, `projects`
- `survey_templates`, `survey_template_items`, `price_list_items`
- `inspections`, `inspection_answers`, `findings`, `finding_photos`
- `remedial_items`, `remedial_photos`

Every mirror row carries one extra local column `origin`: `server` (came from a download) or `local` (created or patched on this device and not yet confirmed by the server).

Sync tables, local only:

- `outbox`: the queue of changes to send (see 4)
- `blobs`: photo binaries and cached floor plan images, keyed by storage path
- `sync_state`: one row per downloaded building: `building_id`, `downloaded_at`, `role_scope`
- `session`: Supabase session tokens, user profile, device id

All of it sits behind one small interface in `lib/local` (get, put, query, transaction). That interface is the only thing to swap when the app is wrapped in Capacitor and moved to native SQLite.

## 3. Download

"Download building" is the only way data enters the phone. It needs network.

1. The app calls one RPC, `download_building(building_id)`. The server returns a single JSON tree filtered by RLS for the calling user: building, floors, assets, open findings, remedial items, active templates, price list, plus the user's projects in that building. Inspector and remedial get different subsets, enforced on the server, not in the app.
2. The app writes every returned row into the mirror tables with `origin = server`, in one Dexie transaction. Rows with `origin = local` are never touched by a download.
3. Floor plan images are fetched through short-lived signed URLs and stored in `blobs`, so the plan opens offline.
4. `sync_state.downloaded_at` is set. The building screen shows the age of the download ("downloaded 3 h ago") and a refresh button.
5. A refresh is the same operation again. It replaces server-origin rows and leaves local rows alone.

Rules that follow:

- The morning routine is: open the app while online, tap the buildings for today, wait for the green tick on each, go.
- A building that was never downloaded cannot be opened offline. The list shows it greyed with "not downloaded".
- Downloaded data is kept until the user removes the building from the phone or logs out. There is no automatic eviction on our side.

## 4. Outbox

One table, one row per change, processed in order.

| column | meaning |
|---|---|
| `seq` | auto increment, defines send order |
| `id` | uuid of the outbox row |
| `created_at` | when the change was made on the device |
| `op` | `upsert`, `patch`, `upload_photo` |
| `entity` | target table, for example `findings` |
| `record_id` | uuid of the record |
| `payload` | for `upsert` the whole row, for `patch` only the changed fields plus `updated_at`, for `upload_photo` the blob key and storage path |
| `depends_on` | outbox row ids that must be done first (a photo row depends on its upload) |
| `status` | `pending`, `sending`, `done`, `failed` |
| `attempts` | retry counter |
| `last_error` | text of the last failure, shown to the user after repeated failures |

Every local write does two things inside one Dexie transaction: update the mirror table and append an outbox row. If the app is killed between the two, neither happened. This is the only place where consistency between "what I see" and "what will be sent" is guaranteed, so no code path may write a mirror table without going through it.

Example, one finding with one photo produces three outbox rows, in this order:

1. `upsert findings` (the finding)
2. `upload_photo` (the compressed jpeg to storage)
3. `upsert finding_photos` (the row, depends on 2)

Done rows are kept for 7 days for debugging, then purged.

## 5. Push

When it runs:

- the browser reports the connection is back
- the app comes to the foreground
- every 60 seconds while online and the outbox is not empty
- the user taps "Sync now"

How it runs:

1. One worker at a time. A Web Lock named `firedesk-sync` prevents two tabs or two timers from sending the same rows.
2. The worker takes pending rows in `seq` order, skipping rows whose `depends_on` is not done.
3. Row writes (`upsert`, `patch`) are batched, up to 50 per call, into one RPC `sync_push(changes jsonb)`. The RPC runs as the calling user (security invoker), so RLS applies exactly as for any other write. It applies the batch in one transaction and returns a per-row result: `ok`, `ignored_older`, `error <text>`.
4. Photo uploads go one at a time to Supabase Storage with the normal upload API. Our photos are 200 to 400 KB, resumable upload is not needed. Path convention: `photos/{building_id}/{parent_id}/{photo_id}.jpg`.
5. A row that comes back `ok` or `ignored_older` is marked `done` and its mirror row flips to `origin = server`. For a photo, the local blob is deleted after the row confirming it is `done`, so the phone frees space only when the server has both file and row.
6. A row that errors is retried with backoff: 5 s, 30 s, 2 min, 10 min, then every hour. After 10 attempts it is marked `failed`, the indicator turns red, and the user is told which door and what happened. Failed rows do not block rows that do not depend on them.
7. If the connection drops mid-batch, the batch either committed on the server or it did not. Either way the rows stay `pending` and are resent. Idempotent upserts make the resend safe.

## 6. Conflict rules

| table | field may do | server rule |
|---|---|---|
| `inspections`, `inspection_answers` | insert, set `completed_at` and `overall_result` once | upsert, keep the row with the newer `updated_at` |
| `findings` | insert, patch `status` and `deleted_at` | upsert, findings are never removed by a sync, only marked |
| `finding_photos`, `remedial_photos` | insert | insert, ignore if already present |
| `assets` | insert new asset, patch `qr_code`, `location`, `subtype`, `spec`, `floor_id`, `status` | a patch carries only the changed fields and is applied to those fields only, last arrival wins per field, `updated_at` becomes server time |
| `remedial_items` | patch `status`, `done_by`, `done_at`, `detail` | same field rule |
| everything else | read only in the field | office edits only, through the normal app, online |

The field never patches `next_due_date`. It is set by a server trigger when an inspection is completed, from `completed_at` plus `cycle_months`. The app shows a provisional value computed the same way until the next download confirms it.

Two inspectors on the same asset on the same day (rare, but designed for): both inspections arrive and both are kept, both findings are kept, the later `completed_at` drives the due date. Nothing is lost.

## 7. Session

- The Supabase session is stored in `session`, not in cookies, so a native shell keeps it later.
- The refresh token is kept for weeks. The access token expires hourly, that is fine offline: no token is needed to read local data. On the next sync the worker refreshes the token first, then sends.
- If the refresh is rejected (user disabled, password changed), local data stays on the phone, the outbox stays pending, sync is paused and the app asks for a new login. Nothing is discarded.
- Logout with a non-empty outbox is blocked with a clear message: "3 changes are not yet sent. Sync first or they will be lost."

## 8. Storage budget and iOS

- Photos are compressed on the device to a long edge of about 1600 px, quality tuned for 200 to 400 KB. Originals are never kept.
- 200 doors x 3 photos is roughly 180 MB. Local blobs are released after confirmed upload, so the working set stays small.
- On iPhone the app must be installed via "Add to Home Screen". The app checks `navigator.standalone` and, if it is running in a plain Safari tab, shows a full-screen instruction and warns that data may be evicted. It also calls `navigator.storage.persist()` on first run.
- The settings screen shows storage in use and offers "remove building from this phone".

## 9. What the user sees

One pill in the header of every field screen:

- green `Online`
- grey `Offline, 12 to sync`
- amber `Syncing 4 of 12`
- red `Sync problem, tap` opens the list of failed rows with door number and error, and a retry button

## 10. Failure cases, decided up front

| case | behaviour |
|---|---|
| signal drops mid upload | row stays pending, resent, server ignores duplicate |
| app killed mid sync | Dexie transaction means nothing half-written, worker restarts on next open |
| template edited in the office during an inspection | answers store `question_text`, history is unaffected |
| price list edited after a quote is sent | quote lines carry their own prices and percentages |
| same door, two phones, same day | both inspections kept, see 6 |
| office deletes an asset that has pending field changes | `deleted_at` is a patch, field changes still arrive and attach to the archived asset |
| phone storage full | photo capture shows an error, finding is saved without the photo, user is told to sync |
| user logs out with pending rows | blocked, see 7 |
| clock wrong on the phone | `created_at` is what the phone says, `received_at` is set by the server on arrival, reports use server time for ordering |

## 11. Server pieces (migration 20260913184233_sync, applied)

1. RPC `download_building(building_id uuid)` returning jsonb, security invoker, role aware.
2. RPC `sync_push(changes jsonb)` returning jsonb, security invoker, transactional, per-row results.
3. Column `received_at timestamptz` on every field-written table, set by the RPC.
4. Trigger on `inspections`: when `completed_at` goes from null to a value, set `assets.next_due_date` and insert an `asset_events` row.
5. Trigger on `findings` insert: `asset_events` row `finding_raised` and, by the decision of 13 Sep 2026, a `remedial_items` row with status `todo` created straight from the finding. The phone never creates remedial items itself, it receives them on the next download.
6. Trigger on `remedial_items`: when `status` becomes `done`, `asset_events` row `remedial_done` and the linked finding is marked `resolved`.
7. Trigger on `assets` insert: `asset_events` row `created`. Trigger on `certificates` insert: `certificate_issued` for every asset of that work type in the building.
8. Trigger on `auth.users` insert: a `profiles` row is created automatically, role `inspector` unless the invitation metadata says otherwise. The first manager is promoted by hand in SQL (see docs/SETUP.md).
9. `set_updated_at` keeps an `updated_at` the caller set explicitly (an upsert from the field carries device time), and only fills in `now()` when the caller did not change it (office edits, patches).

## 12. Test checklist before "done"

All on a real iPhone and a real Android, app installed on the home screen.

1. Download a building, switch to airplane mode, close the app fully, reopen, open the building and a floor plan.
2. Inspect 5 doors with findings and photos in airplane mode, switch airplane mode off, watch the counter go to zero, confirm every row and file in Supabase.
3. Start a sync, switch airplane mode on halfway, off again. Nothing duplicated, nothing lost.
4. Kill the app mid sync. Reopen. Sync completes.
5. Two phones, same door, same day. Both inspections visible in the office.
6. Fail an upload on purpose (revoke storage policy), see the red pill, restore the policy, retry, all good.
7. Edit a template in the office while a phone is mid inspection. Old answers keep their question text.
8. Remedial phone: assigned building only, marks 3 items done with photos offline, syncs, office sees status.
9. Log out with pending changes: blocked with message.
10. Leave the phone untouched for 8 days, open the app offline. Data still there (installed app, persist granted).

## 13. Plan B: PowerSync

If after 3 weeks of sync work the checklist in 12 is not passing, the swap points are:

- `lib/local` becomes PowerSync's SQLite, mirror tables map one to one
- the outbox is replaced by PowerSync's upload queue, our `sync_push` RPC stays as the upload handler
- `download_building` becomes a sync rule keyed by building
- photo uploads stay exactly as they are

Nothing in the database schema changes, uuid primary keys are all PowerSync needs.

---

Krótko po polsku dla Piotra: dane na telefonie są prawdą w terenie, każdy zapis idzie do lokalnej bazy i do kolejki w jednej transakcji, kolejka wysyła po kolei, każda wysyłka jest bezpieczna do powtórzenia, więc urwany zasięg nic nie psuje. Inspekcje, findings i zdjęcia tylko dopisujemy, na drzwiach i naprawach zmieniamy pojedyncze pola. Termin następnego przeglądu liczy serwer. Punkt 12 to lista testów, które muszą przejść na prawdziwym iPhone i Androidzie, zanim powiemy "gotowe". Punkt 13 to plan B z PowerSync bez zmiany bazy.
