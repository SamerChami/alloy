-- =====================================================================
-- ALLOY — Stage 4d: part_role columns for 3D preview
-- Paste into Supabase SQL Editor and run AFTER 05_bom.sql.
-- =====================================================================

alter table bom_lines
  add column if not exists part_role      text
    check (part_role in (
      'side_left','side_right','top','bottom','back',
      'shelf','divider_v','door','drawer_front','other'
    )),
  add column if not exists depth_mm       numeric(10,2),
  add column if not exists pos_offset_mm  numeric(10,2);

-- Confirm products already has the carcass bounding-box columns
-- (added in 01_schema.sql — these are no-ops if present):
alter table products
  add column if not exists width_mm   numeric(10,2),
  add column if not exists height_mm  numeric(10,2),
  add column if not exists depth_mm   numeric(10,2);
