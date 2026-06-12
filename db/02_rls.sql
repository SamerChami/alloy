-- =====================================================================
-- ALLOY — Stage 1: Row-Level Security (run AFTER 01_schema.sql)
-- =====================================================================
-- Permission tiers:
--   OFFICE  = admin, sales_manager, design_manager, production_manager,
--             analyzing_manager  -> full read/write on business data
--   FACTORY = factory_worker     -> read projects/products, write stock & tasks
--   INSTALL = installation       -> read own projects/tasks, update own tasks
-- Admin can do everything (including managing profiles).
-- =====================================================================

-- Enable RLS everywhere
alter table profiles         enable row level security;
alter table clients          enable row level security;
alter table suppliers        enable row level security;
alter table products         enable row level security;
alter table projects         enable row level security;
alter table quotations       enable row level security;
alter table quotation_items  enable row level security;
alter table contracts        enable row level security;
alter table invoices         enable row level security;
alter table invoice_items    enable row level security;
alter table payments         enable row level security;
alter table tasks            enable row level security;
alter table stock_movements  enable row level security;

-- ---------- PROFILES ----------
-- Everyone can read profiles (needed to show names). Only admin writes.
create policy profiles_read   on profiles for select using (auth.uid() is not null);
create policy profiles_self   on profiles for update using (id = auth.uid());
create policy profiles_admin  on profiles for all
  using (is_admin()) with check (is_admin());

-- ---------- CLIENTS (office only) ----------
create policy clients_office on clients for all
  using (is_office()) with check (is_office());

-- ---------- SUPPLIERS (office only) ----------
create policy suppliers_office on suppliers for all
  using (is_office()) with check (is_office());

-- ---------- PRODUCTS ----------
-- Office: full. Factory & installation: read-only.
create policy products_read on products for select using (auth.uid() is not null);
create policy products_office_write on products for all
  using (is_office()) with check (is_office());

-- ---------- PROJECTS ----------
-- Office: full. Factory & installation: read (they execute the work).
create policy projects_read on projects for select using (auth.uid() is not null);
create policy projects_office_write on projects for all
  using (is_office()) with check (is_office());

-- ---------- QUOTATIONS / ITEMS (office only) ----------
create policy quotations_office on quotations for all
  using (is_office()) with check (is_office());
create policy quote_items_office on quotation_items for all
  using (is_office()) with check (is_office());

-- ---------- CONTRACTS (office only) ----------
create policy contracts_office on contracts for all
  using (is_office()) with check (is_office());

-- ---------- INVOICES / ITEMS / PAYMENTS (office only) ----------
create policy invoices_office on invoices for all
  using (is_office()) with check (is_office());
create policy invoice_items_office on invoice_items for all
  using (is_office()) with check (is_office());
create policy payments_office on payments for all
  using (is_office()) with check (is_office());

-- ---------- TASKS ----------
-- Office: full. Everyone: read tasks assigned to them; update own (mark done).
create policy tasks_office on tasks for all
  using (is_office()) with check (is_office());
create policy tasks_read_own on tasks for select
  using (assigned_to = auth.uid());
create policy tasks_update_own on tasks for update
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

-- ---------- STOCK MOVEMENTS ----------
-- Office + factory can record stock movements; everyone reads.
create policy stock_read on stock_movements for select using (auth.uid() is not null);
create policy stock_write on stock_movements for insert
  with check (is_office() or current_role_of(auth.uid()) = 'factory_worker');
