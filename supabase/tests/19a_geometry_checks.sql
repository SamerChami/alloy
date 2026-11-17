-- Stage 19a geometry checks.
-- Paste ONE block at a time into the Supabase SQL editor and run it.
-- Every block ends by raising "RESULT ..." on purpose: the editor shows it as
-- a red message, and that also undoes everything the block did.
-- Nothing in this file leaves any change in the database.
-- Uses the test user factory.test@alloy.test (switched on only inside a block).
-- Run AFTER the 19a migration is applied.

-- ===== G1: an office user saves and reads back a model's geometry ==========
-- Wanted: new meshes 1 | leaves 2 | meshes 1 | file TEST.skp
do $$
declare uid uuid; pid uuid; n int; g jsonb;
begin
  select id into uid from public.profiles where role = 'admin' and is_active limit 1;
  if uid is null then raise exception 'SETUP: no active admin profile'; end if;
  insert into public.products (name_en, item_kind) values ('TEST 19a model', 'product')
    returning id into pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  n := public.save_product_geometry(pid, null,
    '[{"name":"Side","size_mm":{"x":18,"y":560,"z":770},"pos_mm":{"x":0,"y":0,"z":0}},
      {"name":"Leg","size_mm":{"x":60,"y":60,"z":110},"pos_mm":{"x":1,"y":2,"z":3},"mesh_ref":"mesh_test19a01"}]'::jsonb,
    '{"mesh_test19a01":{"vertices":[[0,0,0],[1,0,0],[0,1,0]],"triangles":[[0,1,2]]},
      "mesh_test19a99":{"vertices":[],"triangles":[]}}'::jsonb,
    '{"source_filename":"TEST.skp","export_version":"0.6.12","export_schema":"alloy.sketchup.v6.6"}'::jsonb);
  g := public.get_product_geometry(pid);
  raise exception 'RESULT G1 -> new meshes % (want 1: the unused one is not stored) | leaves % (want 2) | meshes % (want 1) | file % (want TEST.skp)',
    n, jsonb_array_length(g -> 'leaves'),
    (select count(*) from jsonb_object_keys(g -> 'meshes')), g ->> 'source_filename';
end $$;

-- ===== G2: saving again replaces the record and stores no duplicate mesh ===
-- Wanted: second save new meshes 0 | geometry rows 1 | leaves now 1 | mesh rows 1
do $$
declare uid uuid; pid uuid; n int; r int; m int; g jsonb;
begin
  select id into uid from public.profiles where role = 'admin' and is_active limit 1;
  if uid is null then raise exception 'SETUP: no active admin profile'; end if;
  insert into public.products (name_en, item_kind) values ('TEST 19a model', 'product')
    returning id into pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.save_product_geometry(pid, null,
    '[{"name":"Leg","mesh_ref":"mesh_test19a01"},{"name":"Leg","mesh_ref":"mesh_test19a01"}]'::jsonb,
    '{"mesh_test19a01":{"vertices":[[0,0,0]],"triangles":[]}}'::jsonb);
  n := public.save_product_geometry(pid, null,
    '[{"name":"Leg","mesh_ref":"mesh_test19a01"}]'::jsonb,
    '{"mesh_test19a01":{"vertices":[[9,9,9]],"triangles":[]}}'::jsonb);
  select count(*) into r from public.product_geometry where product_id = pid;
  select count(*) into m from public.geometry_meshes where mesh_ref = 'mesh_test19a01';
  g := public.get_product_geometry(pid);
  raise exception 'RESULT G2 -> second save new meshes % (want 0) | geometry rows % (want 1) | leaves now % (want 1) | mesh rows % (want 1) | first mesh kept % (want [[0, 0, 0]])',
    n, r, jsonb_array_length(g -> 'leaves'), m, g -> 'meshes' -> 'mesh_test19a01' -> 'vertices';
end $$;

-- ===== G3: a part may not point at a mesh that is not stored ===============
-- Wanted: REFUSED (good), and nothing saved (geometry rows 0).
do $$
declare uid uuid; pid uuid; msg text; r int;
begin
  select id into uid from public.profiles where role = 'admin' and is_active limit 1;
  if uid is null then raise exception 'SETUP: no active admin profile'; end if;
  insert into public.products (name_en, item_kind) values ('TEST 19a model', 'product')
    returning id into pid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.save_product_geometry(pid, null,
      '[{"name":"Leg","mesh_ref":"mesh_test19amissing"}]'::jsonb, '{}'::jsonb);
    msg := 'HOLE: saved with a missing mesh';
  exception when others then
    msg := 'REFUSED (good): ' || sqlerrm;
  end;
  select count(*) into r from public.product_geometry where product_id = pid;
  raise exception 'RESULT G3 -> % | geometry rows % (want 0)', msg, r;
end $$;

-- ===== G4: a factory worker can read geometry but change nothing ===========
-- Wanted: reads leaves 1 | save BLOCKED | mesh insert BLOCKED | geometry delete 0 rows | mesh update 0 rows | mesh delete BLOCKED or 0 rows
do $$
declare uid uuid; aid uuid; pid uuid; g jsonb; m1 text; m2 text; m3 text; m4 text; n int;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set role = 'factory_worker', is_active = true where id = uid;
  insert into public.products (name_en, item_kind) values ('TEST 19a model', 'product')
    returning id into pid;
  insert into public.geometry_meshes (mesh_ref, data)
    values ('mesh_test19a01', '{"vertices":[[0,0,0]],"triangles":[]}');
  insert into public.product_geometry (product_id, leaves)
    values (pid, '[{"name":"Leg","mesh_ref":"mesh_test19a01"}]');
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  g := public.get_product_geometry(pid);
  begin
    perform public.save_product_geometry(pid, null, '[]'::jsonb, '{}'::jsonb);
    m1 := 'HOLE: factory worker saved geometry';
  exception when others then m1 := 'BLOCKED (good)'; end;
  begin
    insert into public.geometry_meshes (mesh_ref, data)
      values ('mesh_test19a02', '{"vertices":[],"triangles":[]}');
    m2 := 'HOLE: factory worker stored a mesh';
  exception when others then m2 := 'BLOCKED (good)'; end;
  delete from public.product_geometry where product_id = pid;
  get diagnostics n = row_count;
  m3 := n || ' rows';
  begin
    update public.geometry_meshes set data = '{"vertices":[[1,1,1]],"triangles":[]}'
      where mesh_ref = 'mesh_test19a01';
    get diagnostics n = row_count;
    m4 := 'update ' || n || ' rows';
  exception when others then m4 := 'update BLOCKED (good)'; end;
  raise exception 'RESULT G4 -> reads leaves % (want 1) | save % | mesh insert % | geometry delete % (want 0 rows) | mesh % (want BLOCKED or 0 rows)',
    jsonb_array_length(g -> 'leaves'), m1, m2, m3, m4;
end $$;

-- ===== G5: nobody who logs in can change or remove a stored mesh ===========
-- Wanted: admin update BLOCKED or 0 rows | admin delete BLOCKED or 0 rows
do $$
declare uid uuid; m1 text; m2 text; n int;
begin
  select id into uid from public.profiles where role = 'admin' and is_active limit 1;
  if uid is null then raise exception 'SETUP: no active admin profile'; end if;
  insert into public.geometry_meshes (mesh_ref, data)
    values ('mesh_test19a01', '{"vertices":[[0,0,0]],"triangles":[]}');
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.geometry_meshes set data = '{"vertices":[[1,1,1]],"triangles":[]}'
      where mesh_ref = 'mesh_test19a01';
    get diagnostics n = row_count;
    m1 := n || ' rows';
  exception when others then m1 := 'BLOCKED (good)'; end;
  begin
    delete from public.geometry_meshes where mesh_ref = 'mesh_test19a01';
    get diagnostics n = row_count;
    m2 := n || ' rows';
  exception when others then m2 := 'BLOCKED (good)'; end;
  raise exception 'RESULT G5 -> admin update % | admin delete %  (want BLOCKED or 0 rows, twice)', m1, m2;
end $$;

-- ===== G6: an installation user reads geometry ============================
-- Wanted: installation leaves 1
do $$
declare uid uuid; pid uuid; a jsonb;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set role = 'installation', is_active = true where id = uid;
  insert into public.products (name_en, item_kind) values ('TEST 19a model', 'product')
    returning id into pid;
  insert into public.product_geometry (product_id, leaves) values (pid, '[{"name":"Side"}]');
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  a := public.get_product_geometry(pid);
  raise exception 'RESULT G6 -> installation leaves % (want 1)', jsonb_array_length(a -> 'leaves');
end $$;

-- ===== G7: a deactivated user gets nothing =================================
-- Wanted: nothing | geometry rows seen 0 | mesh rows seen 0
do $$
declare uid uuid; pid uuid; b jsonb; r int; m int;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set role = 'factory_worker', is_active = false where id = uid;
  insert into public.products (name_en, item_kind) values ('TEST 19a model', 'product')
    returning id into pid;
  insert into public.geometry_meshes (mesh_ref, data)
    values ('mesh_test19a01', '{"vertices":[[0,0,0]],"triangles":[]}');
  insert into public.product_geometry (product_id, leaves) values (pid, '[{"name":"Side"}]');
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  b := public.get_product_geometry(pid);
  select count(*) into r from public.product_geometry;
  select count(*) into m from public.geometry_meshes;
  raise exception 'RESULT G7 -> deactivated user: % (want nothing) | geometry rows seen % (want 0) | mesh rows seen % (want 0)',
    coalesce(b::text, 'nothing'), r, m;
end $$;

-- ===== G8: sizes, and clean-up when a model is deleted =====================
-- Wanted: wrong-product size REFUSED | size geometry leaves 1 | base still leaves 2 | after deleting the model: geometry rows 0
do $$
declare uid uuid; p1 uuid; p2 uuid; s2 uuid; s1 uuid; msg text; a jsonb; b jsonb; r int;
begin
  select id into uid from public.profiles where role = 'admin' and is_active limit 1;
  if uid is null then raise exception 'SETUP: no active admin profile'; end if;
  insert into public.products (name_en, item_kind) values ('TEST 19a model 1', 'product') returning id into p1;
  insert into public.products (name_en, item_kind) values ('TEST 19a model 2', 'product') returning id into p2;
  insert into public.product_sizes (product_id, width_mm, height_mm, depth_mm) values (p1, 600, 720, 580) returning id into s1;
  insert into public.product_sizes (product_id, width_mm, height_mm, depth_mm) values (p2, 600, 720, 580) returning id into s2;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.save_product_geometry(p1, null, '[{"name":"A"},{"name":"B"}]'::jsonb, '{}'::jsonb);
  begin
    perform public.save_product_geometry(p1, s2, '[{"name":"X"}]'::jsonb, '{}'::jsonb);
    msg := 'HOLE: saved geometry under another model''s size';
  exception when others then msg := 'REFUSED (good)'; end;
  perform public.save_product_geometry(p1, s1, '[{"name":"S"}]'::jsonb, '{}'::jsonb);
  a := public.get_product_geometry(p1, s1);
  b := public.get_product_geometry(p1);
  reset role;
  delete from public.products where id = p1;
  select count(*) into r from public.product_geometry where product_id = p1;
  raise exception 'RESULT G8 -> wrong-product size % | size geometry leaves % (want 1) | base still leaves % (want 2) | after deleting the model: geometry rows % (want 0)',
    msg, jsonb_array_length(a -> 'leaves'), jsonb_array_length(b -> 'leaves'), r;
end $$;
