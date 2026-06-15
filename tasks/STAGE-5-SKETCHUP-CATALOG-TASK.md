# Stage 5 — Bulk Catalog Import from SketchUp JSON (Claude Code)

Build a new import that takes the ALLOY SketchUp extension's JSON (schema
`alloy.sketchup.v2`) and bulk-creates **products** (cabinets) in the catalog,
each with a **panels-only BOM**. This makes the SketchUp library become the
priced product catalog. Read `CLAUDE.md`, the products/BOM code
(`ProductForm.tsx`, `BomSection.tsx`, `bom_types.ts`), and
`db/05_bom.sql`/`06`/`07`/`08` first.

## The JSON structure (VERIFIED from a real export)
```
{
  "schema": "alloy.sketchup.v2",
  "model": "Imad_Al_Kurdi_KITCHEN.skp",
  "units": "mm",
  "item_count": 49,
  "summary": { "Cabinet": 21, "Appliance": 3, "Worktop": 2, "Trim": 4,
               "Other": 17, "RoomBox": 2 },
  "items": [
    {
      "name": "BC2.K3.115.9*105",
      "item_type": "Cabinet",          // Cabinet|Appliance|Worktop|Trim|Other|RoomBox
      "overall_mm": { "w":1411.5, "h":1919.5, "d":890.0 },
      "panel_count": 13,
      "fitting_count": 8,
      "panels": [
        { "name":"Top_1#6", "kind":"panel", "width_mm":994.0,
          "height_mm":522.0, "depth_mm":18.0, "sorted_mm":[18.0,522.0,994.0],
          "pos_mm":{"x":7857.8,"y":4496.7,"z":823.5} },
        ...
      ],
      "fittings": [
        { "name":"Leg_12cm#261", "qty":1, "size_mm":[60.0,60.0,183.8] }, ...
      ]
    }, ...
  ]
}
```

## Behavior (per Samer's decisions)
- **Only import items where `item_type == "Cabinet"`.** Ignore Appliance/
  Worktop/Trim/Other/RoomBox (but SHOW their counts in the preview so he knows
  they were detected and skipped).
- **Always create new** products — do NOT dedupe against existing catalog
  (Samer will clean up duplicates himself). Within ONE import, also do not merge
  same-named cabinets — each Cabinet item = one product. (If the same cabinet
  name appears twice in the file, that's fine, create both.)
- **Panels only in the BOM** for now. Create one `bom_lines` row per panel:
  `line_type='panel'`, `part_name = panel.name`, `width_mm`, `height_mm`,
  `depth_mm` (use the panel's thickness = smallest of sorted_mm; store the two
  larger as width/height — i.e. width=sorted[2]? Keep it simple: store
  width_mm=panel.width_mm, height_mm=panel.height_mm, depth_mm=panel.depth_mm as
  given, plus part_role inferred from name), `qty=1`, `panel_id=null`
  (unmapped → priced later), `part_role` inferred (reuse the role-inference
  keyword logic already in the codebase: left/right/top/bottom/back/shelf/door/
  divider…), `pos_x/y/z_mm` from `pos_mm` (for later accurate 3D),
  `hole_count=0`. Do NOT create fitting BOM lines yet (fittings carried for a
  later phase — ignore `fittings` for now).
- Product fields: `name_en = item.name`, `item_kind='product'`,
  `subcategory='Cabinet'` (or leave default), `width_mm/height_mm/depth_mm` from
  `overall_mm`, `is_template=true`, `source='sketchup_json'`,
  `source_filename = json.model`, `unit='pcs'`, `unit_price_jod=0`.

## UI — `/products/import-sketchup`
- Office-only page. File picker accepting `.json`.
- Parse client-side. Show a **preview**:
  - Header: model name, and the `summary` counts (Cabinet N to import; others
    skipped).
  - A table of the **Cabinet** items: name, overall WxHxD, panel_count,
    fitting_count. (Fittings shown as a number only — not imported yet.)
  - Checkboxes per row (default all checked) so Samer can deselect any.
- One button: **"Import N cabinets"** → inserts the selected products + their
  panel BOM lines (batch). Show progress + a success summary ("Imported 21
  cabinets, 198 panels").
- Add an "Import from SketchUp (JSON)" button on the Products list (office only)
  linking here. Keep the existing .3ds/DXF importer separate and working.

## Acceptance
- Importing the real `alloy_export_0_2.json` previews 21 cabinets (others shown
  as skipped) and, on import, creates 21 products each with its panels as BOM
  lines, dimensions from overall_mm, source='sketchup_json'.
- Re-running creates another 21 (duplicates allowed, per decision).
- `npm run build` passes. Bilingual labels (en+ar) for new strings. Office-only.
- Commit: "Stage 5: bulk catalog import from SketchUp JSON (cabinets, panels-only BOM)".

When done: 3-line summary + how to test with the JSON, and confirm the row
counts (21 products; total panel bom_lines).

## Note to relay
Fittings (P2O, legs, Atira, Gola) are detected and shown but NOT imported yet —
that's the next phase, where we'll strip the `#NN` instance suffix, group by
fitting type, and match to the Components catalog. Pricing: imported cabinets
start at 0; once panels are mapped to materials (or you set a price), the BOM
engine prices them, and then SketchUp project imports can auto-price by name.
