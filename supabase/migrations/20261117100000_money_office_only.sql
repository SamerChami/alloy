-- Stage 18d — Money is office-only
-- Written against the six earlier migrations (baseline .. 20261117090000).
-- Changes access rules and adds one view. No table data is modified, no
-- column is dropped.
--
-- Decision (Samer, 17 Nov 2026): factory_worker and installation users see
-- NO money at all: no selling price, cost, labor, markup, board price,
-- banding price, component price or pricing settings. Neither role opens the
-- Components page. Factory workers keep Inventory (stock, no prices).
--
-- How: the tables that hold money become readable by office roles only.
-- Everyone else reads products through a view that has no money columns.

-- ---------------------------------------------------------------------------
-- 1. A price-free window onto products for every active staff member
-- ---------------------------------------------------------------------------
-- security_invoker = false: the view reads the table with its owner's rights,
-- so it still returns rows after step 3 closes the table itself to non-office
-- roles. The WHERE clause is therefore the ONLY row filter: keep it.
-- security_barrier: a caller's own filter can never run before that WHERE.
--   * every active staff member sees catalogue models (item_kind = 'product');
--   * boards / components (stock items) are seen only by office roles and
--     factory workers (Inventory). Installation users do not get them.
-- Columns: NEVER add a price, cost, labor, markup or supplier column here.
create view public.products_basic
  with (security_invoker = false, security_barrier = true)
as
select
  p.id, p.sku, p.code, p.name_en, p.name_ar,
  p.category, p.subcategory, p.item_kind, p.unit,
  p.width_mm, p.height_mm, p.depth_mm,
  p.sheet_length_mm, p.sheet_width_mm,
  p.description, p.drive_url,
  p.is_active, p.is_template,
  p.track_stock, p.stock_qty, p.reorder_level,
  p.created_at, p.updated_at
from public.products p
where (select public.is_staff())
  and (   p.item_kind = 'product'
       or (select public.is_office())
       or (select public.current_role_of(auth.uid())) = 'factory_worker');

-- Read-only. A simple view like this one accepts INSERT / UPDATE / DELETE and
-- would run them with the owner's rights (skipping row security), so nobody
-- who logs in may hold anything but SELECT on it.
revoke all on table public.products_basic from public, anon, authenticated;
grant select on table public.products_basic to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Low-stock list: read through the price-free view
-- ---------------------------------------------------------------------------
-- Same five columns as before. Office users get the same rows as before;
-- factory workers keep their low-stock count on the dashboard after step 3.
create or replace view public.low_stock_products
  with (security_invoker = true)
as
select id, sku, name_en, stock_qty, reorder_level
from public.products_basic
where track_stock and stock_qty <= reorder_level and is_active;

revoke all on table public.low_stock_products from public, anon, authenticated;
grant select on table public.low_stock_products to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tables that hold money: readable by office roles only
-- ---------------------------------------------------------------------------
-- (Office roles already have full access through the existing
--  "..._office" / "office write ..." policies; these four policies were the
--  ones that let every active staff member read.)
alter policy "products_read" on public.products
  using (public.is_office());
alter policy "product_sizes_read" on public.product_sizes
  using (public.is_office());
alter policy "all authenticated read banding_types" on public.banding_types
  using (public.is_office());
alter policy "pricing_settings_read" on public.pricing_settings
  using (public.is_office());

-- Not changed on purpose:
--   * bom_lines: holds sizes, positions and references only, no money. The
--     existing "factory_worker read bom_lines" policy stays.
--   * price_bom / reprice_product: SECURITY INVOKER, so for a non-office
--     caller they now read nothing and return zeros.
--   * stock_movements + apply_stock_movement (17d): unchanged; a factory
--     worker can still record a movement and the stock still changes.
