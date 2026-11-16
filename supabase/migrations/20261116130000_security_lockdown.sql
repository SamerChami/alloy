-- Stage 17d — Security lockdown
-- Written against the live baseline 20261116120553_remote_schema.sql.
-- Changes access rules only. No table data is modified, no column is dropped.

-- ---------------------------------------------------------------------------
-- 1. Role functions must ignore deactivated users; add is_staff()
-- ---------------------------------------------------------------------------
create or replace function public.current_role_of(uid uuid)
  returns public.user_role
  language sql stable security definer
  set search_path to 'public'
as $function$
  select role from profiles where id = uid and is_active;
$function$;

create or replace function public.is_admin()
  returns boolean
  language sql stable security definer
  set search_path to 'public'
as $function$
  select coalesce((select role = 'admin' from profiles
                   where id = auth.uid() and is_active), false);
$function$;

create or replace function public.is_office()
  returns boolean
  language sql stable security definer
  set search_path to 'public'
as $function$
  select coalesce((select role in
    ('admin','sales_manager','design_manager','production_manager','analyzing_manager')
    from profiles where id = auth.uid() and is_active), false);
$function$;

create or replace function public.is_staff()
  returns boolean
  language sql stable security definer
  set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = auth.uid() and is_active);
$function$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. profiles: a user may edit their own row but never role / is_active / id
-- ---------------------------------------------------------------------------
drop policy "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.guard_profile_privileges()
  returns trigger
  language plpgsql security definer
  set search_path to 'public'
as $function$
begin
  -- auth.uid() is null for the dashboard / SQL editor / service role:
  -- those are the owner's own tools and stay unrestricted.
  if auth.uid() is not null
     and not public.is_admin()
     and (new.role      is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.id        is distinct from old.id) then
    raise exception 'Only an admin can change role or active status';
  end if;
  return new;
end $function$;

create trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- New profile rows start with the least access, not as an office manager.
alter table public.profiles alter column role set default 'installation';

-- ---------------------------------------------------------------------------
-- 3. "Logged in" is not enough: reads require an ACTIVE staff profile
-- ---------------------------------------------------------------------------
alter policy "all authenticated read banding_types" on public.banding_types
  using (public.is_staff());
alter policy "products_read" on public.products
  using (public.is_staff());
alter policy "projects_read" on public.projects
  using (public.is_staff());
alter policy "stock_read" on public.stock_movements
  using (public.is_staff());
-- A user can always read their own row (the app layout needs it to detect
-- "deactivated" and sign the user out).
alter policy "profiles_read" on public.profiles
  using (public.is_staff() or id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Document numbering: works through the trigger only
--    (code_counters has RLS on and no policies, so the trigger function must
--     run with owner rights; nobody may call next_code() directly.)
-- ---------------------------------------------------------------------------
create or replace function public.assign_code()
  returns trigger
  language plpgsql security definer
  set search_path to 'public'
as $function$
begin
  if new.code is null then
    new.code := next_code(tg_argv[0]);
  end if;
  return new;
end $function$;

revoke execute on function public.next_code(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Stock movements by factory workers must actually change stock
-- ---------------------------------------------------------------------------
create or replace function public.apply_stock_movement()
  returns trigger
  language plpgsql security definer
  set search_path to 'public'
as $function$
begin
  update products set stock_qty = stock_qty + new.delta_qty where id = new.product_id;
  return new;
end $function$;

-- ---------------------------------------------------------------------------
-- 6. Low-stock view obeys RLS; visitors who are not logged in get nothing
-- ---------------------------------------------------------------------------
alter view public.low_stock_products set (security_invoker = true);

revoke all on all tables in schema public from anon;

-- Tables and views created by later migrations must not hand rights to
-- visitors who are not logged in (added on the 17d review's recommendation).
alter default privileges in schema public revoke all on tables from anon;
