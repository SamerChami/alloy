# Stage 4 — Products Library (task for Claude Code)

Read `CLAUDE.md` and the `products` table in `db/01_schema.sql` first. Replace
the placeholder at `app/(app)/products/page.tsx` with a full **Products library**
(catalog / price list). Follow all CLAUDE.md conventions (i18n en+ar, JOD via
`jod()`, existing card/button/input styles, RTL-safe).

## Important scope decisions (follow exactly)
- This screen is a **catalog / price list**. **Do NOT show stock, reorder
  level, or stock adjustments here** — inventory is a separate module built
  later. (The `track_stock/stock_qty/reorder_level` columns exist but are out
  of scope for this screen.)
- **Browse as ONE list GROUPED BY CATEGORY** (cabinet, panel, material,
  accessory, fitting, appliance, other) — section headers per category, items
  under each.
- **Do NOT add supplier selection yet.** Leave `supplier_id` untouched
  (null). We'll add it after the Suppliers module exists.

## Access
Products are visible to everyone (all roles, per `lib/nav.ts`), but only
**office** roles (admin + the 4 managers) may create/edit/deactivate. In the
UI, only show Add/Edit/Delete controls to office roles. (Pass the current
role down from the (app) layout / fetch it in the page; RLS already enforces
this server-side, the UI just shouldn't show buttons that would fail.)

## Fields (from the products table)
sku, name_en, name_ar, category, unit (pcs/sheet/m/set/…), unit_price_jod,
cost_jod (optional), width_mm, height_mm, depth_mm (all optional), description,
drive_url (label "Drive link" — e.g. SketchUp component), is_active.

## Build

### 1. Products list — `/products`
- Server Component fetching active products (`is_active = true`) ordered by
  category then name_en.
- Render grouped by category: a translated category heading, then a table
  (cards on mobile) of its products showing: name (name_en, with name_ar in
  muted text beneath if present), sku, unit, and unit_price_jod via `jod()`.
- Optional dimensions: if any of width/height/depth are set, show a compact
  "W×H×D mm" string in a muted column.
- **Search box** (client component) filtering by name (en or ar) or sku, live.
  When searching, it's fine to show a flat filtered list instead of grouped.
- A **category filter** (All + each category) as simple pills/buttons.
- **"Add product"** button (office only), top-right, RTL-aware.
- Empty state per the interface voice + the Add button.

### 2. Create / Edit form (office only)
- Reusable modal form (match the pattern already used in the Clients module —
  look at `ClientForm.tsx` and stay consistent).
- Fields as listed above. Required: name_en, category, unit, unit_price_jod.
- `category` and `unit` as selects (unit options: pcs, sheet, m, m2, set, kg,
  roll, other). Prices are numbers with 3 decimals; force `dir="ltr"` on
  number/sku/url inputs.
- `is_active` toggle (default true) so a product can be retired without delete.
- Inline error display from Supabase (no browser alerts).
- On save: insert/update via the browser client, then `router.refresh()`.

### 3. Delete / deactivate
- Prefer **deactivate** (set `is_active=false`) over hard delete, since
  quotations will reference products. Offer Delete only as a guarded action
  that catches FK errors and shows a clear message ("Can't delete: this
  product is used in quotations — deactivate it instead.").

### i18n
Add all new labels to BOTH en and ar in `lib/i18n.ts`: category names
(cat_cabinet=خزانة/Cabinet, cat_panel=لوح/Panel, cat_material=مادة/Material,
cat_accessory=إكسسوار/Accessory, cat_fitting=قطعة تركيب/Fitting,
cat_appliance=جهاز/Appliance, cat_other=أخرى/Other), unit names, field labels
(SKU, "Name (English)", "Name (Arabic)", "Unit price", "Cost", "Dimensions",
"Drive link", "Active"), and actions (Add product, Deactivate, etc.). Reuse
existing keys where present.

## Acceptance
- `npm run build` passes.
- Products show grouped by category; search and category filter work.
- Office roles see Add/Edit; non-office (factory_worker, installation) see a
  read-only catalog with NO edit controls.
- Works in English and Arabic with correct RTL; no hardcoded user-facing
  strings; no hardcoded currency. No stock fields anywhere on this screen.
- Commit message: "Stage 4: products library (catalog grouped by category)".

When done, run the build and give me a 3-line summary + how to test (including
how to verify a factory_worker login sees no edit buttons).
