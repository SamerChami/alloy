-- Stage 18a — products.code: the join key between SketchUp names and the catalogue
-- One catalogue entry per code (a cabinet MODEL, not a size). Case-insensitive.
-- Materials, components and hand-made products may leave it empty.

alter table public.products add column code text;

alter table public.products
  add constraint products_code_clean
  check (code is null or (code = btrim(code) and code <> ''));

create unique index products_code_unique
  on public.products (lower(code))
  where code is not null;

-- Back-fill products that came from a SketchUp import: code = text before the
-- first "/" of the name. Rows whose code would collide with another row are
-- left empty for a human to decide.
update public.products p
set code = btrim(split_part(p.name_en, '/', 1))
where p.code is null
  and p.item_kind = 'product'
  and p.source = 'sketchup_json'
  and btrim(split_part(p.name_en, '/', 1)) <> ''
  and not exists (
    select 1 from public.products q
    where q.id <> p.id
      and q.item_kind = 'product'
      and q.source = 'sketchup_json'
      and lower(btrim(split_part(q.name_en, '/', 1))) = lower(btrim(split_part(p.name_en, '/', 1)))
  );
