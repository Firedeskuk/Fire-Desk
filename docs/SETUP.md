# Fire Desk setup, step by step

For Piotr and Tomasz. No programming knowledge needed. Do the steps in order, one at a time. If anything shows red text, copy it and paste it to Claude.

## A. Put the files into the repo

Repo: https://github.com/Firedeskuk/Fire-Desk

Copy the files from this delivery to these paths:

| file | goes to |
|---|---|
| CLAUDE.md | repo root, replaces the old one |
| SPEC.md | repo root, replaces the old one |
| 20260913184137_init.sql | supabase/migrations/20260913184137_init.sql |
| 20260913184233_sync.sql | supabase/migrations/20260913184233_sync.sql |
| SYNC-PROTOCOL.md | docs/SYNC-PROTOCOL.md |
| SETUP.md | docs/SETUP.md |
| BRIEFING.md | docs/BRIEFING.md |
| BRIEFING-2-platform.md | docs/BRIEFING-2-platform.md |

Then commit on a branch (for example `feat/schema-and-docs`) and open a pull request to `main`. Piotr reviews and merges.

## B. Database schema: already applied

Both migrations were applied to the Fire Desk project from claude.ai on 13 Sep 2026. Supabase recorded them as:

- `20260913184137_init` (21 tables, 1 view, 42 policies, 4 storage buckets)
- `20260913184233_sync` (2 RPC functions, 8 triggers, 1 extra policy)

Do not run the SQL files again. The files in the repo use the same names, so the migration history in the database and in the repo match. Check if you like: **Table Editor** should show 21 tables, for example `assets`, `buildings`, `findings`.

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

Krótko po polsku: A wrzuć pliki do repo, B baza już zrobiona, nic nie uruchamiaj, C załóż pierwszego użytkownika w Authentication i podnieś go do managera jednym zapytaniem SQL, D klucze do aplikacji dopiero jak będzie kod. Każdy błąd na czerwono kopiujesz do Claude.
