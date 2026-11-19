-- Stage 20c-1 — SketchUp project import into a draft quotation: the database half
--
-- Rule (Samer, 16 Nov 2026), decided here and nowhere else:
--   1. the code is an active catalogue model AND width, height and depth (whole
--      mm) equal one of its standard sizes  -> 'standard': that size's price
--   2. the code is an active catalogue model, any other size -> 'parts': priced
--      from the cabinet's OWN drawn parts, with the model's labor, markup,
--      default board and material choices
--   3. anything else -> the line is written with price 0 and a warning, so that
--      nothing drawn in the room is dropped silently (design decision D1)
--
-- The app sends what was DRAWN (names, sizes, quantities). It never sends a
-- price, a board, a banding type or a component link: those are looked up here.
--
-- Design: Project doc claude/08-design-20c-quotation-import.md

-- ---------------------------------------------------------------------------
-- 1. ONE formula. price_lines works on any list of parts; price_bom (Stage 18c)
--    now only hands it the model's saved parts, so a catalogue price and a
--    quoted one-off cabinet can never be calculated differently.
-- ---------------------------------------------------------------------------
create function public.price_lines(p_product_id uuid, p_lines jsonb)
  returns table (materials numeric, components numeric, base numeric,
                 calc_price numeric, line_count integer,
                 unpriced_panels integer, unlinked_components integer)
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
          * coalesce(l.qty, 1) * (1 + v_waste / 100.0), 0)
        + coalesce(l.banded_length_m * b.price_per_m_jod * coalesce(l.qty, 1), 0)
      else 0 end), 0),
    coalesce(sum(case when l.line_type = 'component'
        then coalesce(c.unit_price_jod * coalesce(l.qty, 1), 0) else 0 end), 0),
    count(*)::integer,
    -- a panel whose board cost cannot be worked out (no board chosen and no
    -- default board, a board with no sheet size or price, or no panel size)
    (count(*) filter (where l.line_type = 'panel' and
        (l.width_mm / 1000.0) * (l.height_mm / 1000.0)
        * (m.sheet_price_jod
           / nullif((m.sheet_length_mm / 1000.0) * (m.sheet_width_mm / 1000.0), 0)) is null))::integer,
    -- a fitting that is linked to no component, so it adds nothing
    (count(*) filter (where l.line_type = 'component' and c.id is null))::integer
  into v_mat, v_comp, v_n, unpriced_panels, unlinked_components
  from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as l(
         line_type text, panel_id uuid, width_mm numeric, height_mm numeric,
         banding_type_id uuid, banded_length_m numeric, component_id uuid, qty numeric)
  left join products      m on m.id = coalesce(l.panel_id, v_default)
  left join banding_types b on b.id = l.banding_type_id
  left join products      c on c.id = l.component_id;

  materials  := round(v_mat, 3);
  components := round(v_comp, 3);
  base       := materials + components;
  v_raw      := (base + coalesce(v_labor, 0)) * (1 + coalesce(v_markup, 0) / 100.0);
  calc_price := case when v_step > 0 then ceil(v_raw / v_step) * v_step
                     else round(v_raw, 3) end;
  line_count := v_n;
  return next;
end $function$;

-- Same name, arguments and result columns as in Stage 18c.
create or replace function public.price_bom(p_product_id uuid, p_size_id uuid default null)
  returns table (materials numeric, components numeric, base numeric,
                 calc_price numeric, line_count integer)
  language sql stable
  set search_path to 'public'
as $function$
  select r.materials, r.components, r.base, r.calc_price, r.line_count
  from price_lines(
         p_product_id,
         (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
            from bom_lines l
           where l.product_id = p_product_id
             and l.size_id is not distinct from p_size_id)) r;
$function$;

-- A part name without the counter SketchUp adds to a copied / made-unique
-- definition ("Left_Side#114" and "Left_Side#91" are the same part of a model).
create function public.part_name_key(p_name text)
  returns text
  language sql immutable
  set search_path to 'public'
as $function$
  select lower(btrim(regexp_replace(btrim(coalesce(p_name, '')), '#[0-9]+$', '')));
$function$;

-- ---------------------------------------------------------------------------
-- 2. New columns and the parts of a quoted cabinet
-- ---------------------------------------------------------------------------
-- Why a line's price needs a look. Internal: never printed for the client.
alter table public.quotation_items add column price_warning text;

-- The parts a 'parts' line was priced from, kept with the line (job orders will
-- read them). A snapshot: board, banding and component are the ones used for
-- the price on the day of the import.
create table public.quotation_item_parts (
  id                uuid primary key default gen_random_uuid(),
  quotation_item_id uuid not null references public.quotation_items(id) on delete cascade,
  line_type         text not null check (line_type in ('panel', 'component')),
  panel_id          uuid references public.products(id)      on delete restrict,
  part_name         text,
  width_mm          numeric(10,2),
  height_mm         numeric(10,2),
  depth_mm          numeric(10,2),
  banding_type_id   uuid references public.banding_types(id) on delete restrict,
  banded_length_m   numeric(10,3) not null default 0,
  component_id      uuid references public.products(id)      on delete restrict,
  qty               numeric(10,2) not null default 1 check (qty > 0),
  sort_order        integer not null default 0,
  part_role         text,
  cuts_json         jsonb,
  cut_warning       text,
  pos_x_mm          numeric(10,2),
  pos_y_mm          numeric(10,2),
  pos_z_mm          numeric(10,2)
);
create index idx_quote_item_parts_item on public.quotation_item_parts (quotation_item_id);
create index idx_quote_item_parts_panel on public.quotation_item_parts (panel_id)
  where panel_id is not null;
create index idx_quote_item_parts_component on public.quotation_item_parts (component_id)
  where component_id is not null;
create index idx_quote_item_parts_banding on public.quotation_item_parts (banding_type_id)
  where banding_type_id is not null;

alter table public.quotation_item_parts enable row level security;
create policy "quote_item_parts_office" on public.quotation_item_parts
  using (public.is_office()) with check (public.is_office());
revoke all on table public.quotation_item_parts from anon, authenticated;
grant select, insert, delete on table public.quotation_item_parts to authenticated;

-- Parts are written only by quotation_import_items / revise_quotation and are
-- never edited. They disappear only together with their line.
create function public.quotation_item_parts_guard()
  returns trigger
  language plpgsql
  set search_path to 'public'
as $function$
declare
  v_writer boolean := coalesce(current_setting('alloy.quote_line_writer', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    -- Deleting a line removes its parts (ON DELETE CASCADE): by then the line
    -- is already gone. A part cannot be deleted on its own.
    if exists (select 1 from quotation_items i where i.id = old.quotation_item_id) then
      raise exception 'The parts of a quotation line cannot be changed by hand. Import the cabinet again.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' or not v_writer then
    raise exception 'The parts of a quotation line cannot be changed by hand. Import the cabinet again.';
  end if;
  return new;
end $function$;

create trigger trg_quote_item_parts_guard
  before insert or update or delete on public.quotation_item_parts
  for each row execute function public.quotation_item_parts_guard();

-- ---------------------------------------------------------------------------
-- 3. Line guard (Stage 20a) + price_warning: written by the database only.
--    The app may clear a warning, never write one.
--    Only the two marked blocks differ from Stage 20a.
-- ---------------------------------------------------------------------------
create or replace function public.quotation_items_guard()
  returns trigger
  language plpgsql
  set search_path to 'public'
as $function$
declare
  v_qid    uuid := case when tg_op = 'INSERT' then new.quotation_id else old.quotation_id end;
  v_status quote_status;
  v_code   text;
  -- 'on' only inside quotation_add_product / quotation_import_items / revise_quotation
  v_writer boolean := coalesce(current_setting('alloy.quote_line_writer', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and new.quotation_id is distinct from old.quotation_id then
    raise exception 'A line cannot be moved to another quotation.';
  end if;

  -- Lock the quotation row (20a review): otherwise another session could send
  -- it between this check and the line's commit, leaving a line on a sent
  -- quotation whose frozen totals do not include it.
  select q.status, q.code into v_status, v_code from quotations q where q.id = v_qid
  for no key update;
  -- Not found = the quotation itself is being deleted (its lines go with it;
  -- quotations_before_delete has already checked it is a draft).
  if found and v_status <> 'draft' then
    -- One thing may still happen to a frozen line: the standard size it was
    -- quoted from is deleted from the catalogue (size_id ON DELETE SET NULL).
    -- The line keeps its own size and price, so nothing quoted changes.
    if tg_op = 'UPDATE' and old.size_id is not null and new.size_id is null
       -- (line_total_jod is generated: not filled in yet on NEW in a BEFORE trigger)
       and (to_jsonb(new) - 'size_id' - 'line_total_jod')
         = (to_jsonb(old) - 'size_id' - 'line_total_jod') then
      return new;
    end if;
    raise exception 'Quotation % is % and its lines cannot be changed. Send it back to draft or make a revision.',
      v_code, v_status;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Where a line's price came from is recorded by the database only, so later
  -- margin reports can trust it (20a review). A line the app writes directly
  -- is a hand-typed line; on a catalogue line the app may change the price
  -- charged, qty, texts and size, never the catalogue facts.
  if not v_writer then
    if tg_op = 'INSERT' then
      new.price_source   := 'manual';
      new.product_id     := null;
      new.size_id        := null;
      new.list_price_jod := null;
      new.price_warning  := null;                -- 20c
    else
      new.price_source   := old.price_source;
      new.product_id     := old.product_id;
      new.list_price_jod := old.list_price_jod;
      if new.size_id is not null then
        new.size_id := old.size_id;          -- may only be cleared
      end if;
      if new.price_warning is not null then      -- 20c
        new.price_warning := old.price_warning;  -- may only be cleared
      end if;
      if old.price_source <> 'manual' then
        new.code          := old.code;
        new.unit_cost_jod := old.unit_cost_jod;
      end if;
    end if;
  end if;
  return new;
end $function$;

-- ---------------------------------------------------------------------------
-- 4. The resolver: one drawn item -> how it is priced. Read-only. Used by the
--    preview and by the import, so the two can never disagree.
--
--    p_item = { "item_no": "156", "code": "B-2D-K3", "description": "90",
--               "width_mm": 900, "height_mm": 880, "depth_mm": 580,
--               "lines": [ {"line_type":"panel", "part_name":"Left_Side#114",
--                           "width_mm":880, "height_mm":580, "depth_mm":18, "qty":1,
--                           "part_role":"side_left", "pos_x_mm":..., "pos_y_mm":...,
--                           "pos_z_mm":..., "cuts_json":..., "cut_warning":...},
--                          {"line_type":"component", "part_name":"03-09-04-0007", "qty":4} ] }
--    A component line's part_name is the fitting's code; its qty is pieces, or
--    metres for a component sold by the metre.
-- ---------------------------------------------------------------------------
create function public.quote_resolve_item(p_item jsonb)
  returns jsonb
  language plpgsql stable
  set search_path to 'public'
as $function$
declare
  v_code  text    := nullif(btrim(p_item->>'code'), '');
  v_w     numeric := round((p_item->>'width_mm')::numeric);
  v_h     numeric := round((p_item->>'height_mm')::numeric);
  v_d     numeric := round((p_item->>'depth_mm')::numeric);
  p       products%rowtype;
  s       product_sizes%rowtype;
  b       record;
  v_lines jsonb;
  v_bad   text;
  v_new   integer;
  v_warn  text[] := '{}';
  v_out   jsonb;
begin
  -- (the size casts in the declarations above already refuse text that is not a number)
  if jsonb_typeof(p_item) is distinct from 'object' then
    raise exception 'Each imported item must be an object.';
  end if;
  if jsonb_typeof(coalesce(p_item->'lines', '[]'::jsonb)) <> 'array' then
    raise exception 'The parts of an imported item must be a list.';
  end if;
  if jsonb_array_length(coalesce(p_item->'lines', '[]'::jsonb)) > 2000 then
    raise exception 'Too many parts in one item (2000 at most).';
  end if;
  if v_w is null or v_h is null or v_d is null or v_w <= 0 or v_h <= 0 or v_d <= 0 then
    raise exception 'Item % has no usable size (width, height and depth must be above zero).',
      coalesce(nullif(btrim(p_item->>'item_no'), ''), v_code, '?');
  end if;
  -- Refused here, for every item, so the preview and the import refuse the same
  -- things: a part of an unknown kind, or with a size or quantity that is not
  -- above zero (20c review: a negative panel would lower the price silently).
  select string_agg(format('%s (%s)', t.ord, coalesce(t.j->>'part_name', '?')), ', ' order by t.ord)
    into v_bad
  from jsonb_array_elements(coalesce(p_item->'lines', '[]'::jsonb)) with ordinality as t(j, ord)
  where jsonb_typeof(t.j) is distinct from 'object'
     or coalesce(t.j->>'line_type', '') not in ('panel', 'component')
     or coalesce(round((t.j->>'qty')::numeric, 2), 1) <= 0
     or (t.j->>'line_type' = 'panel'
         and (coalesce((t.j->>'width_mm')::numeric, 0) <= 0
           or coalesce((t.j->>'height_mm')::numeric, 0) <= 0));
  if v_bad is not null then
    raise exception 'Item %: part(s) of an unknown kind, or with a size or quantity that is not above zero: %',
      coalesce(nullif(btrim(p_item->>'item_no'), ''), v_code, '?'), v_bad;
  end if;

  if v_code is not null then
    select * into p from products
    where item_kind = 'product' and lower(code) = lower(v_code);
  end if;

  v_out := jsonb_build_object(
    'item_no', nullif(btrim(p_item->>'item_no'), ''), 'code', v_code,
    'description', nullif(btrim(p_item->>'description'), ''),
    'width_mm', v_w, 'height_mm', v_h, 'depth_mm', v_d);

  -- 3. not something the catalogue can price
  if p.id is null or not p.is_active then
    return v_out || jsonb_build_object(
      'status', 'unknown',
      'warning', case when v_code is null then 'No code on this item: type a price'
                      when p.id is null   then 'Not in the catalogue: type a price'
                      else 'Deactivated in the catalogue: type a price' end);
  end if;

  v_out := v_out || jsonb_build_object(
    'product_id', p.id, 'code', p.code, 'name_en', p.name_en, 'name_ar', p.name_ar);

  -- 1. a standard size, to the millimetre
  select * into s from product_sizes z
  where z.product_id = p.id and z.width_mm = v_w and z.height_mm = v_h and z.depth_mm = v_d;
  if found then
    select * into b from price_lines(p.id,
      (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from bom_lines l
        where l.product_id = p.id and l.size_id = s.id));
    if s.price_jod = 0 then
      v_warn := v_warn || 'This standard size has no price'::text;
    end if;
    if b.unpriced_panels > 0 then
      v_warn := v_warn || format('%s panel(s) of this standard size have no board price', b.unpriced_panels);
    end if;
    if b.unlinked_components > 0 then
      v_warn := v_warn || format('%s fitting(s) of this standard size are not linked', b.unlinked_components);
    end if;
    return v_out || jsonb_build_object(
      'status', 'standard', 'size_id', s.id,
      'list_price_jod', s.price_jod,
      'unit_cost_jod', case when b.line_count > 0 then b.base + coalesce(p.labor_jod, 0) end,
      'warning', nullif(array_to_string(v_warn, '; '), ''));
  end if;

  -- 2. priced from its own drawn parts
  with src as (
    select t.ord, t.j
    from jsonb_array_elements(coalesce(p_item->'lines', '[]'::jsonb)) with ordinality as t(j, ord)
  ),
  panels as (
    -- board and banding come from the model's own part with the same name
    -- (counter ignored, first by order); otherwise the model's default board
    select 1 as grp, src.ord::numeric as ord,
      jsonb_build_object(
        'line_type', 'panel',
        'panel_id', coalesce(o.panel_id, p.default_panel_id),
        'part_name', src.j->>'part_name',
        'width_mm',  round((src.j->>'width_mm')::numeric, 2),
        'height_mm', round((src.j->>'height_mm')::numeric, 2),
        'depth_mm',  round((src.j->>'depth_mm')::numeric, 2),
        'banding_type_id', o.banding_type_id,
        -- banded length follows the panel's perimeter (design decision D6)
        'banded_length_m',
          case when o.id is null then 0
               when coalesce(o.width_mm + o.height_mm, 0) > 0
                and coalesce(round((src.j->>'width_mm')::numeric, 2) + round((src.j->>'height_mm')::numeric, 2), 0) > 0
                 then round(coalesce(o.banded_length_m, 0)
                            * (round((src.j->>'width_mm')::numeric, 2) + round((src.j->>'height_mm')::numeric, 2))
                            / (o.width_mm + o.height_mm), 3)
               else coalesce(o.banded_length_m, 0) end,
        'component_id', null,
        'qty', coalesce(round((src.j->>'qty')::numeric, 2), 1),
        '_matched', o.id is not null,
        'part_role', src.j->>'part_role',
        'cuts_json', src.j->'cuts_json',
        'cut_warning', src.j->>'cut_warning',
        'pos_x_mm', round((src.j->>'pos_x_mm')::numeric, 2),
        'pos_y_mm', round((src.j->>'pos_y_mm')::numeric, 2),
        'pos_z_mm', round((src.j->>'pos_z_mm')::numeric, 2)) as line
    from src
    left join lateral (
      select bl.* from bom_lines bl
      where bl.product_id = p.id and bl.size_id is null and bl.line_type = 'panel'
        and part_name_key(bl.part_name) = part_name_key(src.j->>'part_name')
        and part_name_key(src.j->>'part_name') <> ''
      order by bl.sort_order, bl.id limit 1) o on true
    where src.j->>'line_type' = 'panel'
  ),
  drawn as (
    -- a drawn fitting: linked by its code; failing that, by the link made by
    -- hand on the model's own line with the same code
    select 2 as grp, src.ord::numeric as ord,
      jsonb_build_object(
        'line_type', 'component',
        'part_name', src.j->>'part_name',
        'component_id', coalesce(c.id, o.component_id),
        'banded_length_m', 0,
        'qty', coalesce(round((src.j->>'qty')::numeric, 2), 1)) as line
    from src
    left join products c
      on c.item_kind = 'component' and c.is_active and c.sheet_length_mm is null
     and part_name_key(src.j->>'part_name') <> ''
     and lower(c.code) = part_name_key(src.j->>'part_name')
    left join lateral (
      select bl.component_id from bom_lines bl
      where bl.product_id = p.id and bl.size_id is null and bl.line_type = 'component'
        and bl.component_id is not null
        and exists (select 1 from products x where x.id = bl.component_id and x.is_active)
        and part_name_key(bl.part_name) = part_name_key(src.j->>'part_name')
        and part_name_key(src.j->>'part_name') <> ''
      order by bl.sort_order, bl.id limit 1) o on true
    where src.j->>'line_type' = 'component'
  ),
  by_hand as (
    -- hardware that is not drawn (hinges, cams...): added by hand on the model,
    -- copied as it is
    select 3 as grp, row_number() over (order by bl.sort_order, bl.id)::numeric as ord,
      jsonb_build_object(
        'line_type', 'component', 'part_name', null,
        'component_id', bl.component_id, 'banded_length_m', 0, 'qty', bl.qty) as line
    from bom_lines bl
    where bl.product_id = p.id and bl.size_id is null and bl.line_type = 'component'
      and bl.component_id is not null and btrim(coalesce(bl.part_name, '')) = ''
  ),
  all_lines as (
    select * from panels union all select * from drawn union all select * from by_hand
  )
  select coalesce(jsonb_agg(
           e.line || jsonb_build_object('sort_order', e.rn) order by e.rn), '[]'::jsonb)
    into v_lines
  from (select a.line, row_number() over (order by a.grp, a.ord) as rn from all_lines a) e;

  select * into b from price_lines(p.id, v_lines);

  if not exists (select 1 from jsonb_array_elements(v_lines) e where e->>'line_type' = 'panel') then
    v_warn := v_warn || 'No panels drawn in this item'::text;
  end if;
  if b.unpriced_panels > 0 then
    v_warn := v_warn || format('%s panel(s) have no board price', b.unpriced_panels);
  end if;
  select count(*) into v_new
  from jsonb_array_elements(v_lines) e
  where e->>'line_type' = 'panel' and not (e->>'_matched')::boolean;
  if v_new > 0 then
    v_warn := v_warn || format('%s panel(s) are not in the model: default board, no banding', v_new);
  end if;
  if b.unlinked_components > 0 then
    v_warn := v_warn || format('%s fitting(s) not linked to a component', b.unlinked_components);
  end if;

  return v_out || jsonb_build_object(
    'status', 'parts',
    'list_price_jod', b.calc_price,
    'unit_cost_jod', b.base + coalesce(p.labor_jod, 0),
    'warning', nullif(array_to_string(v_warn, '; '), ''),
    'parts', v_lines);
end $function$;

-- ---------------------------------------------------------------------------
-- 5. Preview: what the import WOULD write. Changes nothing.
-- ---------------------------------------------------------------------------
create function public.quote_import_preview(p_items jsonb)
  returns table (idx integer, item_no text, code text, description text,
                 width_mm numeric, height_mm numeric, depth_mm numeric,
                 status text, product_id uuid, size_id uuid,
                 name_en text, name_ar text,
                 list_price_jod numeric, unit_cost_jod numeric, warning text,
                 panel_count integer, component_count integer)
  language plpgsql stable
  set search_path to 'public'
as $function$
declare
  r record;
  o jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Nothing to import.';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'Too many items in one import (500 at most).';
  end if;
  for r in select t.j, t.ord from jsonb_array_elements(p_items) with ordinality as t(j, ord)
           order by t.ord
  loop
    o := quote_resolve_item(r.j);
    idx := r.ord;
    item_no := o->>'item_no';  code := o->>'code';  description := o->>'description';
    width_mm := (o->>'width_mm')::numeric;  height_mm := (o->>'height_mm')::numeric;
    depth_mm := (o->>'depth_mm')::numeric;
    status := o->>'status';
    product_id := (o->>'product_id')::uuid;  size_id := (o->>'size_id')::uuid;
    name_en := o->>'name_en';  name_ar := o->>'name_ar';
    list_price_jod := (o->>'list_price_jod')::numeric;
    unit_cost_jod  := (o->>'unit_cost_jod')::numeric;
    warning := o->>'warning';
    select count(*) filter (where e->>'line_type' = 'panel'),
           count(*) filter (where e->>'line_type' = 'component')
      into panel_count, component_count
    from jsonb_array_elements(coalesce(o->'parts', '[]'::jsonb)) e;
    return next;
  end loop;
end $function$;

-- ---------------------------------------------------------------------------
-- 6. Import: one quotation line per drawn item, all or nothing.
--    p_replace_section = true first removes every line of that section.
-- ---------------------------------------------------------------------------
create function public.quotation_import_items(
  p_quotation_id    uuid,
  p_items           jsonb,
  p_section         text    default null,
  p_replace_section boolean default false
)
  returns setof public.quotation_items
  language plpgsql
  set search_path to 'public'
as $function$
declare
  v_status  quote_status;
  v_qcode   text;
  v_section text := nullif(btrim(p_section), '');
  v_sort    integer;
  r         record;
  o         jsonb;
  v_known   boolean;
  v_price   numeric;
  v_line    quotation_items%rowtype;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to import.';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'Too many items in one import (500 at most).';
  end if;

  select q.status, q.code into v_status, v_qcode
  from quotations q where q.id = p_quotation_id
  for no key update;
  if not found then
    raise exception 'Quotation not found.';
  end if;
  if v_status <> 'draft' then
    raise exception 'Quotation % is % and its lines cannot be changed. Send it back to draft or make a revision.',
      v_qcode, v_status;
  end if;

  if coalesce(p_replace_section, false) then
    -- never "replace" the lines that have no section (20c review): that would
    -- sweep away every typed and catalogue line of an unsectioned quotation
    if v_section is null then
      raise exception 'Name the section whose lines are to be replaced.';
    end if;
    delete from quotation_items i
    where i.quotation_id = p_quotation_id and i.section = v_section;
  end if;

  select coalesce(max(i.sort_order), 0) into v_sort
  from quotation_items i where i.quotation_id = p_quotation_id;

  for r in select t.j, t.ord from jsonb_array_elements(p_items) with ordinality as t(j, ord)
           order by t.ord
  loop
    o := quote_resolve_item(r.j);
    v_known := (o->>'status') in ('standard', 'parts');
    v_price := coalesce((o->>'list_price_jod')::numeric, 0);
    v_sort  := v_sort + 1;

    perform set_config('alloy.quote_line_writer', 'on', true);
    insert into quotation_items
      (quotation_id, product_id, size_id, section, item_no, code, description, description_ar,
       width_mm, height_mm, depth_mm, qty, unit_price_jod, list_price_jod, unit_cost_jod,
       price_source, price_warning, sort_order)
    values
      (p_quotation_id, (o->>'product_id')::uuid, (o->>'size_id')::uuid, v_section,
       o->>'item_no', o->>'code',
       case when v_known then o->>'name_en'
            else coalesce(nullif(concat_ws(' ', o->>'code', o->>'description'), ''), 'Unnamed item') end,
       o->>'name_ar',
       nullif((o->>'width_mm')::numeric, 0), nullif((o->>'height_mm')::numeric, 0),
       nullif((o->>'depth_mm')::numeric, 0),
       1, v_price,
       case when v_known then v_price end,
       (o->>'unit_cost_jod')::numeric,
       case when v_known then o->>'status' else 'manual' end,
       o->>'warning', v_sort)
    returning * into v_line;

    if o->>'status' = 'parts' then
      insert into quotation_item_parts
        (quotation_item_id, line_type, panel_id, part_name, width_mm, height_mm, depth_mm,
         banding_type_id, banded_length_m, component_id, qty, sort_order, part_role,
         cuts_json, cut_warning, pos_x_mm, pos_y_mm, pos_z_mm)
      select v_line.id, x.line_type, x.panel_id, x.part_name, x.width_mm, x.height_mm, x.depth_mm,
             x.banding_type_id, coalesce(x.banded_length_m, 0), x.component_id,
             coalesce(x.qty, 1), coalesce(x.sort_order, 0), x.part_role,
             nullif(x.cuts_json, 'null'::jsonb), x.cut_warning, x.pos_x_mm, x.pos_y_mm, x.pos_z_mm
      from jsonb_to_recordset(o->'parts') as x(
             line_type text, panel_id uuid, part_name text, width_mm numeric, height_mm numeric,
             depth_mm numeric, banding_type_id uuid, banded_length_m numeric, component_id uuid,
             qty numeric, sort_order integer, part_role text, cuts_json jsonb, cut_warning text,
             pos_x_mm numeric, pos_y_mm numeric, pos_z_mm numeric);
    end if;
    perform set_config('alloy.quote_line_writer', 'off', true);

    return next v_line;
  end loop;
end $function$;

-- ---------------------------------------------------------------------------
-- 7. Revision (Stage 20a) now also copies each line's warning and parts.
-- ---------------------------------------------------------------------------
create or replace function public.revise_quotation(p_quotation_id uuid)
  returns uuid
  language plpgsql
  set search_path to 'public'
as $function$
declare
  src       quotations%rowtype;
  v_root    uuid;
  v_code    text;
  v_rev     integer;
  v_new     uuid;
  i         quotation_items%rowtype;
  v_item    uuid;
begin
  select * into src from quotations where id = p_quotation_id;
  if not found then
    raise exception 'Quotation not found.';
  end if;
  v_root := coalesce(src.root_id, src.id);

  -- one revision at a time per family
  select q.code into v_code from quotations q where q.id = v_root for update;
  select max(q.revision) + 1 into v_rev
  from quotations q where q.id = v_root or q.root_id = v_root;
  -- The lines and their parts are copied one line at a time: hold the source
  -- still meanwhile (an import or a line edit takes a conflicting lock on it).
  perform 1 from quotations q where q.id = p_quotation_id for share;

  insert into quotations
    (code, client_id, project_id, title, notes, discount_kind, discount_value,
     tax_pct, price_display, root_id, revision)
  values
    (v_code || '-R' || v_rev, src.client_id, src.project_id, src.title, src.notes,
     src.discount_kind, src.discount_value, src.tax_pct, src.price_display,
     v_root, v_rev)
  returning id into v_new;

  perform set_config('alloy.quote_line_writer', 'on', true);
  for i in select * from quotation_items q
           where q.quotation_id = p_quotation_id order by q.sort_order, q.id
  loop
    insert into quotation_items
      (quotation_id, product_id, size_id, section, item_no, code, description, description_ar,
       width_mm, height_mm, depth_mm, qty, unit_price_jod, list_price_jod, unit_cost_jod,
       price_source, price_warning, notes, sort_order)
    values
      (v_new, i.product_id, i.size_id, i.section, i.item_no, i.code, i.description,
       i.description_ar, i.width_mm, i.height_mm, i.depth_mm, i.qty, i.unit_price_jod,
       i.list_price_jod, i.unit_cost_jod, i.price_source, i.price_warning, i.notes, i.sort_order)
    returning id into v_item;

    insert into quotation_item_parts
      (quotation_item_id, line_type, panel_id, part_name, width_mm, height_mm, depth_mm,
       banding_type_id, banded_length_m, component_id, qty, sort_order, part_role,
       cuts_json, cut_warning, pos_x_mm, pos_y_mm, pos_z_mm)
    select v_item, t.line_type, t.panel_id, t.part_name, t.width_mm, t.height_mm, t.depth_mm,
           t.banding_type_id, t.banded_length_m, t.component_id, t.qty, t.sort_order, t.part_role,
           t.cuts_json, t.cut_warning, t.pos_x_mm, t.pos_y_mm, t.pos_z_mm
    from quotation_item_parts t
    where t.quotation_item_id = i.id
    order by t.sort_order, t.id;
  end loop;
  perform set_config('alloy.quote_line_writer', 'off', true);

  return v_new;
end $function$;

-- ---------------------------------------------------------------------------
-- 8. Rights. Everything runs with the caller's rights, so the office-only row
--    policies on products, product_sizes, bom_lines, quotations, quotation_items
--    and quotation_item_parts apply inside these functions too: a non-office
--    user sees every item as "not in the catalogue" and cannot write a line.
-- ---------------------------------------------------------------------------
revoke all on function public.price_lines(uuid, jsonb)             from public, anon;
revoke all on function public.part_name_key(text)                  from public, anon;
revoke all on function public.quote_resolve_item(jsonb)            from public, anon;
revoke all on function public.quote_import_preview(jsonb)          from public, anon;
revoke all on function public.quotation_import_items(uuid, jsonb, text, boolean) from public, anon;
revoke all on function public.quotation_item_parts_guard()         from public, anon, authenticated;
grant execute on function public.price_lines(uuid, jsonb)          to authenticated;
grant execute on function public.part_name_key(text)               to authenticated;
grant execute on function public.quote_resolve_item(jsonb)         to authenticated;
grant execute on function public.quote_import_preview(jsonb)       to authenticated;
grant execute on function public.quotation_import_items(uuid, jsonb, text, boolean) to authenticated;
