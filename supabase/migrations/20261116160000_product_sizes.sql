-- Stage 18b — Standard sizes per catalogue model
-- A product (one code = one model) may have fixed standard sizes, each with a
-- list price. A standard size can also keep its own parts list (bom_lines with
-- size_id set) so its price can be calculated later (Stage 18c).

create table public.product_sizes (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete cascade,
  label            text,
  width_mm         numeric(10,0) not null check (width_mm  > 0),
  height_mm        numeric(10,0) not null check (height_mm > 0),
  depth_mm         numeric(10,0) not null check (depth_mm  > 0),
  calc_price_jod   numeric(12,3),                       -- filled by the pricing engine (18c)
  price_jod        numeric(12,3) not null default 0 check (price_jod >= 0),
  price_overridden boolean not null default true,       -- true = price_jod typed by hand
  source_filename  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint product_sizes_unique_dims unique (product_id, width_mm, height_mm, depth_mm)
);

create trigger trg_product_sizes_updated
  before update on public.product_sizes
  for each row execute function public.set_updated_at();

alter table public.product_sizes enable row level security;

create policy "product_sizes_read" on public.product_sizes
  for select using (public.is_staff());

create policy "product_sizes_office" on public.product_sizes
  for all using (public.is_office()) with check (public.is_office());

revoke all on table public.product_sizes from anon;
grant select, insert, update, delete on table public.product_sizes to authenticated;

-- Parts that belong to one standard size. NULL = the model's own (base) parts.
-- The composite key guarantees a line's size always belongs to the line's own
-- product, even for writes that do not go through replace_bom_lines
-- (added on the 18b review's recommendation).
alter table public.product_sizes
  add constraint product_sizes_id_product_unique unique (id, product_id);

alter table public.bom_lines
  add column size_id uuid;

alter table public.bom_lines
  add constraint bom_lines_size_fk
  foreign key (size_id, product_id)
  references public.product_sizes (id, product_id)
  on delete cascade;

create index idx_bom_lines_size on public.bom_lines (size_id) where size_id is not null;

-- replace_bom_lines gains an optional size: it replaces ONLY the lines of that
-- scope (base parts when p_size_id is null, one size's parts otherwise).
drop function public.replace_bom_lines(uuid, jsonb);

create function public.replace_bom_lines(
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
  return n;
end $function$;

revoke all on function public.replace_bom_lines(uuid, jsonb, uuid) from public, anon;
grant execute on function public.replace_bom_lines(uuid, jsonb, uuid) to authenticated;
