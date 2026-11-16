# DB Baseline Drift Report — Stage 17a

Baseline: `supabase/migrations/20261116120553_remote_schema.sql` (live database, `public` schema; the `auth,storage` pull found no changes).
Compared against: `db/01_schema.sql` … `db/09_cuts.sql`.
Method: read-only comparison of the files. Nothing was run against the live database.

**Headline:** the table, column, index, trigger and policy structure matches `db/` exactly. The drift is in the *security posture*: three things exist live that `db/` never described or never intended (items 3, 6, 8), and one policy gap is inherited from `db/` (item 4).

---

## 1. Tables

16 tables in the baseline: `banding_types`, `bom_lines`, `clients`, `code_counters`, `contracts`, `invoice_items`, `invoices`, `payments`, `products`, `profiles`, `projects`, `quotation_items`, `quotations`, `stock_movements`, `suppliers`, `tasks`.

- In baseline but not in `db/`: **none**.
- In `db/` but not in baseline: **none**.

(`code_counters` is created in `03_seed.sql`; `banding_types`/`bom_lines` in `05_bom.sql`.)

## 2. Columns

Checked `products`, `bom_lines`, `profiles`, `quotations`, `quotation_items`, `invoices`, `payments`. Every column, type, nullability and default matches `db/` (including the later additions from `04`–`09`). Column *order* differs only because `db/` added columns with `ALTER`; irrelevant.

- Missing from baseline: none. Extra in baseline: none. Type/default differences: none.
- **Does `products` have a `code` column? No** (as expected). Its identifiers are `id`, `sku` (`UNIQUE`), `name_en`, `name_ar`:

      CREATE TABLE "public"."products" (
        "id"      uuid NOT NULL DEFAULT gen_random_uuid(),
        "sku"     text,
        "name_en" text NOT NULL,
        "name_ar" text,
        CONSTRAINT "products_pkey" PRIMARY KEY (id),
        CONSTRAINT "products_sku_key" UNIQUE (sku)
      );

  The `code` join key in the SketchUp importer is therefore not a DB column today.

## 3. RLS on/off

RLS is **enabled on all 16 tables** (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for each).

- **`code_counters`: RLS enabled, and it has ZERO policies.**
  - **Drift:** `db/02_rls.sql` never enabled RLS on `code_counters` (it is not in its list; `03_seed.sql` creates the table with no RLS). Someone enabled it live, probably through the dashboard.
  - With RLS on and no policy, ordinary users cannot read or write the table. `next_code()` is `SECURITY INVOKER` (item 5) and inserts into `code_counters`, so code generation (`ALY-/QUO-/INV-/CON-`) would be denied for non-owner roles. This contradicts the app working today, so **verify live before 17d** (e.g. insert a quotation as a normal user). Do not "fix" it blind: the right fix is probably `SECURITY DEFINER` on `next_code`, which is a 17d decision.

## 4. Policies

24 policies. All are `TO PUBLIC` (no role scoping). Format: table — name — command — USING / WITH CHECK.

| Table | Policy | Cmd | USING | WITH CHECK |
|---|---|---|---|---|
| banding_types | all authenticated read banding_types | SELECT | `(auth.uid() IS NOT NULL)` ⚠ | — |
| banding_types | office write banding_types | ALL | `public.is_office()` | `public.is_office()` |
| bom_lines | factory_worker read bom_lines | SELECT | `(public.current_role_of(auth.uid()) = 'factory_worker'::public.user_role)` | — |
| bom_lines | office full access bom_lines | ALL | `public.is_office()` | `public.is_office()` |
| clients | clients_office | ALL | `public.is_office()` | `public.is_office()` |
| contracts | contracts_office | ALL | `public.is_office()` | `public.is_office()` |
| invoice_items | invoice_items_office | ALL | `public.is_office()` | `public.is_office()` |
| invoices | invoices_office | ALL | `public.is_office()` | `public.is_office()` |
| payments | payments_office | ALL | `public.is_office()` | `public.is_office()` |
| products | products_office_write | ALL | `public.is_office()` | `public.is_office()` |
| products | products_read | SELECT | `(auth.uid() IS NOT NULL)` ⚠ | — |
| profiles | profiles_admin | ALL | `public.is_admin()` | `public.is_admin()` |
| profiles | profiles_read | SELECT | `(auth.uid() IS NOT NULL)` ⚠ | — |
| profiles | profiles_self | UPDATE | `(id = auth.uid())` | **none** |
| projects | projects_office_write | ALL | `public.is_office()` | `public.is_office()` |
| projects | projects_read | SELECT | `(auth.uid() IS NOT NULL)` ⚠ | — |
| quotation_items | quote_items_office | ALL | `public.is_office()` | `public.is_office()` |
| quotations | quotations_office | ALL | `public.is_office()` | `public.is_office()` |
| stock_movements | stock_read | SELECT | `(auth.uid() IS NOT NULL)` ⚠ | — |
| stock_movements | stock_write | INSERT | — | `(public.is_office() OR (public.current_role_of(auth.uid()) = 'factory_worker'::public.user_role))` |
| suppliers | suppliers_office | ALL | `public.is_office()` | `public.is_office()` |
| tasks | tasks_office | ALL | `public.is_office()` | `public.is_office()` |
| tasks | tasks_read_own | SELECT | `(assigned_to = auth.uid())` | — |
| tasks | tasks_update_own | UPDATE | `(assigned_to = auth.uid())` | `(assigned_to = auth.uid())` |

**`profiles` policies, quoted in full:**

    CREATE POLICY "profiles_admin" ON "public"."profiles"
      FOR ALL TO PUBLIC
      USING (public.is_admin())
      WITH CHECK (public.is_admin());

    CREATE POLICY "profiles_read" ON "public"."profiles"
      FOR SELECT TO PUBLIC
      USING ((auth.uid() IS NOT NULL));

    CREATE POLICY "profiles_self" ON "public"."profiles"
      FOR UPDATE TO PUBLIC
      USING ((id = auth.uid()));

**Flagged — USING is only `auth.uid() IS NOT NULL` (5):** `banding_types` read, `products_read`, `profiles_read`, `projects_read`, `stock_read`. Any logged-in user, including `factory_worker` and `installation`, can read every row of these tables. Intended for products/projects per `db/02_rls.sql` comments; worth a conscious decision for `profiles` (exposes everyone's phone, role, active flag).

**Security finding — `profiles_self`:** `UPDATE` with `USING (id = auth.uid())` and **no `WITH CHECK`**, and RLS does not restrict columns. Any logged-in user can update their own `role` to `admin` and `is_active`. This is identical in `db/02_rls.sql` (inherited, not drift) but it is the most serious item in this report. Candidate for 17d.

## 5. Functions

All ten exist in the baseline and in `db/`.

| Function | Present | Security | search_path |
|---|---|---|---|
| current_role_of(uuid) | yes | **SECURITY DEFINER** | `SET search_path TO 'public'` |
| is_admin() | yes | **SECURITY DEFINER** | `public` |
| is_office() | yes | **SECURITY DEFINER** | `public` |
| next_code(text) | yes | SECURITY INVOKER (default) | not set |
| assign_code() | yes | SECURITY INVOKER (default) | not set |
| apply_stock_movement() | yes | SECURITY INVOKER (default) | not set |
| recompute_quotation_totals() | yes | SECURITY INVOKER (default) | not set |
| recompute_invoice_totals() | yes | SECURITY INVOKER (default) | not set |
| recompute_invoice_paid() | yes | SECURITY INVOKER (default) | not set |
| set_updated_at() | yes | SECURITY INVOKER (default) | not set |

**Do `is_admin` / `is_office` check `is_active`? No.** Quoted:

    select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);

    select coalesce((select role in
      ('admin','sales_manager','design_manager','production_manager','analyzing_manager')
      from profiles where id = auth.uid()), false);

A deactivated user (`is_active = false`) keeps full office/admin database access as long as their login works. Same as `db/`.

Note: the INVOKER triggers (`apply_stock_movement` updating `products`, the `recompute_*` functions updating `quotations`/`invoices`) run with the caller's RLS. A `factory_worker` inserting a stock movement is allowed by `stock_write`, but the trigger's `UPDATE products` is denied by RLS (only office can write `products`). Same as `db/`; flagging because it affects the factory flow.

## 6. Views

`low_stock_products` is present and matches `db/`:

    CREATE VIEW "public"."low_stock_products" AS  SELECT id, sku, name_en, stock_qty, reorder_level
       FROM public.products
      WHERE (track_stock AND (stock_qty <= reorder_level) AND is_active);

**It does NOT have `security_invoker`** (no `WITH (security_invoker = ...)` anywhere in the baseline). The view runs with its owner's rights and bypasses RLS on `products`. Combined with item 8 (`anon` has `SELECT` on it), **anonymous visitors can read product names, SKUs and stock levels through this view.**

## 7. Triggers

17 triggers, all in `public`, all matching `db/`:

| Table | Trigger | Timing / event | Function |
|---|---|---|---|
| clients | trg_clients_updated | BEFORE UPDATE | set_updated_at() |
| contracts | trg_contract_code | BEFORE INSERT | assign_code('CON') |
| contracts | trg_contracts_updated | BEFORE UPDATE | set_updated_at() |
| invoice_items | trg_invoice_items_totals | AFTER INSERT/UPDATE/DELETE | recompute_invoice_totals() |
| invoices | trg_invoice_code | BEFORE INSERT | assign_code('INV') |
| invoices | trg_invoices_updated | BEFORE UPDATE | set_updated_at() |
| payments | trg_payments_recompute | AFTER INSERT/UPDATE/DELETE | recompute_invoice_paid() |
| products | trg_products_updated | BEFORE UPDATE | set_updated_at() |
| profiles | trg_profiles_updated | BEFORE UPDATE | set_updated_at() |
| projects | trg_project_code | BEFORE INSERT | assign_code('ALY') |
| projects | trg_projects_updated | BEFORE UPDATE | set_updated_at() |
| quotation_items | trg_quote_items_totals | AFTER INSERT/UPDATE/DELETE | recompute_quotation_totals() |
| quotations | trg_quotations_updated | BEFORE UPDATE | set_updated_at() |
| quotations | trg_quote_code | BEFORE INSERT | assign_code('QUO') |
| stock_movements | trg_stock_movement | AFTER INSERT | apply_stock_movement() |
| suppliers | trg_suppliers_updated | BEFORE UPDATE | set_updated_at() |
| tasks | trg_tasks_updated | BEFORE UPDATE | set_updated_at() |

**Trigger on `auth.users` that creates a `profiles` row: none** in the baseline. The `auth` pull reported no changes, so there is no evidence of one, but this report cannot prove it from the file alone. New users therefore get a `profiles` row only if the app or someone inserts it by hand.

## 8. Grants

The baseline contains **no explicit `GRANT ... TO anon` written by the project**, but the pull captured these, which are Supabase's default privileges on `public`:

- **Tables and view (all 16 tables + `low_stock_products`):**

      GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."<table>" TO "anon", "authenticated";

  So `anon` holds every privilege on every table. Only RLS stands between the public internet and the data. Tables with RLS and no matching policy are closed; **the view is not protected by RLS (item 6)**.
- **Functions (all 10):**

      GRANT EXECUTE ON FUNCTION "public"."<fn>"(...) TO PUBLIC, "anon", "authenticated";

  `anon` can call `next_code()` (which writes to `code_counters`, subject to its RLS) and the SECURITY DEFINER helpers.

`db/` never wrote these grants; they come from Supabase defaults, so they are drift only in the sense that `db/` does not show them.

## 9. Indexes

Indexes in baseline, identical to `db/` (primary keys / unique constraints omitted):
`idx_banding_types_name` (UNIQUE, name), `idx_bom_lines_product`, `idx_clients_name`, `idx_clients_phone`, `idx_invoice_items_i`, `idx_invoices_client`, `idx_payments_invoice`, `idx_products_category`, `idx_products_sku`, `idx_projects_client`, `idx_projects_stage`, `idx_quotations_client`, `idx_quote_items_q`, `idx_stock_mov_product`, `idx_tasks_assignee`.

`idx_products_sku` duplicates the `products_sku_key` unique index (harmless, wasteful).

**Foreign-key columns with no index (Postgres does not create these automatically):**

- bom_lines: `panel_id`, `component_id`, `banding_type_id`
- clients: `created_by`
- contracts: `client_id`, `project_id`, `quotation_id`, `created_by`
- invoice_items: `product_id`
- invoices: `project_id`, `contract_id`, `created_by`
- payments: `created_by`
- products: `supplier_id`
- projects: `design_manager_id`, `production_manager_id`, `analyzing_manager_id`, `created_by`
- quotation_items: `product_id`
- quotations: `project_id`, `created_by`
- stock_movements: `created_by`
- tasks: `project_id`, `created_by`

Most matter only at scale. Likeliest to bite first: `contracts.client_id`, `bom_lines.component_id`/`panel_id`, `tasks.project_id`.

## 10. Anything else

- **`profiles` is not auto-created** from `auth.users` (item 7) and has FK `profiles_id_fkey → auth.users(id) ON DELETE CASCADE`.
- **Seed data is not in the baseline.** `db/03_seed.sql` inserts 5 sample products (marked "delete later") and `db/05_bom.sql` inserts `banding_types` rows PVC/ABS. The baseline is schema-only, so a fresh database built from migrations alone has empty tables. Live data may or may not still contain them.
- **No `CREATE EXTENSION`** in the baseline. `db/01_schema.sql` creates `pgcrypto`; `gen_random_uuid()` is built in on current Postgres, so this is harmless.
- **`ENABLE RLS` without `FORCE`:** table owner (`postgres`) bypasses RLS; irrelevant to API roles.
- **`code_counters` primary key is `(prefix)` only**, with `year` as a data column. Matches `db/` and `next_code()`; just noting that it holds one row per prefix.
- No storage, auth or extension objects appear in the baseline.

---

## Summary

24 policies, 16 tables, 17 triggers, 10 functions in the live database.

| Item | In db/ files | In live database | Same? |
|---|---|---|---|
| Tables (16) | 16 | 16 | Yes |
| Columns on the 7 checked tables | per 01, 04–09 | identical | Yes |
| `products.code` column | no | no | Yes |
| Indexes | 15 + PK/unique | same | Yes |
| FK columns without an index | 24 | 24 | Yes (gap in both) |
| Triggers (17) | 17 | 17 | Yes |
| Functions (10) | 10 | 10 | Yes |
| SECURITY DEFINER on `current_role_of`/`is_admin`/`is_office` | yes | yes | Yes |
| `is_admin`/`is_office` check `is_active` | no | no | Yes (gap in both) |
| RLS enabled on 15 tables | yes | yes | Yes |
| **RLS on `code_counters`** | **not enabled** | **enabled, 0 policies** | **NO — drift** |
| Policies (24) | 24 | 24 | Yes |
| `profiles_self` has no `WITH CHECK` (role self-escalation) | yes | yes | Yes (gap in both) |
| Policies that are only `auth.uid() IS NOT NULL` | 5 | 5 | Yes |
| `low_stock_products` `security_invoker` | no | no | Yes (gap in both) |
| Grants to `anon` | not written | all privileges on all tables/view, EXECUTE on all functions | **NO — drift (Supabase defaults)** |
| Trigger on `auth.users` creating a profile | no | none found | Yes |
| Seed rows (sample products, PVC/ABS banding) | in `db/` | not in baseline (schema only) | n/a |
