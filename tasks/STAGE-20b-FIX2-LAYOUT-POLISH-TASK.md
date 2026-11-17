# Stage 20b-FIX2 — layout at narrow widths, and the second tester's findings

**Model:** Sonnet. No migration, no SQL, no money logic.
**Requires:** 20b-FIX built (4e0be63, not pushed).

## Why
Second tester run, 18 Nov 2026: every functional check passed (totals,
catalogue prices, lock on Sent, revision, Amman date, double-add, clean-up).
Two layout failures and some polish remain:

1. At 900 px the WHOLE page scrolls sideways (header buttons and cards cut
   off). Cause: the lines table's `min-w-[900px]` (asked for in 20b-FIX)
   pushes the flex `<main>` wider than the space beside the sidebar.
2. While one line is in edit mode, the qty and price boxes of every row
   shrink (qty to 42 px: the numbers disappear) and the section placeholder
   is cut off.
3. Filter or search with no match still says "No quotations yet."
4. The bin removes a line at once, with no confirmation.
5. On a Sent quotation the discount shows twice.
6. Internal box: margin has no percentage.
7. Codes break mid-code ("DR2-" / "K3"); a long product name overlaps the
   next column in the catalogue picker.
8. Small wording points.

## Rules
Surgical edits in the files named. Do not touch any write logic, payload,
query or the two `lib/quotation*.ts` files. All CLAUDE.md conventions.

## Fixes

**G1 Page never wider than its space.** `app/(app)/layout.tsx`: the `<main>`
class becomes `flex-1 min-w-0 p-8 max-w-6xl`. Nothing else in that file.
(With `min-w-0` the lines table's own `overflow-x-auto` wrapper scrolls and
the page does not.)

**G2 Lines table boxes keep their width** (`quotations/[id]/LinesTable.tsx`).
- qty input: `input w-24 min-w-[6rem] px-2 tabular-nums`
- unit price input: `input w-32 min-w-[8rem] px-2 tabular-nums`
- code input (edit row): `input w-32 min-w-[8rem]`
- W / H / D inputs (edit row): `input w-20 min-w-[5rem] px-2`
- the description `<td>`: `min-w-[14rem]` normally, `min-w-[20rem]` while
  that row is being edited
- the code `<td>`: add `whitespace-nowrap`
- the `<table>`: `min-w-[980px]`

**G3 Empty states** (`quotations/QuotationsShell.tsx`). When there are
quotations but the search / status filter matches none, show
`t("noMatches")` instead of `t("noQuotations")`.

**G4 Remove asks first** (`LinesTable.tsx`). The bin becomes two-step, in
place: first click turns that row's bin into a small `text-rust` confirm
(`t("quoteRemoveConfirm")` + a check button + an X button); the check
removes the line, the X or clicking another row's bin cancels. Keep it
inside the same cell; no modal.

**G5 One discount row when not a draft** (`[id]/TotalsCard.tsx`). When the
quotation is not a draft:
- `discount_jod` is 0 → show no discount row at all;
- otherwise ONE row: label `t("quoteDiscount")` followed, for a percentage,
  by ` (${Number(discount_value)} %)` in `dir="ltr"`; value `− jod(discount_jod)`.
The draft view stays as it is.

**G6 Margin percentage** (`TotalsCard.tsx`, internal box). After the margin
amount show the share of revenue, e.g. `72.348 JD (33.0 %)`:
`cost.revenue > 0 ? (cost.margin / cost.revenue * 100).toFixed(1) : null`.
When no line has a known cost (`cost.revenue === 0 && cost.cost === 0`) show
`—` for both cost and margin instead of `0.000 JD`. A negative margin is
`text-rust`.

**G7 Catalogue picker** (`[id]/CataloguePicker.tsx`).
- the name cell: `truncate` with `title={name}` and `min-w-0` on its flex /
  grid parent so it cannot overlap the next column; the code cell
  `whitespace-nowrap`
- the list: `max-h-96` instead of `max-h-64`
- the "Added" message stays 3 seconds (3000)

**G8 Wording** (`lib/i18n.ts`, both languages where given).
| key | en | ar |
|---|---|---|
| noMatches (new) | Nothing matches. | لا توجد نتائج مطابقة. |
| quoteRemoveConfirm (new) | Remove? | إزالة؟ |
| quoteMarkSent | (unchanged) | تم الإرسال للعميل |
| quoteDiscountAmount | (unchanged) | JD |
| quoteWidth | W (mm) | عرض (ملم) |
| quoteHeight | H (mm) | ارتفاع (ملم) |
| quoteDepth | D (mm) | عمق (ملم) |

## Verify and commit
Stop the dev server first.

    npm run lint
    npm run typecheck
    npm test
    npm run build

All four must pass (79 tests). Commit the edited files and this task file:
`fix(quotations): Stage 20b-FIX2 — no page scroll at narrow widths, stable edit row, remove confirm, polish`

Do NOT push. Report a short summary.

## Tester, third run (short; Claude (chat) starts it)
900 px and 1280 px in both languages: page does not scroll sideways, only
the lines table does; edit row keeps qty and price readable; empty filter
text; remove confirm; Sent view discount row; margin percentage. Other pages
(Clients, Products, Components) still look right after G1.

## Not in this fix (noted)
- Unit price shows `19.5` inside the box and `19.500 JD` as text.
- Date boxes use the browser's own date format.
- "New revision" is offered on an empty draft.
- Tab from the discount box lands in the tax box.
