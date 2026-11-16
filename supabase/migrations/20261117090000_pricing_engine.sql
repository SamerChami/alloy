-- Stage 18c — Pricing engine: one source of truth, in the database
--
-- Rules (Samer, 17 Nov 2026):
--   * the percentage is a MARKUP on cost, and it applies to labor too:
--       price = (materials + components + labor) x (1 + markup%)
--   * sheet waste allowance on panel material (default 8 %, adjustable)
--   * the calculated price is rounded UP to a step (default 0.5 JOD)
--   * a model has one default board, used by every part that has none chosen
--   * a typed (overridden) price is never changed by the engine

-- ---------------------------------------------------------------------------
-- 1. Settings (single row)
-- ---------------------------------------------------------------------------
create table public.pricing_settings (
  id                boolean primary key default true check (id),
  waste_pct         numeric(5,2) not null default 8   check (waste_pct >= 0 and waste_pct <= 100),
  rounding_step_jod numeric(6,3) not null default 0.5 check (rounding_step_jod >= 0),
  updated_at        timestamptz not null default now()
);
insert into public.pricing_settings default values;

create trigger trg_pricing_settings_updated
  before update on public.pricing_settings
  for each row execute function public.set_updated_at();

alter table public.pricing_settings enable row level security;
create policy "pricing_settings_read" on public.pricing_settings
  for select using (public.is_staff());
create policy "pricing_settings_office" on public.pricing_settings
  for update using (public.is_office()) with check (public.is_office());
-- Supabase's default privileges hand new tables ALL rights (incl. TRUNCATE,
-- which RLS does not stop) to authenticated: keep only what the app needs.
revoke all on table public.pricing_settings from anon, authenticated;
grant select, update on table public.pricing_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 2. New columns
-- ---------------------------------------------------------------------------
alter table public.products
  add column default_panel_id uuid references public.products(id) on delete set null,
  add column calc_price_jod   numeric(12,3);

create index idx_products_default_panel on public.products (default_panel_id)
  where default_panel_id is not null;

-- From now on a standard size is calculated unless a price is typed.
alter table public.product_sizes alter column price_overridden set default false;

-- ---------------------------------------------------------------------------
-- 3. The calculation (read-only)
--    p_size_id null = the model's own parts; otherwise one standard size.
-- ---------------------------------------------------------------------------
create function public.price_bom(p_product_id uuid, p_size_id uuid default null)
  returns table (materials numeric, components numeric, base numeric,
                 calc_price numeric, line_count integer)
  language plpgsql stable
  set search_path to 'public'
as $function$
declare
  v_waste   numeric;
  v_step    numeric;
  v_labor   numeric;
  v_markup  numeric;
  v_default uuid;
  v_mat     numeric;
  v_comp    numeric;
  v_n       integer;
  v_raw     numeric;
begin
  select s.waste_pct, s.rounding_step_jod into v_waste, v_step
  from pricing_settings s limit 1;
  v_waste := coalesce(v_waste, 0);
  v_step  := coalesce(v_step, 0);

  select p.labor_jod, p.margin_pct, p.default_panel_id
    into v_labor, v_markup, v_default
  from products p where p.id = p_product_id;

  select
    coalesce(sum(case when l.line_type = 'panel' then
        coalesce(
          (l.width_mm / 1000.0) * (l.height_mm / 1000.0)
          * (m.sheet_price_jod
             / nullif((m.sheet_length_mm / 1000.0) * (m.sheet_width_mm / 1000.0), 0))
          * l.qty * (1 + v_waste / 100.0), 0)
        + coalesce(l.banded_length_m * b.price_per_m_jod * l.qty, 0)
      else 0 end), 0),
    coalesce(sum(case when l.line_type = 'component'
        then coalesce(c.unit_price_jod * l.qty, 0) else 0 end), 0),
    count(*)::integer
  into v_mat, v_comp, v_n
  from bom_lines l
  left join products      m on m.id = coalesce(l.panel_id, v_default)
  left join banding_types b on b.id = l.banding_type_id
  left join products      c on c.id = l.component_id
  where l.product_id = p_product_id
    and l.size_id is not distinct from p_size_id;

  materials  := round(v_mat, 3);
  components := round(v_comp, 3);
  base       := materials + components;
  v_raw      := (base + coalesce(v_labor, 0)) * (1 + coalesce(v_markup, 0) / 100.0);
  calc_price := case when v_step > 0 then ceil(v_raw / v_step) * v_step
                     else round(v_raw, 3) end;
  line_count := v_n;
  return next;
end $function$;

-- ---------------------------------------------------------------------------
-- 4. Store the result on the product and on each of its standard sizes
-- ---------------------------------------------------------------------------
create function public.reprice_product(p_product_id uuid)
  returns void
  language plpgsql
  set search_path to 'public'
as $function$
declare
  r record;
  q record;
  s record;
begin
  -- Only catalogue models are priced from parts. A board or component is never
  -- re-priced here, so trigger 5b (which reacts to a board/component price
  -- change) can never be set off by this function: no trigger loop is possible.
  if not exists (select 1 from products
                 where id = p_product_id and item_kind = 'product') then
    return;
  end if;

  select * into r from price_bom(p_product_id, null);

  if r.line_count > 0 then
    update products set
      materials_cost_jod  = r.materials,
      components_cost_jod = r.components,
      base_cost_jod       = r.base,
      calc_price_jod      = r.calc_price,
      unit_price_jod      = case when price_overridden then unit_price_jod else r.calc_price end
    where id = p_product_id;
  else
    -- No parts: nothing to calculate. Keep whatever price was typed.
    update products set
      materials_cost_jod = 0, components_cost_jod = 0, base_cost_jod = 0,
      calc_price_jod = null
    where id = p_product_id
      and (materials_cost_jod <> 0 or components_cost_jod <> 0
           or base_cost_jod <> 0 or calc_price_jod is not null);
  end if;

  for s in select id from product_sizes where product_id = p_product_id loop
    select * into q from price_bom(p_product_id, s.id);
    update product_sizes set
      calc_price_jod = case when q.line_count > 0 then q.calc_price else null end,
      price_jod      = case when price_overridden or q.line_count = 0
                            then price_jod else q.calc_price end
    where id = s.id;
  end loop;
end $function$;

revoke all on function public.price_bom(uuid, uuid)   from public, anon;
revoke all on function public.reprice_product(uuid)   from public, anon;
grant execute on function public.price_bom(uuid, uuid) to authenticated;
grant execute on function public.reprice_product(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Keep prices current
-- ---------------------------------------------------------------------------
-- 5a. A model's own pricing inputs changed (labor, markup, default board,
--     or "use the calculated price" switched back on).
create function public.trg_product_inputs_reprice()
  returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  perform reprice_product(new.id);
  return null;
end $function$;

create trigger trg_products_inputs_reprice
  after update on public.products
  for each row
  when (old.labor_jod        is distinct from new.labor_jod
     or old.margin_pct       is distinct from new.margin_pct
     or old.default_panel_id is distinct from new.default_panel_id
     or (old.price_overridden and not new.price_overridden))
  execute function public.trg_product_inputs_reprice();

-- 5b. A board or a component changed price: re-price every model that uses it.
create function public.trg_source_price_reprice()
  returns trigger language plpgsql set search_path to 'public'
as $function$
declare
  pid uuid;
begin
  for pid in
    select distinct l.product_id from bom_lines l
     where l.panel_id = new.id or l.component_id = new.id
    union
    select p.id from products p where p.default_panel_id = new.id
  loop
    perform reprice_product(pid);
  end loop;
  return null;
end $function$;

create trigger trg_products_source_price_reprice
  after update on public.products
  for each row
  when (new.item_kind <> 'product'
    and (old.sheet_price_jod  is distinct from new.sheet_price_jod
      or old.sheet_length_mm  is distinct from new.sheet_length_mm
      or old.sheet_width_mm   is distinct from new.sheet_width_mm
      or old.unit_price_jod   is distinct from new.unit_price_jod))
  execute function public.trg_source_price_reprice();

-- 5c. An edge-banding rate changed.
create function public.trg_banding_price_reprice()
  returns trigger language plpgsql set search_path to 'public'
as $function$
declare
  pid uuid;
begin
  for pid in select distinct l.product_id from bom_lines l
              where l.banding_type_id = new.id
  loop
    perform reprice_product(pid);
  end loop;
  return null;
end $function$;

create trigger trg_banding_types_reprice
  after update on public.banding_types
  for each row
  when (old.price_per_m_jod is distinct from new.price_per_m_jod)
  execute function public.trg_banding_price_reprice();

-- 5d. Waste or rounding changed: re-price everything that has parts.
create function public.trg_settings_reprice()
  returns trigger language plpgsql set search_path to 'public'
as $function$
declare
  pid uuid;
begin
  for pid in select distinct l.product_id from bom_lines l loop
    perform reprice_product(pid);
  end loop;
  return null;
end $function$;

create trigger trg_pricing_settings_reprice
  after update on public.pricing_settings
  for each row
  when (old.waste_pct         is distinct from new.waste_pct
     or old.rounding_step_jod is distinct from new.rounding_step_jod)
  execute function public.trg_settings_reprice();

-- 5e. A standard size switched back to "calculated" takes its calculated price.
create function public.trg_size_price_sync()
  returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if not new.price_overridden and new.calc_price_jod is not null then
    new.price_jod := new.calc_price_jod;
  end if;
  return new;
end $function$;

create trigger trg_product_sizes_price_sync
  before insert or update on public.product_sizes
  for each row execute function public.trg_size_price_sync();

-- 5f. Saving parts re-prices the model (same signature as Stage 18b).
create or replace function public.replace_bom_lines(
  p_product_id uuid,
  p_lines      jsonb,
  p_size_id    uuid default null
)
  returns integer
  language plpgsql
  set search_path to 'public'
as $function$
declare
  n integer;
begin
  if not public.is_office() then
    raise exception 'Only office staff can edit a bill of materials';
  end if;

  if not exists (select 1 from products where id = p_product_id) then
    raise exception 'Product % not found', p_product_id;
  end if;

  if p_size_id is not null and not exists (
       select 1 from product_sizes where id = p_size_id and product_id = p_product_id) then
    raise exception 'Size % does not belong to product %', p_size_id, p_product_id;
  end if;

  delete from bom_lines
  where product_id = p_product_id
    and size_id is not distinct from p_size_id;

  insert into bom_lines (
    product_id, size_id, line_type, panel_id, part_name, width_mm, height_mm,
    banding_type_id, banded_length_m, component_id, qty, sort_order,
    part_role, depth_mm, pos_offset_mm, hole_count, holes_json,
    pos_x_mm, pos_y_mm, pos_z_mm, cuts_json, cut_warning
  )
  select
    p_product_id, p_size_id, r.line_type, r.panel_id, r.part_name, r.width_mm, r.height_mm,
    r.banding_type_id, coalesce(r.banded_length_m, 0), r.component_id,
    coalesce(r.qty, 1), coalesce(r.sort_order, 0),
    r.part_role, r.depth_mm, r.pos_offset_mm, coalesce(r.hole_count, 0), r.holes_json,
    r.pos_x_mm, r.pos_y_mm, r.pos_z_mm, r.cuts_json, r.cut_warning
  from jsonb_populate_recordset(null::public.bom_lines, coalesce(p_lines, '[]'::jsonb)) as r;

  get diagnostics n = row_count;

  perform reprice_product(p_product_id);
  return n;
end $function$;

-- ---------------------------------------------------------------------------
-- 6. Bring existing rows in line with the new rules (one time)
-- ---------------------------------------------------------------------------
do $$
declare
  pid uuid;
begin
  for pid in select distinct product_id from public.bom_lines loop
    perform public.reprice_product(pid);
  end loop;
end $$;
