# Stage 20b-FIX — Amman date, and the tester's first findings

**Model:** Opus review of one line (Step 1), Sonnet build (Step 3), tester
agent on Sonnet (Step 4).
**Requires:** 20b built (1106a93, not pushed).

## Why
The 20b tester ran checks 1–8 (all numbers correct) before the browser pane
went offline. It found one defect and several usability points:

1. **Date (defect).** A quotation made at 01:45 on 18 Nov in Amman was dated
   17 Nov and valid until 17 Dec. The database default `current_date` and the
   app's `new Date().toISOString()` are both the UTC date, which is yesterday
   between midnight and 03:00 in Amman. (The `toISOString()` line came from
   Claude's own 20b task file.)
2. Unit price and qty boxes are too narrow: 19.5 shows as "19.", 120 as "12(".
3. No sign that an edit was saved.
4. A typed line can be added twice by clicking again while it saves.
5. A fixed discount larger than the subtotal keeps showing the typed number
   (500) while the database applies only the subtotal.
6. The pencil button's label is "Description"; icon buttons have no tooltip.
7. Lines with no section appear under "General", which the user never typed.
8. "Printing comes in a later stage; the choice is saved now." is developer
   wording.

## Already written (do not rewrite)
- `supabase/migrations/20261118100000_quotation_issue_date_amman.sql`: one
  statement, `issue_date` default becomes
  `(now() at time zone 'Asia/Amman')::date`.
- `supabase/tests/20b_fix_date_check.sql` (D1).
- `lib/quotations.ts`: new `todayInAmman(now?)`; `lib/quotations.test.ts`:
  2 new tests (17 in the file).

Trial on the local PostgreSQL 16 copy with the session time zone forced to
UTC, at 01:49 Amman time: D1 gave issue date 2026-11-18, Amman date
2026-11-18 (same), UTC date 2026-11-17, valid for 30 days.

---

## Step 1 — Claude Code (Opus, fresh session): review the one-line migration
Read `supabase/migrations/20261118100000_quotation_issue_date_amman.sql`,
`supabase/migrations/20261118090000_quotations.sql` (trigger
`quotations_before_write`, function `revise_quotation`) and
`supabase/tests/20b_fix_date_check.sql`. Report:
1. Is the default expression valid as a column default and does it give the
   Amman calendar date whatever the session time zone is?
2. Does anything else in the nine migrations still take "today" from
   `current_date` or `now()::date` for quotations? (Other tables —
   invoices, contracts — are out of scope; just list them.)
3. `valid_until` on insert and in `revise_quotation` follows the new date?
Fix a real defect surgically; otherwise report and STOP. No `supabase db`
command, no app code.

## Step 2 — Samer: apply and check
    npx supabase db push --remote --dry-run

must list exactly `20261118100000_quotation_issue_date_amman.sql`.

    npx supabase db push --remote

Then run block **D1** from `supabase/tests/20b_fix_date_check.sql`.
Wanted: `issue date <today in Amman> | Amman date <same> (same) | … | valid for 30 days`.

## Step 3 — Claude Code (Sonnet): app fixes
Surgical edits only, in the files named. Read `lib/quotations.ts` first.

**F1 Dates.** In `app/(app)/quotations/QuotationsShell.tsx` and
`app/(app)/quotations/[id]/QuotationEditor.tsx` replace
`new Date().toISOString().slice(0, 10)` with `todayInAmman()` (import from
`@/lib/quotations`). Search the whole `app/(app)/quotations` and
`app/(app)/clients` folders for any other `toISOString()` used as "today"
and replace it the same way.

**F2 Lines table** (`[id]/LinesTable.tsx`).
- qty input: `className="input w-24 px-2 tabular-nums"`.
- unit price input: `className="input w-32 px-2 tabular-nums"`.
- Give both `<td>`s `whitespace-nowrap`.
- Every `<th>` gets `whitespace-nowrap`.
- The size header uses a new short key `quoteSizeShort`.
- The `<table>` gets `min-w-[900px]` and its wrapper `overflow-x-auto`, so on
  a narrow window the table scrolls sideways instead of squeezing the boxes.

**F3 "Saved".** In `QuotationEditor.tsx`, in the one write helper: after a
successful write and reload, set a `savedAt` state; show `t("quoteSaved")`
with a small check icon in `text-sage text-xs` for 2 seconds (clear it with a
timeout; clear the timeout on unmount). Place it in the header row next to
the status badge so it is visible wherever the user is editing. On an error
it must not show.

**F4 Double add.** `[id]/ManualLineForm.tsx` and `[id]/CataloguePicker.tsx`:
first line of the submit / add handler is `if (busy) return;`. While `busy`,
wrap the form fields in `<fieldset disabled={busy} className="contents">` so
nothing can be changed or submitted twice. The manual form closes on success
(keep as is); the picker stays open (keep as is).

**F5 Capped discount.** `[id]/TotalsCard.tsx`: when the quotation is a draft,
`discount_kind === "amount"`, nothing is being typed, and
`Number(quotation.discount_value) > Number(quotation.subtotal_jod)`, show
under the discount row, `text-rust text-xs`: `t("quoteDiscountCapped")`.

**F6 Icon buttons.** `[id]/LinesTable.tsx`: the pencil button's
`aria-label` becomes `t("quoteEditLine")`; add `title={t("quoteEditLine")}`
to it and `title={t("removeLine")}` to the bin button.

**F7 Section hint.** The section input in `ManualLineForm.tsx`,
`CataloguePicker.tsx` and the line edit row in `LinesTable.tsx` gets
`placeholder={t("quoteSectionHint")}`.

**F8 Print-choice hint.** `[id]/TotalsCard.tsx`: remove the `<p>` that shows
`quotePriceDisplayHint`, and remove that key from both languages in
`lib/i18n.ts`.

**i18n — add to BOTH languages**
| key | en | ar |
|---|---|---|
| quoteSizeShort | Size (mm) | المقاس (ملم) |
| quoteSaved | Saved | تم الحفظ |
| quoteDiscountCapped | Larger than the subtotal: only the subtotal is taken off. | أكبر من المجموع: يُخصم المجموع فقط. |
| quoteEditLine | Edit line | تعديل البند |
| quoteSectionHint | e.g. Kitchen (empty = General) | مثال: مطبخ (فارغ = عام) |

**Verify and commit.** Stop the dev server first.

    npm run lint
    npm run typecheck
    npm test
    npm run build

All four must pass (79 tests). Commit the migration, the check file,
`lib/quotations.ts`, `lib/quotations.test.ts`, the edited app files and this
task file:
`fix(quotations): Stage 20b-FIX — Amman dates, wider price boxes, saved feedback, tester polish`

Do NOT push. Report a short summary.

## Step 4 — Tester agent, second run
Claude (chat) starts it after Samer restarts a clean dev server. It re-checks
the date and the eight fixes, then runs checks 9–18 of the 20b script and the
clean-up. The first run's test data (`TEST 20b client`, draft
`QUO-2026-0001`) is still in the database on purpose: the second run uses it
and deletes it at the end.

## Left for later (tester's notes, not in this fix)
- Tab from the discount box lands in the tax box with its value selected.
- The discount type and number sit close together.
- The first cold load of `/quotations` was briefly unstyled (dev server only).
- Invoices and contracts will need the same Amman date rule when built.
