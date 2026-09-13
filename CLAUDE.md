# CLAUDE.md, Fire Desk

Read this file at the start of every session, then SPEC.md, then docs/SYNC-PROTOCOL.md. Say in one line that you have read them. Then ask which task is next, propose a plan, and wait for "yes" before writing any code.

## 1. Who you are working with

- Piotr Ficner: product owner, makes every decision. Answer him in Polish.
- Tomasz Sadek: runs Claude Code and the repo. Answer him in English.
- Neither is a professional developer. When you need them to run something, give one command at a time, say what it does and what output to paste back.
- Code, comments, database names, UI copy, commit messages, file names: always English.

## 2. The 11 working rules

1. Polish to Piotr, English to Tomasz.
2. Every entry in Brain FD has an author (P, T, PT). Nothing is deleted, only status changes (active, done, archived). Never edit another author's entry, add a new one titled "Correction to: <title>".
3. Step by step. Do not start the next step before the previous one is closed.
4. Nothing without confirmation. Order: proposal, "yes", action. This covers code, installs, database writes, file changes, deletions.
5. Never make things up. If you do not know, say "I do not know".
6. Never remove or change working functionality without consent. If you think it is needed, persuade first.
7. In longer messages all questions go at the end, short, one per line, numbered from 1, answerable with numbers only.
8. Never an em dash or en dash in any text, comment, copy or commit message. Use a comma, a full stop or a colon.
9. Code only after an approved mockup or agreed layout. Ask how a change should look before writing it.
10. Claude delivers complete files. A human pushes. Work on a branch, open a pull request, never commit to main directly.
11. Code and copy in English.

## 3. Repo hygiene

- The repo is public. Never commit secrets, `.env*` files, API keys, client company names, addresses, phone numbers, photos or any real data. Sample data uses invented names.
- Branch per task: `feat/<short-name>` or `fix/<short-name>`. Pull request to `main`. Piotr reviews every pull request with Claude in claude.ai before merge.
- Commit messages: one line, imperative, English, no dash characters.
- Do not add dependencies without listing them and getting a "yes".

## 4. Stack (decided, do not change without consent)

- Next.js, App Router, TypeScript. Deployed on Vercel at app.firedeskuk.com.
- Supabase: Postgres, Auth, Storage. Project "Fire Desk", id `xuyruluqwtbizstjqewf`, region eu-west-2.
- Offline-first PWA. Local data on the phone is the truth in the field. Dexie on IndexedDB, custom sync queue as written in docs/SYNC-PROTOCOL.md. PowerSync is plan B only, not to be added unless Piotr says so.
- Styling: CSS variables with two themes (cream default, dark) in `styles/theme.css`. Every colour in the app comes from a variable. No hard coded hex in components.
- PDF: generated server side in Next. Library not yet chosen, propose with reasons before installing.
- Email: Resend.
- Later: Capacitor wrap for the app stores. Keep the field code free of anything a native shell cannot run: no server rendering in field screens, no cookies for the session, all local storage behind `lib/local`.

## 5. Folder structure

```
app/
  (auth)/login
  (office)/            laptop, online: dashboard, clients, buildings, projects,
                       quotes, reports, certificates, settings/pricing,
                       settings/users, settings/templates
  (field)/             phone, offline: buildings, inspect, works
  api/pdf, api/email
components/ui, office, field, shared
lib/
  local/               Dexie schema, one small data interface, outbox writes
  sync/                queue worker, download, push, photo upload
  supabase/            client, generated types
  pricing/             default x client % x building %
  pdf/, qr/, photos/   photo compression to about 1600 px
styles/theme.css
public/                manifest, icons, service worker
supabase/migrations/   0001_init.sql, 0002_sync.sql, next ones numbered
docs/                  briefings, mockups, SYNC-PROTOCOL.md, SETUP.md
types/
```

## 6. Database

- Schema is in `supabase/migrations/0001_init.sql` (tables, RLS, buckets) and `0002_sync.sql` (RPC `download_building`, RPC `sync_push`, triggers). Read both before touching data.
- Tables: profiles, building_assignments, clients, buildings, floors, assets, projects, survey_templates, survey_template_items, inspections, inspection_answers, findings, finding_photos, remedial_items, remedial_photos, price_list_items, quotes, quote_lines, reports, certificates, asset_events. View: all_photos.
- Every table the field writes to has: uuid `id` generated on the device, `created_by`, `device_id`, `created_at`, `updated_at`, `deleted_at`, `received_at`.
- Nothing is hard deleted. Set `deleted_at`.
- A remedial item is created by a database trigger when a finding is inserted. The app never creates remedial items.
- Next due date is set by a trigger when an inspection is completed. The app may show a provisional value, never writes it.
- A new migration is a new file `supabase/migrations/NNNN_name.sql`. Show it, get "yes", then a human applies it in the Supabase SQL Editor or Piotr applies it from claude.ai. Never drop or rename a column or table without Piotr's explicit yes.

## 7. Roles

- Manager: everything.
- Admin: projects, operatives, schedule, settings.
- Inspector: downloads buildings, inspections, findings, photos, floor plan pins, QR. Works offline.
- Remedial team: sees only the works list for buildings it is assigned to (`building_assignments`). Never sees inspections or findings. Marks items done with a photo after.

RLS in the database enforces this. The UI hides what a role cannot use, but the database is the guard.

## 8. Field app rules, always

1. Field screens in `app/(field)` read and write `lib/local` only. No supabase-js call inside `app/(field)`.
2. Every local write goes through `lib/local`, which updates the mirror table and appends to the outbox in one Dexie transaction. No other code path writes a mirror table.
3. Photos are compressed on the device to a long edge of about 1600 px, 200 to 400 KB, before they are stored. Originals are never kept.
4. Field routes are client components. No server rendering, no cookies.
5. The sync indicator (Online, Offline N to sync, Syncing, Sync problem) is on every field screen.
6. Every screen used in the field works with zero network. If a feature needs the server, it is an office feature.

## 9. UI rules and tokens (from the approved mockup)

- Base font 14 px. Buttons min 48 px tall. High contrast, readable in sunlight, gloves, older workers.
- One screen = one task on the phone. One hand mode.
- English only in the UI.
- Status colours: red = overdue more than 1 to 2 weeks, yellow = overdue up to 1 to 2 weeks, orange = remedial in progress, green = all ok. Nothing alarming before the due date.
- Date inputs are validated (a review date in the year 2101 must be impossible).

Cream theme: bg #F5EFE0, card #FFFDF7, text #2C2C2A, muted #5F5E5A, line #D3D1C7, line strong #888780, primary bg #2C2C2A, primary text #F5EFE0, red #F7C1C1 on #791F1F, orange #F5C4B3 on #712B13, yellow #FAC775 on #633806, green #C0DD97 on #27500A.

Dark theme: bg #1E1E1C, card #2C2C2A, text #F1EFE8, muted #B4B2A9, line #444441, line strong #888780, primary bg #F1EFE8, primary text #1E1E1C, status pairs inverted (dark bg, light text).

## 10. Definition of done for the MVP

1. An inspector completes a full door round in a building with airplane mode on, then syncs, and every finding, photo and pin is in Supabase.
2. A manager turns those findings into a quote priced by list x client % x building %, overrides one line by hand, exports a branded PDF.
3. A remedial joiner opens the works list on a phone, marks items done with photos after, the manager sees the status change.
4. The NAPFIS certificate is uploaded and attached to the building for that project.
5. The dashboard shows one alert per building with due doors, in the agreed colours, on a cream background.
6. The 10 airplane mode tests in docs/SYNC-PROTOCOL.md section 12 pass on a real iPhone and a real Android.

## 11. Every delivery

- Complete files, never fragments or "add this somewhere".
- A list of what changed and why.
- The exact commands to run, one at a time.
- Questions at the end, numbered from 1.

## 12. Commands the humans run

`npm install`, `npm run dev`, `npm run build`, `npm run lint`. Always say which one, and ask them to paste back the last 20 lines of output, error or not.
