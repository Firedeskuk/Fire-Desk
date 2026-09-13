# Fire Desk briefing 2: platform strategy

Companion to BRIEFING.md. This file explains which technical route was chosen for the mobile and office apps, why, and what "done" looks like. Read after BRIEFING.md, before proposing any architecture.

Language rule as always: Polish to Piotr, English to Tomasz, English in code and copy.

---

## 1. The situation we are building for

- Inspectors work inside blocks of flats, basements, risers and plant rooms. Mobile signal is often zero for hours.
- Remedial teams (joiners, fire stoppers) carry only a phone. No laptop, no tablet.
- Inspectors use both iPhone and Android. Office staff use laptops.
- Users include older workers. Screens must be readable in sunlight and usable in gloves.
- Today the team uses RiskBase. It works, but every finding has to be retyped by hand into a quote, and RiskBase branding sits on every page of our reports.
- The software is owned by Skylon Elements Ltd and may be sold one day. Nothing may depend on Piotr's other companies' accounts.

## 2. What we want to achieve

1. One application, one codebase, that works on a laptop in the office and on any phone on site.
2. Full offline operation in the field: open the app, scan a door QR, run the checklist, take photos, pin the finding on the floor plan, move to the next door, all without signal. Sync happens on its own when signal returns.
3. The app opens instantly. It never waits for Supabase or Vercel to wake up. Local data on the phone is the source of truth in the field.
4. A finding becomes a priced line on a quote without retyping.
5. Remedial team gets a works list per building, marks items done with a photo after.
6. QC preview, then a branded PDF, sent by email or downloaded. No third party branding.
7. Every door keeps its full history for life (golden thread of information).
8. Later, without rewriting anything: listing in App Store and Google Play, native push notifications, native file storage.

## 3. The three options that were considered

| Option | What it is | Verdict |
|---|---|---|
| A. Offline-first PWA | Next.js web app installed on the phone home screen. Works offline through a service worker and local storage. No app stores. | Chosen for now |
| B. Native app (React Native / Expo) + separate web app for the office | Most robust offline and camera access, real push, app stores. Two codebases. | Rejected for this stage: double the work for a team of two, second toolchain to learn, app store review on every release |
| C. PWA from option A wrapped in Capacitor | Same web code inside a native shell for iOS and Android. Adds app stores, guaranteed storage, native push and camera. | Chosen as the later step, no rewrite |

## 4. The chosen route: A now, C later

### 4.1 Option A: offline-first PWA (the MVP)

- Next.js application deployed on Vercel at app.firedeskuk.com.
- Same code serves three views by role: office panel (Manager, Admin), inspector app, remedial app.
- Installed on the phone via "Add to Home Screen" (mandatory on iPhone: Safari can wipe data of a site that is not installed and not opened for 7 days; an installed web app is exempt).
- Service worker caches the whole app shell, so it opens without network.
- Local database on the device (IndexedDB, or SQLite in the browser through a sync engine) holds buildings, assets, checklists, price list and pending changes.
- Photos are compressed on the device (about 1600 px, 200 to 400 KB each) and stored locally until synced. 200 doors x 3 photos is roughly 180 MB, fine for a phone; local copies are released after successful sync.
- A background sync queue sends changes and photos to Supabase when signal returns, with a visible indicator: "offline, N changes pending". Sync resumes where it stopped if signal drops again.
- Camera and QR scanning through browser APIs. Works on iPhone and Android.
- Not available offline, by design: PDF generation, email sending, downloading a building that was not downloaded earlier, first login. Session is kept locally for weeks after first login.
- Data flow: the inspector downloads the building in the morning while online ("download Rufus House"), works offline all day, syncs in the van.

What this gives us: one codebase, no app store review, updates reach everyone the moment they are deployed, no developer accounts, no Mac. It is the fastest route to a working tool in Atlas buildings.

### 4.2 Option C: Capacitor wrap (after MVP proves itself)

- The identical web code is placed inside a Capacitor shell. Nothing is rewritten.
- Adds: presence in App Store and Google Play (clients can "install Fire Desk"), storage that the OS never evicts, real push notifications ("17 doors due in Rufus House"), faster native camera and file access.
- Costs: Apple Developer Program 99 USD per year (company enrolment needs a D-U-N-S number, 1 to 3 weeks), Google Play 25 USD once. Apple review 1 to 2 days per version, first submission up to a week. iOS build needs a Mac or a cloud build service (Expo EAS, Codemagic). Android builds anywhere.
- Trigger to start C: a client asks for a store app, or push notifications become important, or PWA storage limits bite in practice.
- App stays free in the stores. Any future paid plans are sold through the website, not in-app, to avoid the 15 to 30 percent store commission.

## 5. Design rules that follow from this route

1. Offline-first is designed before the first line of code. The data model, the sync queue and conflict handling are decided up front, not bolted on.
2. Every screen used in the field must work with zero network. If a feature needs the server, it is an office feature, not a field feature.
3. Keep the web code free of anything that Capacitor cannot wrap: no server-only rendering for field screens, no reliance on cookies that a native shell drops, all storage behind one small abstraction so the browser store can later be swapped for native SQLite.
4. Photos: compress on device, never upload originals, never block the UI on upload.
5. One asset can be touched by two inspectors on the same day. Sync must merge, not overwrite. Rule to be designed: last write wins per field, with findings always appended, never replaced.
6. Sync engine is an open decision. Candidates to compare with reasons: a custom queue on IndexedDB (simple, fully ours), PowerSync (Postgres to SQLite sync with Supabase support), ElectricSQL. Recommendation expected before scaffolding.

## 6. What "done" means for the MVP

- An inspector completes a full door inspection round in a building with airplane mode on, then syncs, and every finding, photo and pin arrives in Supabase intact.
- A manager turns those findings into a quote with prices from the price list adjusted by client and building percentages, overrides one line by hand, and exports a PDF with Skylon Elements branding.
- A remedial joiner opens the works list for that building on a phone, marks items done with photos after, and the manager sees status change.
- The NAPFIS certificate is uploaded and attached to the building for that project.
- Dashboard shows one alert per building with due doors, in the agreed colours, on a cream background, readable on a phone in daylight.

## 7. Open questions for the architecture proposal

1. Sync engine choice (see 5.6).
2. Local storage layer: IndexedDB via Dexie, or SQLite via the chosen sync engine.
3. PDF generation library in Next (server side).
4. QR scanning library that works in both Safari and Chrome.
5. How the office panel and the field app share components without shipping office code to the phone.

---

Krótko po polsku dla Piotra: wybraliśmy drogę A (PWA offline-first, jeden kod, bez sklepów, bez Maca) teraz, a C (ten sam kod w Capacitor, sklepy i push) później, bez przepisywania. Opcja B (natywna apka osobno) odrzucona na tym etapie jako podwójna praca. Punkt 6 mówi, co znaczy "gotowe", a punkt 7 to pytania, na które nowy Claude ma odpowiedzieć zanim zacznie kodować.
