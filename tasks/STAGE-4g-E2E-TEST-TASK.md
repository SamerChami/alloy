# Stage 4g — End-to-end import test (Claude Code + Samer)

The .3ds importer parses correctly and the 3D looks good. Now VERIFY the full
flow: importing → "Create product" → the product + BOM are saved correctly →
the product opens in the editor with its panels. Fix anything broken.

Read `CLAUDE.md`, `ImportShell.tsx`, the products editor (`ProductForm.tsx`,
`BomSection.tsx`), and `db/05_bom.sql` / `db/06_part_role.sql` /
`db/07_import.sql` first.

## Part 1 — Claude Code: audit the save path
In `ImportShell.handleCreate`, confirm:
1. The product insert includes the .3ds-derived `width_mm/height_mm/depth_mm`
   (900/2280/580), `item_kind='product'`, `is_template=true`,
   `source='polyboard_3ds'` (add this source value), `source_filename`.
2. Each panel/leaf writes a `bom_lines` row with: `part_name`, `part_role`,
   `width_mm`, `height_mm`, `depth_mm` (thickness), `qty`, `panel_id` (mapped
   material or null), `hole_count` (0 for .3ds), `pos_offset_mm` (carry the real
   assembled height/position so the saved product's 3D can rebuild later),
   `sort_order`.
3. **Persist real positions**: the bom_lines schema may only have
   `pos_offset_mm`. To rebuild the exact 3D later, we need full position. Add a
   migration `db/08_bom_pos.sql` adding `pos_x_mm, pos_y_mm, pos_z_mm numeric`
   to `bom_lines` (nullable), and save the panel's real mapped position into
   them. (Samer runs this migration.)
4. Error handling: if the bom_lines insert fails, the just-created product is
   rolled back (already coded — verify it works).

## Part 2 — Claude Code: make the saved product re-open with geometry
Confirm the product editor (`/products/[id]` or the edit modal + BomSection):
- Loads the product's `bom_lines` and shows them in the BOM table.
- If `pos_x/y/z` exist, the editor's 3D (if shown) uses them for an accurate
  model; otherwise falls back to role-based layout.
- The calculated price rolls up from the BOM via the existing engine once panels
  are mapped to materials (unmapped → 0, with the existing note).

## Part 3 — Samer: manual test checklist (do after build)
Provide these steps in your summary for Samer to run:
1. Import `T-OV-MIC-D2-90.3ds` → verify 900×2280×580 + 3D.
2. (Optional) map a few panels to the "Carcass 18" material in the table.
3. Click **Create product**. Expect success message.
4. Go to Products list → the new "T-OV-MIC-D2-90" (or "Imported Cabinet")
   appears under its category.
5. Open it → BOM lines are present (21 panels incl. split door leaves), holes/
   sizes intact, and if materials were mapped, a calculated price shows.
6. Check Supabase: `products` has 1 new row; `bom_lines` has 21 rows for it.

## Acceptance
- Creating a product from the .3ds import persists product + 21 bom_lines with
  real positions.
- Re-opening the product shows its panels (and accurate 3D if positions saved).
- `npm run build` passes. Migration `db/08_bom_pos.sql` provided.
- Commit: "Stage 4g: persist imported product + BOM with real positions".

In your summary: (a) remind Samer to run `db/08_bom_pos.sql`, (b) the manual
checklist above, (c) confirm row counts to expect (1 product, 21 bom_lines).
