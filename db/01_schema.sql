-- =====================================================================
-- ALLOY — Kitchen & Bedrooms Management App
-- Stage 1: Database Schema (PostgreSQL / Supabase)
-- =====================================================================
-- Run order: 01_schema.sql -> 02_rls.sql -> 03_seed.sql
-- All money stored as NUMERIC(12,3) in JOD (JOD has 3 decimal places / fils).
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------- ENUM types ----------
do $$ begin
  create type user_role as enum (
    'admin',
    'sales_manager',
    'design_manager',
    'production_manager',
    'analyzing_manager',
    'factory_worker',
    'installation'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_type as enum ('kitchen', 'bedroom', 'closet', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Mirrors your 11-stage workflow
  create type project_stage as enum (
    'lead',              -- Sales: client info captured
    'design',            -- Design Manager: SketchUp + Enscape
    'client_review',     -- Client viewing renderings
    'production_prep',   -- Production Manager: onsite dims, EM layout
    'analyzing',         -- Analyzing Manager: Polyboard, cut lists
    'panel_saw',
    'edge_banding',
    'cnc_drilling',
    'assembly',
    'packaging',
    'delivery',
    'installation',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_category as enum (
    'cabinet', 'panel', 'material', 'accessory', 'fitting', 'appliance', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type quote_status as enum ('draft', 'sent', 'approved', 'rejected', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('draft', 'issued', 'partial', 'paid', 'overdue', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contract_status as enum ('draft', 'sent', 'signed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type referral_source as enum (
    'friend', 'social_media', 'instagram', 'facebook', 'returning_client',
    'walk_in', 'referral_partner', 'website', 'other'
  );
exception when duplicate_object then null; end $$;

-- ---------- Helper: updated_at trigger ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =====================================================================
-- USERS / PROFILES
-- Supabase auth.users holds credentials; this mirrors app-level data.
-- =====================================================================
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  role          user_role not null default 'sales_manager',
  phone         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- Convenience function: current user's role (used heavily in RLS)
create or replace function current_role_of(uid uuid)
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = uid;
$$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

create or replace function is_office()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in
    ('admin','sales_manager','design_manager','production_manager','analyzing_manager')
    from profiles where id = auth.uid()), false);
$$;

-- =====================================================================
-- CLIENTS
-- =====================================================================
create table if not exists clients (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  phone         text not null,
  email         text,
  location      text,                       -- area / address
  project_type  project_type not null default 'kitchen',
  referred_by   referral_source not null default 'walk_in',
  referred_note text,                        -- "friend: Ahmad", etc.
  budget_jod    numeric(12,3),               -- approximate budget
  prerequisites text,                        -- client requirements free text
  notes         text,
  drive_folder_url text,                     -- link to Google Drive project folder
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_clients_phone on clients(phone);
create index if not exists idx_clients_name on clients(full_name);
create trigger trg_clients_updated before update on clients
  for each row execute function set_updated_at();

-- =====================================================================
-- SUPPLIERS
-- =====================================================================
create table if not exists suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_name  text,
  phone         text,
  email         text,
  address       text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_suppliers_updated before update on suppliers
  for each row execute function set_updated_at();

-- =====================================================================
-- PRODUCTS  (cabinets, panels, materials, accessories, fittings...)
-- Priced per unit (your model). Inventory-tracked items link here.
-- =====================================================================
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  sku             text unique,
  name_en         text not null,
  name_ar         text,
  category        product_category not null default 'cabinet',
  unit            text not null default 'pcs',      -- pcs, sheet, m, set...
  unit_price_jod  numeric(12,3) not null default 0, -- selling price per unit
  cost_jod        numeric(12,3) default 0,          -- purchase / production cost
  supplier_id     uuid references suppliers(id) on delete set null,
  -- inventory
  track_stock     boolean not null default false,
  stock_qty       numeric(12,2) not null default 0,
  reorder_level   numeric(12,2) not null default 0,
  -- optional dimensions (mm) for panels/cabinets
  width_mm        numeric(10,2),
  height_mm       numeric(10,2),
  depth_mm        numeric(10,2),
  description     text,
  drive_url       text,                              -- link to SketchUp component, etc.
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_products_category on products(category);
create index if not exists idx_products_sku on products(sku);
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

-- Low-stock helper view
create or replace view low_stock_products as
  select id, sku, name_en, stock_qty, reorder_level
  from products
  where track_stock and stock_qty <= reorder_level and is_active;

-- =====================================================================
-- PROJECTS  (the workflow spine — ties everything together)
-- =====================================================================
create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,                 -- e.g. ALY-2026-0001
  client_id     uuid not null references clients(id) on delete restrict,
  title         text,
  project_type  project_type not null default 'kitchen',
  stage         project_stage not null default 'lead',
  design_manager_id     uuid references profiles(id),
  production_manager_id uuid references profiles(id),
  analyzing_manager_id  uuid references profiles(id),
  installation_team     text,                -- "Team A/B/C"
  sketchup_file_url     text,                -- latest approved SketchUp on Drive
  notes         text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_projects_client on projects(client_id);
create index if not exists idx_projects_stage on projects(stage);
create trigger trg_projects_updated before update on projects
  for each row execute function set_updated_at();

-- =====================================================================
-- QUOTATIONS  (header + line items). Per-unit pricing.
-- =====================================================================
create table if not exists quotations (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,                 -- QUO-2026-0001
  client_id     uuid not null references clients(id) on delete restrict,
  project_id    uuid references projects(id) on delete set null,
  status        quote_status not null default 'draft',
  issue_date    date not null default current_date,
  valid_until   date,
  discount_jod  numeric(12,3) not null default 0,
  tax_pct       numeric(5,2)  not null default 16,  -- Jordan GST default
  notes         text,
  -- computed totals (kept in sync by trigger below)
  subtotal_jod  numeric(12,3) not null default 0,
  tax_jod       numeric(12,3) not null default 0,
  total_jod     numeric(12,3) not null default 0,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_quotations_client on quotations(client_id);
create trigger trg_quotations_updated before update on quotations
  for each row execute function set_updated_at();

create table if not exists quotation_items (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references quotations(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  description   text not null,               -- snapshot so quote stays stable
  qty           numeric(12,2) not null default 1,
  unit_price_jod numeric(12,3) not null default 0,
  line_total_jod numeric(12,3) generated always as (qty * unit_price_jod) stored,
  sort_order    int not null default 0
);
create index if not exists idx_quote_items_q on quotation_items(quotation_id);

-- Recompute quotation totals whenever items change
create or replace function recompute_quotation_totals()
returns trigger language plpgsql as $$
declare
  qid uuid := coalesce(new.quotation_id, old.quotation_id);
  sub numeric(12,3);
  disc numeric(12,3);
  tpct numeric(5,2);
begin
  select coalesce(sum(line_total_jod),0) into sub from quotation_items where quotation_id = qid;
  select discount_jod, tax_pct into disc, tpct from quotations where id = qid;
  update quotations
     set subtotal_jod = sub,
         tax_jod = round((sub - coalesce(disc,0)) * coalesce(tpct,0) / 100, 3),
         total_jod = round((sub - coalesce(disc,0)) * (1 + coalesce(tpct,0)/100), 3)
   where id = qid;
  return null;
end $$;

create trigger trg_quote_items_totals
  after insert or update or delete on quotation_items
  for each row execute function recompute_quotation_totals();

-- =====================================================================
-- CONTRACTS
-- =====================================================================
create table if not exists contracts (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,                 -- CON-2026-0001
  client_id     uuid not null references clients(id) on delete restrict,
  project_id    uuid references projects(id) on delete set null,
  quotation_id  uuid references quotations(id) on delete set null,
  status        contract_status not null default 'draft',
  contract_value_jod numeric(12,3) not null default 0,
  signed_date   date,
  drive_url     text,                         -- signed PDF on Drive
  terms         text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_contracts_updated before update on contracts
  for each row execute function set_updated_at();

-- =====================================================================
-- INVOICES (header + items + payments)
-- =====================================================================
create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,                 -- INV-2026-0001
  client_id     uuid not null references clients(id) on delete restrict,
  project_id    uuid references projects(id) on delete set null,
  contract_id   uuid references contracts(id) on delete set null,
  status        invoice_status not null default 'draft',
  issue_date    date not null default current_date,
  due_date      date,
  discount_jod  numeric(12,3) not null default 0,
  tax_pct       numeric(5,2)  not null default 16,
  subtotal_jod  numeric(12,3) not null default 0,
  tax_jod       numeric(12,3) not null default 0,
  total_jod     numeric(12,3) not null default 0,
  paid_jod      numeric(12,3) not null default 0,
  notes         text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_invoices_client on invoices(client_id);
create trigger trg_invoices_updated before update on invoices
  for each row execute function set_updated_at();

create table if not exists invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  description   text not null,
  qty           numeric(12,2) not null default 1,
  unit_price_jod numeric(12,3) not null default 0,
  line_total_jod numeric(12,3) generated always as (qty * unit_price_jod) stored,
  sort_order    int not null default 0
);
create index if not exists idx_invoice_items_i on invoice_items(invoice_id);

create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  amount_jod    numeric(12,3) not null,
  paid_at       date not null default current_date,
  method        text,                         -- cash, transfer, cheque
  reference     text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_payments_invoice on payments(invoice_id);

-- Recompute invoice totals from items
create or replace function recompute_invoice_totals()
returns trigger language plpgsql as $$
declare
  iid uuid := coalesce(new.invoice_id, old.invoice_id);
  sub numeric(12,3); disc numeric(12,3); tpct numeric(5,2);
begin
  select coalesce(sum(line_total_jod),0) into sub from invoice_items where invoice_id = iid;
  select discount_jod, tax_pct into disc, tpct from invoices where id = iid;
  update invoices
     set subtotal_jod = sub,
         tax_jod = round((sub - coalesce(disc,0)) * coalesce(tpct,0) / 100, 3),
         total_jod = round((sub - coalesce(disc,0)) * (1 + coalesce(tpct,0)/100), 3)
   where id = iid;
  return null;
end $$;
create trigger trg_invoice_items_totals
  after insert or update or delete on invoice_items
  for each row execute function recompute_invoice_totals();

-- Recompute paid amount + status from payments
create or replace function recompute_invoice_paid()
returns trigger language plpgsql as $$
declare
  iid uuid := coalesce(new.invoice_id, old.invoice_id);
  p numeric(12,3); tot numeric(12,3); due date;
begin
  select coalesce(sum(amount_jod),0) into p from payments where invoice_id = iid;
  select total_jod, due_date into tot, due from invoices where id = iid;
  update invoices
     set paid_jod = p,
         status = case
           when p >= tot and tot > 0 then 'paid'::invoice_status
           when p > 0 then 'partial'::invoice_status
           when due is not null and due < current_date then 'overdue'::invoice_status
           else status
         end
   where id = iid;
  return null;
end $$;
create trigger trg_payments_recompute
  after insert or update or delete on payments
  for each row execute function recompute_invoice_paid();

-- =====================================================================
-- TASKS (lightweight task management across the workflow)
-- =====================================================================
create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  project_id    uuid references projects(id) on delete cascade,
  assigned_to   uuid references profiles(id),
  due_date      date,
  is_done       boolean not null default false,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_tasks_assignee on tasks(assigned_to);
create trigger trg_tasks_updated before update on tasks
  for each row execute function set_updated_at();

-- =====================================================================
-- STOCK MOVEMENTS (audit trail for inventory)
-- =====================================================================
create table if not exists stock_movements (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  delta_qty     numeric(12,2) not null,       -- + receive, - consume
  reason        text,                          -- purchase, production, adjustment
  ref           text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_stock_mov_product on stock_movements(product_id);

create or replace function apply_stock_movement()
returns trigger language plpgsql as $$
begin
  update products set stock_qty = stock_qty + new.delta_qty where id = new.product_id;
  return new;
end $$;
create trigger trg_stock_movement after insert on stock_movements
  for each row execute function apply_stock_movement();
