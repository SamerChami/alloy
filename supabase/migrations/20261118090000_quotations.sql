-- Stage 20a — Quotations: the database half
--
-- Decisions (Samer left these to Claude, 18 Nov 2026):
--   * line prices are BEFORE tax; sales tax (default 16 %) is added on top and
--     can be changed per quotation
--   * one discount on the whole quotation, typed as a percentage or as JOD
--   * every line keeps its own price; how prices are shown to the client
--     (per line / per section / one total) is a print choice per quotation
--   * built by hand first; the SketchUp project import (Stage 20c) fills the
--     same tables
--
-- Rules this file enforces:
--   * a line REMEMBERS what was quoted (code, names, size, list price, cost):
--     later catalogue changes never change an existing quotation
--   * subtotal, discount, tax and total are computed by the database only;
--     whatever the app sends in those four columns is overwritten
--       discount = percent: subtotal x value / 100   |  amount: value (never more than the subtotal)
--       tax      = (subtotal - discount) x tax % / 100
--       total    = subtotal - discount + tax            (all rounded to fils)
--   * only a DRAFT can be changed or deleted. Once sent, the lines, client,
--     discount, tax and dates of issue are frozen; to change them, send it
--     back to draft or make a revision
--   * status flow: draft -> sent -> approved | rejected | expired, sent -> draft

-- ---------------------------------------------------------------------------
-- 1. Settings: default tax and validity for NEW quotations
-- ---------------------------------------------------------------------------
alter table public.pricing_settings
  add column quote_tax_pct       numeric(5,2) not null default 16
    check (quote_tax_pct >= 0 and quote_tax_pct <= 100),
  add column quote_validity_days integer      not null default 30
    check (quote_validity_days >= 0 and quote_validity_days <= 3650);

-- ---------------------------------------------------------------------------
-- 2. Quotation header
-- ---------------------------------------------------------------------------
alter table public.quotations
  add column title          text,
  add column discount_kind  text          not null default 'amount'
    check (discount_kind in ('amount', 'percent')),
  add column discount_value numeric(12,3) not null default 0
    check (discount_value >= 0),
  add column price_display  text          not null default 'lines'
    check (price_display in ('lines', 'sections', 'total')),
  add column root_id        uuid references public.quotations(id) on delete restrict,
  add column revision       integer       not null default 1 check (revision >= 1),
  add column sent_at        timestamptz,
  add column decided_at     timestamptz;

-- Any quotation already there keeps its fixed discount.
update public.quotations set discount_value = discount_jod where discount_jod > 0;

alter table public.quotations
  add constraint quotations_discount_percent_max
    check (discount_kind <> 'percent' or discount_value <= 100),
  add constraint quotations_tax_pct_range
    check (tax_pct >= 0 and tax_pct <= 100);

-- The default now comes from pricing_settings (filled by the trigger below).
alter table public.quotations alter column tax_pct drop default;

-- One number per revision inside a family (the original is revision 1).
create unique index quotations_family_revision
  on public.quotations (coalesce(root_id, id), revision);
create index idx_quotations_project on public.quotations (project_id)
  where project_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Quotation lines: a snapshot of what was quoted
-- ---------------------------------------------------------------------------
alter table public.quotation_items
  add column section        text,            -- e.g. "Kitchen", "Master bedroom"
  add column item_no        text,            -- the number written before the code in SketchUp
  add column code           text,            -- product code at the time of quoting
  add column description_ar text,
  add column width_mm       numeric(10,0) check (width_mm  > 0),
  add column height_mm      numeric(10,0) check (height_mm > 0),
  add column depth_mm       numeric(10,0) check (depth_mm  > 0),
  add column size_id        uuid references public.product_sizes(id) on delete set null,
  -- where list_price_jod came from:
  --   standard  = a standard size's price      catalogue = the model's own price
  --   parts     = priced from the cabinet's own parts (Stage 20c)
  --   manual    = a line typed by hand
  add column price_source   text not null default 'manual'
    check (price_source in ('standard', 'catalogue', 'parts', 'manual')),
  add column list_price_jod numeric(12,3) check (list_price_jod >= 0),
  add column unit_cost_jod  numeric(12,3) check (unit_cost_jod  >= 0),
  add column notes          text;

alter table public.quotation_items
  add constraint quotation_items_qty_positive   check (qty > 0),
  add constraint quotation_items_price_not_negative check (unit_price_jod >= 0);

-- A catalogue item that is on any quotation cannot be deleted (deactivate it
-- instead; the app already says so). Was ON DELETE SET NULL, which the draft
-- lock below would refuse with a confusing message (20a review).
alter table public.quotation_items
  drop constraint quotation_items_product_id_fkey,
  add constraint quotation_items_product_id_fkey
    foreign key (product_id) references public.products(id) on delete restrict;

create index idx_quote_items_product on public.quotation_items (product_id)
  where product_id is not null;
create index idx_quote_items_size on public.quotation_items (size_id)
  where size_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Header trigger: defaults, lock, status flow, totals
-- ---------------------------------------------------------------------------
drop trigger trg_quote_items_totals on public.quotation_items;
drop function public.recompute_quotation_totals();

create function public.quotations_before_write()
  returns trigger
  language plpgsql
  set search_path to 'public'
as $function$
declare
  v_tax  numeric;
  v_days integer;
  v_sub  numeric;
  v_disc numeric;
  v_net  numeric;
  v_root_code text;
  v_root_of   uuid;
  v_rev       integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A new quotation starts as a draft.';
    end if;
    -- The number and the revision come from the database only, also on insert
    -- (20a review). trg_quote_code fires after this trigger (name order) and
    -- gives an original its next QUO number.
    if new.root_id is null then
      new.code     := null;
      new.revision := 1;
    else
      select q.code, q.root_id into v_root_code, v_root_of
      from quotations q where q.id = new.root_id
      for no key update;                       -- one revision at a time per family
      if not found or v_root_of is not null then
        raise exception 'A revision must point to the original quotation of its family.';
      end if;
      select max(q.revision) + 1 into v_rev
      from quotations q where q.id = new.root_id or q.root_id = new.root_id;
      new.revision := v_rev;
      new.code     := v_root_code || '-R' || v_rev;
    end if;
    if new.tax_pct is null or new.valid_until is null then
      select s.quote_tax_pct, s.quote_validity_days into v_tax, v_days
      from pricing_settings s limit 1;
      if new.tax_pct is null then
        new.tax_pct := coalesce(v_tax, 16);
      end if;
      if new.valid_until is null then
        new.valid_until := new.issue_date + coalesce(v_days, 30);
      end if;
    end if;
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    new.sent_at    := null;
    new.decided_at := null;

  else
    -- never change, whatever the status
    if new.id         is distinct from old.id
    or new.created_at is distinct from old.created_at
    or new.code     is distinct from old.code
    or new.root_id  is distinct from old.root_id
    or new.revision is distinct from old.revision then
      raise exception 'The quotation number and revision cannot be changed.';
    end if;

    if new.status is distinct from old.status then
      if not ( (old.status = 'draft' and new.status = 'sent')
            or (old.status = 'sent'  and new.status in ('draft', 'approved', 'rejected', 'expired')) ) then
        raise exception 'A quotation cannot go from % to %.', old.status, new.status;
      end if;
      if new.status = 'sent'
         and not exists (select 1 from quotation_items i where i.quotation_id = new.id) then
        raise exception 'Quotation % has no lines and cannot be sent.', old.code;
      end if;
      if new.status = 'sent' then
        new.sent_at := now();  new.decided_at := null;
      elsif new.status = 'draft' then
        new.sent_at := null;   new.decided_at := null;
      else
        new.sent_at := old.sent_at;  new.decided_at := now();
      end if;
    else
      new.sent_at    := old.sent_at;
      new.decided_at := old.decided_at;
    end if;

    if old.status <> 'draft' then
      -- Frozen. Status, notes, validity date and the print choice may still change.
      if new.client_id      is distinct from old.client_id
      or new.project_id     is distinct from old.project_id
      or new.title          is distinct from old.title
      or new.issue_date     is distinct from old.issue_date
      or new.discount_kind  is distinct from old.discount_kind
      or new.discount_value is distinct from old.discount_value
      or new.tax_pct        is distinct from old.tax_pct
      or new.created_by     is distinct from old.created_by then
        raise exception 'Quotation % is % and cannot be changed. Send it back to draft or make a revision.',
          old.code, old.status;
      end if;
      new.subtotal_jod := old.subtotal_jod;
      new.discount_jod := old.discount_jod;
      new.tax_jod      := old.tax_jod;
      new.total_jod    := old.total_jod;
      return new;
    end if;
  end if;

  -- Draft (or a draft being sent right now): the database works out the money.
  select coalesce(sum(i.line_total_jod), 0) into v_sub
  from quotation_items i where i.quotation_id = new.id;

  v_disc := case when new.discount_kind = 'percent'
                 then round(v_sub * new.discount_value / 100.0, 3)
                 else least(new.discount_value, v_sub) end;
  v_net  := v_sub - v_disc;

  new.subtotal_jod := v_sub;
  new.discount_jod := v_disc;
  new.tax_jod      := round(v_net * new.tax_pct / 100.0, 3);
  new.total_jod    := v_net + new.tax_jod;
  return new;
end $function$;

create trigger trg_quotations_write
  before insert or update on public.quotations
  for each row execute function public.quotations_before_write();

create function public.quotations_before_delete()
  returns trigger
  language plpgsql
  set search_path to 'public'
as $function$
begin
  if old.status <> 'draft' then
    raise exception 'Quotation % is % and cannot be deleted. Only a draft can be deleted.',
      old.code, old.status;
  end if;
  return old;
end $function$;

create trigger trg_quotations_delete
  before delete on public.quotations
  for each row execute function public.quotations_before_delete();

-- ---------------------------------------------------------------------------
-- 5. Line triggers: lines change only while the quotation is a draft, and
--    every change makes the header work its totals out again
-- ---------------------------------------------------------------------------
create function public.quotation_items_guard()
  returns trigger
  language plpgsql
  set search_path to 'public'
as $function$
declare
  v_qid    uuid := case when tg_op = 'INSERT' then new.quotation_id else old.quotation_id end;
  v_status quote_status;
  v_code   text;
  -- 'on' only inside quotation_add_product / revise_quotation (see section 6)
  v_writer boolean := coalesce(current_setting('alloy.quote_line_writer', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and new.quotation_id is distinct from old.quotation_id then
    raise exception 'A line cannot be moved to another quotation.';
  end if;

  -- Lock the quotation row (20a review): otherwise another session could send
  -- it between this check and the line's commit, leaving a line on a sent
  -- quotation whose frozen totals do not include it.
  select q.status, q.code into v_status, v_code from quotations q where q.id = v_qid
  for no key update;
  -- Not found = the quotation itself is being deleted (its lines go with it;
  -- quotations_before_delete has already checked it is a draft).
  if found and v_status <> 'draft' then
    -- One thing may still happen to a frozen line: the standard size it was
    -- quoted from is deleted from the catalogue (size_id ON DELETE SET NULL).
    -- The line keeps its own size and price, so nothing quoted changes.
    if tg_op = 'UPDATE' and old.size_id is not null and new.size_id is null
       -- (line_total_jod is generated: not filled in yet on NEW in a BEFORE trigger)
       and (to_jsonb(new) - 'size_id' - 'line_total_jod')
         = (to_jsonb(old) - 'size_id' - 'line_total_jod') then
      return new;
    end if;
    raise exception 'Quotation % is % and its lines cannot be changed. Send it back to draft or make a revision.',
      v_code, v_status;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Where a line's price came from is recorded by the database only, so later
  -- margin reports can trust it (20a review). A line the app writes directly
  -- is a hand-typed line; on a catalogue line the app may change the price
  -- charged, qty, texts and size, never the catalogue facts.
  if not v_writer then
    if tg_op = 'INSERT' then
      new.price_source   := 'manual';
      new.product_id     := null;
      new.size_id        := null;
      new.list_price_jod := null;
    else
      new.price_source   := old.price_source;
      new.product_id     := old.product_id;
      new.list_price_jod := old.list_price_jod;
      if new.size_id is not null then
        new.size_id := old.size_id;          -- may only be cleared
      end if;
      if old.price_source <> 'manual' then
        new.code          := old.code;
        new.unit_cost_jod := old.unit_cost_jod;
      end if;
    end if;
  end if;
  return new;
end $function$;

create trigger trg_quote_items_guard
  before insert or update or delete on public.quotation_items
  for each row execute function public.quotation_items_guard();

create function public.quotation_items_touch()
  returns trigger
  language plpgsql
  set search_path to 'public'
as $function$
begin
  -- An empty-looking update: trg_quotations_write recomputes the totals.
  update quotations set updated_at = now()
  where id = case when tg_op = 'DELETE' then old.quotation_id else new.quotation_id end;
  return null;
end $function$;

create trigger trg_quote_items_touch
  after insert or update or delete on public.quotation_items
  for each row execute function public.quotation_items_touch();

-- ---------------------------------------------------------------------------
-- 6. Add a catalogue item to a draft: the database copies code, names, size,
--    price and cost onto the line (the app never sends a catalogue price).
--    Only this function and revise_quotation switch on the transaction-local
--    setting alloy.quote_line_writer, which lets quotation_items_guard accept
--    catalogue facts. The app talks to the database through the API, which
--    cannot change settings, so it cannot switch it on.
--    p_size_id null = the model as it is in the catalogue.
-- ---------------------------------------------------------------------------
create function public.quotation_add_product(
  p_quotation_id uuid,
  p_product_id   uuid,
  p_size_id      uuid    default null,
  p_qty          numeric default 1,
  p_section      text    default null
)
  returns public.quotation_items
  language plpgsql
  set search_path to 'public'
as $function$
declare
  p      products%rowtype;
  s      product_sizes%rowtype;
  b      record;
  v_w    numeric;  v_h numeric;  v_d numeric;
  v_list numeric;  v_cost numeric;
  v_src  text;
  v_sort integer;
  r      quotation_items%rowtype;
begin
  select * into p from products where id = p_product_id;
  if not found then
    raise exception 'Catalogue item not found.';
  end if;
  if not p.is_active then
    raise exception '% is deactivated and cannot be quoted.', p.name_en;
  end if;

  if p_size_id is not null then
    select * into s from product_sizes where id = p_size_id and product_id = p_product_id;
    if not found then
      raise exception 'That standard size does not belong to %.', p.name_en;
    end if;
    v_w := s.width_mm;  v_h := s.height_mm;  v_d := s.depth_mm;
    v_list := s.price_jod;
    v_src  := 'standard';
    select * into b from price_bom(p_product_id, p_size_id);
    v_cost := case when b.line_count > 0 then b.base + coalesce(p.labor_jod, 0) end;
  else
    v_w := round(p.width_mm);  v_h := round(p.height_mm);  v_d := round(p.depth_mm);
    v_list := p.unit_price_jod;
    v_src  := 'catalogue';
    if p.item_kind = 'product' then
      select * into b from price_bom(p_product_id, null);
      v_cost := case when b.line_count > 0 then b.base + coalesce(p.labor_jod, 0) end;
    else
      v_cost := p.cost_jod;
    end if;
  end if;

  select coalesce(max(i.sort_order), 0) + 1 into v_sort
  from quotation_items i where i.quotation_id = p_quotation_id;

  perform set_config('alloy.quote_line_writer', 'on', true);
  insert into quotation_items
    (quotation_id, product_id, size_id, section, code, description, description_ar,
     width_mm, height_mm, depth_mm, qty, unit_price_jod, list_price_jod, unit_cost_jod,
     price_source, sort_order)
  values
    (p_quotation_id, p_product_id, p_size_id, nullif(btrim(p_section), ''), p.code,
     p.name_en, p.name_ar,
     nullif(v_w, 0), nullif(v_h, 0), nullif(v_d, 0),
     coalesce(p_qty, 1), v_list, v_list, v_cost, v_src, v_sort)
  returning * into r;
  perform set_config('alloy.quote_line_writer', 'off', true);
  return r;
end $function$;

-- ---------------------------------------------------------------------------
-- 7. Revision: a new draft copied from any quotation of the family.
--    QUO-2026-0007 -> QUO-2026-0007-R2 -> QUO-2026-0007-R3 ...
--    Lines are copied exactly as quoted. The source is left untouched.
-- ---------------------------------------------------------------------------
create function public.revise_quotation(p_quotation_id uuid)
  returns uuid
  language plpgsql
  set search_path to 'public'
as $function$
declare
  src       quotations%rowtype;
  v_root    uuid;
  v_code    text;
  v_rev     integer;
  v_new     uuid;
begin
  select * into src from quotations where id = p_quotation_id;
  if not found then
    raise exception 'Quotation not found.';
  end if;
  v_root := coalesce(src.root_id, src.id);

  -- one revision at a time per family
  select q.code into v_code from quotations q where q.id = v_root for update;
  select max(q.revision) + 1 into v_rev
  from quotations q where q.id = v_root or q.root_id = v_root;

  insert into quotations
    (code, client_id, project_id, title, notes, discount_kind, discount_value,
     tax_pct, price_display, root_id, revision)
  values
    (v_code || '-R' || v_rev, src.client_id, src.project_id, src.title, src.notes,
     src.discount_kind, src.discount_value, src.tax_pct, src.price_display,
     v_root, v_rev)
  returning id into v_new;

  perform set_config('alloy.quote_line_writer', 'on', true);
  insert into quotation_items
    (quotation_id, product_id, size_id, section, item_no, code, description, description_ar,
     width_mm, height_mm, depth_mm, qty, unit_price_jod, list_price_jod, unit_cost_jod,
     price_source, notes, sort_order)
  select v_new, i.product_id, i.size_id, i.section, i.item_no, i.code, i.description,
         i.description_ar, i.width_mm, i.height_mm, i.depth_mm, i.qty, i.unit_price_jod,
         i.list_price_jod, i.unit_cost_jod, i.price_source, i.notes, i.sort_order
  from quotation_items i
  where i.quotation_id = p_quotation_id
  order by i.sort_order, i.id;
  perform set_config('alloy.quote_line_writer', 'off', true);

  return v_new;
end $function$;

-- ---------------------------------------------------------------------------
-- 8. Rights. Row access is already office-only (policies quotations_office and
--    quote_items_office from the baseline); the functions run with the
--    caller's rights, so those policies apply inside them too.
-- ---------------------------------------------------------------------------
revoke all on table public.quotations, public.quotation_items from anon, authenticated;
grant select, insert, update, delete
  on table public.quotations, public.quotation_items to authenticated;

revoke all on function public.quotations_before_write()   from public, anon, authenticated;
revoke all on function public.quotations_before_delete()  from public, anon, authenticated;
revoke all on function public.quotation_items_guard()     from public, anon, authenticated;
revoke all on function public.quotation_items_touch()     from public, anon, authenticated;
revoke all on function public.quotation_add_product(uuid, uuid, uuid, numeric, text) from public, anon;
revoke all on function public.revise_quotation(uuid)      from public, anon;
grant execute on function public.quotation_add_product(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.revise_quotation(uuid)   to authenticated;
