# Fire Desk: fix the repo, then run it

## What is wrong right now

GitHub `main` is at commit `1eaa8f4` and `feat/mvp-night-2` does not exist on GitHub.
Nothing has been merged. The night 2 delivery zip was uploaded into `main` as raw
files, so `main` contains:

- `files/`, a full duplicate copy of the night 2 work, sitting unapplied
- `git/fire-desk-night-2.bundle`, `README-UPLOAD.txt`, `DELETE-THESE-FILES.txt`
- `components/field/inspector/QrScanStub.tsx`, which should have been deleted
- `supabase/migrations/0001_init.sql` and `0002_sync.sql`, stale duplicates of the
  timestamped migrations, and their contents differ from the timestamped versions

The actual night 2 features (QR scanning, printable labels, select options editor)
are not live on `main`. The application code itself is fine. The problem is only
where the code was put.

## Part 1: fix the repo

You need git on your laptop for this. The browser uploader cannot do it, and the
browser uploader is what caused the problem.

1. Clone the repo, if you do not have a clone already:

   ```
   git clone https://github.com/Firedeskuk/Fire-Desk.git
   cd Fire-Desk
   ```

2. Copy `fire-desk-night-2.bundle` from this zip somewhere you can reach, for
   example your Downloads folder.

3. From inside the clone, run:

   ```
   bash /path/to/push-branch.sh /path/to/fire-desk-night-2.bundle
   ```

   On a Mac that is usually:

   ```
   bash ~/Downloads/push-branch.sh ~/Downloads/fire-desk-night-2.bundle
   ```

4. Go to GitHub. A banner offers a pull request for `feat/mvp-night-2`. Open it,
   paste `NIGHT-2-REPORT.md` as the description, merge it into `main`.

5. Do not delete anything by hand. The branch already carries a cleanup commit
   that removes `files/`, `git/`, both README files and the two stale migrations.
   Merging is enough.

### If you prefer to do it without the script

Same thing, one command at a time:

```
git checkout main
git pull
git fetch /path/to/fire-desk-night-2.bundle feat/mvp-night-2:feat/mvp-night-2
git push -u origin feat/mvp-night-2
```

## Part 2: run it locally

Node 22 or newer. Checked on Node 22.22.

1. Get the merged code:

   ```
   git checkout main
   git pull
   ```

2. Install:

   ```
   npm install
   ```

3. Create `.env.local` in the repo root. Copy the names from `.env.example` and
   fill in real values from the Supabase project "Fire Desk", not "Brain FD":

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xuyruluqwtbizstjqewf.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your anon key
   SUPABASE_SERVICE_ROLE_KEY=your service role key
   RESEND_API_KEY=your resend key
   EMAIL_FROM=noreply@firedeskuk.com
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   The anon key is in Supabase under Project Settings, API. Never commit this file.

4. Start the dev server:

   ```
   npm run dev
   ```

   Open http://localhost:3000

5. To check everything the way CI would:

   ```
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```

   All four pass on the night 2 branch: 49 tests across 6 files, 25 routes built,
   no type errors, no lint errors.

## Testing QR scanning on a phone

The camera needs a secure context. `http://localhost` counts as secure on the
machine itself, but `http://192.168.x.x` from your phone does not, so the scanner
will not open. Use the Vercel preview deployment of the pull request to test QR
scanning on an iPhone, or use a tunnel that gives you an https URL.

## Known point to check before you rely on the migrations

`0001_init.sql` and `20260913184137_init.sql` are not identical, and the same is
true of the sync pair. The timestamped ones are the migrations that were actually
applied to Supabase, so the `0001` and `0002` files are the stale ones and the
merge deletes them. If you want to see exactly what differs before merging:

```
git diff --no-index supabase/migrations/0001_init.sql supabase/migrations/20260913184137_init.sql
```

## Krotko po polsku dla Piotra

Nic sie nie zmergowalo. Na GitHubie `main` stoi w tym samym miejscu co przedtem,
galezi `feat/mvp-night-2` tam nie ma. Zip z nocy 2 zostal wgrany do `main` jako
zwykle pliki, wiec w repo siedzi katalog `files/` z kopia calej pracy, ktora nigdzie
nie jest podpieta, plus bundle, dwa pliki README i dwie stare migracje.

Sam kod jest dobry: testy przechodza, build przechodzi, typy i lint czyste.
Problem jest wylacznie w tym, gdzie te pliki wyladowaly.

Zeby to naprawic, trzeba git na laptopie. Przegladarka tego nie zrobi, a to wlasnie
przegladarka narobila balaganu. Wejdz do klona repo i uruchom `push-branch.sh`
z tego zipa, potem na GitHubie otworz pull request i zmerguj. Niczego nie kasuj
recznie, merge sam usunie zbedne pliki.

Potem `npm install`, zrob plik `.env.local` z kluczami z Supabase, `npm run dev`,
i otworz http://localhost:3000.

Skanowanie QR nie zadziala z telefonu po adresie `192.168.x.x`, bo kamera wymaga
https. Do testow na iPhonie uzyj podgladu z Vercela.
