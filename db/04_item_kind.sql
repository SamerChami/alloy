-- =====================================================================
-- ALLOY — Stage 4b: item_kind split (Products vs Components)
-- Paste into Supabase SQL Editor and run BEFORE using the new UI.
-- =====================================================================

-- 1. Create the item_kind enum
do $$ begin
  create type item_kind as enum ('product', 'component');
exception when duplicate_object then null; end $$;

-- 2. Add item_kind column (default 'component'; backfill sets real values below)
alter table products
  add column if not exists item_kind item_kind not null default 'component';

-- 3. Add subcategory free-text column
alter table products
  add column if not exists subcategory text;

-- 4. Backfill seed rows by their existing category value
update products set item_kind = 'product',   subcategory = 'Kitchen Cabinets' where category = 'cabinet';
update products set item_kind = 'component', subcategory = 'Materials'        where category in ('panel', 'material');
update products set item_kind = 'component', subcategory = 'Hinges'           where category = 'accessory';
update products set item_kind = 'component', subcategory = 'Drawers'          where category = 'fitting';
update products set item_kind = 'component', subcategory = 'Other'
  where category in ('appliance', 'other') and subcategory is null;
