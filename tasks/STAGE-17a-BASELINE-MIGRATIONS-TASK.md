# Stage 17a — Live Database Baseline + Supabase CLI Migrations

**Model:** Sonnet (Part B). Part A is run by Samer by hand.
**Phase:** 0 (Lockdown). Must finish before 17d (security) and 17e (BOM save).

## Goal
Stop pasting SQL into the Supabase editor. Capture the REAL structure of the
live database as the first migration file in the repo, then report every
difference between it and the hand-written files in `db/`.

Nothing in this stage changes tables, policies or data. The only write to the
live database is one bookkeeping row that records "baseline applied".

---

## Part A — Samer, in PowerShell (about 10 minutes)

These commands ask for a login and a password, so they are run by hand, not by
Claude Code. Never paste the database password into a chat.

0. Start **Docker Desktop** and wait until it says it is running. Check:

       docker info

   (If Docker Desktop is not installed, install it first, then restart the PC.)

1. Go to the repo and add the Supabase CLI to the project:

       cd C:\Users\USER\Documents\alloy
       npm install --save-dev supabase
       npx supabase --version

2. Log in (opens the browser):

       npx supabase login

3. Create the `supabase/` folder. Answer **N** to any editor-settings question:

       npx supabase init

4. Link the repo to the live project. The project ref is the code in the
   dashboard address: `https://supabase.com/dashboard/project/<project-ref>`.
   It asks for the **database password** (Dashboard → Project Settings →
   Database). If it is lost, reset it there; the app does not use this
   password, so resetting it breaks nothing.

       npx supabase link --project-ref <project-ref>

5. Pull the live schema. This can take a few minutes the first time.
   When it asks `Update remote migration history table? [Y/n]` answer **Y**.

       npx supabase db pull --remote

   Expected: `Schema written to supabase/migrations/<timestamp>_remote_schema.sql`

6. Pull once more for the auth and storage schemas (it may say there is
   nothing to pull; that is fine):

       npx supabase db pull --remote --schema auth,storage

7. Confirm the file exists:

       Get-ChildItem supabase\migrations

If any step fails, stop and send the exact error text. Do not retry with
different flags.

---

## Part B — Claude Code (read-only analysis + commit)

### Scope — exactly this, nothing else
1. Read `supabase/migrations/*_remote_schema.sql` (the baseline) and
   `db/01_schema.sql` through `db/09_cuts.sql`.
2. Write `docs/DB-BASELINE-DRIFT.md` answering every question below with the
   exact SQL text found in the baseline (quote the lines).
3. Add `db/README.md` with exactly this content:

       # db/ is frozen
       These files are the historical hand-run SQL. Do not edit or re-run them.
       The source of truth is `supabase/migrations/`. Every schema change is a
       new migration file created with `npx supabase migration new <name>`.

4. Make sure `supabase/.temp` is git-ignored (check `supabase/.gitignore`,
   which `supabase init` creates; add the line to the root `.gitignore` only
   if it is missing from both).

### DO NOT
- Do not run `supabase db push`, `db reset`, `migration repair`, or any SQL
  against the live database.
- Do not edit the baseline migration file or anything in `db/`.
- Do not touch app code.

### Questions the drift report must answer
1. **Tables:** list every table in the baseline. Mark any that is in the
   baseline but not in `db/`, and any in `db/` but not in the baseline.
2. **Columns:** for `products`, `bom_lines`, `profiles`, `quotations`,
   `quotation_items`, `invoices`, `payments`: any column that differs from
   `db/` (missing, extra, different type or default).
   Specifically: does `products` have a `code` column? (Expected: no.)
3. **RLS on/off:** list every table and whether row level security is
   enabled. Specifically `code_counters`.
4. **Policies:** list every policy with its table, command, USING and
   WITH CHECK text. Quote in full the policies on `profiles`.
   Flag every policy whose USING is only `auth.uid() IS NOT NULL`.
5. **Functions:** for `current_role_of`, `is_admin`, `is_office`, `next_code`,
   `assign_code`, `apply_stock_movement`, `recompute_quotation_totals`,
   `recompute_invoice_totals`, `recompute_invoice_paid`, `set_updated_at`:
   is each present, and is it `SECURITY DEFINER` or `SECURITY INVOKER`?
   Do `is_admin` / `is_office` check `is_active`?
6. **Views:** is `low_stock_products` present, and does it have
   `security_invoker`?
7. **Triggers:** list every trigger (table, timing, function). Is there any
   trigger on `auth.users` that creates a `profiles` row?
8. **Grants:** any `GRANT ... TO anon` on tables, views or functions.
9. **Indexes:** list indexes; flag foreign-key columns with no index.
10. **Anything else** in the baseline that `db/` does not explain.

End the report with a section `## Summary` : a short table
`Item | In db/ files | In live database | Same?`.

### Verification
- `docs/DB-BASELINE-DRIFT.md` exists and has an answer under all 10 headings.
- `git status` shows only: `package.json`, `package-lock.json`, `supabase/`,
  `docs/DB-BASELINE-DRIFT.md`, `db/README.md` (and `.gitignore` if step 4
  needed it). No file under `app/`, `lib/`, `components/`, `extension/`.
- `npm run build` passes.

### Commit
```
git add -A
git commit -m "chore(db): Stage 17a — Supabase CLI baseline migration + drift report"
git push
```

### Report back
Paste the `## Summary` table from the drift report into the chat.
