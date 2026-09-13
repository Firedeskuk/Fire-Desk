# Fire Desk briefing for a new Claude session

Read this whole file before doing anything. Then read CLAUDE.md and SPEC.md in the repo. Do not write code until the human confirms the plan.

Language rule: if you are talking to Piotr, answer in Polish. If you are talking to Tomasz, answer in English. Code, comments, database names and app copy are always English.

---

## 1. What Fire Desk is

Fire door and fire stopping compliance platform for UK contractors. It replaces RiskBase (the tool the team uses today) and adds what RiskBase lacks: quoting from defects, remedial works tracking, branded PDF reports, NAPFIS certificate storage, doors as assets with full history (golden thread of information).

- Owner: Skylon Elements Ltd (Piotr Ficner). Future sale of the software is planned, so everything is kept clean and separate from Piotr's other companies.
- First client: FD30 (UK) Ltd, which services a portfolio of buildings for Atlas Properties. FD30 is a client, not the owner.
- Team: Piotr (product owner, decisions, spec, review), Tomasz Sadek (developer, codes with Claude Code), Claude (developer and auditor).

## 2. Accounts and infrastructure

- Domain: firedeskuk.com. App will live at app.firedeskuk.com.
- Main account: info@firedeskuk.com. Bootstrap Gmail firedesk26@gmail.com is the recovery account only.
- GitHub: https://github.com/Firedeskuk/Fire-Desk (currently public by Piotr's decision, so never commit secrets, client data, addresses or names).
- Supabase organisation "Firedesk" with two projects, both region London (eu-west-2):
  - `Fire Desk` = the application database, project id `xuyruluqwtbizstjqewf`
  - `Brain FD` = shared project memory, project id `lgijuxwwciysbdxaolxe`
- Vercel team and Resend account exist on info@firedeskuk.com (Resend domain verification still to do).
- No Apple or Google developer accounts yet. Not needed for the PWA.

## 3. Brain FD (shared memory), how to use it

Supabase project `lgijuxwwciysbdxaolxe`, tables:

- `wardrobes` (path, description): a wardrobe is a folder of entries.
- `entries` (id, path, title, content, entry_type, author, status, tags, created_at, updated_at). `author` is `P` (Piotr), `T` (Tomasz) or `PT` (joint).

Current wardrobes:

- `rules`: 11 working rules, each in Polish and English. Same content as CLAUDE.md in the repo.
- `fire-desk-spec`: 8 entries (ownership, roles, data model, pricing, MVP scope, UI rules, platform, competition). Same content as SPEC.md in the repo.
- `mockups`: 3 entries holding the source of `docs/mockups/*` files.

At the start of every Fire Desk session: `select title, content from entries where path = 'rules' and status = 'active'`, then read `fire-desk-spec`. If you have no Supabase access, CLAUDE.md and SPEC.md in the repo are the mirror.

Writing to Brain FD: only with explicit confirmation from the human. Never delete entries, only change `status`. Never edit an entry by another author, add a new entry titled "Correction to: <title>".

## 4. The 11 rules (short form)

1. Polish to Piotr, English to Tomasz.
2. Every entry has an author, nothing is deleted, only status changes.
3. Step by step, no jumping ahead.
4. Nothing without confirmation: proposal, "yes", action.
5. Never make things up. Say "I do not know".
6. Never remove or change working functionality without consent, persuade first.
7. Questions at the end of a message, short, numbered from 1, answerable with numbers only.
8. No em dash or en dash in text.
9. Mockup or agreed layout before any code.
10. Claude delivers complete files, a human pushes. Pull request before merge to main.
11. Code and copy in English.

Full text: CLAUDE.md.

## 5. Agreed product decisions (short form, full text in SPEC.md)

- Roles: Manager, Admin, Inspector, Remedial team. Remedial team sees only the works list of buildings it is assigned to, never the inspections.
- Data model: Client > Building > Work type (Doors / FS) > Floors (optional) > Asset > Inspection > Finding > Remedial > Report > NAPFIS certificate. Asset keeps full history. Inspection cycle on the asset (doors 3/6/12 months, FS 12 months or NA). One alert per building that expands to a list. One NAPFIS certificate per building per completed project.
- Pricing: one amount per item, no labour/material split, doorsets in the same list. price = default x client % x building %, multiplied, plus manual override per line.
- MVP: Tomasz proposal (roles, dashboard, projects, survey templates, findings with photo and floor plan pin, offline, QR, cycles) plus quote from findings, remedial status with photo after, QC preview then PDF (email or download, own brand), doors as assets with history, NAPFIS upload. Stage 2: invoices, recurring contracts, client portal, doorset production.
- UI: cream background default with dark toggle (both themes via CSS variables from day one), base font 14 px, high contrast for building sites and older workers, buttons min 48 px, status colours red (overdue more than 1 to 2 weeks), yellow (overdue up to 1 to 2 weeks), orange (remedial in progress), green (all ok), English only, one-hand mode on phone.
- Platform: Next.js + Supabase, PDF in Next, offline-first PWA (one codebase for office, inspector and remedial), local data as source of truth in the field, sync when online, photos compressed to about 1600 px. Capacitor wrap for app stores later, no rewrite. Offline-first is the hardest part and must be designed before coding.

## 6. Division of work

- Tomasz + Claude Code in the cloned repo: writes the code, runs it, commits, opens pull requests.
- Piotr + Claude in the claude.ai chat: spec, decisions, Brain FD, mockups, and audit of every pull request before Piotr approves.
- Migrations for the Fire Desk database can be applied from a Claude session connected to Supabase, after the SQL is shown and confirmed.

## 7. What to do first in this session

1. Confirm you have read CLAUDE.md, SPEC.md and this briefing. Say so in one line.
2. Propose the Next.js folder structure and the initial Supabase schema for the Fire Desk project (tables for client, building, floor, asset, inspection, finding, remedial item, quote, price list, report, certificate, user profile with role). Present them as a plan, not as code.
3. Wait for approval. Only then scaffold the project.
4. Every delivery: complete files, list of what changed, questions at the end, numbered.

## 8. Things that are not decided yet

- Exact folder structure and schema (see step 2 above).
- Offline sync engine (candidates to compare and recommend: custom queue on IndexedDB, PowerSync, ElectricSQL). Recommend one with reasons, do not pick silently.
- PDF library in Next.
- Who hosts the first test build and when Atlas sees a demo.

---

Krótko po polsku dla Piotra: ten plik to pełny briefing dla każdego nowego Claude (czat albo Claude Code). Wklej go na start rozmowy albo trzymaj w repo jako `docs/BRIEFING.md`. Nowy Claude ma najpierw przeczytać CLAUDE.md, SPEC.md i ten plik, potem zaproponować strukturę folderów i schemat bazy, i czekać na Twoje "tak".
