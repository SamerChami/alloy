-- Stage 18d money-visibility checks.
-- Paste ONE block at a time into the Supabase SQL editor and run it.
-- Every block ends by raising "RESULT ..." on purpose: the editor shows it as
-- a red message, and that also undoes everything the block did (including the
-- temporary re-activation / role change of the test user).
-- Nothing in this file leaves any change in the database.
--
-- Uses the 17d test user  factory.test@alloy.test . It may stay deactivated:
-- each block switches it on for the length of the block only.
--
-- M1 works before AND after the migration. M2-M9 need the migration applied.

-- ===== M1: what money tables can a factory worker read directly? ===========
-- Before 18d: products > 0 and pricing settings 1 (HOLE); standard sizes and
-- banding types are > 0 only if any exist.   After 18d: 0 | 0 | 0 | 0.
do $$
declare uid uuid; a int; b int; c int; d int; top numeric;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set role = 'factory_worker', is_active = true where id = uid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*), max(unit_price_jod) into a, top from public.products;
  select count(*) into b from public.product_sizes;
  select count(*) into c from public.banding_types;
  select count(*) into d from public.pricing_settings;
  raise exception 'RESULT M1 -> factory worker reads: products % (highest price seen %) | standard sizes % | banding types % | pricing settings %  (want 0 | 0 | 0 | 0)',
    a, coalesce(top::text, 'none'), b, c, d;
end $$;

-- ===== M2: a factory worker still gets the price-free list =================
-- Wanted: models seen = models total, stock items seen = stock items total.
do $$
declare uid uuid; m_all int; c_all int; m int; c int;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set role = 'factory_worker', is_active = true where id = uid;
  select count(*) filter (where item_kind = 'product'),
         count(*) filter (where item_kind <> 'product')
    into m_all, c_all from public.products;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) filter (where item_kind = 'product'),
         count(*) filter (where item_kind <> 'product')
    into m, c from public.products_basic;
  raise exception 'RESULT M2 -> factory worker, price-free list: models % of % | stock items % of %  (want both complete)',
    m, m_all, c, c_all;
end $$;

-- ===== M3: an installation user sees models only, and no money tables ======
-- Wanted: money tables 0 | 0 | 0 | 0, models complete, stock items 0.
do $$
declare uid uuid; m_all int; a int; b int; c int; d int; m int; s int;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set role = 'installation', is_active = true where id = uid;
  select count(*) into m_all from public.products where item_kind = 'product';
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into a from public.products;
  select count(*) into b from public.product_sizes;
  select count(*) into c from public.banding_types;
  select count(*) into d from public.pricing_settings;
  select count(*) filter (where item_kind = 'product'),
         count(*) filter (where item_kind <> 'product')
    into m, s from public.products_basic;
  raise exception 'RESULT M3 -> installation user: money tables % | % | % | % (want 0 | 0 | 0 | 0), models % of % (want complete), stock items % (want 0)',
    a, b, c, d, m, m_all, s;
end $$;

-- ===== M4: the two views carry no money column =============================
-- Wanted: none.
do $$
declare cols text;
begin
  select string_agg(table_name || '.' || column_name, ', ') into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('products_basic', 'low_stock_products')
    and column_name ~* '(price|cost|labor|margin|markup|supplier|jod)';
  raise exception 'RESULT M4 -> money columns in the views: %  (want none)',
    coalesce(cols, 'none');
end $$;

-- ===== M5: nobody can write through the views ==============================
-- Wanted: BLOCKED twice.
do $$
declare uid uuid; m1 text; m2 text; n int;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set role = 'factory_worker', is_active = true where id = uid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.products_basic set name_en = name_en || ' HACKED';
    get diagnostics n = row_count;
    m1 := 'HOLE OPEN: ' || n || ' rows changed through products_basic';
  exception when others then
    m1 := 'BLOCKED (good): ' || sqlerrm;
  end;
  begin
    delete from public.low_stock_products;
    get diagnostics n = row_count;
    m2 := 'HOLE OPEN: ' || n || ' rows deleted through low_stock_products';
  exception when others then
    m2 := 'BLOCKED (good): ' || sqlerrm;
  end;
  raise exception 'RESULT M5 -> update: % | delete: %', m1, m2;
end $$;

-- ===== M6: an office user still reads everything ===========================
-- Wanted: every pair equal, and pricing settings 1.
do $$
declare uid uuid; p_all int; s_all int; b_all int; p int; s int; b int; d int;
begin
  select id into uid from public.profiles where role = 'admin' and is_active limit 1;
  if uid is null then raise exception 'SETUP: no active admin profile'; end if;
  select count(*) into p_all from public.products;
  select count(*) into s_all from public.product_sizes;
  select count(*) into b_all from public.banding_types;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into p from public.products;
  select count(*) into s from public.product_sizes;
  select count(*) into b from public.banding_types;
  select count(*) into d from public.pricing_settings;
  raise exception 'RESULT M6 -> admin reads: products % of % | standard sizes % of % | banding types % of % | pricing settings % (want 1)',
    p, p_all, s, s_all, b, b_all, d;
end $$;

-- ===== M7: factory stock work still functions ==============================
-- Wanted: in low-stock list before 1 | movement WORKS | stock after 10.00 | in low-stock list after 0.
do $$
declare uid uuid; v uuid; l1 int; l2 int; q numeric; msg text;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set role = 'factory_worker', is_active = true where id = uid;
  insert into public.products (name_en, item_kind, track_stock, stock_qty, reorder_level)
    values ('TEST 18d stock item', 'component', true, 0, 5) returning id into v;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into l1 from public.low_stock_products where id = v;
  begin
    insert into public.stock_movements (product_id, delta_qty, reason)
      values (v, 10, 'TEST 18d');
    msg := 'WORKS (good)';
  exception when others then
    msg := 'FAILS: ' || sqlerrm;
  end;
  select stock_qty into q from public.products_basic where id = v;
  select count(*) into l2 from public.low_stock_products where id = v;
  raise exception 'RESULT M7 -> in low-stock list before % (want 1) | movement % | stock after % (want 10.00) | in low-stock list after % (want 0)',
    l1, msg, q, l2;
end $$;

-- ===== M8: the price calculation tells a factory worker nothing ============
-- Wanted: owner sees a real price; factory worker gets 0 | 0.
do $$
declare uid uuid; pid uuid; real_price numeric; r record;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set role = 'factory_worker', is_active = true where id = uid;
  select id, calc_price_jod into pid, real_price from public.products
   where item_kind = 'product' and calc_price_jod is not null
   order by calc_price_jod desc limit 1;
  if pid is null then
    raise exception 'RESULT M8 -> NO MODEL WITH A CALCULATED PRICE to test with (not a failure)';
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.price_bom(pid, null);
  raise exception 'RESULT M8 -> real calculated price % | factory worker gets cost % and price %  (want 0 and 0)',
    real_price, r.base, r.calc_price;
end $$;

-- ===== M9: a deactivated user gets nothing from the views ==================
-- Wanted: 0 | 0.
do $$
declare uid uuid; a int; b int;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set role = 'factory_worker', is_active = false where id = uid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into a from public.products_basic;
  select count(*) into b from public.low_stock_products;
  raise exception 'RESULT M9 -> deactivated user: price-free list % | low-stock list %  (want 0 | 0)', a, b;
end $$;
