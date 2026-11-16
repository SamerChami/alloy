# Stage 17d — Security Lockdown

**Model:** Opus, in a FRESH Claude Code session (independent review).
**Phase:** 0 (Lockdown). Requires 17a (done).

## Goal
Close the access holes confirmed in `docs/DB-BASELINE-DRIFT.md`:
1. any logged-in user can make themselves admin;
2. reads need only a login, not an active staff profile;
3. deactivated users keep access;
4. automatic document codes cannot be generated (`code_counters` locked);
5. factory stock movements do not change stock;
6. the low-stock view is readable without logging in.

The migration and the checks are already written:
- `supabase/migrations/20261116130000_security_lockdown.sql`
- `supabase/tests/17d_security_checks.sql`

Diagnostic-first: the checks are run BEFORE the migration (to prove the holes
on the live database) and AGAIN after it.

Out of scope (later stages): hiding cost/margin columns from non-office roles
(needs app changes), task policies, per-route role guards.

---

## Step 1 — Samer: create the test user (5 minutes)
1. Supabase dashboard → Authentication → Users → Add user.
   Email `factory.test@alloy.test`, any password, tick auto-confirm.
2. SQL editor, run:

       insert into public.profiles (id, full_name, role)
       select id, 'Test Factory', 'factory_worker'
       from auth.users where email = 'factory.test@alloy.test'
       on conflict (id) do update set role = 'factory_worker', is_active = true;

3. Also confirm your own account is an active admin (must return your row):

       select full_name, role, is_active from public.profiles where role = 'admin';

   If it returns nothing, STOP and report. Do not continue.

## Step 2 — Samer: run the checks BEFORE the migration
Open `supabase/tests/17d_security_checks.sql`. Paste and run blocks T1, T2,
T5 and T6, one at a time. Each shows a red "RESULT ..." line; that is how the
result is displayed, and it also undoes the test. Note the four results.

Expected before: T1 HOLE OPEN · T2 FAILS · T5 HOLE OPEN · T6 products > 0.
If a result differs, note it; it is information, not a blocker.

## Step 3 — Claude Code (Opus): independent review, no edits yet
Read, in full: `docs/DB-BASELINE-DRIFT.md`,
`supabase/migrations/20261116120553_remote_schema.sql`,
`supabase/migrations/20261116130000_security_lockdown.sql`,
`supabase/tests/17d_security_checks.sql`, `app/(app)/layout.tsx`,
`middleware.ts`, and every `.from("profiles")` call in `app/`.

You did not write this migration. Review it as an outsider and answer each
question in a short written report:
1. Does every statement apply cleanly on top of the baseline (object names,
   policy names, function signatures, quoting)?
2. Can a non-admin still change `role`, `is_active` or `id` on any row by any
   route (direct update, upsert, insert of a second row, RPC)?
3. Can the owner still manage roles from the Supabase dashboard / SQL editor?
   Can an admin still manage other users from the app?
4. Is there any way an active admin gets locked out by this migration?
5. Does any page in the app break? Check every query the app makes against
   the changed policies, in particular: the layout's own-profile read for a
   deactivated user, the dashboard's `low_stock_products` count, and login.
6. Does anything in the app rely on the `anon` role having table access
   before login?
7. `SECURITY DEFINER` functions: is `search_path` pinned on each one? Any
   function that could be abused now that it runs with owner rights?
8. Anything the migration should do and does not, within this stage's scope.

If you find a real defect: fix it with a surgical edit to the migration file
(it has NOT been applied yet, so editing it is allowed), and say exactly what
you changed and why. If you only have doubts, report them and STOP.

Then run `npm run build`. Do NOT run any `supabase db` command.

## Step 4 — Samer: apply the migration
Only after Step 3 reports no open defects.

    npx supabase db push --dry-run

If the first line says `Target: local stack`, add `--remote` to both commands.
The dry run must list exactly one migration: `20261116130000_security_lockdown.sql`.
Then:

    npx supabase db push

Enter the database password if asked. If it errors, copy the exact text and
stop; a failed migration is rolled back as a whole.

## Step 5 — Samer: run the checks AFTER the migration
Run all six blocks T1–T6, one at a time.

| Check | Wanted after |
|---|---|
| T1 | BLOCKED (good) |
| T2 | WORKS (good): generated code ALY-2026-0001 (or next number) |
| T3 | 0 products, own profile rows 1 |
| T4 | BLOCKED (good) |
| T5 | BLOCKED (good) |
| T6 | products > 0 |

Then in the app (clean restart, hard refresh):
- Log in as yourself: dashboard, clients, products and components all load.
- Log in as `factory.test@alloy.test`: the app opens; products list loads.
- In the dashboard set that test user's `is_active` to false (Table editor →
  profiles). Reload the app as the test user: it is signed out to the login
  page. Leave the test user deactivated when done.

## Step 6 — Claude Code: commit
Only after Samer confirms all Step 5 results.
```
git add -A
git commit -m "feat(security): Stage 17d — lock down profiles, staff-only reads, code numbering, low-stock view"
git push
```

## Report back
The six RESULT lines before and after, the review report from Step 3, and
anything that behaved differently from this file.
