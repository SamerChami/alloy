# Stage 5b — Fix panel dimensions + 3D for SketchUp import (Claude Code)

Two fixes for the SketchUp import path. Read `CLAUDE.md`, the SketchUp importer
(`/products/import-sketchup`), `components/Cabinet3D.tsx`, `lib/cabinet3d.ts`,
and how the .3ds importer feeds the 3D (Stage 4f) first.

## FIX 1 — Correct Height/Width/Thickness derivation (rotation-proof)
Problem: when a SketchUp part is rotated, its bounding-box dimensions land in
the wrong H/W/T slots (e.g. an 18mm thickness shows as "height").

Rule (apply EVERYWHERE a panel's H/W/T is computed — importer parsing AND
display AND what gets saved to bom_lines):
- Take the three measured extents of the panel (width_mm, height_mm, depth_mm
  from the JSON — these are raw, possibly rotated).
- **Thickness = the SMALLEST of the three.**
- Of the remaining two: **Height = the LARGER**, **Width = the SMALLER.**

So sorted ascending = [t, w, h]; thickness=sorted[0], width=sorted[1],
height=sorted[2]. (The JSON already includes `sorted_mm` = ascending sorted
extents — use it: thickness=sorted_mm[0], width=sorted_mm[1],
height=sorted_mm[2].)

Apply this when building each panel row in the SketchUp catalog importer, so the
preview table and the saved `bom_lines` store correct height_mm/width_mm/
depth_mm(thickness). Re-verify the preview shows e.g. a Left_Side as
Thickness 18, Height 720, Width 560 — NOT 18 as height.

(Note: "Height = larger face dim" — for wide panels Height may be the horizontal
dimension; that's the agreed cut-list convention, fine.)

Also apply the SAME rule in the .3ds importer if it isn't already (consistency).

## FIX 2 — Add 3D preview to the SketchUp import (like the .3ds)
The SketchUp JSON carries real assembled positions per panel in
`panels[].pos_mm` (x,y,z in mm, model world space). Use them to render an
accurate 3D, same component (`Cabinet3D`) and approach as the .3ds import:
- For a SINGLE cabinet (one item), build the 3D from its panels' real positions
  + corrected sizes, centering the model (subtract the cabinet's min corner so
  it sits at origin). Map SketchUp axes correctly: SketchUp is Z-up
  (z = height/vertical). Map z→height(Y in three.js), x→width(X), y→depth(Z),
  matching how the .3ds 3D is oriented. Verify the cabinet stands upright.
- Solid shaded panels + edges, doors toggle, explode, reset — reuse the polished
  Cabinet3D from Stage 4f.
- Show the 3D in the SketchUp import preview for the currently-focused cabinet.
  Since a project JSON has many cabinets, add a small selector (dropdown or click
  a row) to choose WHICH cabinet to preview in 3D. Default to the first Cabinet.

## Acceptance
- SketchUp import preview shows each panel with correct Thickness (smallest),
  Height (largest), Width (middle) — rotation no longer scrambles them.
- Saved products' bom_lines store the corrected dimensions.
- A 3D preview renders the selected cabinet accurately from pos_mm (upright,
  recognizable), with the same controls as the .3ds 3D.
- `npm run build` passes. Bilingual labels for any new strings. Office-only.
- Commit: "Stage 5b: fix panel H/W/T derivation + 3D preview for SketchUp import".

Test with the real `alloy_export_0_2.json`: pick a cabinet like `BC2.K3.115`
and confirm the panels read sensibly and the 3D looks like a real cabinet.
Report a couple of panel rows (e.g. Left_Side, Top) with their H/W/T so we can
confirm the derivation.
