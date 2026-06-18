# Stage 6 — SketchUp v3 importer: Single + Project modes (Claude Code)

Update the SketchUp importer to read the NEW nested schema `alloy.sketchup.v3`
and split into TWO pages: **Single** (one cabinet → one product) and **Project**
(many cabinets → bulk catalog import). Both show the 3D preview using the Stage
5e placement (raw per-axis extents + real positions, Z-up). Read `CLAUDE.md`,
the current SketchUp importer, `Cabinet3D.tsx`, and the v3 JSON structure below.

## v3 JSON structure (VERIFIED from a real export)
```
{
  "schema": "alloy.sketchup.v3",
  "model": "test.skp",
  "units": "mm",
  "root_count": 1,
  "summary": { "Cabinet": 1 },
  "roots": [
    {
      "name": "BDR.K3.120 / Wood DR / P2O / LCH",
      "type": "component",
      "size_mm": { "x":1200, "y":580, "z":880 },   // extents along SU X/Y/Z
      "sorted_mm": [580, 880, 1200],                 // ascending
      "pos_mm": { "x":600, "y":430.5, "z":440 },     // center, SU world
      "is_leaf": false,
      "item_type": "Cabinet",
      "panel_count": 16, "fitting_count": 9,
      "children": [
        { "name":"Left_Side#231", "size_mm":{x:18,y:560,z:720},
          "pos_mm":{x:9,y:440.5,z:495}, "is_leaf":true, "item_type":"Part", ... },
        { "name":"Wood_BDR#37", "is_leaf":false, "item_type":"Other",
          "children":[ {drawer sub-parts, is_leaf:true}, ... ] },   // NESTED
        ...
      ]
    }
  ]
}
```
Key points:
- A root's parts may be NESTED (e.g. a drawer assembly `Wood_BDR` is a non-leaf
  child whose own children are leaf parts). To get ALL parts of a cabinet,
  **recursively collect every leaf** (`is_leaf:true`) under the root.
- `size_mm.{x,y,z}` = the part's extents along SketchUp world X/Y/Z (already
  oriented — NOT sorted). `pos_mm` = world center.
- `sorted_mm` = ascending extents → use for the CUT-LIST H/W/T rule only
  (thickness=sorted[0], width=sorted[1], height=sorted[2]).
- A leaf is a FITTING if its name matches fitting keywords (p2o, leg_, atira,
  hafele, basket, l_channel, u_channel, channel, blum, hinge, slide); else a
  panel. (Same rule as before.)

## Shared parsing — `lib/sketchup/parseV3.ts`
- Accept the v3 JSON. Provide helpers:
  - `collectLeaves(node)` → all descendant leaves (recursive).
  - `cabinetToParts(root)` → { panels:[], fittings:[] } from its leaves, each
    part carrying: name, raw size {x,y,z}, pos {x,y,z}, sorted [t,w,h],
    isFitting.
  - `cutListDims(part)` → { thickness:sorted[0], width:sorted[1],
    height:sorted[2] } for the table/BOM.
- For the 3D: build boxes using RAW size {x,y,z} at pos {x,y,z}, with the Z-up
  map (threeX=su x, threeY=su z, threeZ=su y) applied to BOTH size and center,
  then recenter — i.e. reuse the Stage 5e logic. (Doors/fittings still render;
  fittings can be a distinct subtle color.)

## Page 1 — SINGLE import `/products/import-sketchup-single`
- Office-only. Upload v3 JSON. Expect ONE root (if multiple, use the first and
  show a note "multiple roots found — use Project import for all").
- Show: cabinet name (editable), overall dims from root.size_mm (mapped),
  the 3D preview (Stage 5e), and a parts table (all leaves) with cut-list
  H/W/T, role, panel/fitting tag.
- "Create product" → ONE product (item_kind='product', name=root.name, dims
  from root, source='sketchup_json', is_template=true) + one bom_line per leaf
  (panels-only for the BOM per earlier decision; still list fittings in the
  table but DON'T create fitting bom_lines yet — carry them for later). Save
  pos_x/y/z for accurate 3D rebuild.

## Page 2 — PROJECT import `/products/import-sketchup-project`
- Office-only. Upload v3 JSON. Take all roots with item_type=='Cabinet'
  (show others as detected/skipped via `summary`).
- Preview: a table of cabinet roots (name, overall dims, panel/fitting counts),
  checkboxes (default all), and a 3D preview of the currently-selected row
  (click a row → preview that cabinet). 
- "Import N cabinets" → create one product + panel BOM lines per selected
  cabinet (same as single, batched). Always create new (allow duplicates).

## Mode selection
- On the Products list, replace/augment the SketchUp import entry with TWO
  buttons: "Import single cabinet" and "Import project" (office-only), linking to
  the two pages. (User picks the mode, per decision.)
- Keep the .3ds/DXF importer separate and working.

## i18n / acceptance
- All new labels in en+ar. Office-only. `npm run build` passes.
- Single: importing the provided v3 file creates 1 product with its leaf panels
  (incl. the nested drawer parts) as BOM lines; 3D matches SketchUp.
- Project: a multi-cabinet v3 file lists all cabinets, previews each in 3D, and
  bulk-imports selected ones.
- Commit: "Stage 6: SketchUp v3 importer (single + project modes) with 3D".

Test with `alloy_export_3.json` (single cabinet, BDR.K3.120). Confirm the parts
table includes the nested Wood_BDR drawer parts (W_BDR_*, DR_Front) and the 3D
looks correct. Report part count (expect ~25 leaves; 16 panels / 9 fittings).
