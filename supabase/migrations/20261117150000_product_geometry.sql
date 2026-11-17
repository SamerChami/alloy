-- Stage 19a — Save the model's 3D geometry on import
-- Written against the seven earlier migrations (baseline .. 20261117100000).
-- Adds two tables and two functions. No existing table, column, policy or
-- function is changed; no existing data is touched.
--
-- Why: a saved product kept only each panel's sorted size and its SketchUp
-- position, so its 3D preview could not be redrawn (Stage 19 diagnosis). The
-- import preview is right because it draws from the export file. From now on
-- the same drawing data is stored with the product, so the saved product
-- draws through the same path as the import preview.
--
-- Geometry holds shapes, positions and part names. It holds NO price, cost,
-- labor, markup or supplier, so every active staff member may read it
-- (the factory will need it); only office roles write it.

-- ---------------------------------------------------------------------------
-- 1. Meshes, stored once and shared
-- ---------------------------------------------------------------------------
-- mesh_ref = "mesh_" + a fingerprint of the row's own data, computed by the
-- app when it saves (lib/geometry.ts meshContentRef: SHA-256 of the exact
-- vertices and triangles). Same data -> same row, so the same leg drawn in
-- 300 cabinets is stored once. The export file's own mesh_ref is NOT used as
-- the key: up to extension v0.6.12 its hash ignores which way a triangle
-- faces, so two different meshes could share it (19a review).
-- data = { "vertices": [[x,y,z],...], "triangles": [[a,b,c],...] }, in the
-- part's own local frame (instance scale already applied), millimetres,
-- never world-oriented.
-- A row is never changed or deleted by the app: other models may share it.
create table public.geometry_meshes (
  mesh_ref   text primary key check (mesh_ref ~ '^mesh_[0-9A-Za-z]+$'),
  data       jsonb not null
             check (jsonb_typeof(data) = 'object'
                    and jsonb_typeof(data -> 'vertices')  = 'array'
                    and jsonb_typeof(data -> 'triangles') = 'array'),
  created_at timestamptz not null default now()
);

alter table public.geometry_meshes enable row level security;

create policy "geometry_meshes_read" on public.geometry_meshes
  for select using (public.is_staff());
create policy "geometry_meshes_office_insert" on public.geometry_meshes
  for insert with check (public.is_office());
-- No update / delete policy on purpose: nobody who logs in can change or
-- remove a stored mesh.

revoke all on table public.geometry_meshes from public, anon, authenticated;
grant select, insert on table public.geometry_meshes to authenticated;

-- ---------------------------------------------------------------------------
-- 2. One geometry record per model, and one per standard size
-- ---------------------------------------------------------------------------
-- leaves = every drawn part of the cabinet (panels AND fittings), each with
-- name, size_mm, pos_mm and, when the export has them, axes, outline_mm,
-- profile_mm, mesh_ref, cuts, tooling. Exactly what the 3D viewer needs
-- (see lib/geometry.ts). size_id null = the model itself.
create table public.product_geometry (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  size_id         uuid,
  leaves          jsonb not null check (jsonb_typeof(leaves) = 'array'),
  export_schema   text,
  export_version  text,
  source_filename text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- a size's geometry always belongs to that size's own product (same rule
  -- as bom_lines.size_id, Stage 18b)
  constraint product_geometry_size_fk
    foreign key (size_id, product_id)
    references public.product_sizes (id, product_id)
    on delete cascade
);

create unique index product_geometry_base_unique
  on public.product_geometry (product_id) where size_id is null;
create unique index product_geometry_size_unique
  on public.product_geometry (size_id) where size_id is not null;
-- for the cascade when a model is deleted (the base index is partial)
create index idx_product_geometry_product on public.product_geometry (product_id);

create trigger trg_product_geometry_updated
  before update on public.product_geometry
  for each row execute function public.set_updated_at();

alter table public.product_geometry enable row level security;

create policy "product_geometry_read" on public.product_geometry
  for select using (public.is_staff());
create policy "product_geometry_office" on public.product_geometry
  for all using (public.is_office()) with check (public.is_office());

revoke all on table public.product_geometry from public, anon, authenticated;
grant select, insert, update, delete on table public.product_geometry to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Save: one call, all or nothing
-- ---------------------------------------------------------------------------
-- p_size_id null = the model itself; otherwise one of its standard sizes.
-- p_meshes = { "mesh_<hash>": {vertices, triangles}, ... }. Only the meshes a
-- leaf of THIS cabinet refers to are stored; a mesh already stored is left as
-- it is. Returns the number of meshes newly stored.
-- SECURITY INVOKER: the caller's own rights and row security apply.
create function public.save_product_geometry(
  p_product_id uuid,
  p_size_id    uuid,
  p_leaves     jsonb,
  p_meshes     jsonb,
  p_meta       jsonb default '{}'::jsonb
)
  returns integer
  language plpgsql
  set search_path to 'public'
as $function$
declare
  v_leaves jsonb := coalesce(p_leaves, '[]'::jsonb);
  v_meshes jsonb := coalesce(p_meshes, '{}'::jsonb);
  v_missing text;
  n integer;
begin
  if not public.is_office() then
    raise exception 'Only office staff can save model geometry';
  end if;

  if not exists (select 1 from products
                 where id = p_product_id and item_kind = 'product') then
    raise exception 'Product % not found', p_product_id;
  end if;

  if p_size_id is not null and not exists (
       select 1 from product_sizes where id = p_size_id and product_id = p_product_id) then
    raise exception 'Size % does not belong to product %', p_size_id, p_product_id;
  end if;

  if jsonb_typeof(v_leaves) <> 'array' then
    raise exception 'Geometry leaves must be a list';
  end if;
  if jsonb_typeof(v_meshes) <> 'object' then
    raise exception 'Geometry meshes must be an object';
  end if;

  insert into geometry_meshes (mesh_ref, data)
  select e.key, e.value
  from jsonb_each(v_meshes) as e
  where e.key in (select l ->> 'mesh_ref'
                  from jsonb_array_elements(v_leaves) as l
                  where l ->> 'mesh_ref' is not null)
  on conflict (mesh_ref) do nothing;
  get diagnostics n = row_count;

  -- A part must never point at a mesh that is not stored.
  select l ->> 'mesh_ref' into v_missing
  from jsonb_array_elements(v_leaves) as l
  where l ->> 'mesh_ref' is not null
    and not exists (select 1 from geometry_meshes g where g.mesh_ref = l ->> 'mesh_ref')
  limit 1;
  if v_missing is not null then
    raise exception 'Mesh % is used by a part but was not supplied', v_missing;
  end if;

  delete from product_geometry
  where product_id = p_product_id
    and size_id is not distinct from p_size_id;

  insert into product_geometry
    (product_id, size_id, leaves, export_schema, export_version, source_filename)
  values
    (p_product_id, p_size_id, v_leaves,
     p_meta ->> 'export_schema', p_meta ->> 'export_version', p_meta ->> 'source_filename');

  return n;
end $function$;

-- ---------------------------------------------------------------------------
-- 4. Read: the leaves plus exactly the meshes they use, in one call
-- ---------------------------------------------------------------------------
-- Returns null when the model (or size) has no stored geometry.
create function public.get_product_geometry(
  p_product_id uuid,
  p_size_id    uuid default null
)
  returns jsonb
  language sql stable
  set search_path to 'public'
as $function$
  select jsonb_build_object(
    'leaves', g.leaves,
    'meshes', coalesce((
        select jsonb_object_agg(m.mesh_ref, m.data)
        from geometry_meshes m
        where m.mesh_ref in (select l ->> 'mesh_ref'
                             from jsonb_array_elements(g.leaves) as l
                             where l ->> 'mesh_ref' is not null)
      ), '{}'::jsonb),
    'export_schema',   g.export_schema,
    'export_version',  g.export_version,
    'source_filename', g.source_filename)
  from product_geometry g
  where g.product_id = p_product_id
    and g.size_id is not distinct from p_size_id;
$function$;

revoke all on function public.save_product_geometry(uuid, uuid, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.get_product_geometry(uuid, uuid)                       from public, anon;
grant execute on function public.save_product_geometry(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.get_product_geometry(uuid, uuid)                       to authenticated;
