# Stage 20b-FIX6 — Lines table: confirm tint on the sticky actions cell

Source: sixth tester run on `/quotations/[id]` (commit 069cf2c, 18 Nov 2026).
Everything in FIX5 passed except one thing. Change only what is described here.

## Scope
- `app/(app)/quotations/[id]/LinesTable.tsx`, the sticky actions cell of a row that
  is confirming removal. Nothing else.

## The defect
While a row is confirming, its actions cell is a solid rust block. Measured computed
style: `background-image: linear-gradient(rgb(166, 73, 46), rgb(166, 73, 46))`, no
alpha. The class is

`[background-image:linear-gradient(theme(colors.rust/10),theme(colors.rust/10))]`

and the `/10` opacity is not applied inside `theme()`. Result: the rust confirm check
is invisible on the rust block until hovered, and the grey X is low contrast.

The rest of the row is correct: `rgba(166, 73, 46, 0.1)`.

## The fix
Make the overlay on the actions cell the same 10 % rust as the rest of the row, while
the cell stays opaque (keep `bg-paper` underneath; it is sticky and content scrolls
behind it).

- First check how `rust` is defined (Tailwind config or a CSS variable in
  `app/globals.css`) and use a form that really produces alpha in this setup.
- If rust is a CSS variable: `color-mix(in srgb, var(<the rust variable>) 10%, transparent)`
  for both gradient stops.
- Otherwise use the literal `rgb(166 73 46 / 0.1)` for both stops.
- Do not use `theme(colors.rust/10)` again.
- Before committing, confirm in the compiled CSS that the gradient stops carry the
  alpha (grep the built CSS and quote the rule in the report).

## Acceptance
- Lint 0 errors (5 existing warnings allowed), typecheck clean, all tests pass,
  `npm run build` passes.
- Compiled CSS for the confirming actions cell shows a 10 % rust overlay, not solid
  rust.
- Nothing else in the file changes: column still `w-28 min-w-[7rem]`, labels, focus
  handling and the edit form untouched.
- Commit, do not push:
  `Stage 20b-FIX6: light rust tint on the confirming actions cell`

## Out of scope (noted by the tester, for a later stage)
- W/H/D inputs 59 px wide below `lg` (800 px); section placeholder truncated there.
- Code input sits 20 px higher than W/H/D on the same row (the size group has two
  label lines).
- Focus drops to the page body after a confirmed removal.
- Inline Qty and Unit Price inputs, and the "Add a typed line" dialog fields, have no
  accessible name.
- 12 px shift of the edit box between unscrolled and pinned.

## After build — clean restart
- Stop any running dev server
- `Remove-Item -Recurse -Force .next`
- `npm run dev`
- Hard refresh the browser (Ctrl+Shift+R)
