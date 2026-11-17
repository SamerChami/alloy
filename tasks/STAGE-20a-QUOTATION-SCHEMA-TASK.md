# Stage 20a — Quotations: the database half

**Model:** Opus review in a FRESH Claude Code session (Step 1). No app screens
in this stage; Step 3 is a commit only.
**Phase:** 3 (Sales spine), first stage. Requires 19c (done, f3cc688).

## Decisions this implements
Samer was asked on 18 Nov 2026 and left all four to Claude:
1. **Tax:** line prices are before tax. Sales tax (default 16 %) is added on
   top and can be changed per quotation. The default lives in
   `pricing_settings.quote_tax_pct`.
2. **Discount:** one discount on the whole quotation, typed as a percentage
   or as a JOD amount. No per-line discount.
3. **What the client sees:** every line always keeps its own price in the
   app. Each quotation has a print choice: price per line, per section, or
   one total (`quotations.price_display`).
4. **Order:** 20a database, 20b quotations built by hand, 20c SketchUp
   project import into a draft, 20d bilingual print/PDF.

Also decided by Claude (say so if you disagree, Samer):
- A new quotation is valid for 30 days (`pricing_settings.quote_validity_days`).
- Only a **draft** can be changed or deleted. Sent / approved / rejected /
  expired quotations are frozen; to change one, send it back to draft (only
  from "sent") or make a **revision** (`QUO-2026-0007-R2`).
- Status flow: draft → sent → approved | rejected | expired; sent → draft.
  Nothing leaves approved, rejected or expired.
- A line remembers code, names, size, list price and cost at the time of
  quoting. A later catalogue price change never changes an existing quotation.
- Projects stay optional on a quotation; the Projects screens come after.

## Already written (do not rewrite)
- `supabase/migrations/20261118090000_quotations.sql`
- `supabase/tests/20a_quotation_checks.sql` (Q0–Q9)
- `lib/quotationTotals.ts` + `lib/quotationTotals.test.ts` (preview mirror of
  the totals rule; 7 tests)

The migration and Q1–Q9 were run against a local PostgreSQL 16 copy built from
the eight existing migrations (with stand-ins for Supabase's `auth` schema and
roles; `MAINTAIN` stripped from the baseline grants because it is PostgreSQL 17
only): it applied cleanly and every check gave the wanted result. That is not
the live database, so the review and the live checks below still apply.

Nothing in the app reads the changed columns yet (only the dashboard count and
the placeholder page touch `quotations`), so applying the migration cannot
break a screen.

---

## Step 1 — Claude Code (Opus, fresh session): review, no app edits
Read in full: the nine files in `supabase/migrations/`,
`supabase/tests/20a_quotation_checks.sql`, `lib/quotationTotals.ts` and its
test. You did not write these. Review as an outsider and report on each point:

1. **Applies cleanly** on top of the eight earlier migrations? Names exactly
   as created in the baseline: trigger `trg_quote_items_totals`, function
   `recompute_quotation_totals()`, policies `quotations_office` and
   `quote_items_office`, enum `quote_status`. Anything else in the schema that
   still calls the dropped function?
2. **Totals cannot be forged or go stale.** `quotations_before_write`
   overwrites `subtotal_jod`, `discount_jod`, `tax_jod`, `total_jod` on every
   insert and every draft update; `quotation_items_touch` forces that update
   after every line change. Find any path where the four columns can differ
   from the lines: bulk statements, `insert … on conflict`, a line moved
   between quotations, concurrent edits of the same quotation from two
   sessions, a trigger-order problem with `trg_quotations_updated`.
3. **The lock.** Once the status is not `draft`: can any line be inserted,
   updated or deleted; can client, project, title, issue date, discount, tax,
   number or revision change; can the row be deleted? Walk the cascade delete
   of a draft (parent row not visible inside `quotation_items_guard`) and say
   whether "not found = allow" can be abused by anyone, given RLS.
4. **Status flow.** Only the transitions listed above pass; `sent_at` /
   `decided_at` cannot be set by the app. A new row cannot be inserted with a
   status other than `draft`.
5. **`quotation_add_product`** (SECURITY INVOKER): correct price and cost for
   a model, a standard size (with and without its own parts) and a component;
   refuses a deactivated item and a size of another model; does it work for
   every office role under the 18d policies (`products`, `product_sizes`,
   `pricing_settings`, `price_bom`)? Any way a non-office user gets a price
   out of it?
6. **`revise_quotation`**: numbering under two simultaneous calls, revising a
   revision, the `on delete restrict` on `root_id`, the unique index
   `quotations_family_revision`.
7. **Rights.** After section 8 of the migration: what can `anon`,
   `authenticated` and `public` do on the two tables and the six functions?
   TRUNCATE must be gone. Revoking EXECUTE on the four trigger functions must
   not stop the triggers firing for an office user (Q8 covers it; confirm the
   reasoning).
8. **The mirror.** `lib/quotationTotals.ts` gives the same numbers as the
   trigger for the cases in the test and in Q1/Q2, including rounding of a
   line total (`qty` is `numeric(12,2)`, price `numeric(12,3)`).
9. **Existing rows.** Q0 is meant to show the live tables are empty. If they
   are not, which statement of the migration could fail or change a stored
   total?
10. Anything the migration should do and does not, within this stage's scope
    (20b–20d are out of scope).

If you find a real defect: fix it with a surgical edit to the migration, the
checks file or the mirror (none is applied or committed yet) and say exactly
what you changed and why. If you only have doubts, report them and STOP.
Do NOT run any `supabase db` command. Do not touch app code.

## Step 1b — Claude Code (Opus, fresh session): second round, the changes only
Step 1 was done on 18 Nov 2026 and fixed two defects (line added while the
quotation is being sent; number / revision typed on insert). Claude (chat)
then ran the fixed files on the local PostgreSQL 16 copy (Q0–Q8 as wanted,
both orders of the send-versus-add-line race behave correctly) and added four
changes in answer to the review's open questions. They are NOT reviewed yet:

a. `quotation_items.product_id` is now `on delete restrict` (was `set null`):
   a catalogue item on any quotation cannot be deleted, only deactivated.
   `ProductForm` / `ComponentForm` already show "used in quotations —
   deactivate it instead" on a failed delete.
b. `size_id` stays `on delete set null`, and `quotation_items_guard` lets
   exactly that change through on a frozen quotation (nothing else on the row
   may differ; the generated `line_total_jod` is left out of the comparison
   because it is not filled in on NEW in a BEFORE trigger).
c. Catalogue facts on a line (`price_source`, `product_id`, `list_price_jod`,
   and for non-manual lines `code` and `unit_cost_jod`) are written only by
   `quotation_add_product` / `revise_quotation`, which switch on the
   transaction-local setting `alloy.quote_line_writer` around their inserts.
   A direct insert is stored as a `manual` line; a direct update keeps the
   old values silently. `size_id` may only be cleared.
d. `id` and `created_at` of a quotation cannot change; an empty quotation
   cannot be sent. Q4 gained `send empty REFUSED`; new block Q9.

Review only these four: any way an API user (PostgREST, role `authenticated`)
can switch the setting on or otherwise forge a catalogue line; whether (b) can
let any other change onto a frozen line; whether the setting can stay `on`
after an error and leak into later statements of the same transaction;
whether (a) breaks an existing app path (the three import shells delete a
just-created product on rollback; Duplicate; `replace_bom_lines`). Same rules
as Step 1: fix real defects surgically, otherwise report and STOP.

Not changed, accepted as they are: a deleted draft revision frees its number;
an original that has revisions cannot be deleted; two lines added at the same
moment can share a `sort_order` (lists order by `sort_order, id`).

## Step 2 — Samer: check BEFORE, apply, check AFTER
1. SQL editor: paste and run block **Q0** from
   `supabase/tests/20a_quotation_checks.sql`.
   Wanted: `quotations 0 | lines 0 | … 0 | 0 | 0`. If any number is not 0,
   stop and tell Claude.
2. Only after Step 1b reports no open defects:

       npx supabase db push --remote --dry-run

   It must list exactly one migration: `20261118090000_quotations.sql`.

       npx supabase db push --remote

   If it errors, copy the exact text and stop; a failed migration is rolled
   back as a whole.
3. Run **Q1 to Q9**, one block at a time.

| Check | Wanted |
|---|---|
| Q1 | subtotal 180.750 \| discount 18.075 \| tax 26.028 \| total 188.703 |
| Q2 | fixed 20 -> 20.000 / 186.470 \| tax 0 -> 160.750 \| discount 500 is held at 180.750 -> total 0.000 \| typed total 1 is ignored -> 209.670 \| line removed -> subtotal 159.000 |
| Q3 | six times REFUSED \| print choice and notes allowed \| total still 209.670 \| back to draft … total 232.290 |
| Q4 | new as sent REFUSED \| draft->approved REFUSED \| send empty REFUSED \| draft->sent ok (sent date set) \| sent->approved ok (decided date set) \| approved->draft REFUSED \| approved->sent REFUSED \| renumber REFUSED \| typed number ignored \| typed revision ignored (-R2) \| delete a draft ok |
| Q5 | model line: TEST-20A \| 800x720x580 \| price 21.500 \| cost 16.326 \| catalogue \| size line: 600x720x560 \| price 35.000 \| cost none \| standard (section "Kitchen") \| hinge line: price 1.750 \| cost 1.100 \| subtotal 63.500 \| after the board doubles: catalogue price 30.500, quotation still 63.500 \| deactivated item REFUSED \| size of another model REFUSED |
| Q6 | three numbers, the 2nd and 3rd ending -R2 and -R3 (R2 ok, R3 ok) \| status draft and draft \| lines 3 and 3 \| totals 188.703 and 188.703 \| original still approved with 3 lines, total 188.703 |
| Q7 | factory worker reads quotations 0 of 1, lines 0 of 1 \| new quotation REFUSED \| new line REFUSED \| change 0 rows \| add from catalogue REFUSED \| revision REFUSED |
| Q8 | number QUO-2026-nnnn \| tax 16.00 \| valid 30 days \| with settings 10 % and 14 days: tax 10.00 \| valid 14 days \| as an office user: add ok, send ok, revise ok (…-R2), total 23.200 |
| Q9 | hand line claiming to be catalogue is stored as: manual \| list none \| product none \| catalogue line after an edit attempt: catalogue \| list 21.500 \| cost 15.318 \| code TEST-20A \| price charged 20.000 \| delete a quoted model REFUSED \| standard size deleted while sent: line keeps 600x720x560 at 35.000, link cleared \| total still 60.000 |

The word `ERROR:` in front of each line is expected (that is how a block shows
its answer and undoes itself). Any other result: stop and report it.

## Step 3 — Claude Code (Sonnet): verify and commit
No code edits. Stop the dev server first.

    npm run lint
    npm run typecheck
    npm test
    npm run build

All four must pass (`lib/quotationTotals.test.ts` adds 7 tests). Then commit
exactly these five files plus this task file:

    supabase/migrations/20261118090000_quotations.sql
    supabase/tests/20a_quotation_checks.sql
    lib/quotationTotals.ts
    lib/quotationTotals.test.ts
    tasks/STAGE-20a-QUOTATION-SCHEMA-TASK.md

Commit message:
`feat(quotations): Stage 20a — line snapshots, database-owned totals, draft lock, status flow, revisions`

Push to `main`. Report the commit hash.

## What comes next (not in this stage)
- **20b** Quotations screens: list, new quotation for a client, add lines from
  the catalogue (`quotation_add_product`) or by hand, sections, discount, tax,
  status buttons, revision, the quotations panel on the client page.
- **20c** SketchUp project import into a draft quotation: match by code,
  standard price only on an exact W × H × D match, otherwise priced from the
  cabinet's own parts; review of matched / unmatched lines.
- **20d** Bilingual print / PDF with the three price-display choices.
