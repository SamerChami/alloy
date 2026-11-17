# Stage 20b-FIX3 — the lines table must fit at 1280 px

**Model:** Sonnet. No migration, no SQL, no money logic.
**Requires:** 20b-FIX2 built (5e8ceec, not pushed).

## Why
Third tester run, 18 Nov 2026: 9 of 10 checks passed and the page no longer
scrolls sideways. But the width numbers Claude gave in FIX and FIX2 made the
lines table 980 px wide inside a 903 px card at 1280 px, so:

1. The pencil and bin column is cut off at 1280 px until the table is
   scrolled sideways, and they are the only way to edit or remove a line.
2. In edit mode the table grows to 1259 px; Save and Cancel are about 350 px
   off-screen.
3. In the catalogue picker a long code (`Coffee_Corner_NEW`) spills over the
   name.
4. The section placeholder is cut off in the "Add a typed line" form.

## Rules
Surgical edits in `app/(app)/quotations/[id]/LinesTable.tsx`,
`CataloguePicker.tsx` and `ManualLineForm.tsx` only. Do not change
`commit`, `startEdit`, `saveEdit`, the payloads, or any `lib/` file.

## H1 Column budget (`LinesTable.tsx`)
Target: the whole table, with the actions column, fits in 860 px.
- every `<th>` and `<td>`: horizontal padding `px-2` instead of `px-3`
- qty input: `input w-20 min-w-[5rem] px-2 tabular-nums`
- unit price input: `input w-28 min-w-[7rem] px-2 tabular-nums`
- description `<td>`: `min-w-[11rem]` (remove the wider edit-mode value)
- the two icon buttons in the actions cell: `p-1.5` instead of `p-2`
- the `<table>`: `min-w-[850px]` (was 980)

## H2 Actions column always in view
The actions `<th>` and `<td>` (the last column, draft only) become sticky at
the end of the row so they stay visible even when the table does scroll:
`sticky end-0 bg-paper` on the `<td>`, `sticky end-0 bg-mist` on the `<th>`,
and a soft divider `border-s border-line`. (`end-0` is the logical side:
right in English, left in Arabic.) The same on the empty actions cell of
the section-total row.

## H3 Edit a line in its own row, not inside the cells
Today the pencil turns the row's cells into inputs, which is what makes the
table grow. Change the rendering only:
- When a line is being edited, its normal row stays exactly as it is when
  not editing (plain code, description, size text; qty and price boxes as
  usual), except the actions cell shows nothing.
- Directly under it render ONE extra row: `<tr><td colSpan={8}>` with
  `bg-mist/60 px-3 py-3`, holding the edit form in a grid
  (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3`), each field with a
  small label above it (`block text-xs text-slate mb-1`):
  - description (`quoteDescription`), spanning 2 columns on `lg`
  - section (`quoteSection`, datalist `line-sections`, placeholder
    `quoteSectionHint`)
  - notes (`notes`)
  - only when `price_source === "manual"`: code (`code`, `dir="ltr"`), and
    W / H / D (`quoteWidth`, `quoteHeight`, `quoteDepth`; whole numbers,
    `dir="ltr"`) side by side in one grid cell
  - at the end of the form, aligned to the end: `cancel` (btn-ghost) and
    `save` (btn-primary) as TEXT buttons, `disabled={busy}` on save
- All inputs are plain `className="input"` (full width of their grid cell).
- Same state (`edit`, `setEdit`), same `saveEdit(l)`; only where the inputs
  are drawn changes. Pressing Enter in any of these inputs saves; Escape
  cancels.
- The edit row needs a stable key (e.g. `l.id + "-edit"`); wrap the pair in a
  keyed fragment.

## H4 Catalogue picker row (`CataloguePicker.tsx`)
The code span: `w-36 shrink-0 font-medium truncate` with `title={p.code ?? ""}`
(keep `dir="ltr"`). Nothing else.

## H5 Typed-line form (`ManualLineForm.tsx`)
The section field takes the full width of the form (its grid cell spans both
columns: `sm:col-span-2` or move it to its own row), so the placeholder
"e.g. Kitchen (empty = General)" is readable.

## Verify and commit
Stop the dev server first.

    npm run lint
    npm run typecheck
    npm test
    npm run build

All four must pass (79 tests). Commit the edited files and this task file:
`fix(quotations): Stage 20b-FIX3 — lines table fits at 1280 px, sticky actions, edit form in its own row`

Do NOT push. Report a short summary.

## Tester, fourth run (short; Claude (chat) starts it)
At 1280 px, 1024 px and 900 px, English and Arabic: pencil and bin visible
without scrolling the table at 1280; still reachable (sticky) at 900; edit
form opens under the line with Save / Cancel visible; Enter saves, Escape
cancels; edit of a typed line (code, W/H/D) and of a catalogue line (no
code / size fields) both save; picker code column; typed-line form
placeholder.
