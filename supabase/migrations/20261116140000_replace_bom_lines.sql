-- Stage 17e — Atomic BOM save
-- One database function replaces a product's BOM lines in a single
-- transaction: either the old lines are replaced by the new ones, or nothing
-- changes. It writes every bom_lines column, including cut and hole data.

create or replace function public.replace_bom_lines(
  p_product_id uuid,
  p_lines      jsonb
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

  delete from bom_lines where product_id = p_product_id;

  insert into bom_lines (
    product_id, line_type, panel_id, part_name, width_mm, height_mm,
    banding_type_id, banded_length_m, component_id, qty, sort_order,
    part_role, depth_mm, pos_offset_mm, hole_count, holes_json,
    pos_x_mm, pos_y_mm, pos_z_mm, cuts_json, cut_warning
  )
  select
    p_product_id, r.line_type, r.panel_id, r.part_name, r.width_mm, r.height_mm,
    r.banding_type_id, coalesce(r.banded_length_m, 0), r.component_id,
    coalesce(r.qty, 1), coalesce(r.sort_order, 0),
    r.part_role, r.depth_mm, r.pos_offset_mm, coalesce(r.hole_count, 0), r.holes_json,
    r.pos_x_mm, r.pos_y_mm, r.pos_z_mm, r.cuts_json, r.cut_warning
  from jsonb_populate_recordset(null::public.bom_lines, coalesce(p_lines, '[]'::jsonb)) as r;

  get diagnostics n = row_count;
  return n;
end $function$;

revoke all on function public.replace_bom_lines(uuid, jsonb) from public, anon;
grant execute on function public.replace_bom_lines(uuid, jsonb) to authenticated;
