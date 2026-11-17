-- Stage 20a quotation checks.
-- Paste ONE block at a time into the Supabase SQL editor and run it.
-- Every block ends by raising "RESULT ..." on purpose: the editor shows it as
-- a red message, and that also undoes everything the block did.
-- Nothing in this file leaves any change in the database (not even a used
-- quotation number).
--
-- Q0 runs BEFORE the migration. Q1-Q9 need the migration applied.
-- Q7 uses the 17d test user  factory.test@alloy.test  (may stay deactivated).

-- ===== Q0 (BEFORE the migration): is there anything the new rules would refuse?
-- Wanted: 0 | 0 | 0 | 0 | 0   (if not, tell Claude before applying)
do $$
declare a int; b int; c int; d int; e int;
begin
  select count(*) into a from quotations;
  select count(*) into b from quotation_items;
  select count(*) into c from quotation_items where qty <= 0 or unit_price_jod < 0;
  select count(*) into d from quotations where tax_pct < 0 or tax_pct > 100 or discount_jod < 0;
  select count(*) into e from quotations where status <> 'draft';
  raise exception 'RESULT Q0 -> quotations % | lines % | lines with bad qty or price % | headers with bad tax or discount % | not draft %',
    a, b, c, d, e;
end $$;

-- ===== Q1: the worked example must match lib/quotationTotals.test.ts ========
-- Lines 2 x 19.500 + 1 x 120.000 + 3 x 7.250, discount 10 %, tax 16 %.
-- Wanted: subtotal 180.750 | discount 18.075 | tax 26.028 | total 188.703
do $$
declare v_client uuid; v_q uuid; r record;
begin
  insert into clients (full_name, phone) values ('TEST client 20a', '0790000000') returning id into v_client;
  insert into quotations (client_id, discount_kind, discount_value, tax_pct)
    values (v_client, 'percent', 10, 16) returning id into v_q;
  insert into quotation_items (quotation_id, description, qty, unit_price_jod) values
    (v_q, 'TEST base unit', 2, 19.5),
    (v_q, 'TEST tall unit', 1, 120),
    (v_q, 'TEST handle',    3, 7.25);
  select * into r from quotations where id = v_q;
  raise exception 'RESULT Q1 -> subtotal % | discount % | tax % | total %',
    r.subtotal_jod, r.discount_jod, r.tax_jod, r.total_jod;
end $$;

-- ===== Q2: changing the header re-works the totals; the app cannot set them ==
-- Wanted: fixed 20 -> 20.000 / 186.470 | tax 0 -> 160.750 | discount 500 is held at 180.750 -> total 0.000
--         | typed total 1 is ignored -> 209.670 | line removed -> subtotal 159.000
do $$
declare v_client uuid; v_q uuid; a record; b numeric; c record; d numeric; e numeric;
begin
  insert into clients (full_name, phone) values ('TEST client 20a', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 16) returning id into v_q;
  insert into quotation_items (quotation_id, description, qty, unit_price_jod) values
    (v_q, 'TEST base unit', 2, 19.5), (v_q, 'TEST tall unit', 1, 120), (v_q, 'TEST handle', 3, 7.25);
  update quotations set discount_kind = 'amount', discount_value = 20 where id = v_q;
  select discount_jod, total_jod into a from quotations where id = v_q;
  update quotations set tax_pct = 0 where id = v_q;
  select total_jod into b from quotations where id = v_q;
  update quotations set discount_value = 500 where id = v_q;
  select discount_jod, total_jod into c from quotations where id = v_q;
  update quotations set discount_value = 0, tax_pct = 16, total_jod = 1, subtotal_jod = 1 where id = v_q;
  select total_jod into d from quotations where id = v_q;
  delete from quotation_items where quotation_id = v_q and description = 'TEST handle';
  select subtotal_jod into e from quotations where id = v_q;
  raise exception 'RESULT Q2 -> fixed 20 -> % / % | tax 0 -> % | discount 500 is held at % -> total % | typed total 1 is ignored -> % | line removed -> subtotal %',
    a.discount_jod, a.total_jod, b, c.discount_jod, c.total_jod, d, e;
end $$;

-- ===== Q3: a sent quotation is frozen ========================================
-- Wanted: add line REFUSED | change line REFUSED | delete line REFUSED | change discount REFUSED
--         | change client REFUSED | delete quotation REFUSED | print choice and notes allowed
--         | total still 209.670 | back to draft, then the line can change: total 232.290
do $$
declare v_client uuid; v_c2 uuid; v_q uuid; v_item uuid; res text := ''; t numeric; t2 numeric;
begin
  insert into clients (full_name, phone) values ('TEST client 20a', '0790000000') returning id into v_client;
  insert into clients (full_name, phone) values ('TEST client 20a b', '0790000001') returning id into v_c2;
  insert into quotations (client_id, tax_pct) values (v_client, 16) returning id into v_q;
  insert into quotation_items (quotation_id, description, qty, unit_price_jod) values
    (v_q, 'TEST tall unit', 1, 120), (v_q, 'TEST handle', 3, 7.25);
  insert into quotation_items (quotation_id, description, qty, unit_price_jod)
    values (v_q, 'TEST base unit', 2, 19.5) returning id into v_item;
  update quotations set status = 'sent' where id = v_q;

  begin insert into quotation_items (quotation_id, description, qty, unit_price_jod) values (v_q, 'x', 1, 1);
        res := res || 'add line ALLOWED (HOLE)';
  exception when raise_exception then res := res || 'add line REFUSED'; end;
  begin update quotation_items set unit_price_jod = 1 where id = v_item;
        res := res || ' | change line ALLOWED (HOLE)';
  exception when raise_exception then res := res || ' | change line REFUSED'; end;
  begin delete from quotation_items where id = v_item;
        res := res || ' | delete line ALLOWED (HOLE)';
  exception when raise_exception then res := res || ' | delete line REFUSED'; end;
  begin update quotations set discount_value = 50 where id = v_q;
        res := res || ' | change discount ALLOWED (HOLE)';
  exception when raise_exception then res := res || ' | change discount REFUSED'; end;
  begin update quotations set client_id = v_c2 where id = v_q;
        res := res || ' | change client ALLOWED (HOLE)';
  exception when raise_exception then res := res || ' | change client REFUSED'; end;
  begin delete from quotations where id = v_q;
        res := res || ' | delete quotation ALLOWED (HOLE)';
  exception when raise_exception then res := res || ' | delete quotation REFUSED'; end;
  begin update quotations set price_display = 'total', notes = 'note', valid_until = current_date + 60 where id = v_q;
        res := res || ' | print choice and notes allowed';
  exception when raise_exception then res := res || ' | print choice and notes REFUSED (wrong)'; end;

  select total_jod into t from quotations where id = v_q;
  update quotations set status = 'draft' where id = v_q;
  update quotation_items set qty = 3 where id = v_item;
  select total_jod into t2 from quotations where id = v_q;
  raise exception 'RESULT Q3 -> % | total still % | back to draft, then the line can change: total %', res, t, t2;
end $$;

-- ===== Q4: status flow =======================================================
-- Wanted: new as sent REFUSED | draft->approved REFUSED | send empty REFUSED | draft->sent ok (sent date set)
--         | sent->approved ok (decided date set) | approved->draft REFUSED | approved->sent REFUSED
--         | renumber REFUSED | typed number ignored | typed revision ignored (-R2) | delete a draft ok
do $$
declare v_client uuid; v_q uuid; v_q2 uuid; res text := ''; r record; n int;
begin
  insert into clients (full_name, phone) values ('TEST client 20a', '0790000000') returning id into v_client;
  begin insert into quotations (client_id, status) values (v_client, 'sent');
        res := res || 'new as sent ALLOWED (HOLE)';
  exception when raise_exception then res := res || 'new as sent REFUSED'; end;
  insert into quotations (client_id) values (v_client) returning id into v_q;
  begin update quotations set status = 'approved' where id = v_q;
        res := res || ' | draft->approved ALLOWED (HOLE)';
  exception when raise_exception then res := res || ' | draft->approved REFUSED'; end;
  begin update quotations set status = 'sent' where id = v_q;
        res := res || ' | send empty ALLOWED (HOLE)';
  exception when raise_exception then res := res || ' | send empty REFUSED'; end;
  insert into quotation_items (quotation_id, description, unit_price_jod) values (v_q, 'TEST line', 10);
  update quotations set status = 'sent' where id = v_q;
  select * into r from quotations where id = v_q;
  res := res || ' | draft->sent ok (sent date ' || case when r.sent_at is not null then 'set' else 'MISSING' end || ')';
  update quotations set status = 'approved' where id = v_q;
  select * into r from quotations where id = v_q;
  res := res || ' | sent->approved ok (decided date ' || case when r.decided_at is not null and r.sent_at is not null then 'set' else 'MISSING' end || ')';
  begin update quotations set status = 'draft' where id = v_q;
        res := res || ' | approved->draft ALLOWED (HOLE)';
  exception when raise_exception then res := res || ' | approved->draft REFUSED'; end;
  begin update quotations set status = 'sent' where id = v_q;
        res := res || ' | approved->sent ALLOWED (HOLE)';
  exception when raise_exception then res := res || ' | approved->sent REFUSED'; end;
  insert into quotations (client_id) values (v_client) returning id into v_q2;
  begin update quotations set code = 'QUO-1' where id = v_q2;
        res := res || ' | renumber ALLOWED (HOLE)';
  exception when raise_exception then res := res || ' | renumber REFUSED'; end;
  insert into quotations (client_id, code, revision) values (v_client, 'QUO-1', 7) returning * into r;
  res := res || case when r.code <> 'QUO-1' and r.revision = 1 and r.root_id is null
                     then ' | typed number ignored' else ' | typed number KEPT (HOLE)' end;
  insert into quotations (client_id, code, root_id, revision) values (v_client, 'QUO-2', v_q, 9) returning * into r;
  res := res || case when r.code = (select code from quotations where id = v_q) || '-R2' and r.revision = 2
                     then ' | typed revision ignored (-R2)' else ' | typed revision KEPT (HOLE)' end;
  insert into quotation_items (quotation_id, description) values (v_q2, 'TEST line');
  delete from quotations where id = v_q2;
  select count(*) into n from quotation_items where quotation_id = v_q2;
  res := res || case when n = 0 then ' | delete a draft ok' else ' | delete a draft LEFT LINES (wrong)' end;
  raise exception 'RESULT Q4 -> %', res;
end $$;

-- ===== Q5: adding from the catalogue copies price, size and cost; later
--           catalogue changes do not touch the quotation ======================
-- Model: 2 sides 720 x 580 on a 22.500 board, banding, 2 hinges, labor 5, markup 30 % -> 21.500
-- (the 18c worked example), plus one standard size 600 x 720 x 560 typed at 35.000.
-- Wanted: model line: TEST-20A | 800x720x580 | price 21.500 | cost 16.326 | catalogue
--         | size line: 600x720x560 | price 35.000 | cost none | standard (section "Kitchen")
--         | hinge line: price 1.750 | cost 1.100
--         | subtotal 63.500 | after the board doubles: catalogue price 30.500, quotation still 63.500
--         | deactivated item REFUSED | size of another model REFUSED
do $$
declare v_client uuid; v_q uuid; v_board uuid; v_hinge uuid; v_band uuid; v_model uuid; v_other uuid;
        v_size uuid; a quotation_items; b quotation_items; c quotation_items;
        s1 numeric; s2 numeric; cat numeric; res text := '';
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board', 'component', 2440, 1220, 22.5) returning id into v_board;
  insert into products (name_en, item_kind, unit_price_jod, cost_jod)
    values ('TEST hinge', 'component', 1.75, 1.1) returning id into v_hinge;
  insert into banding_types (name, price_per_m_jod) values ('TEST band 20a', 0.35) returning id into v_band;
  insert into products (name_en, name_ar, code, item_kind, labor_jod, margin_pct, width_mm, height_mm, depth_mm)
    values ('TEST model', 'نموذج', 'TEST-20A', 'product', 5, 30, 800, 720, 580) returning id into v_model;
  insert into products (name_en, item_kind, is_active) values ('TEST retired', 'product', false) returning id into v_other;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, banding_type_id, banded_length_m, qty)
    values (v_model, 'panel', v_board, 'side', 720, 580, v_band, 1.44, 2);
  insert into bom_lines (product_id, line_type, component_id, qty) values (v_model, 'component', v_hinge, 2);
  perform reprice_product(v_model);
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 600, 720, 560, 35, true) returning id into v_size;

  insert into clients (full_name, phone) values ('TEST client 20a', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;
  a := quotation_add_product(v_q, v_model);
  b := quotation_add_product(v_q, v_model, v_size, 1, ' Kitchen ');
  c := quotation_add_product(v_q, v_hinge, null, 4);
  select subtotal_jod into s1 from quotations where id = v_q;

  update products set sheet_price_jod = 45 where id = v_board;       -- catalogue re-prices itself
  select unit_price_jod into cat from products where id = v_model;
  select subtotal_jod into s2 from quotations where id = v_q;

  begin perform quotation_add_product(v_q, v_other);
        res := 'deactivated item ALLOWED (wrong)';
  exception when raise_exception then res := 'deactivated item REFUSED'; end;
  begin perform quotation_add_product(v_q, v_hinge, v_size);
        res := res || ' | size of another model ALLOWED (wrong)';
  exception when raise_exception then res := res || ' | size of another model REFUSED'; end;

  raise exception 'RESULT Q5 -> model line: % | %x%x% | price % | cost % | % | size line: %x%x% | price % | cost % | % (section "%") | hinge line: price % | cost % | subtotal % | after the board doubles: catalogue price %, quotation still % | %',
    a.code, a.width_mm, a.height_mm, a.depth_mm, a.unit_price_jod, a.unit_cost_jod, a.price_source,
    b.width_mm, b.height_mm, b.depth_mm, b.unit_price_jod, coalesce(b.unit_cost_jod::text, 'none'), b.price_source, b.section,
    c.unit_price_jod, c.unit_cost_jod, s1, cat, s2, res;
end $$;

-- ===== Q6: revision ==========================================================
-- Wanted: second number = first number + "-R2", third = "-R3" (R2 ok, R3 ok) | status draft and draft
--         | lines 3 and 3 | totals 188.703 and 188.703 | original still approved with 3 lines, total 188.703
do $$
declare v_client uuid; v_q uuid; v_r2 uuid; v_r3 uuid; q1 record; q2 record; q3 record; n2 int; n3 int; n1 int;
begin
  insert into clients (full_name, phone) values ('TEST client 20a', '0790000000') returning id into v_client;
  insert into quotations (client_id, discount_kind, discount_value, tax_pct, title)
    values (v_client, 'percent', 10, 16, 'TEST kitchen') returning id into v_q;
  insert into quotation_items (quotation_id, description, qty, unit_price_jod, section, sort_order) values
    (v_q, 'TEST base unit', 2, 19.5, 'Kitchen', 1),
    (v_q, 'TEST tall unit', 1, 120, 'Kitchen', 2),
    (v_q, 'TEST handle',    3, 7.25, null, 3);
  update quotations set status = 'sent' where id = v_q;
  update quotations set status = 'approved' where id = v_q;
  v_r2 := revise_quotation(v_q);
  v_r3 := revise_quotation(v_r2);
  select * into q1 from quotations where id = v_q;
  select * into q2 from quotations where id = v_r2;
  select * into q3 from quotations where id = v_r3;
  select count(*) into n1 from quotation_items where quotation_id = v_q;
  select count(*) into n2 from quotation_items where quotation_id = v_r2;
  select count(*) into n3 from quotation_items where quotation_id = v_r3;
  raise exception 'RESULT Q6 -> numbers: % | % | %  (R2 %, R3 %) | status % and % | lines % and % | totals % and % | original still % with % lines, total %',
    q1.code, q2.code, q3.code,
    case when q2.code = q1.code || '-R2' and q2.revision = 2 and q2.root_id = v_q then 'ok' else 'WRONG' end,
    case when q3.code = q1.code || '-R3' and q3.revision = 3 and q3.root_id = v_q then 'ok' else 'WRONG' end,
    q2.status, q3.status, n2, n3, q2.total_jod, q3.total_jod, q1.status, n1, q1.total_jod;
end $$;

-- ===== Q7: a factory worker sees and does nothing here =======================
-- Wanted: reads quotations 0 of 1, lines 0 of 1 | new quotation REFUSED | new line REFUSED
--         | change 0 rows | add from catalogue REFUSED | revision REFUSED
do $$
declare uid uuid; v_client uuid; v_q uuid; v_p uuid; a int; b int; n int; res text := '';
begin
  select id into uid from auth.users where email = 'factory.test@alloy.test';
  if uid is null then raise exception 'SETUP: test user not found'; end if;
  update public.profiles set role = 'factory_worker', is_active = true where id = uid;
  insert into clients (full_name, phone) values ('TEST client 20a', '0790000000') returning id into v_client;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST item', 'component', 9) returning id into v_p;
  insert into quotations (client_id) values (v_client) returning id into v_q;
  insert into quotation_items (quotation_id, description, unit_price_jod) values (v_q, 'TEST line', 50);

  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into a from public.quotations;
  select count(*) into b from public.quotation_items;
  begin insert into public.quotations (client_id) values (v_client);
        res := 'new quotation ALLOWED (HOLE)';
  exception when others then res := 'new quotation REFUSED'; end;
  begin insert into public.quotation_items (quotation_id, description) values (v_q, 'x');
        res := res || ' | new line ALLOWED (HOLE)';
  exception when others then res := res || ' | new line REFUSED'; end;
  update public.quotations set notes = 'x' where id = v_q;
  get diagnostics n = row_count;
  res := res || ' | change ' || n || ' rows';
  begin perform public.quotation_add_product(v_q, v_p);
        res := res || ' | add from catalogue ALLOWED (HOLE)';
  exception when others then res := res || ' | add from catalogue REFUSED'; end;
  begin perform public.revise_quotation(v_q);
        res := res || ' | revision ALLOWED (HOLE)';
  exception when others then res := res || ' | revision REFUSED'; end;
  raise exception 'RESULT Q7 -> factory worker reads quotations % of 1, lines % of 1 | %', a, b, res;
end $$;

-- ===== Q8: defaults on a new quotation; an office user can do the whole job ==
-- Uses Samer's own account (the oldest active admin) the way the app does.
-- Wanted: number looks like QUO-<year>-<nnnn> | tax 16.00 | valid 30 days
--         | with settings 10 % and 14 days: tax 10.00 | valid 14 days
--         | as an office user: add ok, send ok, revise ok, total 23.200
do $$
declare uid uuid; v_client uuid; v_p uuid; v_q uuid; v_q2 uuid; v_q3 uuid; v_r uuid;
        r record; r2 record; t numeric; rc text;
begin
  select p.id into uid from public.profiles p where p.role = 'admin' and p.is_active order by p.created_at limit 1;
  if uid is null then raise exception 'SETUP: no active admin profile'; end if;
  insert into clients (full_name, phone) values ('TEST client 20a', '0790000000') returning id into v_client;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST item', 'component', 10) returning id into v_p;
  update pricing_settings set quote_tax_pct = 16, quote_validity_days = 30;
  insert into quotations (client_id) values (v_client) returning id into v_q;
  select * into r from quotations where id = v_q;
  update pricing_settings set quote_tax_pct = 10, quote_validity_days = 14;
  insert into quotations (client_id) values (v_client) returning id into v_q2;
  select * into r2 from quotations where id = v_q2;

  update pricing_settings set quote_tax_pct = 16, quote_validity_days = 30;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.quotations (client_id) values (v_client) returning id into v_q3;
  perform public.quotation_add_product(v_q3, v_p, null, 2);
  update public.quotations set status = 'sent' where id = v_q3;
  v_r := public.revise_quotation(v_q3);
  select total_jod, code into t, rc from public.quotations where id = v_r;
  raise exception 'RESULT Q8 -> number % | tax % | valid % days | with settings 10 %% and 14 days: tax % | valid % days | as an office user: add ok, send ok, revise ok (%), total %',
    r.code, r.tax_pct, r.valid_until - r.issue_date, r2.tax_pct, r2.valid_until - r2.issue_date, rc, t;
end $$;

-- ===== Q9: catalogue facts on a line come from the database only; a quoted
--           catalogue item cannot be deleted; a deleted standard size leaves a
--           sent quotation as it was ==========================================
-- Wanted: hand line claiming to be catalogue is stored as: manual | list none | product none
--         | catalogue line after an edit attempt: catalogue | list 21.500 | cost 15.318 | code TEST-20A | price charged 20.000
--         | delete a quoted model REFUSED | standard size deleted while sent: line keeps 600x720x560 at 35.000, link cleared
--         | total still 60.000
do $$
declare v_client uuid; v_q uuid; v_board uuid; v_hinge uuid; v_model uuid; v_size uuid;
        a quotation_items; b quotation_items; h quotation_items; res text; t numeric;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board', 'component', 2440, 1220, 22.5) returning id into v_board;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into products (name_en, code, item_kind, labor_jod, margin_pct, width_mm, height_mm, depth_mm)
    values ('TEST model', 'TEST-20A', 'product', 5, 30, 800, 720, 580) returning id into v_model;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, qty)
    values (v_model, 'panel', v_board, 'side', 720, 580, 2);
  insert into bom_lines (product_id, line_type, component_id, qty) values (v_model, 'component', v_hinge, 2);
  update products set unit_price_jod = 21.5, price_overridden = true where id = v_model;
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 600, 720, 560, 35, true) returning id into v_size;
  insert into clients (full_name, phone) values ('TEST client 20a', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;

  insert into quotation_items (quotation_id, description, unit_price_jod, price_source, list_price_jod, product_id, size_id)
    values (v_q, 'TEST hand line', 5, 'catalogue', 999, v_model, v_size) returning * into h;
  a := quotation_add_product(v_q, v_model);
  b := quotation_add_product(v_q, v_model, v_size);
  update quotation_items
     set unit_price_jod = 20, price_source = 'manual', list_price_jod = 1, unit_cost_jod = 0, code = 'X', product_id = null
   where id = a.id returning * into a;

  begin delete from products where id = v_model;
        res := 'delete a quoted model ALLOWED (wrong)';
  exception when foreign_key_violation then res := 'delete a quoted model REFUSED'; end;

  update quotations set status = 'sent' where id = v_q;
  delete from product_sizes where id = v_size;
  select * into b from quotation_items where id = b.id;
  select total_jod into t from quotations where id = v_q;
  raise exception 'RESULT Q9 -> hand line claiming to be catalogue is stored as: % | list % | product % | catalogue line after an edit attempt: % | list % | cost % | code % | price charged % | % | standard size deleted while sent: line keeps %x%x% at %, link % | total still %',
    h.price_source, coalesce(h.list_price_jod::text, 'none'), coalesce(h.product_id::text, 'none'),
    a.price_source, a.list_price_jod, a.unit_cost_jod, a.code, a.unit_price_jod, res,
    b.width_mm, b.height_mm, b.depth_mm, b.unit_price_jod,
    case when b.size_id is null then 'cleared' else 'KEPT (wrong)' end, t;
end $$;
