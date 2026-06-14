-- =====================================================================
-- ALLOY — Stage 4c: BOM Auto-Pricing Engine
-- Paste into Supabase SQL Editor and run BEFORE using the new UI.
-- Requires 04_item_kind.sql to have been run first.
-- =====================================================================

-- 1. Extend products: sheet/panel columns (only meaningful for panel materials)
alter table products
  add column if not exists sheet_length_mm  numeric(10,2),
  add column if not exists sheet_width_mm   numeric(10,2),
  add column if not exists sheet_price_jod  numeric(12,3);

-- 2. Edge banding types table
create table if not exists banding_types (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  price_per_m_jod numeric(12,3) not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create unique index if not exists idx_banding_types_name on banding_types(name);

insert into banding_types (name, price_per_m_jod) values
  ('PVC', 0.350),
  ('ABS', 0.500)
on conflict (name) do nothing;

-- 3. Extend products: BOM pricing fields
alter table products
  add column if not exists labor_jod           numeric(12,3) not null default 0,
  add column if not exists margin_pct          numeric(5,2)  not null default 0,
  add column if not exists price_overridden    boolean not null default false,
  add column if not exists is_template         boolean not null default true,
  add column if not exists materials_cost_jod  numeric(12,3) not null default 0,
  add column if not exists components_cost_jod numeric(12,3) not null default 0,
  add column if not exists base_cost_jod       numeric(12,3) not null default 0;

-- 4. BOM lines table
create table if not exists bom_lines (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete cascade,
  line_type       text not null check (line_type in ('panel', 'component')),
  -- panel-part fields
  panel_id        uuid references products(id),
  part_name       text,
  width_mm        numeric(10,2),
  height_mm       numeric(10,2),
  banding_type_id uuid references banding_types(id),
  banded_length_m numeric(10,3) default 0,
  -- component-part fields
  component_id    uuid references products(id),
  -- shared
  qty             numeric(10,2) not null default 1,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_bom_lines_product on bom_lines(product_id);

-- 5. RLS for bom_lines
alter table bom_lines enable row level security;

create policy "office full access bom_lines" on bom_lines
  using (is_office()) with check (is_office());

create policy "factory_worker read bom_lines" on bom_lines
  for select using (current_role_of(auth.uid()) = 'factory_worker');

-- 6. RLS for banding_types
alter table banding_types enable row level security;

create policy "all authenticated read banding_types" on banding_types
  for select using (auth.uid() is not null);

create policy "office write banding_types" on banding_types
  using (is_office()) with check (is_office());
