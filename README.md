# Fire Desk

Fire door and fire stopping compliance platform for UK contractors: door register with full history (golden thread), inspections with offline mobile app, defect quoting, remedial works tracking, branded PDF reports, NAPFIS certificate storage.

- Owner: Skylon Elements Ltd
- Domain: firedeskuk.com (app at app.firedeskuk.com)
- Stack: Next.js (PWA, offline-first), Supabase (Postgres, Auth, Storage), Vercel, Resend
- First client: FD30 (UK) Ltd, portfolio of Atlas Properties buildings

## Repo layout

```
docs/          spec, decisions, mockups
docs/mockups/  HTML and SVG mockups (direction, not final design)
CLAUDE.md      working rules for Claude sessions (PL + EN)
SPEC.md        agreed scope, data model, pricing, roles, UI, platform
.env.example   environment variable names (no values)
```

## Working memory

Shared project memory lives in Supabase project "Brain FD" (wardrobes: `rules`, `fire-desk-spec`, `mockups`). CLAUDE.md and SPEC.md mirror it. Read both at the start of every session.

## Ways of working

1. Nothing gets coded without an approved mockup or agreed layout.
2. Every change is proposed first, confirmed, then done.
3. Claude delivers complete files. Piotr or Tomasz push. Pull request required before merge to `main`.
4. Code, comments, database names and application copy are in English.

Full rules in CLAUDE.md.
