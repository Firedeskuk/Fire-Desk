# Night 2 progress log

Kept by Claude Code during the unattended run of the night 2 task (QR scanning, QR labels, select options editor).
Before each step: what is about to happen. After each step: what happened.
If context is compacted: re-read this file first, continue from the last unfinished step.

## Step 0: setup

- About to: read CLAUDE.md, SPEC.md, docs/SYNC-PROTOCOL.md, docs/NIGHT-1-REPORT.md and both migrations, create branch feat/mvp-night-2 from up to date main, start this file.
- Done: files read. AGENTS.md does not exist in the repo. origin/main is at 410c200 (night 1 upload), branch feat/mvp-night-2 created from it.
- Decision: the session was started on branch claude/sharp-bohr-9ilt5o. The task says feat/mvp-night-2. Work happens on feat/mvp-night-2. The same commits are also pushed to claude/sharp-bohr-9ilt5o so the session record stays complete. Pull request is opened from feat/mvp-night-2.

## Step 1: repo cleanup

- About to: delete supabase/migrations/0001_init.sql and 0002_sync.sql, append the ignore lines to .gitignore, create .npmrc, add the typecheck script, add it to CLAUDE.md section 12, npm install, run the four checks, commit.
- Done: 0001_init.sql and 0002_sync.sql deleted (they differed from the timestamped files only in four comment lines naming the file), .gitignore extended, .npmrc created, typecheck script added, CLAUDE.md section 12 now lists npm run typecheck and npm test next to build and lint. npm install went through with legacy-peer-deps. Build, lint, typecheck and 28 tests green.
- Decision: commit messages are one line as CLAUDE.md section 3 asks, without the tool's co-author trailer lines.
- Blocker: git push is refused with 403 for feat/mvp-night-2 and for claude/sharp-bohr-9ilt5o ("Claude doesn't have GitHub access to Firedeskuk/Fire-Desk for your organization"). The GitHub API through the connector is refused too: creating the branch fails with 403 "Resource not accessible by integration". Same as night 1. Decision: keep committing locally after every step, retry git push after every step, and at the end attach a git bundle of the branch to the session so nothing is lost. The pull request can only be opened once a human has pushed the branch.

## Step 2: QR decoding in the field

- About to: install jsqr, qrcode and @types/qrcode, write lib/qr/decode.ts (jsqr wrapper, camera helpers, decode loop at most 10 frames a second, no React), lib/qr/lookup.ts (match against the local assets mirror by qr_code), components/field/inspector/QrScanner.tsx (full screen camera, viewfinder, Close, typed fallback), a ScanQrButton that owns the lookup and navigation, wire it into /buildings, /buildings/[id] and the door screen, delete QrScanStub.tsx, tests in tests/qr.test.ts, run the four checks, commit.
- Done: jsqr 1.4.0, qrcode 1.5.4 and @types/qrcode 1.5.6 installed. lib/qr/decode.ts (decodeImageData wraps jsqr, decodeFrame draws the video on an offscreen canvas scaled to a long edge of 800 px, scanFrames schedules the next frame only after the previous one was decoded so it never exceeds 10 frames a second and stops after the first value, openBackCamera and stopCamera, CameraError with a problem code, no React). lib/qr/lookup.ts (findAssetByCode: exact match on the qr_code index, then case insensitive, then the door reference inside the current building, result here, elsewhere with the building name, or not_found). components/field/inspector/QrScanner.tsx (full screen video, amber square viewfinder, 48 px Close, message line, typed fallback with Find when the camera is refused or missing). components/field/inspector/ScanQrButton.tsx (the button plus the landing rules and navigation, push on the lists, replace on the door screen). components/field/inspector/useScanArrival.ts (reads ?scan=other from the browser location so the door screen can say "Door is in {building}"). QrScanStub.tsx deleted. Scan QR at the top of /buildings and /buildings/[id], in the asset card on the door screen. Scanner styles and three camera tokens (scan-bg, scan-frame, scan-text) in theme.css. tests/qr.test.ts: 12 tests (decode a qrcode image, blank frame, frame draw and size, video without data, scaling, at most 10 frames a second and stop after the first value, stop before the first read, lookup here, elsewhere, not found, from the list, typed case and door reference). Build, lint, typecheck and 40 tests green.
- Decision: jsdom has no 2d canvas and the canvas npm package is not on the allowed list, so the decode test paints the qrcode module matrix into an RGBA buffer the way a canvas holds it and feeds that to jsqr. The frame loop is tested with a fake video and a fake context.
- Decision: "Door is in {building name}" travels as ?scan=other on the door URL, not in memory, so it survives a full page load when the phone is offline and the service worker serves the shell. The door screen shows the notice from its own building row.
- Decision: scanning from the building list treats every hit as "elsewhere", so the door screen names its building there too.
- Decision: a typed code is matched case insensitively, and inside the current building the door reference printed under the QR (GF-01) is accepted as well. The scanned payload is still the exact qr_code value.
- Decision: scanning the label of the door already on screen says "This is the door on screen." instead of reloading.
- Decision: after a value led nowhere the scanner shows the message and resumes scanning 2 seconds later, the camera stays open. The Close button leaves.
- Decision: frames are scaled to a long edge of 800 px before decoding and jsqr runs without inversion attempts, both for speed on older phones. The camera is asked for 1280 by 720.

## Step 3: QR labels in the office

- About to: lib/qr/codes.ts (code format FD-{6 chars of the building id}-{ref without spaces}, pure), lib/qr/labels.ts (qrcode toDataURL at 256 px, dynamic import so only the office page loads it), "Assign QR codes" button and "Labels" link in the assets card of /office/buildings/[id], page /office/buildings/[id]/labels with the grid of labels and a Print button, print stylesheet in theme.css, tests for the code format, run the four checks, commit.
- Done: lib/qr/codes.ts (buildingShortCode, qrCodeFor, needsCode), lib/qr/labels.ts (qrDataUrl, 256 px, margin 1 module, error correction M, qrcode loaded with a dynamic import so it lands in its own client chunk and never in the field bundle or the server build, verified in .next), "Assign QR codes (N)" button and "Labels" link in the assets card title row of /office/buildings/[id], one update per asset without a code through the office Supabase client, existing codes untouched, notice "N codes assigned.", page /office/buildings/[id]/labels (building name, assets with a code in natural ref order, 4 per row, QR image, ref 16 px bold, building name 12 px, Print button, count of assets without a code), label and print styles in theme.css (page margin 5 mm, header and buttons hidden, 4 x 50 mm labels, image 32 mm, break inside avoided, dark theme tokens forced to cream on paper). tests/qr.test.ts: 3 more tests (code format, needsCode, a generated code decodes from its own label image). Build, lint, typecheck and 43 tests green.
- Decision: the label image is 32 mm inside the 50 mm label so the reference and the building name fit under it. A 256 px PNG at 32 mm is about 200 dpi, which scans fine.
- Decision: refs are sorted with numeric collation on the labels page, so 2F-05 comes before 2F-10, the same rule as the field screens.
- Decision: on a window narrower than 900 px the label grid shows 2 per row on screen, print stays at 4 per row.

## Step 4: select options editor

- About to: in components/office/TemplateQuestions.tsx add options to the draft (add and edit forms show "Options, one per line" when the type is select), show the current options as small pills on every select question, and an inline "Options, one per line" editor under the question that saves survey_template_items.options as a JSON array of strings on blur. Run the four checks, commit.
- Done: components/office/TemplateQuestions.tsx: the draft (add and edit) has "Options, one per line" when the type is select, saved with Add and Save as a JSON array of strings (null when empty, and null when the type is not select). Every select question in the list shows its options as small pills ("No options yet" when empty) and an inline "Options, one per line" editor that saves survey_template_items.options on blur when the text changed. Helpers optionStrings, optionsText and optionsFrom (trim, drop blanks and repeats) live in components/office/helpers.ts, tests/options.test.ts covers them. Build, lint, typecheck and 45 tests green.
- Decision: the editor is a textarea, not a single line input, because the options are one per line.
- Decision: changing a question away from select clears its options on Save, options only mean something for a select question.

## Step 5: report

- About to: write docs/NIGHT-2-REPORT.md in the night 1 format, run the four checks, commit, retry the push, bundle the branch, attach the bundle to the session.
- Done: docs/NIGHT-2-REPORT.md written (20 decisions, 3 packages, 10 hand tests, 5 questions). Push still refused, bundle attached as fire-desk-night-2.bundle. The pull request cannot be opened until a human pushes the branch (report section 0).

## Follow up, 18 Sep: Piotr's answers to the report questions

- Answers: 2 = the typed fallback takes the door number only (GF-01), 3 = labels for removed and replaced doors stay, 4 = label size stays, 5 = yes, offer typing while the camera works. Question 1 (GitHub access) not answered yet.
- About to: lib/qr/lookup.ts gets findAssetByRef (door number, case and spaces ignored, building on screen first, otherwise unique among downloaded buildings, else ambiguous), findAssetByCode goes back to the exact qr_code value only. QrScanner gets a "Type the door number" button in the camera view and "Use the camera" in the typing view, the camera is stopped while typing. ScanQrButton routes scanned values to the code lookup and typed values to the number lookup. Tests updated. Four checks, commit, report updated, bundle rebuilt.
- Done: commit Type the door number in the scanner. lib/qr/lookup.ts: findAssetByCode exact only, findAssetByRef (letters and digits only, building on screen first, unique elsewhere, else ambiguous with a message). QrScanner: "Type the door number" in the camera view, "Use the camera" in the typing view, camera effect tied to the mode so the camera stops while typing, a stream that arrives after leaving camera mode is stopped. ScanQrButton routes by source. Tests: 49 green, build, lint and typecheck green.
- Piotr, mid run: "do not push, deliver a zip". No further push attempts. The delivery is a zip with the changed files at their repo paths, a delete list, upload steps and the git bundle. Report section 0 rewritten for that.
