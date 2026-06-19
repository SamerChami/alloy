# Stage 8b — Draw cuts (grooves/rabbets) on panels in the 3D viewer — Claude Code

Read `CLAUDE.md`, `components/Cabinet3D.tsx`, `lib/cabinet3d.ts`,
`lib/sketchup/parseV3.ts` (+ the shared `Cut` type from Stage 8a's
`lib/sketchup/types.ts`), and `03-sketchup-export-schema.md` (cuts section)
first. Stage 8a is done: `cuts_json` is persisted on `bom_lines` and loaded back
into the in-memory panel objects. Now **render those cuts visually** on the
panel boxes in `Cabinet3D`.

This is a VISUAL/3D-only task. Do NOT change parsing, dimensions, positions,
BOM, or the saved data. Cuts are already in memory on each part as `cuts: Cut[]`.

Follow CLAUDE.md conventions (i18n en+ar for any new label, RTL-safe,
office-only context unchanged).

## The cut coordinate model (VERIFIED against the real export — read carefully)
A panel is a flat board. Its three extents sorted ascending = `[thickness, a, b]`
where `thickness = sorted_mm[0]` (the small axis) and the two large faces are
perpendicular to the thickness axis. A cut's footprint lives ON a big face:

- `u_min/u_max` and `v_min/v_max` are **panel-local** coordinates on the face,
  origin at the panel's min corner. They span the panel's TWO LARGE extents
  (the `a` and `b` dims — i.e. `sorted_mm[1]` and `sorted_mm[2]`), NOT the
  thickness.
- `depth_mm` is how far the cut bites INTO the thickness.
- `face`: `"front"` = cut enters from the t≈0 face; `"back"` = from the
  t≈thickness face; `"both"` = mirrored on both faces.
- `runs_along` (`width|height|depth`) is informational (channel direction); you
  don't strictly need it to place the box — the u/v rectangle already defines
  the footprint. Use it only for labeling/sanity if helpful.

### Worked check (use these to verify your mapping)
- `Left_Side` 18×560×770, groove depth9 w9 len752, face=front, u[518,527]
  v[9,761]: a 9mm-wide band across the 560 axis at 518–527, running 9..761 along
  the 770 axis, 9mm deep from the front face. → a near-full-height vertical
  groove close to one long edge. ✅
- `Bottom` 1164×546×16.8, rabbet depth8.4 w9 len1164, face=front, u[0,1164]
  v[518,527]: full-length 1164 strip, 9mm wide at the 518–527 band of the 546
  axis, 8.4mm deep → an edge rabbet along the long edge. ✅
- `Difference` has 3 small rabbets (both faces) — must show as small recesses,
  some on front, some on back.

## Approach — inset recess boxes (NO CSG)
Do **not** use real boolean subtraction (CThree CSG is heavy/fragile and we run
this for many parts live). Instead, for each cut draw a **thin dark inset box**
positioned in the recess so it reads as a groove/rabbet:

For each panel that has `cuts[]`, and for each `Cut`:
1. Identify the panel's thickness axis and its two face axes from its RAW
   `size_mm` (the smallest of x/y/z is thickness; the other two are the face
   plane). Keep using the SAME Z-up→Y-up mapping the panel box already uses —
   the cut box must be placed in the panel's already-mapped local frame, then
   carried through the identical world transform/recenter as the panel.
2. Build a box sized:
   - along face-axis-1 (the u axis): `u_max - u_min`
   - along face-axis-2 (the v axis): `v_max - v_min`
   - along the thickness axis: `depth_mm`
3. Position its center at:
   - u center = `(u_min + u_max)/2` (mapped onto the correct face axis)
   - v center = `(v_min + v_max)/2`
   - thickness offset: if `face==="front"`, recess from the t=0 face → center at
     `depth/2`; if `face==="back"`, center at `thickness - depth/2`; if
     `"both"`, draw two boxes (one each side). (Origin = panel min corner along
     the thickness axis.)
   Then apply the panel's own world placement (the same offset/mapping/recenter
   used for the panel box) so the recess sits exactly on that panel wherever it
   is in the cabinet.
4. Material: a darker grey than the panel (e.g. #8A857C-ish vs the panel
   #D9D5CE), slightly recessed look. Render it as a child of/grouped with the
   panel so explode/reset move them together. Give it its own EdgesGeometry so
   the groove outline reads in both shaded and wireframe modes.

### Which face axis is u vs v?
The export's u/v correspond to the panel's two large extents in a fixed order
(u = first large extent, v = second). Determine the two non-thickness axes of
the panel's RAW box and assign u→the axis matching `sorted_mm[1]`'s source axis,
v→`sorted_mm[2]`'s source axis. If that orientation looks transposed on the
verified panels above (e.g. the Left_Side groove comes out horizontal instead of
vertical), swap u/v — and lock it with the worked checks above. Add a brief code
comment recording which assignment proved correct against `Left_Side`.

## Toggle + controls
- Add a **"Show cuts"** toggle button in the Cabinet3D control area, alongside
  the existing Shaded/Wireframe/Reset/Explode/Show-doors. **Default ON.**
  When off, hide all cut recess meshes (the plain panels show).
- Cuts must survive/track all existing controls: explode moves them with their
  panel; wireframe shows their outline; modal viewer (Stage 5d) shows them too
  (reuse the same component, so it's automatic).
- Dispose the cut geometries/materials on unmount with everything else (no
  leaks).

## i18n
Add "Show cuts" in en+ar (ar e.g. "إظهار التجاويف" or a natural equivalent).
Reuse existing control-button styling.

## Acceptance
- Importing/opening the v4 cabinet (`alloy_export_0_4_1.json` data), the 3D
  shows:
  - the two **side panels** with a clean near-full-height vertical groove near
    one edge (front on Left, back on Right — they mirror);
  - **Bottom** with a long edge rabbet strip;
  - **Top_Back / DR_Front / W_BDR_*** with their single grooves/rabbets in the
    right spot;
  - **Difference** with three small recesses (front + back);
  - panels with no cuts (Back, shelves, doors, tops, partition) unchanged.
- "Show cuts" toggles them; default ON. Works in shaded, wireframe, exploded,
  and the expand-to-modal viewer. No console errors; disposes cleanly.
- The verified Left_Side groove is VERTICAL and near a long edge (not
  transposed) — confirm against the worked check.
- `npm run build` passes. Bilingual label added. No geometry/parsing/data
  changes.
- Commit: "Stage 8b: render cuts as inset recesses on panels in Cabinet3D".

When done: run the build, give a 3-line summary, and tell Samer to open the v4
cabinet and confirm (a) the side-panel grooves run vertically near the edge,
(b) Bottom shows an edge rabbet, (c) "Show cuts" toggles them. Note any panel
where the u/v orientation looked transposed and how you resolved it.

## Note to relay to Samer
These are VISUAL approximations (dark inset boxes), not true boolean-cut
geometry — they show cut position, size, and depth faithfully without the cost
of live CSG. That's plenty to eyeball that the machining data is right. 8c turns
the same `cuts` data into a textual cut-list / CNC sheet — the production payoff.
