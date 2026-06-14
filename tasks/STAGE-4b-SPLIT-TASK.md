# Stage 4b — Split into Products + Components (task for Claude Code)

Read `CLAUDE.md` and `db/01_schema.sql` first. We're splitting the catalog into
two concepts that share one table:

- **Products** = finished goods ALLOY sells/designs (Kitchen Cabinets, Closets,
  Beds, Nightstands, Dressers, Wall Cladding, + more later). **No stock
  tracking.**
- **Components** = parts used to build cabinets (Drawers, Materials, Lighting,
  Hinges, Connectors, Plinth, + more later). **Stock-tracked.**

Two separate nav items: **Products** and **Components**.

Follow all CLAUDE.md conventions (i18n en+ar, JOD via `jod()`, existing styles,
RTL-safe, office-only edit).

## Part 1 — Database migration (do this first, carefully)
Create a new migration file `db/04_item_kind.sql` (do NOT edit the existing
01–03 files). It must:

1. Create an enum `item_kind` with values `('product','component')`.
2. Add column `item_kind item_kind not null default 'component'` to `products`.
3. Add a `subcategory` text column to `products` (free-ish category label per
   kind, e.g. "Kitchen Cabinets", "Hinges") — we'll use this instead of trying
   to cram everything into the old `category` enum, which can't be easily
   extended later. Keep the existing `category` column for now (don't drop it).
4. Backfill: set sensible `item_kind` for the 5 seed rows — the cabinets become
   `product`, panels/accessories/fittings become `component`. Set their
   `subcategory` to readable values.
5. Provide the SQL as a file Samer can paste into the Supabase SQL Editor.
   **Tell him clearly in your summary that he must run `db/04_item_kind.sql` in
   Supabase before the new UI will work**, since you can't run it for him.

Also: since `subcategory` is now the user-facing grouping, define the starting
category lists in app code (a small config in `lib/catalog.ts`):
- productSubcategories: Kitchen Cabinets, Closets, Beds, Nightstands, Dressers,
  Wall Cladding
- componentSubcategories: Drawers, Materials, Lighting, Hinges, Connectors,
  Plinth
Each as {value, en, ar}. Make it trivial to add more later by editing this file.

## Part 2 — Navigation
In `lib/nav.ts` add a **Components** nav item next to **Products**.
- Products: visible to all roles (read), office can edit.
- Components: visible to office + factory_worker (read); office can edit;
  factory_worker read-only.
Add `components` label to i18n (en: "Components", ar: "المكوّنات").

## Part 3 — Products page (`/products`)
- Now filters to `item_kind = 'product'` only.
- Group by `subcategory` (using the productSubcategories order from
  `lib/catalog.ts`); show any unknown subcategory under "Other".
- **No stock anywhere** on this screen (unchanged from before).
- Add/Edit modal: the category selector now picks from productSubcategories.
  Set `item_kind='product'` on insert. Keep existing fields (sku, name_en,
  name_ar, unit, unit_price_jod, cost_jod, dimensions, drive_url, is_active,
  description).

## Part 4 — Components page (`/components`)
New route `app/(app)/components/page.tsx`, mirroring the Products structure but:
- Filters to `item_kind = 'component'`.
- Group by `subcategory` (componentSubcategories order).
- **Stock IS shown here**: display `stock_qty`, `reorder_level`, and unit. Rows
  at/under reorder level get a subtle "low stock" badge (rust color).
- Add/Edit modal includes stock fields (`track_stock` default true, `stock_qty`,
  `reorder_level`) AND sets `item_kind='component'` on insert.
- Office can edit; factory_worker read-only (no Add/Edit buttons).
- Deactivate-over-delete, same guarded pattern as Products.

## i18n
Add all new labels to BOTH en and ar: "Components", the subcategory names
(both lists), stock labels ("In stock", "Reorder level", "Low stock"),
"Product"/"Component" if shown. Reuse existing keys where possible.

## Acceptance
- `npm run build` passes.
- After Samer runs `db/04_item_kind.sql`: Products shows only finished goods
  grouped by their subcategories with no stock; Components shows parts grouped
  by their subcategories WITH stock + low-stock badges.
- factory_worker sees Components (read-only) and Products (read-only), no edit
  controls; office can edit both.
- Bilingual + RTL correct; no hardcoded strings or currency.
- Commit message: "Stage 4b: split products and components (item_kind)".

When done: run the build, then give me (a) the exact reminder that
`db/04_item_kind.sql` must be run in Supabase first, (b) a 3-line summary, and
(c) how to test both pages and the factory_worker view.
