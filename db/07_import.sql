-- =====================================================================
-- ALLOY — Stage 4e: DXF importer columns
-- Paste into Supabase SQL Editor and run AFTER 06_part_role.sql.
-- =====================================================================

alter table bom_lines
  add column if not exists hole_count  int not null default 0,
  add column if not exists holes_json  jsonb;

alter table products
  add column if not exists source           text,
  add column if not exists source_filename  text;
