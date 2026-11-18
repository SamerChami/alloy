# Stage 20b-FIX5 — Lines table: remove-confirm clarity, W/H/D width, edit-form labels and focus

Source: fifth tester run on `/quotations/[id]` (commit f268981, 18 Nov 2026).
K1 (edit form width) and the regression cycle passed. Do not touch what makes them pass:
the size-container wrapper, the sticky edit box (`wrapper − 1.5rem`), and the fixed
actions column `w-28 min-w-[7rem]`.

## Scope
- `app/(app)/quotations/[id]/LinesTable.tsx`
- `i18n.ts` (one key changed, at most three added)
- A CSS file only if item 1 cannot be solved in the component (see item 1).

Surgical edits only. Show the diff of each block before applying. No file rewrites.
No database, migration or `lib/` changes.

## 1. Rust colour on the confirm check and the trash (tester K2, fail)
Measured: the confirm check and the idle trash both render `rgb(58, 63, 68)`. Both
buttons carry `btn-ghost p-1 text-rust`, and the `btn-ghost` colour wins. Rust is
`rgb(166, 73, 46)`.

- First read how `btn-ghost` sets its colour (where it is defined, and why it beats
  `text-rust`).
- Fix it so the icon in these two buttons computes to rust. Preferred: put the
  colour on the icon element itself (the `<svg>`), so no global class changes. If
  that is not possible, use the important modifier on these two buttons only.
- Do not change `btn-ghost` itself: it is used across the app.
- The X (cancel) and the pencil stay grey.

## 2. Confirm state must say what it confirms (tester K2, fail)
While a row is confirming removal:

- **Label:** the check's `title` and `aria-label` are now "Remove" / "إزالة", the same
  as the trash. Change them to "Confirm removal" / "تأكيد الإزالة". Reuse the
  currently unused key `quoteRemoveConfirm`: change its two values to these strings
  and use it for the check. Do not add a second key for this.
- **Row tint:** give the confirming row a light rust background on all its cells
  (about 8–10 % rust, e.g. `bg-rust/10` if the colour supports opacity; otherwise the
  nearest existing light rust token). The sticky actions cell must keep an opaque
  background so scrolled content does not show through it: layer the tint over the
  card colour rather than making the cell transparent.
- Do NOT bring back the visible "Remove?" text. It does not fit: about 100 px of
  content against 96 px available.
- The actions column must stay exactly 112 px before and during confirmation.

## 3. W/H/D inputs too narrow (tester, new defect)
Measured grid tracks in the edit form: 146.75 px at 1024, 210.75 px at 1280,
246.5 px at 1440. The W/H/D group sits in one track, so each input is 44 px at 1024
(18 px text area) and 65 px at 1280 (39 px text area). "2400" shows as "240" at 1280.
At 1024 the "W (mm)" label wraps and pushes the W input below H and D.

Change the `lg` layout of the edit form for a manual line to:

| Row | Columns |
|---|---|
| 1 | Description (span 2) · Section (span 2) |
| 2 | Code (span 1) · W/H/D group (span 2) · empty |
| 3 | Notes (span 2) |

- A catalogue line keeps its current form: Description (2), Section (2), Notes (2).
- Budget check: at 1024 the group gets about 305 px, so each of the three inputs is
  about 95 px. That is the minimum case and it must hold.
- Unit shown once: one group label "Size (mm)" / "المقاس (مم)" above the three
  inputs, and the three per-input labels shortened to "W", "H", "D" (Arabic: the
  existing short forms without the unit). Add i18n keys only for strings that do not
  already exist. No label may wrap at 1024 in either language.
- The three inputs must share one baseline at every width.
- Below `lg` keep the current stacking.

## 4. Edit-form labels and focus (tester, medium)
- Tie every edit-form `<label>` to its input with `htmlFor` / `id`. Use `useId()` so
  ids are unique per row. The W/H/D group gets `role="group"` with `aria-labelledby`
  pointing at the group label.
- Give the actions column header a visually hidden name ("Actions" / "إجراءات",
  `sr-only`), reusing an existing key if there is one.
- Focus:
  - opening the edit form focuses the Description input;
  - Save or Cancel returns focus to that row's pencil;
  - clicking the trash focuses the X (the safe choice), not the check;
  - clicking the X returns focus to that row's trash.
- When focusing, pass `{ preventScroll: true }` so the table does not jump sideways.

## Out of scope (noted, not fixed here)
- The 12 px shift of the edit box between unscrolled and pinned.
- The table once ending up scrolled to the end after opening an edit form at 1024.
  If `preventScroll` in item 4 obviously explains it, say so in the report; do not
  chase it further.
- Section placeholder truncated at 800 px (below `lg`).
- Sidebar language and sign-out buttons without accessible names (not this file).

## Acceptance
- `npm run lint` 0 errors (5 existing warnings allowed), typecheck clean, all tests
  pass (79 or more), `npm run build` passes.
- Check and trash icons compute to `rgb(166, 73, 46)`; X and pencil unchanged.
- Check `title` / `aria-label` = "Confirm removal" / "تأكيد الإزالة"; trash still
  "Remove" / "إزالة".
- Confirming row is tinted; actions cell opaque; actions column 112 px in both states.
- At 1024, 1280 and 1440, in English and Arabic: each W/H/D input is at least 90 px
  wide, "2400" is fully visible, no label wraps, the three inputs are level.
- K1 unchanged: edit box = wrapper − 24 px (623 at 1024, 879 at 1280, 1022 at 1440).
- No unused i18n keys left behind by this stage.
- Commit, do not push: `Stage 20b-FIX5: rust confirm check, confirm label and row tint, wider W/H/D, edit-form labels and focus`

## Report back
Per item: what was changed and where, anything that differs from this file and why
(with the arithmetic if it is a width), and what was not verified in a browser.

## After build — clean restart
- Stop any running dev server
- `Remove-Item -Recurse -Force .next`
- `npm run dev`
- Hard refresh the browser (Ctrl+Shift+R)

Then the sixth tester run uses the fixture quotation `QUO-2026-0006`
(`/quotations/61872b77-01b7-4f4d-b303-54eb4dafd6cb`): a DR2-K3 catalogue line and
one manual line, total 34.220 JD.
