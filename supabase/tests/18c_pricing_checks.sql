-- Stage 18c pricing checks.
-- Paste ONE block at a time into the Supabase SQL editor and run it.
-- Each block builds throw-away rows, shows "RESULT ..." as a red message, and
-- that error undoes everything the block did. Nothing is left in the database.
-- Run AFTER the 18c migration is applied.

-- ===== P1: the worked example must match lib/pricing.test.ts ===============
-- Wanted: materials 7.826 | components 3.500 | base 11.326 | price 21.500 | stored 21.500
do $$
declare v_board uuid; v_hinge uuid; v_band uuid; v_model uuid; r record; v_stored numeric;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board', 'component', 2440, 1220, 22.5) returning id into v_board;
  insert into products (name_en, item_kind, unit_price_jod)
    values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into banding_types (name, price_per_m_jod)
    values ('TEST band 18c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, labor_jod, margin_pct)
    values ('TEST model', 'product', 5, 30) returning id into v_model;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm,
                         banding_type_id, banded_length_m, qty)
    values (v_model, 'panel', v_board, 'side', 720, 580, v_band, 1.44, 2);
  insert into bom_lines (product_id, line_type, component_id, qty)
    values (v_model, 'component', v_hinge, 2);
  perform reprice_product(v_model);
  select * into r from price_bom(v_model, null);
  select unit_price_jod into v_stored from products where id = v_model;
  raise exception 'RESULT P1 -> materials % | components % | base % | price % | stored %',
    r.materials, r.components, r.base, r.calc_price, v_stored;
end $$;

-- ===== P2: default board, and a board price change re-prices the model =====
-- Wanted: with default board 21.500 | after board price doubles 30.500
do $$
declare v_board uuid; v_hinge uuid; v_band uuid; v_model uuid; a numeric; b numeric;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board', 'component', 2440, 1220, 22.5) returning id into v_board;
  insert into products (name_en, item_kind, unit_price_jod)
    values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into banding_types (name, price_per_m_jod)
    values ('TEST band 18c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, labor_jod, margin_pct)
    values ('TEST model', 'product', 5, 30) returning id into v_model;
  -- the panel line has NO board chosen: it must use the model's default board
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm,
                         banding_type_id, banded_length_m, qty)
    values (v_model, 'panel', null, 'side', 720, 580, v_band, 1.44, 2);
  insert into bom_lines (product_id, line_type, component_id, qty)
    values (v_model, 'component', v_hinge, 2);
  update products set default_panel_id = v_board where id = v_model;   -- trigger re-prices
  select unit_price_jod into a from products where id = v_model;
  update products set sheet_price_jod = 45 where id = v_board;         -- trigger re-prices
  select unit_price_jod into b from products where id = v_model;
  raise exception 'RESULT P2 -> with default board % | after board price doubles %', a, b;
end $$;

-- ===== P3: a typed price is never changed; a model with no parts keeps its price
-- Wanted: overridden stays 99.000 (calculated 21.500) | no-parts model stays 25.000
do $$
declare v_board uuid; v_model uuid; v_empty uuid; a numeric; c numeric; e numeric;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board', 'component', 2440, 1220, 22.5) returning id into v_board;
  insert into products (name_en, item_kind, labor_jod, margin_pct, unit_price_jod, price_overridden)
    values ('TEST model', 'product', 14.5, 0, 99, true) returning id into v_model;
  insert into bom_lines (product_id, line_type, panel_id, part_name, width_mm, height_mm, qty)
    values (v_model, 'panel', v_board, 'side', 720, 580, 2);
  perform reprice_product(v_model);
  select unit_price_jod, calc_price_jod into a, c from products where id = v_model;
  insert into products (name_en, item_kind, unit_price_jod)
    values ('TEST empty', 'product', 25) returning id into v_empty;
  perform reprice_product(v_empty);
  update products set labor_jod = 3 where id = v_empty;                -- trigger re-prices
  select unit_price_jod into e from products where id = v_empty;
  raise exception 'RESULT P3 -> overridden stays % (calculated %) | no-parts model stays %', a, c, e;
end $$;

-- ===== P4: a standard size is calculated from its own parts ================
-- Wanted: size calculated 21.500, price 21.500 | after typing 30 -> 30.000 | back to calculated -> 21.500
do $$
declare v_board uuid; v_hinge uuid; v_band uuid; v_model uuid; v_size uuid;
        c1 numeric; p1 numeric; p2 numeric; p3 numeric;
begin
  update pricing_settings set waste_pct = 8, rounding_step_jod = 0.5;
  insert into products (name_en, item_kind, sheet_length_mm, sheet_width_mm, sheet_price_jod)
    values ('TEST board', 'component', 2440, 1220, 22.5) returning id into v_board;
  insert into products (name_en, item_kind, unit_price_jod)
    values ('TEST hinge', 'component', 1.75) returning id into v_hinge;
  insert into banding_types (name, price_per_m_jod)
    values ('TEST band 18c', 0.35) returning id into v_band;
  insert into products (name_en, item_kind, labor_jod, margin_pct, default_panel_id)
    values ('TEST model', 'product', 5, 30, v_board) returning id into v_model;
  insert into product_sizes (product_id, width_mm, height_mm, depth_mm)
    values (v_model, 600, 720, 560) returning id into v_size;
  insert into bom_lines (product_id, size_id, line_type, part_name, width_mm, height_mm,
                         banding_type_id, banded_length_m, qty)
    values (v_model, v_size, 'panel', 'side', 720, 580, v_band, 1.44, 2);
  insert into bom_lines (product_id, size_id, line_type, component_id, qty)
    values (v_model, v_size, 'component', v_hinge, 2);
  perform reprice_product(v_model);
  select calc_price_jod, price_jod into c1, p1 from product_sizes where id = v_size;
  update product_sizes set price_jod = 30, price_overridden = true where id = v_size;
  perform reprice_product(v_model);
  select price_jod into p2 from product_sizes where id = v_size;
  update product_sizes set price_overridden = false where id = v_size;
  select price_jod into p3 from product_sizes where id = v_size;
  raise exception 'RESULT P4 -> size calculated %, price % | after typing 30 -> % | back to calculated -> %',
    c1, p1, p2, p3;
end $$;
