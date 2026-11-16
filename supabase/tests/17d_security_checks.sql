-- Stage 17d security checks.
-- Paste ONE block at a time into the Supabase SQL editor and run it.
-- Every block ends by raising "RESULT ..." on purpose: the editor shows it as
-- an error message, and that also undoes everything the block did.
-- Nothing in this file leaves any change in the database.
--
-- Setup needed once: a test user  factory.test@alloy.test  with a profiles row
-- role = factory_worker (see the task file).

-- ===== T1: can a factory worker make themselves admin? =====================
-- Before 17d: HOLE OPEN.   After 17d: BLOCKED.
do $$
declare uid uuid; msg text; n int;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.profiles set role = 'admin' where id = uid;
    get diagnostics n = row_count;
    if n = 0 then msg := 'BLOCKED (good): 0 rows updated';
    else msg := 'HOLE OPEN: a factory worker changed their own role to admin';
    end if;
  exception when others then
    msg := 'BLOCKED (good): ' || sqlerrm;
  end;
  raise exception 'RESULT T1 -> %', msg;
end $$;

-- ===== T2: can an admin create a project and get an automatic code? ========
-- Before 17d: expected to FAIL (code_counters locked).  After 17d: a code.
do $$
declare uid uuid; msg text; v text;
begin
  select id into uid from public.profiles where role = 'admin' and is_active limit 1;
  if uid is null then raise exception 'SETUP: no active admin profile'; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.projects (client_id, title)
      select id, 'RLS TEST' from public.clients limit 1
      returning code into v;
    if v is null then msg := 'NO CLIENT ROWS to test with (add one client first)';
    else msg := 'WORKS (good): generated code ' || v;
    end if;
  exception when others then
    msg := 'FAILS: ' || sqlerrm;
  end;
  raise exception 'RESULT T2 -> %', msg;
end $$;

-- ===== T3: does a deactivated user still see data? =========================
-- After 17d: products visible = 0, own profile visible = 1.
do $$
declare uid uuid; p int; o int;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set is_active = false where id = uid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into p from public.products;
  select count(*) into o from public.profiles where id = uid;
  raise exception 'RESULT T3 -> deactivated user sees % products (want 0), own profile rows % (want 1)', p, o;
end $$;

-- ===== T4: can a user call the numbering function directly? ================
-- After 17d: BLOCKED (permission denied).
do $$
declare uid uuid; msg text;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.next_code('TST');
    msg := 'HOLE OPEN: next_code callable directly';
  exception when others then
    msg := 'BLOCKED (good): ' || sqlerrm;
  end;
  raise exception 'RESULT T4 -> %', msg;
end $$;

-- ===== T5: can a visitor who is NOT logged in read the low-stock view? =====
-- Before 17d: HOLE OPEN.   After 17d: BLOCKED.
do $$
declare msg text; n int;
begin
  set local role anon;
  begin
    select count(*) into n from public.low_stock_products;
    msg := 'HOLE OPEN: anonymous visitor read the view (' || n || ' rows)';
  exception when others then
    msg := 'BLOCKED (good): ' || sqlerrm;
  end;
  raise exception 'RESULT T5 -> %', msg;
end $$;

-- ===== T6: does an ACTIVE factory worker still see what they need? =========
-- Before and after: products > 0 (if the catalogue has products).
do $$
declare uid uuid; p int; b int;
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into p from public.products;
  select count(*) into b from public.bom_lines;
  raise exception 'RESULT T6 -> active factory worker sees % products, % BOM lines', p, b;
end $$;
