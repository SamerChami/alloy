-- Stage 20c-1 import checks.
-- Paste ONE block at a time into the Supabase SQL editor and run it.
-- Every block ends by raising "RESULT ..." on purpose: the editor shows it as
-- a red message, and that also undoes everything the block did.
-- Nothing in this file leaves any change in the database (not even a used
-- quotation number).
--
-- I0 runs BEFORE the migration; I1 right after it. I2-I11 need the migration.
-- Run them when nobody is working in the app: each block sets waste 8 % and
-- rounding 0.5 for its own test (undone with the block), which re-prices and
-- holds every product for the second the block takes.
-- The blocks create the codes TEST-20C, TEST-20C-OLD, T20C-LEG and T20C-CH and
-- stop with a "duplicate key" message if one of them is really in the catalogue.
-- I9 uses the 17d test user  factory.test@alloy.test  (may stay deactivated).
--
-- The test model TEST-20C (same fixture in every block):
--   board A 22.500 per 2440 x 1220 sheet, board B (the model's default) 58.000 per 2800 x 2070,
--   banding 0.350 / m, waste 8 %, round up to 0.5, labor 5, markup 30 %.
--   Its own parts: Left_Side#114 and Right_Side#115 720 x 580 on board A (banded 1.44 m each),
--   Bottom#7 764 x 580 with no board chosen (banded 0.764 m), 4 legs T20C-LEG at 0.600,
--   one accessory linked by hand to the drawn code T20C-ODD (9.000), 2 hinges added by hand (1.750).
--   One standard size 800 x 720 x 580 typed at 40.000.
-- The drawn 900-wide cabinet: the same two sides (other counters), Bottom#33 864 x 580,
--   Shelf#5 864 x 560 (not in the model), 4 legs, 0.9 m of channel T20C-CH (2.000 / m), T20C-ODD.
--   Worked out by hand: sides 2 x 0.4176 m2 x 7.558452 x 1.08 = 6.818 + banding 1.008
--     bottom 0.50112 m2 x 10.006901 x 1.08 = 5.416 + banding 0.821 m (0.764 x 1444/1344) x 0.35 = 0.287
--     shelf 0.48384 m2 x 10.006901 x 1.08 = 5.229
--     materials 18.758 | components 2.400 + 1.800 + 9.000 + 3.500 = 16.700 | base 35.458
--     (35.458 + 5) x 1.30 = 52.595 -> 53.000 | cost 40.458

-- ===== I0 (BEFORE the migration) and I1 (AFTER): no catalogue price moved =====
-- Run I0 before applying, keep the line it prints. Run the SAME block again
-- after applying: the two lines must be identical, letter for letter.
do $$
declare n int; t numeric; h text;
begin
  select count(*), coalesce(sum(r.calc_price), 0),
         md5(coalesce(string_agg(concat_ws('|', x.pid, x.sid, r.materials, r.components, r.base, r.calc_price, r.line_count), ';'
             order by x.pid, x.sid), ''))
    into n, t, h
  from (select p.id as pid, null::uuid as sid from products p where p.item_kind = 'product'
        union all select s.product_id, s.id from product_sizes s) x,
       lateral price_bom(x.pid, x.sid) r;
  raise exception 'RESULT I0/I1 -> priced % | sum of calculated prices % | fingerprint %', n, t, h;
end $$;

-- ===== I2: which rule applies (preview only, nothing written) ============
-- Wanted: 1 standard 800x720x580 price 40.000 cost none (0 panels, 0 fittings) size ok warning none
--         | 2 parts 900x720x580 price 53.000 cost 40.458 (4 panels, 4 fittings)  "1 panel(s) are not in the model: default board, no banding"
--         | 3 unknown 1200x900x600 price none cost none (0 panels, 0 fittings)  "Not in the catalogue: type a price"
--         | 4 unknown 600x720x560 price none cost none (0 panels, 0 fittings)  "Deactivated in the catalogue: type a price"
--         | 5 unknown 600x720x560 price none cost none (0 panels, 0 fittings)  "No code on this item: type a price"
--         | 6 parts 801x720x580 price 11.500 cost 8.500 (0 panels, 1 fittings)  "No panels drawn in this item"
--         | lines written 0
do $$
declare v_client uuid; v_q uuid; v_a uuid; v_b uuid; v_band uuid; v_leg uuid; v_ch uuid;
        v_hinge uuid; v_acc uuid; v_model uuid; v_old uuid; v_size uuid;
        std jsonb; wide jsonb; unk jsonb;
        r record; res text := ''; n int;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board A', 'component', 2440, 1220, 22.5) returning id into v_a;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board B', 'component', 2800, 2070, 58) returning id into v_b;
  insert into banding_types (name, price_per_m_jod) values ('TEST band 20c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST leg', 'component', 'T20C-LEG', 'pcs', 0.6) returning id into v_leg;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST channel', 'component', 'T20C-CH', 'm', 2) returning id into v_ch;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST accessory', 'component', 9) returning id into v_acc;
  insert into products (name_en, name_ar, code, item_kind, labor_jod, margin_pct, default_panel_id, width_mm, height_mm, depth_mm)
    values ('TEST model 20c', 'نموذج', 'TEST-20C', 'product', 5, 30, v_b, 800, 720, 580) returning id into v_model;
  insert into products (name_en, code, item_kind, is_active) values ('TEST retired 20c', 'TEST-20C-OLD', 'product', false) returning id into v_old;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, banding_type_id, banded_length_m, qty, sort_order) values
    (v_model, 'panel', v_a,  'Left_Side#114',  720, 580, v_band, 1.44,  1, 0),
    (v_model, 'panel', v_a,  'Right_Side#115', 720, 580, v_band, 1.44,  1, 1),
    (v_model, 'panel', null, 'Bottom#7',       764, 580, v_band, 0.764, 1, 2);
  insert into bom_lines (product_id, line_type, part_name, component_id, qty, sort_order) values
    (v_model, 'component', 'T20C-LEG', v_leg,   4, 3),
    (v_model, 'component', 'T20C-ODD', v_acc,   1, 4),   -- a link made by hand
    (v_model, 'component', null,       v_hinge, 2, 5);   -- hardware added by hand
  perform reprice_product(v_model);
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 800, 720, 580, 40, true) returning id into v_size;
  insert into clients (full_name, phone) values ('TEST client 20c', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;
  -- what the app would send for three drawn items
  std  := '{"item_no":"1","code":"test-20c","description":"80","width_mm":800,"height_mm":720.2,"depth_mm":579.8,"lines":[]}';
  wide := '{"item_no":"2","code":"TEST-20C","description":"90","width_mm":900,"height_mm":720,"depth_mm":580,"lines":[
     {"line_type":"panel","part_name":"Left_Side#201","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_left","pos_x_mm":9,"pos_y_mm":290,"pos_z_mm":360,"cuts_json":[{"k":1}]},
     {"line_type":"panel","part_name":"Right_Side#202","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_right"},
     {"line_type":"panel","part_name":"Bottom#33","width_mm":864,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"bottom"},
     {"line_type":"panel","part_name":"Shelf#5","width_mm":864,"height_mm":560,"depth_mm":18,"qty":1,"part_role":"shelf"},
     {"line_type":"component","part_name":"t20c-leg","qty":4},
     {"line_type":"component","part_name":"T20C-CH","qty":0.9},
     {"line_type":"component","part_name":"T20C-ODD","qty":1}]}';
  unk  := '{"item_no":"3","code":"NOPE-1","description":"island","width_mm":1200,"height_mm":900,"depth_mm":600,"lines":[{"line_type":"panel","part_name":"Top","width_mm":1200,"height_mm":600,"depth_mm":18,"qty":1}]}';

  for r in select * from quote_import_preview(jsonb_build_array(std, wide, unk,
      '{"code":"TEST-20C-OLD","width_mm":600,"height_mm":720,"depth_mm":560}'::jsonb,
      '{"code":" ","width_mm":600,"height_mm":720,"depth_mm":560}'::jsonb,
      std || '{"width_mm":801}'::jsonb)) loop
    res := res || format(' | %s %s %sx%sx%s price %s cost %s (%s panels, %s fittings) %s %s', r.idx, r.status,
      r.width_mm, r.height_mm, r.depth_mm, coalesce(r.list_price_jod::text, 'none'), coalesce(r.unit_cost_jod::text, 'none'),
      r.panel_count, r.component_count,
      case when r.status = 'standard' then case when r.size_id = v_size and r.product_id = v_model then 'size ok' else 'size WRONG' end else '' end,
      coalesce('"' || r.warning || '"', 'warning none'));
  end loop;
  select count(*) into n from quotation_items where quotation_id = v_q;
  raise exception 'RESULT I2 ->% | lines written %', res, n;
end $$;

-- ===== I3: a non-standard size is priced from its own parts ================
-- Wanted: price 53.000 | cost 40.458 | source parts | warning 1 panel(s) are not in the model: default board, no banding
--         | 8 parts kept | Left_Side#201 TEST board A, banded 1.440 | Bottom#33 TEST board B, banded 0.821
--         | Shelf#5 TEST board B, banded 0.000 | t20c-leg -> TEST leg x 4.00 | T20C-CH -> TEST channel x 0.90
--         | T20C-ODD -> TEST accessory x 1.00 | by hand -> TEST hinge x 2.00 | cuts kept yes | quotation subtotal 53.000
do $$
declare v_client uuid; v_q uuid; v_a uuid; v_b uuid; v_band uuid; v_leg uuid; v_ch uuid;
        v_hinge uuid; v_acc uuid; v_model uuid; v_old uuid; v_size uuid;
        std jsonb; wide jsonb; unk jsonb;
        l quotation_items; res text := ''; r record; s numeric; n int;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board A', 'component', 2440, 1220, 22.5) returning id into v_a;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board B', 'component', 2800, 2070, 58) returning id into v_b;
  insert into banding_types (name, price_per_m_jod) values ('TEST band 20c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST leg', 'component', 'T20C-LEG', 'pcs', 0.6) returning id into v_leg;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST channel', 'component', 'T20C-CH', 'm', 2) returning id into v_ch;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST accessory', 'component', 9) returning id into v_acc;
  insert into products (name_en, name_ar, code, item_kind, labor_jod, margin_pct, default_panel_id, width_mm, height_mm, depth_mm)
    values ('TEST model 20c', 'نموذج', 'TEST-20C', 'product', 5, 30, v_b, 800, 720, 580) returning id into v_model;
  insert into products (name_en, code, item_kind, is_active) values ('TEST retired 20c', 'TEST-20C-OLD', 'product', false) returning id into v_old;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, banding_type_id, banded_length_m, qty, sort_order) values
    (v_model, 'panel', v_a,  'Left_Side#114',  720, 580, v_band, 1.44,  1, 0),
    (v_model, 'panel', v_a,  'Right_Side#115', 720, 580, v_band, 1.44,  1, 1),
    (v_model, 'panel', null, 'Bottom#7',       764, 580, v_band, 0.764, 1, 2);
  insert into bom_lines (product_id, line_type, part_name, component_id, qty, sort_order) values
    (v_model, 'component', 'T20C-LEG', v_leg,   4, 3),
    (v_model, 'component', 'T20C-ODD', v_acc,   1, 4),   -- a link made by hand
    (v_model, 'component', null,       v_hinge, 2, 5);   -- hardware added by hand
  perform reprice_product(v_model);
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 800, 720, 580, 40, true) returning id into v_size;
  insert into clients (full_name, phone) values ('TEST client 20c', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;
  -- what the app would send for three drawn items
  std  := '{"item_no":"1","code":"test-20c","description":"80","width_mm":800,"height_mm":720.2,"depth_mm":579.8,"lines":[]}';
  wide := '{"item_no":"2","code":"TEST-20C","description":"90","width_mm":900,"height_mm":720,"depth_mm":580,"lines":[
     {"line_type":"panel","part_name":"Left_Side#201","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_left","pos_x_mm":9,"pos_y_mm":290,"pos_z_mm":360,"cuts_json":[{"k":1}]},
     {"line_type":"panel","part_name":"Right_Side#202","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_right"},
     {"line_type":"panel","part_name":"Bottom#33","width_mm":864,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"bottom"},
     {"line_type":"panel","part_name":"Shelf#5","width_mm":864,"height_mm":560,"depth_mm":18,"qty":1,"part_role":"shelf"},
     {"line_type":"component","part_name":"t20c-leg","qty":4},
     {"line_type":"component","part_name":"T20C-CH","qty":0.9},
     {"line_type":"component","part_name":"T20C-ODD","qty":1}]}';
  unk  := '{"item_no":"3","code":"NOPE-1","description":"island","width_mm":1200,"height_mm":900,"depth_mm":600,"lines":[{"line_type":"panel","part_name":"Top","width_mm":1200,"height_mm":600,"depth_mm":18,"qty":1}]}';

  select * into l from quotation_import_items(v_q, jsonb_build_array(wide), 'Kitchen');
  select count(*) into n from quotation_item_parts where quotation_item_id = l.id;
  for r in select t.*, b.name_en as board, c.name_en as comp from quotation_item_parts t
           left join products b on b.id = t.panel_id left join products c on c.id = t.component_id
           where t.quotation_item_id = l.id and (t.line_type = 'component' or t.part_name in ('Left_Side#201', 'Bottom#33', 'Shelf#5'))
           order by t.sort_order loop
    res := res || case when r.line_type = 'panel'
      then format(' | %s %s, banded %s', r.part_name, r.board, r.banded_length_m)
      else format(' | %s -> %s x %s', coalesce(r.part_name, 'by hand'), r.comp, r.qty) end;
  end loop;
  select subtotal_jod into s from quotations where id = v_q;
  raise exception 'RESULT I3 -> price % | cost % | source % | warning % | % parts kept% | cuts kept % | quotation subtotal %',
    l.unit_price_jod, l.unit_cost_jod, l.price_source, coalesce(l.price_warning, 'none'), n, res,
    (select case when cuts_json = '[{"k":1}]' and pos_x_mm = 9 then 'yes' else 'NO' end from quotation_item_parts where quotation_item_id = l.id and part_name = 'Left_Side#201'), s;
end $$;

-- ===== I4: a price that needs a look says so ===============================
-- Wanted: no default board: price 39.000 "2 panel(s) have no board price; 1 panel(s) are not in the model: default board, no banding"
--         | unknown fitting: price 53.000 "1 panel(s) are not in the model: default board, no banding; 1 fitting(s) not linked to a component"
--         | nothing drawn: price 11.500 "No panels drawn in this item"
do $$
declare v_client uuid; v_q uuid; v_a uuid; v_b uuid; v_band uuid; v_leg uuid; v_ch uuid;
        v_hinge uuid; v_acc uuid; v_model uuid; v_old uuid; v_size uuid;
        std jsonb; wide jsonb; unk jsonb;
        r record; res text := '';
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board A', 'component', 2440, 1220, 22.5) returning id into v_a;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board B', 'component', 2800, 2070, 58) returning id into v_b;
  insert into banding_types (name, price_per_m_jod) values ('TEST band 20c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST leg', 'component', 'T20C-LEG', 'pcs', 0.6) returning id into v_leg;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST channel', 'component', 'T20C-CH', 'm', 2) returning id into v_ch;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST accessory', 'component', 9) returning id into v_acc;
  insert into products (name_en, name_ar, code, item_kind, labor_jod, margin_pct, default_panel_id, width_mm, height_mm, depth_mm)
    values ('TEST model 20c', 'نموذج', 'TEST-20C', 'product', 5, 30, v_b, 800, 720, 580) returning id into v_model;
  insert into products (name_en, code, item_kind, is_active) values ('TEST retired 20c', 'TEST-20C-OLD', 'product', false) returning id into v_old;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, banding_type_id, banded_length_m, qty, sort_order) values
    (v_model, 'panel', v_a,  'Left_Side#114',  720, 580, v_band, 1.44,  1, 0),
    (v_model, 'panel', v_a,  'Right_Side#115', 720, 580, v_band, 1.44,  1, 1),
    (v_model, 'panel', null, 'Bottom#7',       764, 580, v_band, 0.764, 1, 2);
  insert into bom_lines (product_id, line_type, part_name, component_id, qty, sort_order) values
    (v_model, 'component', 'T20C-LEG', v_leg,   4, 3),
    (v_model, 'component', 'T20C-ODD', v_acc,   1, 4),   -- a link made by hand
    (v_model, 'component', null,       v_hinge, 2, 5);   -- hardware added by hand
  perform reprice_product(v_model);
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 800, 720, 580, 40, true) returning id into v_size;
  insert into clients (full_name, phone) values ('TEST client 20c', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;
  -- what the app would send for three drawn items
  std  := '{"item_no":"1","code":"test-20c","description":"80","width_mm":800,"height_mm":720.2,"depth_mm":579.8,"lines":[]}';
  wide := '{"item_no":"2","code":"TEST-20C","description":"90","width_mm":900,"height_mm":720,"depth_mm":580,"lines":[
     {"line_type":"panel","part_name":"Left_Side#201","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_left","pos_x_mm":9,"pos_y_mm":290,"pos_z_mm":360,"cuts_json":[{"k":1}]},
     {"line_type":"panel","part_name":"Right_Side#202","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_right"},
     {"line_type":"panel","part_name":"Bottom#33","width_mm":864,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"bottom"},
     {"line_type":"panel","part_name":"Shelf#5","width_mm":864,"height_mm":560,"depth_mm":18,"qty":1,"part_role":"shelf"},
     {"line_type":"component","part_name":"t20c-leg","qty":4},
     {"line_type":"component","part_name":"T20C-CH","qty":0.9},
     {"line_type":"component","part_name":"T20C-ODD","qty":1}]}';
  unk  := '{"item_no":"3","code":"NOPE-1","description":"island","width_mm":1200,"height_mm":900,"depth_mm":600,"lines":[{"line_type":"panel","part_name":"Top","width_mm":1200,"height_mm":600,"depth_mm":18,"qty":1}]}';

  update products set default_panel_id = null where id = v_model;
  select * into r from quote_import_preview(jsonb_build_array(wide));
  res := format('no default board: price %s "%s"', r.list_price_jod, r.warning);
  update products set default_panel_id = v_b where id = v_model;
  select * into r from quote_import_preview(jsonb_build_array(
    jsonb_set(wide, '{lines}', (wide->'lines') || '[{"line_type":"component","part_name":"T20C-MYSTERY","qty":2}]'::jsonb)));
  res := res || format(' | unknown fitting: price %s "%s"', r.list_price_jod, r.warning);
  select * into r from quote_import_preview(jsonb_build_array(wide || '{"lines":[]}'::jsonb));
  res := res || format(' | nothing drawn: price %s "%s"', r.list_price_jod, r.warning);
  raise exception 'RESULT I4 -> %', res;
end $$;

-- ===== I5: the import writes one line per drawn item =======================
-- Wanted: 3 lines in "Kitchen" | 1: TEST-20C "TEST model 20c" 800x720x580 standard 40.000 list 40.000 parts 0
--         | 2: TEST-20C "TEST model 20c" 900x720x580 parts 53.000 list 53.000 parts 8 warning "1 panel(s) are not in the model: default board, no banding"
--         | 3: NOPE-1 "NOPE-1 island" 1200x900x600 manual 0.000 list none parts 0 warning "Not in the catalogue: type a price"
--         | subtotal 93.000 | add again: 6 lines, subtotal 186.000 | replace the section: 1 line, subtotal 53.000
--         | a typed line in another section is still there: yes | parts left without a line: 0
do $$
declare v_client uuid; v_q uuid; v_a uuid; v_b uuid; v_band uuid; v_leg uuid; v_ch uuid;
        v_hinge uuid; v_acc uuid; v_model uuid; v_old uuid; v_size uuid;
        std jsonb; wide jsonb; unk jsonb;
        r record; res text := ''; n int; s numeric; n2 int; s2 numeric; n3 int; s3 numeric; keep int;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board A', 'component', 2440, 1220, 22.5) returning id into v_a;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board B', 'component', 2800, 2070, 58) returning id into v_b;
  insert into banding_types (name, price_per_m_jod) values ('TEST band 20c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST leg', 'component', 'T20C-LEG', 'pcs', 0.6) returning id into v_leg;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST channel', 'component', 'T20C-CH', 'm', 2) returning id into v_ch;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST accessory', 'component', 9) returning id into v_acc;
  insert into products (name_en, name_ar, code, item_kind, labor_jod, margin_pct, default_panel_id, width_mm, height_mm, depth_mm)
    values ('TEST model 20c', 'نموذج', 'TEST-20C', 'product', 5, 30, v_b, 800, 720, 580) returning id into v_model;
  insert into products (name_en, code, item_kind, is_active) values ('TEST retired 20c', 'TEST-20C-OLD', 'product', false) returning id into v_old;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, banding_type_id, banded_length_m, qty, sort_order) values
    (v_model, 'panel', v_a,  'Left_Side#114',  720, 580, v_band, 1.44,  1, 0),
    (v_model, 'panel', v_a,  'Right_Side#115', 720, 580, v_band, 1.44,  1, 1),
    (v_model, 'panel', null, 'Bottom#7',       764, 580, v_band, 0.764, 1, 2);
  insert into bom_lines (product_id, line_type, part_name, component_id, qty, sort_order) values
    (v_model, 'component', 'T20C-LEG', v_leg,   4, 3),
    (v_model, 'component', 'T20C-ODD', v_acc,   1, 4),   -- a link made by hand
    (v_model, 'component', null,       v_hinge, 2, 5);   -- hardware added by hand
  perform reprice_product(v_model);
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 800, 720, 580, 40, true) returning id into v_size;
  insert into clients (full_name, phone) values ('TEST client 20c', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;
  -- what the app would send for three drawn items
  std  := '{"item_no":"1","code":"test-20c","description":"80","width_mm":800,"height_mm":720.2,"depth_mm":579.8,"lines":[]}';
  wide := '{"item_no":"2","code":"TEST-20C","description":"90","width_mm":900,"height_mm":720,"depth_mm":580,"lines":[
     {"line_type":"panel","part_name":"Left_Side#201","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_left","pos_x_mm":9,"pos_y_mm":290,"pos_z_mm":360,"cuts_json":[{"k":1}]},
     {"line_type":"panel","part_name":"Right_Side#202","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_right"},
     {"line_type":"panel","part_name":"Bottom#33","width_mm":864,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"bottom"},
     {"line_type":"panel","part_name":"Shelf#5","width_mm":864,"height_mm":560,"depth_mm":18,"qty":1,"part_role":"shelf"},
     {"line_type":"component","part_name":"t20c-leg","qty":4},
     {"line_type":"component","part_name":"T20C-CH","qty":0.9},
     {"line_type":"component","part_name":"T20C-ODD","qty":1}]}';
  unk  := '{"item_no":"3","code":"NOPE-1","description":"island","width_mm":1200,"height_mm":900,"depth_mm":600,"lines":[{"line_type":"panel","part_name":"Top","width_mm":1200,"height_mm":600,"depth_mm":18,"qty":1}]}';

  insert into quotation_items (quotation_id, description, qty, unit_price_jod, section) values (v_q, 'TEST typed line', 1, 0, 'Bedroom');
  perform quotation_import_items(v_q, jsonb_build_array(std, wide, unk), ' Kitchen ');
  for r in select i.*, (select count(*) from quotation_item_parts t where t.quotation_item_id = i.id) as np
           from quotation_items i where i.quotation_id = v_q and i.section = 'Kitchen' order by i.sort_order loop
    res := res || format(' | %s: %s "%s" %sx%sx%s %s %s list %s parts %s%s', r.item_no, r.code, r.description, r.width_mm, r.height_mm, r.depth_mm,
      r.price_source, r.unit_price_jod, coalesce(r.list_price_jod::text, 'none'), r.np, coalesce(' warning "' || r.price_warning || '"', ''));
  end loop;
  select count(*) into n from quotation_items where quotation_id = v_q and section = 'Kitchen';
  select subtotal_jod into s from quotations where id = v_q;
  perform quotation_import_items(v_q, jsonb_build_array(std, wide, unk), 'Kitchen', false);
  select count(*) into n2 from quotation_items where quotation_id = v_q and section = 'Kitchen';
  select subtotal_jod into s2 from quotations where id = v_q;
  perform quotation_import_items(v_q, jsonb_build_array(wide), 'Kitchen', true);
  select count(*) into n3 from quotation_items where quotation_id = v_q and section = 'Kitchen';
  select subtotal_jod into s3 from quotations where id = v_q;
  select count(*) into keep from quotation_items where quotation_id = v_q and section = 'Bedroom';
  raise exception 'RESULT I5 -> % lines in "Kitchen"% | subtotal % | add again: % lines, subtotal % | replace the section: % line, subtotal % | a typed line in another section is still there: % | parts left without a line: %',
    n, res, s, n2, s2, n3, s3, case when keep = 1 then 'yes' else 'NO' end,
    (select count(*) from quotation_item_parts t where not exists (select 1 from quotation_items i where i.id = t.quotation_item_id));
end $$;

-- ===== I6: all or nothing; only a draft ====================================
-- Wanted: one bad item among three: REFUSED, lines written 0 | empty list REFUSED | sent quotation REFUSED, still 1 line
--         | replace on a sent quotation REFUSED, still 1 line
do $$
declare v_client uuid; v_q uuid; v_a uuid; v_b uuid; v_band uuid; v_leg uuid; v_ch uuid;
        v_hinge uuid; v_acc uuid; v_model uuid; v_old uuid; v_size uuid;
        std jsonb; wide jsonb; unk jsonb;
        res text := ''; n int;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board A', 'component', 2440, 1220, 22.5) returning id into v_a;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board B', 'component', 2800, 2070, 58) returning id into v_b;
  insert into banding_types (name, price_per_m_jod) values ('TEST band 20c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST leg', 'component', 'T20C-LEG', 'pcs', 0.6) returning id into v_leg;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST channel', 'component', 'T20C-CH', 'm', 2) returning id into v_ch;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST accessory', 'component', 9) returning id into v_acc;
  insert into products (name_en, name_ar, code, item_kind, labor_jod, margin_pct, default_panel_id, width_mm, height_mm, depth_mm)
    values ('TEST model 20c', 'نموذج', 'TEST-20C', 'product', 5, 30, v_b, 800, 720, 580) returning id into v_model;
  insert into products (name_en, code, item_kind, is_active) values ('TEST retired 20c', 'TEST-20C-OLD', 'product', false) returning id into v_old;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, banding_type_id, banded_length_m, qty, sort_order) values
    (v_model, 'panel', v_a,  'Left_Side#114',  720, 580, v_band, 1.44,  1, 0),
    (v_model, 'panel', v_a,  'Right_Side#115', 720, 580, v_band, 1.44,  1, 1),
    (v_model, 'panel', null, 'Bottom#7',       764, 580, v_band, 0.764, 1, 2);
  insert into bom_lines (product_id, line_type, part_name, component_id, qty, sort_order) values
    (v_model, 'component', 'T20C-LEG', v_leg,   4, 3),
    (v_model, 'component', 'T20C-ODD', v_acc,   1, 4),   -- a link made by hand
    (v_model, 'component', null,       v_hinge, 2, 5);   -- hardware added by hand
  perform reprice_product(v_model);
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 800, 720, 580, 40, true) returning id into v_size;
  insert into clients (full_name, phone) values ('TEST client 20c', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;
  -- what the app would send for three drawn items
  std  := '{"item_no":"1","code":"test-20c","description":"80","width_mm":800,"height_mm":720.2,"depth_mm":579.8,"lines":[]}';
  wide := '{"item_no":"2","code":"TEST-20C","description":"90","width_mm":900,"height_mm":720,"depth_mm":580,"lines":[
     {"line_type":"panel","part_name":"Left_Side#201","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_left","pos_x_mm":9,"pos_y_mm":290,"pos_z_mm":360,"cuts_json":[{"k":1}]},
     {"line_type":"panel","part_name":"Right_Side#202","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_right"},
     {"line_type":"panel","part_name":"Bottom#33","width_mm":864,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"bottom"},
     {"line_type":"panel","part_name":"Shelf#5","width_mm":864,"height_mm":560,"depth_mm":18,"qty":1,"part_role":"shelf"},
     {"line_type":"component","part_name":"t20c-leg","qty":4},
     {"line_type":"component","part_name":"T20C-CH","qty":0.9},
     {"line_type":"component","part_name":"T20C-ODD","qty":1}]}';
  unk  := '{"item_no":"3","code":"NOPE-1","description":"island","width_mm":1200,"height_mm":900,"depth_mm":600,"lines":[{"line_type":"panel","part_name":"Top","width_mm":1200,"height_mm":600,"depth_mm":18,"qty":1}]}';

  begin perform quotation_import_items(v_q, jsonb_build_array(std, wide, wide || '{"width_mm":"wide"}'::jsonb), 'Kitchen');
        res := 'one bad item among three: ALLOWED (wrong)';
  exception when others then res := 'one bad item among three: REFUSED'; end;
  select count(*) into n from quotation_items where quotation_id = v_q;
  res := res || format(', lines written %s', n);
  begin perform quotation_import_items(v_q, '[]'::jsonb, 'Kitchen');
        res := res || ' | empty list ALLOWED (wrong)';
  exception when raise_exception then res := res || ' | empty list REFUSED'; end;
  perform quotation_import_items(v_q, jsonb_build_array(wide), 'Kitchen');
  update quotations set status = 'sent' where id = v_q;
  begin perform quotation_import_items(v_q, jsonb_build_array(std), 'Kitchen');
        res := res || ' | sent quotation ALLOWED (wrong)';
  exception when raise_exception then res := res || ' | sent quotation REFUSED'; end;
  select count(*) into n from quotation_items where quotation_id = v_q;
  res := res || format(', still %s line', n);
  begin perform quotation_import_items(v_q, jsonb_build_array(std), 'Kitchen', true);
        res := res || ' | replace on a sent quotation ALLOWED (wrong)';
  exception when raise_exception then res := res || ' | replace on a sent quotation REFUSED'; end;
  select count(*) into n from quotation_items where quotation_id = v_q;
  raise exception 'RESULT I6 -> %, still % line', res, n;
end $$;

-- ===== I7: parts and warnings cannot be forged =============================
-- Wanted: part added by hand REFUSED | part changed REFUSED | part deleted REFUSED | warning typed on a new line: none
--         | warning rewritten: still "Not in the catalogue: type a price" | warning cleared: none
--         | price source after a direct edit: parts, list 53.000, cost 40.458, charged 60.000
--         | line deleted: its parts 0 | quotation deleted: lines 0
do $$
declare v_client uuid; v_q uuid; v_a uuid; v_b uuid; v_band uuid; v_leg uuid; v_ch uuid;
        v_hinge uuid; v_acc uuid; v_model uuid; v_old uuid; v_size uuid;
        std jsonb; wide jsonb; unk jsonb;
        l quotation_items; u quotation_items; m quotation_items; res text := ''; w1 text; w2 text; w3 text; n int; n2 int;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board A', 'component', 2440, 1220, 22.5) returning id into v_a;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board B', 'component', 2800, 2070, 58) returning id into v_b;
  insert into banding_types (name, price_per_m_jod) values ('TEST band 20c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST leg', 'component', 'T20C-LEG', 'pcs', 0.6) returning id into v_leg;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST channel', 'component', 'T20C-CH', 'm', 2) returning id into v_ch;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST accessory', 'component', 9) returning id into v_acc;
  insert into products (name_en, name_ar, code, item_kind, labor_jod, margin_pct, default_panel_id, width_mm, height_mm, depth_mm)
    values ('TEST model 20c', 'نموذج', 'TEST-20C', 'product', 5, 30, v_b, 800, 720, 580) returning id into v_model;
  insert into products (name_en, code, item_kind, is_active) values ('TEST retired 20c', 'TEST-20C-OLD', 'product', false) returning id into v_old;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, banding_type_id, banded_length_m, qty, sort_order) values
    (v_model, 'panel', v_a,  'Left_Side#114',  720, 580, v_band, 1.44,  1, 0),
    (v_model, 'panel', v_a,  'Right_Side#115', 720, 580, v_band, 1.44,  1, 1),
    (v_model, 'panel', null, 'Bottom#7',       764, 580, v_band, 0.764, 1, 2);
  insert into bom_lines (product_id, line_type, part_name, component_id, qty, sort_order) values
    (v_model, 'component', 'T20C-LEG', v_leg,   4, 3),
    (v_model, 'component', 'T20C-ODD', v_acc,   1, 4),   -- a link made by hand
    (v_model, 'component', null,       v_hinge, 2, 5);   -- hardware added by hand
  perform reprice_product(v_model);
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 800, 720, 580, 40, true) returning id into v_size;
  insert into clients (full_name, phone) values ('TEST client 20c', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;
  -- what the app would send for three drawn items
  std  := '{"item_no":"1","code":"test-20c","description":"80","width_mm":800,"height_mm":720.2,"depth_mm":579.8,"lines":[]}';
  wide := '{"item_no":"2","code":"TEST-20C","description":"90","width_mm":900,"height_mm":720,"depth_mm":580,"lines":[
     {"line_type":"panel","part_name":"Left_Side#201","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_left","pos_x_mm":9,"pos_y_mm":290,"pos_z_mm":360,"cuts_json":[{"k":1}]},
     {"line_type":"panel","part_name":"Right_Side#202","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_right"},
     {"line_type":"panel","part_name":"Bottom#33","width_mm":864,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"bottom"},
     {"line_type":"panel","part_name":"Shelf#5","width_mm":864,"height_mm":560,"depth_mm":18,"qty":1,"part_role":"shelf"},
     {"line_type":"component","part_name":"t20c-leg","qty":4},
     {"line_type":"component","part_name":"T20C-CH","qty":0.9},
     {"line_type":"component","part_name":"T20C-ODD","qty":1}]}';
  unk  := '{"item_no":"3","code":"NOPE-1","description":"island","width_mm":1200,"height_mm":900,"depth_mm":600,"lines":[{"line_type":"panel","part_name":"Top","width_mm":1200,"height_mm":600,"depth_mm":18,"qty":1}]}';

  select * into l from quotation_import_items(v_q, jsonb_build_array(wide), 'Kitchen');
  select * into u from quotation_import_items(v_q, jsonb_build_array(unk), 'Kitchen');
  begin insert into quotation_item_parts (quotation_item_id, line_type, part_name, qty) values (l.id, 'panel', 'TEST forged', 1);
        res := 'part added by hand ALLOWED (wrong)';
  exception when raise_exception then res := 'part added by hand REFUSED'; end;
  begin update quotation_item_parts set qty = 9 where quotation_item_id = l.id;
        res := res || ' | part changed ALLOWED (wrong)';
  exception when raise_exception then res := res || ' | part changed REFUSED'; end;
  begin delete from quotation_item_parts where quotation_item_id = l.id;
        res := res || ' | part deleted ALLOWED (wrong)';
  exception when raise_exception then res := res || ' | part deleted REFUSED'; end;
  insert into quotation_items (quotation_id, description, qty, unit_price_jod, price_warning)
    values (v_q, 'TEST typed line', 1, 1, 'TEST forged warning') returning price_warning into w1;
  update quotation_items set price_warning = 'all fine' where id = u.id returning price_warning into w2;
  update quotation_items set price_warning = null where id = u.id returning price_warning into w3;
  update quotation_items set price_source = 'manual', list_price_jod = 1, unit_cost_jod = 1, unit_price_jod = 60 where id = l.id returning * into m;
  delete from quotation_items where id = l.id;
  select count(*) into n from quotation_item_parts where quotation_item_id = l.id;
  delete from quotations where id = v_q;
  select count(*) into n2 from quotation_items where quotation_id = v_q;
  raise exception 'RESULT I7 -> % | warning typed on a new line: % | warning rewritten: still "%" | warning cleared: % | price source after a direct edit: %, list %, cost %, charged % | line deleted: its parts % | quotation deleted: lines %',
    res, coalesce(w1, 'none'), w2, coalesce(w3, 'none'), m.price_source, m.list_price_jod, m.unit_cost_jod, m.unit_price_jod, n, n2;
end $$;

-- ===== I8: a revision keeps the parts and the warnings =====================
-- Wanted: revision lines 2 | parts 8 and 0 | warning on the unknown line "Not in the catalogue: type a price"
--         | totals 53.000 and 53.000 | the original keeps its 8 parts | parts of the sent original REFUSED to be deleted
--         | lines of the sent original REFUSED to be deleted | board B cannot be deleted while quoted: REFUSED
do $$
declare v_client uuid; v_q uuid; v_a uuid; v_b uuid; v_band uuid; v_leg uuid; v_ch uuid;
        v_hinge uuid; v_acc uuid; v_model uuid; v_old uuid; v_size uuid;
        std jsonb; wide jsonb; unk jsonb;
        v_r uuid; res text := ''; n1 int; n2 int; n0 int; w text; t0 numeric; t1 numeric;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board A', 'component', 2440, 1220, 22.5) returning id into v_a;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board B', 'component', 2800, 2070, 58) returning id into v_b;
  insert into banding_types (name, price_per_m_jod) values ('TEST band 20c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST leg', 'component', 'T20C-LEG', 'pcs', 0.6) returning id into v_leg;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST channel', 'component', 'T20C-CH', 'm', 2) returning id into v_ch;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST accessory', 'component', 9) returning id into v_acc;
  insert into products (name_en, name_ar, code, item_kind, labor_jod, margin_pct, default_panel_id, width_mm, height_mm, depth_mm)
    values ('TEST model 20c', 'نموذج', 'TEST-20C', 'product', 5, 30, v_b, 800, 720, 580) returning id into v_model;
  insert into products (name_en, code, item_kind, is_active) values ('TEST retired 20c', 'TEST-20C-OLD', 'product', false) returning id into v_old;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, banding_type_id, banded_length_m, qty, sort_order) values
    (v_model, 'panel', v_a,  'Left_Side#114',  720, 580, v_band, 1.44,  1, 0),
    (v_model, 'panel', v_a,  'Right_Side#115', 720, 580, v_band, 1.44,  1, 1),
    (v_model, 'panel', null, 'Bottom#7',       764, 580, v_band, 0.764, 1, 2);
  insert into bom_lines (product_id, line_type, part_name, component_id, qty, sort_order) values
    (v_model, 'component', 'T20C-LEG', v_leg,   4, 3),
    (v_model, 'component', 'T20C-ODD', v_acc,   1, 4),   -- a link made by hand
    (v_model, 'component', null,       v_hinge, 2, 5);   -- hardware added by hand
  perform reprice_product(v_model);
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 800, 720, 580, 40, true) returning id into v_size;
  insert into clients (full_name, phone) values ('TEST client 20c', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;
  -- what the app would send for three drawn items
  std  := '{"item_no":"1","code":"test-20c","description":"80","width_mm":800,"height_mm":720.2,"depth_mm":579.8,"lines":[]}';
  wide := '{"item_no":"2","code":"TEST-20C","description":"90","width_mm":900,"height_mm":720,"depth_mm":580,"lines":[
     {"line_type":"panel","part_name":"Left_Side#201","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_left","pos_x_mm":9,"pos_y_mm":290,"pos_z_mm":360,"cuts_json":[{"k":1}]},
     {"line_type":"panel","part_name":"Right_Side#202","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_right"},
     {"line_type":"panel","part_name":"Bottom#33","width_mm":864,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"bottom"},
     {"line_type":"panel","part_name":"Shelf#5","width_mm":864,"height_mm":560,"depth_mm":18,"qty":1,"part_role":"shelf"},
     {"line_type":"component","part_name":"t20c-leg","qty":4},
     {"line_type":"component","part_name":"T20C-CH","qty":0.9},
     {"line_type":"component","part_name":"T20C-ODD","qty":1}]}';
  unk  := '{"item_no":"3","code":"NOPE-1","description":"island","width_mm":1200,"height_mm":900,"depth_mm":600,"lines":[{"line_type":"panel","part_name":"Top","width_mm":1200,"height_mm":600,"depth_mm":18,"qty":1}]}';

  perform quotation_import_items(v_q, jsonb_build_array(wide, unk), 'Kitchen');
  update quotations set status = 'sent' where id = v_q;
  v_r := revise_quotation(v_q);
  select count(*) into n1 from quotation_item_parts t join quotation_items i on i.id = t.quotation_item_id where i.quotation_id = v_r and i.item_no = '2';
  select count(*) into n2 from quotation_item_parts t join quotation_items i on i.id = t.quotation_item_id where i.quotation_id = v_r and i.item_no = '3';
  select count(*) into n0 from quotation_item_parts t join quotation_items i on i.id = t.quotation_item_id where i.quotation_id = v_q;
  select price_warning into w from quotation_items where quotation_id = v_r and item_no = '3';
  select total_jod into t0 from quotations where id = v_q;
  select total_jod into t1 from quotations where id = v_r;
  begin delete from quotation_item_parts t using quotation_items i where i.id = t.quotation_item_id and i.quotation_id = v_q;
        res := 'parts of the sent original ALLOWED to be deleted (wrong)';
  exception when raise_exception then res := 'parts of the sent original REFUSED to be deleted'; end;
  begin delete from quotation_items where quotation_id = v_q;
        res := res || ' | lines of the sent original ALLOWED to be deleted (wrong)';
  exception when raise_exception then res := res || ' | lines of the sent original REFUSED to be deleted'; end;
  begin update products set default_panel_id = null where id = v_model;
        delete from products where id = v_b;
        res := res || ' | board B cannot be deleted while quoted: ALLOWED (wrong)';
  exception when foreign_key_violation then res := res || ' | board B cannot be deleted while quoted: REFUSED'; end;
  raise exception 'RESULT I8 -> revision lines % | parts % and % | warning on the unknown line "%" | totals % and % | the original keeps its % parts | %',
    (select count(*) from quotation_items where quotation_id = v_r), n1, n2, w, t0, t1, n0, res;
end $$;

-- ===== I9: who can do it ==================================================
-- Wanted: factory worker: preview says unknown, price none | import REFUSED | sees 0 parts
--         | office user: preview parts 53.000 | import ok, 8 parts | revise ok, 8 parts
do $$
declare v_client uuid; v_q uuid; v_a uuid; v_b uuid; v_band uuid; v_leg uuid; v_ch uuid;
        v_hinge uuid; v_acc uuid; v_model uuid; v_old uuid; v_size uuid;
        std jsonb; wide jsonb; unk jsonb;
        uid uuid; fid uuid; r record; res text := ''; l quotation_items; n int; v_r uuid; v_q2 uuid;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board A', 'component', 2440, 1220, 22.5) returning id into v_a;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board B', 'component', 2800, 2070, 58) returning id into v_b;
  insert into banding_types (name, price_per_m_jod) values ('TEST band 20c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST leg', 'component', 'T20C-LEG', 'pcs', 0.6) returning id into v_leg;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST channel', 'component', 'T20C-CH', 'm', 2) returning id into v_ch;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST accessory', 'component', 9) returning id into v_acc;
  insert into products (name_en, name_ar, code, item_kind, labor_jod, margin_pct, default_panel_id, width_mm, height_mm, depth_mm)
    values ('TEST model 20c', 'نموذج', 'TEST-20C', 'product', 5, 30, v_b, 800, 720, 580) returning id into v_model;
  insert into products (name_en, code, item_kind, is_active) values ('TEST retired 20c', 'TEST-20C-OLD', 'product', false) returning id into v_old;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, banding_type_id, banded_length_m, qty, sort_order) values
    (v_model, 'panel', v_a,  'Left_Side#114',  720, 580, v_band, 1.44,  1, 0),
    (v_model, 'panel', v_a,  'Right_Side#115', 720, 580, v_band, 1.44,  1, 1),
    (v_model, 'panel', null, 'Bottom#7',       764, 580, v_band, 0.764, 1, 2);
  insert into bom_lines (product_id, line_type, part_name, component_id, qty, sort_order) values
    (v_model, 'component', 'T20C-LEG', v_leg,   4, 3),
    (v_model, 'component', 'T20C-ODD', v_acc,   1, 4),   -- a link made by hand
    (v_model, 'component', null,       v_hinge, 2, 5);   -- hardware added by hand
  perform reprice_product(v_model);
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 800, 720, 580, 40, true) returning id into v_size;
  insert into clients (full_name, phone) values ('TEST client 20c', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;
  -- what the app would send for three drawn items
  std  := '{"item_no":"1","code":"test-20c","description":"80","width_mm":800,"height_mm":720.2,"depth_mm":579.8,"lines":[]}';
  wide := '{"item_no":"2","code":"TEST-20C","description":"90","width_mm":900,"height_mm":720,"depth_mm":580,"lines":[
     {"line_type":"panel","part_name":"Left_Side#201","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_left","pos_x_mm":9,"pos_y_mm":290,"pos_z_mm":360,"cuts_json":[{"k":1}]},
     {"line_type":"panel","part_name":"Right_Side#202","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_right"},
     {"line_type":"panel","part_name":"Bottom#33","width_mm":864,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"bottom"},
     {"line_type":"panel","part_name":"Shelf#5","width_mm":864,"height_mm":560,"depth_mm":18,"qty":1,"part_role":"shelf"},
     {"line_type":"component","part_name":"t20c-leg","qty":4},
     {"line_type":"component","part_name":"T20C-CH","qty":0.9},
     {"line_type":"component","part_name":"T20C-ODD","qty":1}]}';
  unk  := '{"item_no":"3","code":"NOPE-1","description":"island","width_mm":1200,"height_mm":900,"depth_mm":600,"lines":[{"line_type":"panel","part_name":"Top","width_mm":1200,"height_mm":600,"depth_mm":18,"qty":1}]}';

  select p.id into uid from public.profiles p where p.role = 'admin' and p.is_active order by p.created_at limit 1;
  if uid is null then raise exception 'SETUP: no active admin profile'; end if;
  select u.id into fid from auth.users u where u.email = 'factory.test@alloy.test';
  if fid is null then raise exception 'SETUP: test user factory.test@alloy.test not found'; end if;
  update public.profiles set role = 'factory_worker', is_active = true where id = fid;
  perform quotation_import_items(v_q, jsonb_build_array(wide), 'Kitchen');

  perform set_config('request.jwt.claims', json_build_object('sub', fid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.quote_import_preview(jsonb_build_array(wide));
  res := format('factory worker: preview says %s, price %s', r.status, coalesce(r.list_price_jod::text, 'none'));
  begin perform public.quotation_import_items(v_q, jsonb_build_array(wide), 'Kitchen');
        res := res || ' | import ALLOWED (wrong)';
  exception when others then res := res || ' | import REFUSED'; end;
  select count(*) into n from public.quotation_item_parts;
  res := res || format(' | sees %s parts', n);

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select * into r from public.quote_import_preview(jsonb_build_array(wide));
  res := res || format(' | office user: preview %s %s', r.status, r.list_price_jod);
  insert into public.quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q2;
  select * into l from public.quotation_import_items(v_q2, jsonb_build_array(wide), 'Kitchen');
  select count(*) into n from public.quotation_item_parts where quotation_item_id = l.id;
  res := res || format(' | import ok, %s parts', n);
  update public.quotations set status = 'sent' where id = v_q2;
  v_r := public.revise_quotation(v_q2);
  select count(*) into n from public.quotation_item_parts t join public.quotation_items i on i.id = t.quotation_item_id where i.quotation_id = v_r;
  raise exception 'RESULT I9 -> % | revise ok, % parts', res, n;
end $$;

-- ===== I10: a quoted line remembers; the catalogue still re-prices itself ===
-- Wanted: before: model 43.000, quoted 53.000 | board A doubles: model 51.500, quoted still 53.000, preview now 61.500
--         | the standard line still 40.000
do $$
declare v_client uuid; v_q uuid; v_a uuid; v_b uuid; v_band uuid; v_leg uuid; v_ch uuid;
        v_hinge uuid; v_acc uuid; v_model uuid; v_old uuid; v_size uuid;
        std jsonb; wide jsonb; unk jsonb;
        l quotation_items; c0 numeric; c1 numeric; q1 numeric; pv numeric; st numeric; same text;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board A', 'component', 2440, 1220, 22.5) returning id into v_a;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board B', 'component', 2800, 2070, 58) returning id into v_b;
  insert into banding_types (name, price_per_m_jod) values ('TEST band 20c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST leg', 'component', 'T20C-LEG', 'pcs', 0.6) returning id into v_leg;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST channel', 'component', 'T20C-CH', 'm', 2) returning id into v_ch;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST accessory', 'component', 9) returning id into v_acc;
  insert into products (name_en, name_ar, code, item_kind, labor_jod, margin_pct, default_panel_id, width_mm, height_mm, depth_mm)
    values ('TEST model 20c', 'نموذج', 'TEST-20C', 'product', 5, 30, v_b, 800, 720, 580) returning id into v_model;
  insert into products (name_en, code, item_kind, is_active) values ('TEST retired 20c', 'TEST-20C-OLD', 'product', false) returning id into v_old;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, banding_type_id, banded_length_m, qty, sort_order) values
    (v_model, 'panel', v_a,  'Left_Side#114',  720, 580, v_band, 1.44,  1, 0),
    (v_model, 'panel', v_a,  'Right_Side#115', 720, 580, v_band, 1.44,  1, 1),
    (v_model, 'panel', null, 'Bottom#7',       764, 580, v_band, 0.764, 1, 2);
  insert into bom_lines (product_id, line_type, part_name, component_id, qty, sort_order) values
    (v_model, 'component', 'T20C-LEG', v_leg,   4, 3),
    (v_model, 'component', 'T20C-ODD', v_acc,   1, 4),   -- a link made by hand
    (v_model, 'component', null,       v_hinge, 2, 5);   -- hardware added by hand
  perform reprice_product(v_model);
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 800, 720, 580, 40, true) returning id into v_size;
  insert into clients (full_name, phone) values ('TEST client 20c', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;
  -- what the app would send for three drawn items
  std  := '{"item_no":"1","code":"test-20c","description":"80","width_mm":800,"height_mm":720.2,"depth_mm":579.8,"lines":[]}';
  wide := '{"item_no":"2","code":"TEST-20C","description":"90","width_mm":900,"height_mm":720,"depth_mm":580,"lines":[
     {"line_type":"panel","part_name":"Left_Side#201","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_left","pos_x_mm":9,"pos_y_mm":290,"pos_z_mm":360,"cuts_json":[{"k":1}]},
     {"line_type":"panel","part_name":"Right_Side#202","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_right"},
     {"line_type":"panel","part_name":"Bottom#33","width_mm":864,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"bottom"},
     {"line_type":"panel","part_name":"Shelf#5","width_mm":864,"height_mm":560,"depth_mm":18,"qty":1,"part_role":"shelf"},
     {"line_type":"component","part_name":"t20c-leg","qty":4},
     {"line_type":"component","part_name":"T20C-CH","qty":0.9},
     {"line_type":"component","part_name":"T20C-ODD","qty":1}]}';
  unk  := '{"item_no":"3","code":"NOPE-1","description":"island","width_mm":1200,"height_mm":900,"depth_mm":600,"lines":[{"line_type":"panel","part_name":"Top","width_mm":1200,"height_mm":600,"depth_mm":18,"qty":1}]}';

  perform quotation_import_items(v_q, jsonb_build_array(std), 'Kitchen');
  select * into l from quotation_import_items(v_q, jsonb_build_array(wide), 'Kitchen');
  select unit_price_jod into c0 from products where id = v_model;
  update products set sheet_price_jod = 45 where id = v_a;
  select unit_price_jod into c1 from products where id = v_model;
  select unit_price_jod into q1 from quotation_items where id = l.id;
  select list_price_jod into pv from quote_import_preview(jsonb_build_array(wide));
  select unit_price_jod into st from quotation_items where quotation_id = v_q and item_no = '1';
  raise exception 'RESULT I10 -> before: model %, quoted % | board A doubles: model %, quoted still %, preview now % | the standard line still %',
    c0, l.unit_price_jod, c1, q1, pv, st;
end $$;

-- ===== I11: bad input is refused, never priced (20c review) ================
-- Wanted: negative panel REFUSED | panel of width 0 REFUSED | fitting with quantity -1 REFUSED
--         | part of an unknown kind REFUSED | item with no size REFUSED | item of width 0 REFUSED
--         | a number instead of an item REFUSED | an empty item REFUSED | lines written 0
--         | replace with no section name REFUSED, the typed line is still there: yes
--         | a panel that is not in the model is said: "1 panel(s) are not in the model: default board, no banding"
--         | hand-linked accessory deactivated: price 41.000 "1 panel(s) are not in the model: default board, no banding; 1 fitting(s) not linked to a component"
--         | 799.5 wide counts as 800: standard
do $$
declare v_client uuid; v_q uuid; v_a uuid; v_b uuid; v_band uuid; v_leg uuid; v_ch uuid;
        v_hinge uuid; v_acc uuid; v_model uuid; v_old uuid; v_size uuid;
        std jsonb; wide jsonb; unk jsonb;
        res text := ''; r record; n int; keep int; t text;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board A', 'component', 2440, 1220, 22.5) returning id into v_a;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board B', 'component', 2800, 2070, 58) returning id into v_b;
  insert into banding_types (name, price_per_m_jod) values ('TEST band 20c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST leg', 'component', 'T20C-LEG', 'pcs', 0.6) returning id into v_leg;
  insert into products (name_en, item_kind, code, unit, unit_price_jod) values ('TEST channel', 'component', 'T20C-CH', 'm', 2) returning id into v_ch;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into products (name_en, item_kind, unit_price_jod) values ('TEST accessory', 'component', 9) returning id into v_acc;
  insert into products (name_en, name_ar, code, item_kind, labor_jod, margin_pct, default_panel_id, width_mm, height_mm, depth_mm)
    values ('TEST model 20c', 'نموذج', 'TEST-20C', 'product', 5, 30, v_b, 800, 720, 580) returning id into v_model;
  insert into products (name_en, code, item_kind, is_active) values ('TEST retired 20c', 'TEST-20C-OLD', 'product', false) returning id into v_old;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, banding_type_id, banded_length_m, qty, sort_order) values
    (v_model, 'panel', v_a,  'Left_Side#114',  720, 580, v_band, 1.44,  1, 0),
    (v_model, 'panel', v_a,  'Right_Side#115', 720, 580, v_band, 1.44,  1, 1),
    (v_model, 'panel', null, 'Bottom#7',       764, 580, v_band, 0.764, 1, 2);
  insert into bom_lines (product_id, line_type, part_name, component_id, qty, sort_order) values
    (v_model, 'component', 'T20C-LEG', v_leg,   4, 3),
    (v_model, 'component', 'T20C-ODD', v_acc,   1, 4),   -- a link made by hand
    (v_model, 'component', null,       v_hinge, 2, 5);   -- hardware added by hand
  perform reprice_product(v_model);
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm, price_jod, price_overridden)
    values (v_model, 800, 720, 580, 40, true) returning id into v_size;
  insert into clients (full_name, phone) values ('TEST client 20c', '0790000000') returning id into v_client;
  insert into quotations (client_id, tax_pct) values (v_client, 0) returning id into v_q;
  -- what the app would send for three drawn items
  std  := '{"item_no":"1","code":"test-20c","description":"80","width_mm":800,"height_mm":720.2,"depth_mm":579.8,"lines":[]}';
  wide := '{"item_no":"2","code":"TEST-20C","description":"90","width_mm":900,"height_mm":720,"depth_mm":580,"lines":[
     {"line_type":"panel","part_name":"Left_Side#201","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_left","pos_x_mm":9,"pos_y_mm":290,"pos_z_mm":360,"cuts_json":[{"k":1}]},
     {"line_type":"panel","part_name":"Right_Side#202","width_mm":720,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"side_right"},
     {"line_type":"panel","part_name":"Bottom#33","width_mm":864,"height_mm":580,"depth_mm":18,"qty":1,"part_role":"bottom"},
     {"line_type":"panel","part_name":"Shelf#5","width_mm":864,"height_mm":560,"depth_mm":18,"qty":1,"part_role":"shelf"},
     {"line_type":"component","part_name":"t20c-leg","qty":4},
     {"line_type":"component","part_name":"T20C-CH","qty":0.9},
     {"line_type":"component","part_name":"T20C-ODD","qty":1}]}';
  unk  := '{"item_no":"3","code":"NOPE-1","description":"island","width_mm":1200,"height_mm":900,"depth_mm":600,"lines":[{"line_type":"panel","part_name":"Top","width_mm":1200,"height_mm":600,"depth_mm":18,"qty":1}]}';

  insert into quotation_items (quotation_id, description, qty, unit_price_jod) values (v_q, 'TEST typed line, no section', 1, 5);
  foreach t in array array[
    'negative panel|' || jsonb_set(wide, '{lines}', (wide->'lines') || '[{"line_type":"panel","part_name":"x","width_mm":-700,"height_mm":580,"qty":1}]'::jsonb)::text,
    'panel of width 0|' || jsonb_set(wide, '{lines}', (wide->'lines') || '[{"line_type":"panel","part_name":"x","width_mm":0,"height_mm":580,"qty":1}]'::jsonb)::text,
    'fitting with quantity -1|' || jsonb_set(wide, '{lines}', (wide->'lines') || '[{"line_type":"component","part_name":"T20C-LEG","qty":-1}]'::jsonb)::text,
    'part of an unknown kind|' || jsonb_set(wide, '{lines}', (wide->'lines') || '[{"line_type":"door","part_name":"x","qty":1}]'::jsonb)::text,
    'item with no size|' || (wide - 'depth_mm')::text,
    'item of width 0|' || (wide || '{"width_mm":0}'::jsonb)::text,
    'a number instead of an item|42',
    'an empty item|{}'] loop
    begin
      perform * from quote_import_preview(jsonb_build_array(split_part(t, '|', 2)::jsonb));
      perform quotation_import_items(v_q, jsonb_build_array(split_part(t, '|', 2)::jsonb), 'Kitchen');
      res := res || split_part(t, '|', 1) || ' ALLOWED (wrong) | ';
    exception when raise_exception then res := res || split_part(t, '|', 1) || ' REFUSED | '; end;
  end loop;
  select count(*) into n from quotation_items where quotation_id = v_q;
  res := res || format('lines written %s', n - 1);
  begin perform quotation_import_items(v_q, jsonb_build_array(wide), ' ', true);
        res := res || ' | replace with no section name ALLOWED (wrong)';
  exception when raise_exception then res := res || ' | replace with no section name REFUSED'; end;
  select count(*) into keep from quotation_items where quotation_id = v_q and description = 'TEST typed line, no section';
  res := res || format(', the typed line is still there: %s', case when keep = 1 then 'yes' else 'NO' end);
  select * into r from quote_import_preview(jsonb_build_array(wide));
  res := res || format(' | a panel that is not in the model is said: "%s"', r.warning);
  update products set is_active = false where id = v_acc;
  select * into r from quote_import_preview(jsonb_build_array(wide));
  res := res || format(' | hand-linked accessory deactivated: price %s "%s"', r.list_price_jod, r.warning);
  select * into r from quote_import_preview(jsonb_build_array(std || '{"width_mm":799.5}'::jsonb));
  res := res || format(' | 799.5 wide counts as 800: %s', r.status);
  raise exception 'RESULT I11 -> %', res;
end $$;
