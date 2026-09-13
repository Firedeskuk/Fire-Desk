# Fire Desk specification

Agreed 13 September 2026 by Piotr Ficner. Mirror of wardrobe `fire-desk-spec` in Brain FD. English is the working language of this file; the Brain FD entries carry a Polish version too.

## 1. Ownership and accounts

- Software owner: Skylon Elements Ltd.
- Domain firedeskuk.com. Main account info@firedeskuk.com (bootstrap Gmail firedesk26@gmail.com kept as recovery).
- Fresh accounts, nothing shared with Skylon Construction: Google Workspace, GitHub org `firedeskuk`, Supabase org Fire Desk (projects: `Fire Desk` = application, `Brain FD` = shared memory), Vercel, Resend.
- FD30 (UK) Ltd is a client, not the owner.
- Tomasz Sadek develops on the project. His agreement must state the code belongs to Skylon Elements.

## 2. Roles

| Role | Sees | Does |
|---|---|---|
| Manager | everything | projects, clients, users, templates, pricing, QC, reports |
| Admin | assigned projects, operatives | create and edit projects, assign surveys, schedule operatives |
| Inspector | assigned buildings and surveys | inspections, findings, photos, floor plan pins, QR, offline |
| Remedial team | works list for assigned buildings only | mark items in progress or done, photo after |

Remedial team has no access to inspections. Assignment is per building, not per defect: they see every item in that building.

## 3. Data model

```
Client
  Building
    Work type (Doors / FS)
      Floors (optional category, set when the project is created)
        Asset (door or penetration)  <- full history, golden thread of information (GToI)
          Inspection
            Finding
              Remedial work
                Report (QC, PDF)
                  NAPFIS certificate (one per building per completed project)
```

- Project (from Tomasz proposal) is the organisational layer on top: who, when, which survey.
- Inspection cycle lives on the asset: doors 3 / 6 / 12 months, set when the door is added. FS: 12 months or NA.
- Alerts: one per building ("17 doors due"). Opens to a list: floor, door number, due date.
- NAPFIS certificate: file upload, one per building per completed project.
- Date validation everywhere (RiskBase let a review date of 2101 through).

## 4. Pricing

- Settings > Pricing: a list of a few dozen items, one amount per item, no labour / material split. Doorsets are in the same list, simple pricing.
- Two percentage steps, multiplied: `price = default x client adjustment x building adjustment` (example: 100 x 0.9 x 1.1 = 99).
- Clients tab: percentage adjustment per client (example: Atlas -10%).
- Per building: an additional percentage adjustment.
- On the quote: manual override of any line.
- Remedial = works list built from these items, total at the bottom.

## 5. MVP scope

MVP = Tomasz proposal (roles, dashboard, projects, survey templates, finding with photo and pin, offline, QR, cycles) plus:

1. Quote generated from findings.
2. Remedial status (to do, in progress, done, photo after).
3. QC: preview, "all ok", PDF generated in Next, sent by email or downloaded. Our brand only, no "Powered by".
4. Doors as assets with full history.
5. NAPFIS certificate upload.

Stage 2 (not MVP): invoices, recurring contracts, client portal, doorset production link.

## 6. UI rules

- Cream background by default, dark theme toggle. CSS built with both themes through variables from day one.
- Base font 14 px. High contrast. Readable on site in sunlight and for older workers.
- Buttons and touch targets min 48 px.
- Status colours: red = overdue more than 1 to 2 weeks, yellow = overdue up to 1 to 2 weeks, orange = remedial works in progress, green = all ok. Nothing alarming before the due date.
- App language: always English.
- One-hand mode on phone. One screen = one task in the inspector app.

## 7. Platform

- Next.js + Supabase. PDF generated in Next (no Java).
- Option A now: offline-first PWA, one codebase for office, inspector and remedial, installed on the phone home screen (iPhone and Android).
- Local data on the phone is the source of truth in the field. Supabase is the hub. Sync when signal returns. Photos compressed to about 1600 px. Visible indicator: "offline, N changes pending".
- Not available offline: PDF, email, downloading a new building, first login.
- Option C later: the same code wrapped in Capacitor for App Store and Play, no rewrite. No developer accounts and no Mac needed to start.
- Offline-first is the hardest part and is designed before the first line of code.

## 8. Inputs and competition

- RiskBase: used today with Atlas (1 GBP per door, 0.50 per reinspection). Door register, QR, floor plan pins, checklist, actions carried between inspections, client portal, API and webhooks. No quoting, invoicing or production. Sample report: fire stopping, Rufus House, 20 July 2026, 23 pages, 22 findings with Quelfire / Protecta tested details.
- Uptick: built for contractor businesses. Defect quoting in the field, online approval, invoices, contracts, client portal, install projects. Per user pricing, aimed at alarms and sprinklers.
- Tomasz proposal (10 slides): roles, dashboard like Skylon Build, projects, survey templates, finding with photo and pin, offline, QR, cycle schedule. Missing: quoting, remedial status, QC, portal, asset history.
- Fire Desk = register (RiskBase) + contractor business (Uptick) + our own production and NAPFIS certificate.

## 9. Mockups

`docs/mockups/fire-desk-screens.html` (dashboard, inspector app, remedial app, cream and dark), `docs/mockups/fire-desk-architecture.svg`, `docs/mockups/fire-desk-defect-flow.svg`. Direction, not final design.
