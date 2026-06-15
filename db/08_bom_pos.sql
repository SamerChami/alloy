-- =====================================================================
-- ALLOY — Stage 4g: real 3D positions for imported BOM lines
-- Paste into Supabase SQL Editor and run AFTER 07_import.sql.
-- =====================================================================

alter table bom_lines
  add column if not exists pos_x_mm numeric(10,2),
  add column if not exists pos_y_mm numeric(10,2),
  add column if not exists pos_z_mm numeric(10,2);
