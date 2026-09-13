# SPEC.md, Fire Desk

Product specification. Every decision here was made by Piotr and is mirrored in Brain FD (Supabase project `lgijuxwwciysbdxaolxe`, wardrobe `fire-desk-spec`). If this file and Brain FD disagree, Brain FD wins, and this file gets a correction. Last updated 13 Sep 2026.

Client company names, addresses and people are kept out of this file on purpose, the repo is public.

---

## 1. What Fire Desk is

A fire door and fire stopping compliance platform for UK contractors. It replaces the register tool the team uses today and adds what that tool lacks: quotes built from defects without retyping, remedial works tracking with photos after, branded PDF reports with no third party logo, NAPFIS certificate storage, and every door kept as an asset with its full history (golden thread of information).

Fire Desk = register (what the current tool does) + contractor business (quotes, remedial, reports) + the team's own production and certification.

## 2. Ownership and accounts

- Owner of the software: Skylon Elements Ltd. The software may be sold one day, so nothing depends on any other company's accounts.
- Domain firedeskuk.com, app at app.firedeskuk.com, main account info@firedeskuk.com.
- Own accounts from zero: Google Workspace, GitHub org, Supabase org (projects: Fire Desk = application, Brain FD = memory), Vercel, Resend.
- The first client is a fire door contractor servicing a property portfolio. It is a client, not an owner.
- Tomasz Sadek codes on the project. His agreement states the code belongs to Skylon Elements.

## 3. Roles

| Role | Sees and does |
|---|---|
| Manager | everything |
| Admin | projects, operatives, schedule, settings |
| Inspector | downloads buildings, runs inspections, raises findings with photo and floor plan pin, scans QR, works offline |
| Remedial team (joiners, fire stoppers) | separate view, no access to inspections or findings, sees only the works list for the buildings it is assigned to, marks items done with a photo after |

Remedial assignment is per building, not per defect. An assigned worker sees every open item in that building.

## 4. Data model

Client > Building > Work type (Doors / FS) > Floors (optional) > Asset (door, penetration) > Inspection > Finding > Remedial > Report > NAPFIS certificate.

- Every asset keeps its full history for life in `asset_events`, one immutable timeline per door or penetration.
- A project is the organisational layer on top: who, when, which survey, which work type, in which building.
- The inspection cycle lives on the asset: doors 3, 6 or 12 months, set when the door is added; fire stopping 12 months or NA. The next due date is computed by the server when an inspection is completed.
- Alerts: one per building ("17 doors due"), expands to a list: floor, door number, due date.
- NAPFIS certificate: one per building per completed project, uploaded as a file.

Tables (see `supabase/migrations/0001_init.sql`):

- People and access: `profiles`, `building_assignments`
- Structure: `clients`, `buildings`, `floors`, `assets`
- Work: `projects`, `survey_templates`, `survey_template_items`, `inspections`, `inspection_answers`, `findings`
- Photos: `finding_photos`, `remedial_photos`, view `all_photos` over both
- Money: `price_list_items`, `quotes`, `quote_lines`, `remedial_items`
- Output: `reports`, `certificates`, `asset_events`

Decisions baked into the schema:

- Photos in two tables (finding photos, remedial photos) with one shared view and one shared sync queue.
- `asset_events` is a separate table, written by triggers, never edited.
- Many quotes per project, with `version` and `is_current`.
- A remedial item is created straight from a finding by a trigger, status `todo`, no approval gate. A quote line can be attached to it later.
- Stage 2 invoicing has room already: `clients.vat_number`, `clients.payment_terms_days`, `quotes.invoice_ref`, `quotes.invoiced_at`. No screens in the MVP.
- Nothing is hard deleted. `deleted_at` everywhere.
- Inspection answers copy the question text, so editing a template never rewrites history.
- Quote lines copy the default price and both percentages, so editing the price list never changes a sent quote.

## 5. Pricing

- Settings > Pricing: a list of a few dozen items, one amount per item, no labour and material split, doorsets in the same list.
- Two percentage steps, multiplied: price = default x client adjustment x building adjustment. Example: 100 x 0.9 x 1.1 = 99. Stored as "100 = no change", so 90 means minus 10 percent.
- Clients tab: percentage per client. Building: an extra percentage.
- Quote: manual override of any line. Total at the bottom.
- Remedial works list is built from these items.

## 6. MVP scope

MVP = the base proposal (roles, dashboard, projects, survey templates, findings with photo and floor plan pin, offline, QR, inspection cycles) plus:

- quote from findings
- remedial status with photo after, mark done
- QC preview, then PDF, email or download, own brand, no "Powered by"
- doors as assets with full history
- NAPFIS certificate upload

Stage 2: invoices, recurring contracts, client portal, doorset production.

## 7. UI rules

- Cream background by default with a dark toggle. Both themes through CSS variables from day one. Tokens in CLAUDE.md section 9 and `styles/theme.css`.
- Base font 14 px. Buttons at least 48 px. High contrast for building sites in sunlight and for older workers.
- Status colours: red = overdue more than 1 to 2 weeks, yellow = overdue up to 1 to 2 weeks, orange = remedial in progress, green = all ok. No alarm colour before the due date.
- App language: English only.
- One hand mode on the phone. One screen = one task in the inspector app.
- Dates are validated (no review dates in the year 2101).

Approved mockups (direction, not final design): `docs/mockups/fire-desk-screens.html` (dashboard, inspector door screen, remedial works list), `docs/mockups/fire-desk-architecture.svg`, `docs/mockups/fire-desk-defect-flow.svg`. Screens not yet mocked: login, buildings list with download, floor plan with pins, quote editor, QC preview. Mockup first, then code.

## 8. Platform

Decided route: A now, C later. Full reasoning in `docs/BRIEFING-2-platform.md`.

- A: offline-first PWA. Next.js on Vercel, Supabase behind it, one codebase for office, inspector and remedial, installed on the phone home screen (mandatory on iPhone).
- Local data on the phone is the truth in the field. Sync when signal returns. Photos compressed to about 1600 px. Indicator "Offline, N to sync".
- Not available offline by design: PDF, email, downloading a building not downloaded before, first login.
- C later: the same code in a Capacitor shell for the App Store and Google Play, native push, native storage. No rewrite.
- B (separate native app) rejected at this stage: double work for a team of two.

Sync engine, decided 13 Sep 2026: custom queue on IndexedDB (Dexie). PowerSync is plan B without a schema change. Full protocol in `docs/SYNC-PROTOCOL.md`, server side in `supabase/migrations/0002_sync.sql`.

Session on the phone: stored locally, not in cookies, kept for weeks. Logout with unsent changes is blocked.

## 9. Definition of done for the MVP

1. An inspector completes a full door round in a building with airplane mode on, then syncs, and every finding, photo and pin arrives in Supabase intact.
2. A manager turns those findings into a quote with prices from the price list adjusted by client and building percentages, overrides one line by hand, exports a PDF with the owner's branding.
3. A remedial joiner opens the works list for that building on a phone, marks items done with photos after, and the manager sees the status change.
4. The NAPFIS certificate is uploaded and attached to the building for that project.
5. The dashboard shows one alert per building with due doors, in the agreed colours, on a cream background, readable on a phone in daylight.
6. The 10 airplane mode tests in `docs/SYNC-PROTOCOL.md` section 12 pass on a real iPhone and a real Android.

## 10. Still open

1. PDF library in Next (server side).
2. QR scanning library that works in Safari and Chrome.
3. How the office panel and the field app share components without shipping office code to the phone (route groups are the starting point).
4. Who hosts the first test build and when the first client sees a demo.
5. Mockups for: login, buildings list, floor plan with pins, quote editor, QC preview.

---

Krótko po polsku dla Piotra: ten plik to pełna specyfikacja produktu w repo, po angielsku dla Tomasza i Claude Code. Zawiera wszystkie decyzje z Brain FD plus te z 13.09.2026: schemat bazy, dwie tabele zdjęć, osobna historia drzwi, wiele wycen na projekt, remedial od razu z usterki, miejsce pod faktury, własna kolejka sync z PowerSync jako planem B. Nazwy klientów celowo pominięte, bo repo jest publiczne. Jeśli Brain FD i ten plik się różnią, Brain FD ma rację.
