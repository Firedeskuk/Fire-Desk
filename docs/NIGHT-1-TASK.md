Tutaj Piotr. Answer me in Polish. The task below is in English so nothing is lost. This is an unattended run: I will not be at the keyboard. Do NOT ask me anything. Where a decision is needed, make the sensible choice, write it down in docs/NIGHT-1-REPORT.md and carry on. For this run, Piotr waives rule 4 (confirmation) and rule 9 (mockup first) for every item listed below. The layouts described in this file are the agreed layouts. Everything else in CLAUDE.md still applies, especially: English everywhere, no em or en dash anywhere, no secrets in git, no merge to main.

# Night 1 task for Claude Code

## 0. How to work tonight

- Read CLAUDE.md, SPEC.md, docs/SYNC-PROTOCOL.md, docs/SETUP.md, both migration files, and docs/mockups/* before writing anything.
- Work on branch `feat/mvp-night-1` created from an up to date `main`.
- Keep a file `docs/NIGHT-1-PROGRESS.md`. Before each step write what you are about to do, after each step write what you did. If your context gets compacted, re-read this file first and continue from the last unfinished step.
- After every step: `npm run build` must pass and `npm run lint` must pass. Fix until green, then `git add -A`, commit with a one line English message, `git push`. Never push to main. Never run `git merge`. Never touch the Supabase database (no supabase CLI, no SQL, no migrations tonight).
- If a step cannot be completed after 3 serious attempts, write what failed and why in the report, leave the code compiling (stub the feature behind a clear TODO comment), and move to the next step.
- At the very end open a pull request `feat/mvp-night-1` to `main` with the report as the description, then stop.
- Never commit `.env.local`. If it does not exist, create it from `.env.example` with placeholder values and say so in the report.
- Never write or print any key that starts with `service_role` or `sb_secret`.
- Do not install anything outside the allowed list in section 2. If you believe something else is needed, write it in the report and work around it.

## 1. Step 1: align repo with the database (5 minutes)

The database already has both migrations applied under the versions Supabase assigned. Check the repo and make it match. Some of this may already be done, skip whatever is already correct:

- `supabase/migrations/` must contain exactly `20260913184137_init.sql` and `20260913184233_sync.sql`. If `0001_init.sql` or `0002_sync.sql` still exist, delete them (the timestamped files have the same content plus a corrected header line).
- The header comment line `-- File:` inside both files must show the new names.
- CLAUDE.md, SPEC.md and docs/SYNC-PROTOCOL.md must reference the new names, not `0001` or `0002`.
- docs/SETUP.md section B must say both migrations were applied on 13 Sep 2026 and must not be run again.
- If anything changed, commit: `Align migration names and docs with the applied database`. If nothing changed, write "step 1: already aligned" in the progress file and move on.

## 2. Step 2: scaffold

- Scaffold Next.js with TypeScript, App Router, ESLint, no Tailwind, no `src` directory, import alias `@/*`. If `create-next-app` refuses because the directory is not empty, scaffold into a temporary directory and move the generated files into the repo root, keeping the existing files.
- Allowed packages, nothing else: `@supabase/supabase-js`, `dexie`, `dexie-react-hooks`, `@serwist/next`, `serwist`, `browser-image-compression`, dev: `vitest`, `fake-indexeddb`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`.
- Folder structure exactly as CLAUDE.md section 5. Put a short `README.md` in every empty folder saying what belongs there.
- `styles/theme.css`: all tokens from CLAUDE.md section 9 as CSS variables on `:root` (cream) and `[data-theme="dark"]`. Base font 14 px, font stack Arial, Helvetica, sans-serif. Utility classes: `.card`, `.btn`, `.btn-primary`, `.pill` with `.pill-red`, `.pill-yellow`, `.pill-orange`, `.pill-green`, `.row`, `.label`. Buttons min height 48 px, font 16 px, weight 600. Copy the look of docs/mockups/fire-desk-screens.html, that file is the reference.
- Root layout: loads theme.css, sets `data-theme` from a value stored in localStorage (default cream), provides a small theme toggle component used in the office header.
- `public/manifest.webmanifest`: name "Fire Desk", short name "Fire Desk", standalone display, theme colour #F5EFE0, background #F5EFE0, icons: generate two simple PNG icons 192 and 512 px (a dark rounded square with the letters FD in cream) with a tiny node script, commit the PNGs.
- Service worker with `@serwist/next`: precache the app shell, runtime cache same origin GET. If serwist does not build with the installed Next version after 3 attempts, fall back to a hand written `public/sw.js` with runtime caching of same origin GET requests, registered from a client component, and note it in the report.
- Commit: `Scaffold Next.js app with theme, manifest and service worker`.

## 3. Step 3: Supabase client and auth

- `lib/supabase/client.ts`: browser client from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, session persisted in localStorage (default supabase-js behaviour), no cookies, no `@supabase/ssr`.
- `lib/supabase/types.ts`: TypeScript types for every table in the migrations, written by hand from the SQL. Enums as string unions.
- `lib/local/session.ts`: current user, profile (id, full_name, role), device id (uuid created once and stored in localStorage).
- `app/(auth)/login/page.tsx`: email and password form, one column, logo text "Fire Desk", inputs 48 px, primary button "Sign in", error text under the button. On success load the profile from `profiles`, store it locally, route: manager and admin to `/dashboard`, inspector to `/buildings`, remedial to `/works`.
- Route guard: a client component wrapper that redirects to `/login` when there is no session and to the role home when the role does not match the route group.
- Logout button in the office header and in the field settings screen. Logout is blocked with the message "N changes are not yet sent. Sync first." when the outbox is not empty.
- Commit: `Add Supabase client, auth and login`.

## 4. Step 4: lib/local (Dexie), exactly as docs/SYNC-PROTOCOL.md section 2 and 4

- `lib/local/db.ts`: Dexie database `firedesk` with mirror tables: buildings, floors, assets, projects, survey_templates, survey_template_items, price_list_items, inspections, inspection_answers, findings, finding_photos, remedial_items, remedial_photos. Every mirror row has an extra `origin: 'server' | 'local'`. Sync tables: outbox, blobs, sync_state, session. Indexes on building_id, asset_id, finding_id, remedial_item_id, and outbox by seq and status.
- `lib/local/index.ts`: the one small interface the app uses: `get`, `list`, `put`, `patch`, `transaction`. `put` and `patch` write the mirror row and append the outbox row in one Dexie transaction. No other module writes mirror tables.
- `lib/local/outbox.ts`: `enqueueUpsert`, `enqueuePatch`, `enqueuePhoto`, `pending()`, `markDone`, `markFailed`, dependency handling via `depends_on`.
- `lib/local/blobs.ts`: store and read photo and floor plan blobs by storage path, `release(path)` after confirmed upload.
- Unit tests with vitest and fake-indexeddb: a write creates both rows in one transaction, a failed transaction creates neither, pending order follows seq, dependencies are respected.
- Commit: `Add local Dexie layer with outbox`.

## 5. Step 5: lib/sync, exactly as docs/SYNC-PROTOCOL.md sections 3, 5, 6, 7

- `lib/sync/download.ts`: calls RPC `download_building`, writes every returned array into mirror tables with `origin: 'server'` in one transaction, never touches `origin: 'local'` rows, fetches floor plan images via signed URLs into blobs, records `sync_state`.
- `lib/sync/push.ts`: the worker. Web Lock `firedesk-sync`. Takes pending outbox rows in seq order, skips rows with unfinished dependencies, batches upsert and patch rows (max 50) into RPC `sync_push`, uploads photos one at a time to bucket `photos` at `photos/{building_id}/{parent_id}/{photo_id}.jpg`, handles `ok`, `ignored_older`, `error`, retry backoff 5 s, 30 s, 2 min, 10 min, then hourly, `failed` after 10 attempts. Refreshes the Supabase session before sending.
- `lib/sync/triggers.ts`: run on `online` event, on `visibilitychange` to visible, every 60 s while online and outbox not empty, and on manual call.
- `lib/sync/status.ts`: a tiny store exposing `online`, `pendingCount`, `syncing`, `failedCount`, `lastError` for the indicator.
- `lib/photos/compress.ts`: `browser-image-compression`, long edge 1600 px, target 300 KB, output jpeg, returns blob plus width and height.
- Unit tests: push sends rows in order and marks them done from a mocked RPC result, an error row does not block independent rows, a dropped connection leaves rows pending.
- Commit: `Add sync worker, download and photo upload`.

## 6. Step 6: field app (inspector)

All routes under `app/(field)` are client components, read and write `lib/local` only. Every screen has the sync pill in the header: green "Online", grey "Offline, N to sync", amber "Syncing", red "Sync problem, tap" opening a list of failed rows with a retry button.

- `/buildings`: list of buildings the user can see (fetched online from `buildings` once, then kept locally), each row: name, postcode, download state ("Not downloaded", "Downloaded 3 h ago"), a 48 px "Download" or "Refresh" button. Tap a downloaded row to open it. A settings row at the bottom: theme toggle, storage in use, "Remove building from this phone", logout.
- `/buildings/[id]`: building name, floors as a list, each floor shows asset count and how many are due. Tap a floor to see its assets. Assets with no floor appear under "No floor".
- `/buildings/[id]/assets/[assetId]`: the inspector door screen from the mockup: title "Building name, Door 2F-05", line with subtype, last inspected date and cycle, "Scan QR" button (stub that opens the camera via `getUserMedia` and shows a message "QR decoding comes in a later step", no QR library tonight), then the checklist from the active `survey_templates` for the asset's work type: one row per question, yes and no pills for `yes_no`, text input for others. Answering a question in `fail_values` creates a finding automatically with the question text as description. Below: "N findings created", two buttons "Photo" and "Next door". Completing the last question sets `completed_at` and `overall_result` (pass if no findings, fail otherwise) and the provisional next due date is shown.
- Finding screen (`/buildings/[id]/findings/[findingId]`): description textarea, severity pills, photo capture (`<input type="file" accept="image/*" capture="environment">`, compressed, stored in blobs, outbox rows in the order upsert finding, upload_photo, upsert finding_photos), floor plan pin: show the floor plan image from blobs, a tap stores `pin_x` and `pin_y` as 0 to 1 relative values and draws a marker.
- Commit: `Add inspector field screens`.

## 7. Step 7: field app (remedial)

- `/works`: buildings assigned to the user, then `/works/[buildingId]`: the works list from the mockup: "22 items, 15 done, 7 left", rows with description, detail, status pill (todo, in progress, done). Tap an item: buttons "Photo after" and "Mark done". Mark done patches status, done_by, done_at through `lib/local`. Photos after go to `remedial_photos`.
- The remedial user never sees findings or inspections, not even in navigation.
- Commit: `Add remedial works screens`.

## 8. Step 8: office (manager, admin)

Office routes may fetch from Supabase directly with supabase-js (they are online). Keep them client components too, to stay simple.

- Office header: "Fire Desk", section links (Dashboard, Clients, Buildings, Projects, Quotes, Settings), user name and role, theme toggle, logout.
- `/dashboard`: the dashboard from the mockup: four metric cards (Buildings, Doors due this month, Remedial in progress, Certificates issued) and an Alerts card with one row per building: text like "Building, postcode, 17 doors due" and a pill: red overdue more than 14 days, yellow overdue 1 to 14 days, orange remedial in progress, green all ok. Computed from `assets.next_due_date` and `remedial_items.status`.
- `/clients`: list and a simple form (name, contact, adjustment_pct). `/buildings`: list, form (client, name, address, postcode, adjustment_pct), floors editor with floor plan upload to bucket `floorplans`, assets table with add and edit (ref, work_type, subtype, floor, location, cycle_months, qr_code). `/projects`: list and form.
- `/settings/pricing`: price list table, inline edit of name and default price, add row. `/settings/templates`: templates and their questions, add and reorder. `/settings/users`: list of profiles with role dropdown (update `profiles.role`) and building assignments for remedial users.
- `/quotes`: list per building. `/quotes/new?building=...`: pick open findings, each becomes a line with `price_item_id` from `suggested_price_item_id` or chosen from a dropdown, quantities, default price and both percentages copied from the price list, client and building. Editable override per line. Total at the bottom. Save creates `quotes` and `quote_lines`. Quote number format `Q-YYYY-NNNN` computed from the count. No PDF tonight.
- Commit: `Add office screens: dashboard, register, pricing, templates, users, quotes`.

## 9. Step 9: sample data

- `supabase/seed.sql`: invented names only. One client "Sample Housing Ltd", one building "Test House, AB1 2CD" with 3 floors, 20 doors (refs GF-01 to 2F-06, cycles 6 and 12 months, some overdue, some due soon, some fine), 5 fire stopping penetrations, one doors survey template with 10 yes no questions (gaps 2 to 4 mm, closer shuts from 75 mm, intumescent strips intact, signage present, and so on) with sensible fail values, one FS template with 6 questions, 15 price list items with realistic UK prices. Do not run it. Piotr runs it in the SQL Editor.
- Commit: `Add sample seed data`.

## 10. Step 10: finish

- `npm run build`, `npm run lint`, `npx vitest run` all green.
- `docs/NIGHT-1-REPORT.md`: what was done per step, what was skipped and why, every decision you made on your own, packages installed with versions, known problems, and a numbered list of questions for Piotr at the end.
- Open the pull request `feat/mvp-night-1` to `main`, description = the report.
- Stop. Do not merge.
