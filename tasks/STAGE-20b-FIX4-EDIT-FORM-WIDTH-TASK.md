# Stage 20b-FIX4 — three small points left on the lines table

**Model:** Sonnet. No migration, no SQL, no money logic.
**Requires:** 20b-FIX3 built (071b4fc, not pushed).

## Why
Fourth tester run, 18 Nov 2026: the main problem is solved (at 1280 px the
table is 903 px in a 903 px card, pencil and bin visible; at 1024 and 900 px
they stay pinned). Three small points remain:

1. On a narrow screen (900 px, probably 1024 px too) the edit form is as
   wide as the table (850 px) inside a 523 px card, so Save is off-screen
   until the table is scrolled.
2. While "Remove?" is showing, the actions column gets wider: the table
   grows 13 px past its card and the line total is clipped.
3. In the edit form the section box is 209 px wide and its placeholder is
   cut off.

## Rules
Surgical edits in `app/(app)/quotations/[id]/LinesTable.tsx` only. Do not
change `commit`, `startEdit`, `saveEdit`, payloads, or any other file.

## K1 The edit form is as wide as the card, not the table
- On the scrolling wrapper (the `<div className="overflow-x-auto">` around
  the table) add the class `[container-type:inline-size]`.
- Inside the edit row's `<td colSpan={8}>`, wrap the whole form in
  `<div className="sticky start-0 w-[calc(100cqw-1rem)] max-w-full">`.
  (`100cqw` is the visible width of the wrapper, so the form always sits in
  view; `sticky start-0` keeps it there when the table is scrolled sideways,
  in both English and Arabic.)
- If the td has horizontal padding other than `px-2`, make the subtracted
  amount equal to its left + right padding.

## K2 "Remove?" must not change the column width
- The actions `<td>` (and its `<th>`) get a fixed width: `w-28 min-w-[7rem]`.
- While `confirmId === l.id`, do NOT render the pencil for that row: the
  cell shows only `Remove?` + the check + the X, with `gap-0.5`, the two
  buttons `p-1`, the text `text-xs whitespace-nowrap`.
- Check by arithmetic that the confirm content fits 7rem (112 px) minus the
  cell padding; if it does not, drop the word and show only a rust-coloured
  check and an X, both with `title` / `aria-label`
  (`removeLine` and `cancel`).

## K3 Edit form grid
In the edit form's grid (`lg:grid-cols-4`): description `lg:col-span-2`,
section `lg:col-span-2`, notes `lg:col-span-2`; for a typed line, code and
the W / H / D group share the remaining two columns (one each). On `sm` two
columns, on the smallest one column. The section placeholder
"e.g. Kitchen (empty = General)" must be fully readable at 1280 px.

## Verify and commit
Stop the dev server first.

    npm run lint
    npm run typecheck
    npm test
    npm run build

All four must pass (79 tests). Commit the edited file and this task file:
`fix(quotations): Stage 20b-FIX4 — edit form fits the card, stable actions column, wider section box`

Do NOT push. Report a short summary.

## Tester, fifth run (very short; Claude (chat) starts it)
At 1280, 1024 and 900 px, English and Arabic: open the edit form — Save and
Cancel visible without scrolling the table; the section placeholder is
complete; click the bin — the table width does not change and the line
total stays readable; the table still fits its card at 1280 px (903 / 903).
