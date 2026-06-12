-- =====================================================================
-- ALLOY — Stage 1: Seed & Code Generators (run AFTER 02_rls.sql)
-- =====================================================================

-- Auto-generate human-readable codes per table (ALY/QUO/INV/CON/project)
create table if not exists code_counters (
  prefix text primary key,
  year   int  not null,
  n      int  not null default 0
);

create or replace function next_code(p_prefix text)
returns text language plpgsql as $$
declare y int := extract(year from now())::int; cur int;
begin
  insert into code_counters(prefix, year, n) values (p_prefix, y, 1)
  on conflict (prefix) do update
    set n = case when code_counters.year = y then code_counters.n + 1 else 1 end,
        year = y
  returning n into cur;
  return p_prefix || '-' || y || '-' || lpad(cur::text, 4, '0');
end $$;

-- Auto-assign codes on insert if null
create or replace function assign_code()
returns trigger language plpgsql as $$
begin
  if new.code is null then
    new.code := next_code(tg_argv[0]);
  end if;
  return new;
end $$;

create trigger trg_project_code  before insert on projects
  for each row execute function assign_code('ALY');
create trigger trg_quote_code    before insert on quotations
  for each row execute function assign_code('QUO');
create trigger trg_invoice_code  before insert on invoices
  for each row execute function assign_code('INV');
create trigger trg_contract_code before insert on contracts
  for each row execute function assign_code('CON');

-- ---------- Sample products (delete later) ----------
insert into products (sku, name_en, name_ar, category, unit, unit_price_jod, cost_jod, track_stock, stock_qty, reorder_level)
values
  ('CAB-BASE-60', 'Base Cabinet 60cm', 'خزانة سفلية ٦٠ سم', 'cabinet', 'pcs', 120.000, 75.000, false, 0, 0),
  ('CAB-WALL-60', 'Wall Cabinet 60cm', 'خزانة علوية ٦٠ سم', 'cabinet', 'pcs', 95.000, 58.000, false, 0, 0),
  ('PNL-MDF-18',  'MDF Panel 18mm',    'لوح إم دي إف ١٨ مم', 'panel',  'sheet', 22.500, 15.000, true, 40, 10),
  ('ACC-HINGE-BLUM','Blum Hinge',       'مفصلة بلوم',        'accessory','pcs', 1.750, 1.100, true, 500, 100),
  ('ACC-SLIDE-45','Drawer Slide 45cm', 'مجرى درج ٤٥ سم',     'fitting','set', 6.500, 4.200, true, 120, 30)
on conflict (sku) do nothing;
