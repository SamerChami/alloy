-- =====================================================================
-- ALLOY — Stage 8a: cuts_json on bom_lines, export_version on products
-- Paste into Supabase SQL Editor and run AFTER 08_bom_pos.sql.
--
-- RLS note: bom_lines and products already have row-level security
-- policies from 05_bom.sql / 01_schema.sql. Adding nullable columns
-- does NOT require new policies — existing policies cover all rows and
-- the new columns are readable/writable under the same rules.
-- =====================================================================

-- 1. Store the raw cuts array from SketchUp v4 exports (nullable: null
--    means no cut data ingested, [] means v4 data ingested with 0 cuts).
alter table bom_lines
  add column if not exists cuts_json   jsonb,
  add column if not exists cut_warning text;

-- 2. Record the SketchUp exporter version for traceability (e.g. "0.4.1").
alter table products
  add column if not exists export_version text;
