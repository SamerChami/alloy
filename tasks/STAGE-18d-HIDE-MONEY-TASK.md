# Stage 18d — Money is office-only

**Model:** Opus review in a FRESH Claude Code session (Step 1), Sonnet for the
app work (Step 3).
**Phase:** 1 (Catalogue truth) leftover 1. Requires 18c (done, c12ba47).

## Decisions this implements (Samer, 17 Nov 2026)
1. `factory_worker` and `installation` users see **no money at all**: no
   selling price, cost, labor, markup, board price, banding price, component
   price, standard-size price or pricing settings.
2. Neither role opens the **Components** page (menu and direct link).
3. Factory workers **keep Inventory** (stock quantities, no prices).

## Why the database, not just the pages
Today every active staff member can read every money column straight from
the database (`products_read`, `product_sizes_read`, banding and pricing
settings policies all use `is_staff()`). Hiding a column on a page does not
change that. So: the money tables become office-only, and everyone else reads
products through a view that has no money columns.

Already written (do not rewrite):
- `supabase/migrations/20261117100000_money_office_only.sql`
  - view `products_basic` (no money columns; read-only; models for every
    active staff member, stock items for office + factory workers only);
  - `low_stock_products` now reads from `products_basic`;
  - the four staff-wide read policies become office-only.
- `supabase/tests/18d_money_checks.sql` (M1–M9).
- One comment added to T6 in `supabase/tests/17d_security_checks.sql`.

Both SQL files were run against a local PostgreSQL 16 copy built from the six
existing migrations (with stand-ins for Supabase's `auth` schema and roles):
the migration applied cleanly and M1–M9 gave the wanted results. That is not
the live database, so the review and the live checks below still apply.

Order matters: the app change (Step 3) needs the view, so the migration is
applied first. Between Step 2 and Step 3 a factory/installation user simply
sees an empty products list; office users are unaffected.

---

## Step 1 — Claude Code (Opus, fresh session): review, no app edits
Read in full: the seven files in `supabase/migrations/`,
`supabase/tests/18d_money_checks.sql`, `supabase/tests/17d_security_checks.sql`,
and every `.from(` call under `app/`. You did not write this migration. Review
it as an outsider and report on each point:
1. Applies cleanly on top of the six earlier migrations? (policy names exactly
   as created, `create or replace view low_stock_products` keeps the same five
   columns and types, enum literals `'product'` and `'factory_worker'`.)
2. **The view is the only security-definer object added.** Confirm
   `products_basic` (`security_invoker = false`) cannot be used to read any
   money, cost, labor, markup or supplier column, and that no login role can
   INSERT / UPDATE / DELETE / TRUNCATE through it or through
   `low_stock_products`. Check the grants left on both views for
   `authenticated`, `anon` and `public`.
3. Its WHERE clause is the only row filter. Any way a non-staff, deactivated
   or installation user gets rows they should not (stock items for
   installation, anything for a deactivated user)? Does `security_barrier`
   plus the `(select …)` wrappers behave as intended?
4. **Other roads to money.** For a factory_worker and an installation user,
   walk every remaining road and say what each returns: `price_bom`,
   `reprice_product`, `replace_bom_lines`, PostgREST embedding from
   `bom_lines` / `stock_movements` into `products` or `banding_types`,
   `quotation_items` / `invoice_items`, and any other view or function in the
   schema. Anything still leaking a JOD amount is a defect.
5. **Nothing office users do breaks.** The office policies
   (`products_office_write`, `product_sizes_office`, `office write
   banding_types`, `pricing_settings_office`) must still give office roles
   full read. The 18c re-price triggers must still work when fired by an
   office user, and `apply_stock_movement` (17d, SECURITY DEFINER) must still
   work when fired by a factory worker.
6. **App impact.** List every query in `app/` that a factory_worker or
   installation user can reach and say what it returns after the migration.
   Expected: dashboard low-stock count still works; `products/page.tsx`
   returns an empty list until Step 3; `components/page.tsx` returns an empty
   list until Step 3. Anything that would throw instead of returning empty?
7. Supabase's database linter will flag `products_basic` as a "security
   definer view". That is intended here. Say whether you agree, or name a
   safer design that still hides columns per app role.
8. Anything the migration should do and does not, within this stage's scope.

If you find a real defect: fix it with a surgical edit to the migration or
the checks file (neither is applied yet, so editing is allowed) and say
exactly what you changed and why. If you only have doubts, report them and
STOP. Do NOT run any `supabase db` command. Do not touch app code in this step.

## Step 2 — Samer: check BEFORE, apply, check AFTER
1. SQL editor: paste and run block **M1** from
   `supabase/tests/18d_money_checks.sql`. Wanted before: products above 0 and
   pricing settings 1 (that is the hole); standard sizes and banding types
   are above 0 only if you have any. Note the line.
2. Only after Step 1 reports no open defects:

       npx supabase db push --remote --dry-run

   It must list exactly one migration: `20261117100000_money_office_only.sql`.

       npx supabase db push --remote

   If it errors, copy the exact text and stop; a failed migration is rolled
   back as a whole.
3. Run **M1 to M9**, one block at a time.

| Check | Wanted after |
|---|---|
| M1 | factory worker reads 0 \| 0 \| 0 \| 0 |
| M2 | models N of N, stock items N of N (both complete) |
| M3 | money tables 0 \| 0 \| 0 \| 0, models complete, stock items 0 |
| M4 | money columns in the views: none |
| M5 | update BLOCKED (good), delete BLOCKED (good) |
| M6 | admin reads every pair equal, pricing settings 1 |
| M7 | before 1 · movement WORKS (good) · stock after 10.00 · after 0 |
| M8 | factory worker gets cost 0 and price 0 (or "no model to test with") |
| M9 | deactivated user 0 \| 0 |

Any other result: stop and report it. Do not continue to Step 3.

## Step 3 — Claude Code (Sonnet): app changes
Surgical edits only. Six files.

### 3.1 `lib/nav.ts` — Components is office-only
Replace the `/components` line in `NAV` with:

    { href: "/components",  key: "components",  icon: Layers,   roles: OFFICE },

Leave every other line, including `/inventory`, as it is.

### 3.2 `app/(app)/components/page.tsx` — block the direct link
- Add `import { redirect } from "next/navigation";` as the first import.
- The page currently runs the components query and the profile query together
  in one `Promise.all`. Change it so the **profile is read first**, and if the
  role is not in `OFFICE_ROLES`, `redirect("/dashboard");` BEFORE any query on
  `products` runs. Then run the existing components query unchanged.
- `isOffice` is now always true on this page; keep passing `isOffice={true}`
  so `ComponentsShell` needs no change.

### 3.3 `app/(app)/products/types.ts` — a type with no money
Append:

    /** What factory / installation users receive (view `products_basic`,
     *  Stage 18d): no price, cost, labor or markup fields exist on it. */
    export type ProductBasic = Pick<
      Product,
      | "id" | "sku" | "code" | "name_en" | "name_ar" | "subcategory" | "unit"
      | "width_mm" | "height_mm" | "depth_mm" | "description" | "drive_url"
      | "is_active"
    >;

### 3.4 `app/(app)/products/page.tsx` — two paths
- Import `ProductBasic` next to `Product`.
- Read the profile FIRST (same query as today, taken out of the
  `Promise.all`) and compute `isOffice`.
- **Not office:** run ONE query and return. No query on `products`,
  `banding_types` or `pricing_settings` may run on this path.

      const { data: basic } = await supabase
        .from("products_basic")
        .select(
          "id, sku, code, name_en, name_ar, subcategory, unit, width_mm, height_mm, depth_mm, description, drive_url, is_active"
        )
        .eq("item_kind", "product")
        .eq("is_active", true)
        .order("subcategory")
        .order("name_en");

      return (
        <ProductsShell
          initialProducts={(basic ?? []) as ProductBasic[]}
          isOffice={false}
          panels={[]}
          allComponents={[]}
          bandingTypes={[]}
          pricingSettings={DEFAULT_PRICING_SETTINGS}
        />
      );

- **Office:** the existing `Promise.all` (minus the profile query) and the
  existing return, with `isOffice` passed as `true`. Do not change the
  selected columns.

### 3.5 `app/(app)/products/ProductsShell.tsx` — no price column for non-office
- Import `ProductBasic` from `./types` and add, below the imports:

      type ListProduct = Product | ProductBasic;

- Use `ListProduct` for: the `dims` parameter, `ProductRow`'s `p`,
  `ProductRow`/`ProductTable`'s `onEdit` parameter, `ProductTable`'s
  `products`, and `ProductsShell`'s `initialProducts`.
- In `ProductTable`, render the price header only for office:

      {isOffice && (
        <th className="text-start px-4 py-3 font-medium">{t("unitPrice")}</th>
      )}

- In `ProductRow`, render the price cell only for office:

      {isOffice && (
        <td className="px-4 py-3 tabular-nums font-medium text-sm" dir="ltr">
          {jod((p as Product).unit_price_jod)}
        </td>
      )}

- `openEdit` becomes `function openEdit(p: ListProduct) { setEditTarget(p as Product); … }`.
  The edit button is already office-only, and office rows are full `Product`
  rows, so the cast is safe; add a one-line comment saying so.
- Leave `editTarget`'s state type as `Product | null`. Change nothing else.

### 3.6 `CLAUDE.md` — one sentence
In the "Auth/roles" bullet, after the sentence that ends "(see `lib/nav.ts`).",
add:

    Money (prices, costs, labor, markup, pricing settings) is readable by
    office roles only; pages for factory_worker / installation read products
    from the view `products_basic`, which has no money columns — never query
    the `products` table on a non-office path.

### Then
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — all must
pass (stop the dev server before the build). Report the diff summary. Do NOT
commit yet.

## Step 4 — Samer: verify in the app
Clean restart (`.next` removed, `npm run dev`, Ctrl+Shift+R).

a. **As yourself (admin):** Products shows prices and the pricing settings
   card as before; open a product, the parts and prices are there; Components
   opens; dashboard counts unchanged.
b. Table editor → `profiles` → set the test user (`factory.test@alloy.test`)
   to `is_active = true`, role `factory_worker`. **Log in as the test user:**
   - the menu has Dashboard, Products, Inventory, Tasks — **no Components**;
   - Products lists the models with **no Unit price column**, no pricing
     card, no import / add / edit buttons;
   - typing `/components` in the address bar lands on the dashboard;
   - the dashboard low-stock number matches what you see as admin.
c. Table editor → set the test user's role to `installation`, reload:
   - the menu has Dashboard, Products, Tasks only;
   - Products as in (b); `/components` lands on the dashboard.
d. Set the test user back to `factory_worker` and `is_active = false`.

## Step 5 — Claude Code: commit
Only after Samer confirms every Step 2 and Step 4 result.
```
git add -A
git commit -m "feat(security): Stage 18d — money is office-only; price-free products view; Components office-only"
git push
```

## Out of scope (stay out)
- Dashboard quick-action links ("New client", "New quotation") shown to
  non-office users; route guards on the other office-only pages (their data
  is already office-only in the database).
- A parts / standard-sizes screen for the factory (comes with job orders).
- The other Phase 1 leftovers (fittings on import, banding-types screen,
  deactivated products list, `product_sizes` TRUNCATE grant).

## Report back
The M1 line before; the nine RESULT lines after; the Step 1 review report;
the Step 3 diff summary; anything that behaved differently from this file.
