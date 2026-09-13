# Fire Desk setup, step by step

For Piotr and Tomasz. No programming knowledge needed. Do the steps in order, one at a time. If anything shows red text, copy it and paste it to Claude.

## A. Put the files into the repo

Repo: https://github.com/Firedeskuk/Fire-Desk

Copy the files from this delivery to these paths:

| file | goes to |
|---|---|
| CLAUDE.md | repo root, replaces the old one |
| SPEC.md | repo root, replaces the old one |
| 0001_init.sql | supabase/migrations/0001_init.sql |
| 0002_sync.sql | supabase/migrations/0002_sync.sql |
| SYNC-PROTOCOL.md | docs/SYNC-PROTOCOL.md |
| SETUP.md | docs/SETUP.md |
| BRIEFING.md | docs/BRIEFING.md |
| BRIEFING-2-platform.md | docs/BRIEFING-2-platform.md |

Then commit on a branch (for example `feat/schema-and-docs`) and open a pull request to `main`. Piotr reviews and merges.

## B. Apply the database schema

Do this once, on the Fire Desk project (not Brain FD).

1. Open https://supabase.com/dashboard, pick the organisation, open the project **Fire Desk** (id `xuyruluqwtbizstjqewf`).
2. In the left menu click **SQL Editor**, then **New query**.
3. Open `0001_init.sql`, select all, copy, paste into the editor.
4. Click **Run** (bottom right). Wait. The result should say "Success. No rows returned".
5. Click **New query** again. Paste the whole `0002_sync.sql`. Click **Run**. Same success message.
6. Check: in the left menu click **Table Editor**. You should see 21 tables, for example `assets`, `buildings`, `findings`.

If step 4 or 5 shows an error, copy the whole error text to Claude. Do not run the same file twice, it will complain that things already exist.

## C. Create the first user (the manager)

1. In the Fire Desk project, left menu, click **Authentication**, then **Users**.
2. Click **Add user**, then **Create new user**.
3. Fill in the email and a password. Tick **Auto Confirm User**. Click **Create user**.
4. The database created a profile for this user automatically, with role `inspector`. Promote it to manager: go to **SQL Editor**, **New query**, paste this, replace the email, click **Run**:

```sql
update profiles
   set role = 'manager', full_name = 'Your Name'
 where id = (select id from auth.users where email = 'you@example.com');
```

5. Check: **Table Editor**, table `profiles`, one row, role `manager`.

Repeat steps 1 to 3 for every inspector. Inspectors keep the default role. For a remedial worker run the same SQL with `role = 'remedial'`, then add a row in `building_assignments` for each building they may see (Claude will give you the SQL when there are buildings).

## D. Keys for the app (needed later, when the app code exists)

1. Fire Desk project, left menu, **Project Settings**, then **API**.
2. Copy **Project URL** and the **anon public** key.
3. They go into a file called `.env.local` in the repo root. Claude will give you the exact content. This file is never committed, it is already in `.gitignore`.

Never copy the **service_role** key anywhere except where Claude explicitly says. It bypasses all security.

## E. What comes next

Claude delivers the application files. You will run, one at a time:

1. `npm install`
2. `npm run dev`
3. open http://localhost:3000 in a browser

and paste back what the terminal prints.

---

Krótko po polsku: A wrzuć pliki do repo, B wklej dwa pliki SQL w SQL Editor projektu Fire Desk i kliknij Run, C załóż pierwszego użytkownika w Authentication i podnieś go do managera jednym zapytaniem SQL, D klucze do aplikacji dopiero jak będzie kod. Każdy błąd na czerwono kopiujesz do Claude.
