# Stage 4c — BOM Auto-Pricing Engine (task for Claude Code)

Read `CLAUDE.md`, `db/01_schema.sql`, and `db/04_item_kind.sql` first.

We're adding a **Bill of Materials (BOM)** to products so a finished product's
price is **calculated from the components it's built from**, instead of typed in
by hand. This is the costing core of the whole system — build it carefully and
make the math verifiable.

Follow all CLAUDE.md conventions (i18n en+ar, JOD via `jod()`, existing styles,
RTL-safe, office-only edit). All money is `numeric(12,3)` JOD.

## The model (read carefully)

A product (e.g. a kitchen cabinet) is built from a BOM with two line types:

1. **Panel parts** — sides, back, top/bottom, divisions, shelves, doors, drawer
   fronts, etc. Cut from a **panel** (a component of subcategory "Materials" /
   that has sheet dimensions). Cost is **area-based**:
   - panel price per m² = `sheet_price / (sheet_length_m * sheet_width_m)`
   - part material cost = `part_w_m * part_h_m * price_per_m2 * qty`
   - plus **edge banding**: each part says how many meters of edge are banded
     and which **banding type** (PVC/ABS…) is used:
     banding cost = `banded_length_m * banding_price_per_m * qty`

2. **Component parts** — bought items (Hettich Atira/Avantech drawers, wooden/
   internal drawers, hinges, P2O, handles, Gola profiles…). Cost =
   `component.unit_price_jod * qty`.

### Rollup to selling price
```
materials   = Σ panel-part material costs + Σ edge-banding costs
components   = Σ component-part costs
base_cost    = materials + components
labor        = fixed JOD amount (entered per product)
margin_pct   = % (entered per product)
calc_price   = (base_cost + labor) * (1 + margin_pct/100)
```
`calc_price` **auto-fills** the product's `unit_price_jod`, but the user can
**override** the final price manually (keep a flag so we know if overridden).

### Live pricing principle (important)
Panel m² price and banding rate are looked up **live at calculation time** from
the referenced panel/banding rows — NOT copied into the BOM line. So when a
panel's sheet price changes, every product using it recalculates. Store on each
BOM line only: the reference + dimensions + qty. Compute costs in code.

## Part 1 — Database migration `db/05_bom.sql`
(New file; don't edit earlier migrations. Samer runs it in Supabase — remind
him.)

1. Extend **panels**: add to `products` the columns used when item is a panel
   material (nullable, only meaningful for panels):
   - `sheet_length_mm numeric(10,2)`, `sheet_width_mm numeric(10,2)`,
     `sheet_price_jod numeric(12,3)`
   - (derive per-m² in code; optionally a generated column
     `price_per_m2_jod` = sheet_price / area — but a generated column needs the
     dims non-null; safer to compute in code. Your call, but document it.)

2. **Edge banding types** — add a small table:
   `banding_types (id uuid pk, name text, price_per_m_jod numeric(12,3),
   is_active bool, created_at)`. Seed a couple: 'PVC' and 'ABS'.

3. Extend **products** with pricing fields:
   - `labor_jod numeric(12,3) not null default 0`
   - `margin_pct numeric(5,2) not null default 0`
   - `price_overridden boolean not null default false`
   - `is_template boolean not null default true`  (a product doubles as a
     reusable template; copies are still products)
   - cached breakdown (optional, for display/perf):
     `materials_cost_jod, components_cost_jod, base_cost_jod numeric(12,3)
     default 0`

4. **BOM lines** table:
   ```
   bom_lines (
     id uuid pk default gen_random_uuid(),
     product_id uuid not null references products(id) on delete cascade,
     line_type text not null check (line_type in ('panel','component')),
     -- panel-part fields:
     panel_id uuid references products(id),       -- the panel it's cut from
     part_name text,                              -- "Side", "Shelf", ...
     width_mm numeric(10,2),
     height_mm numeric(10,2),
     banding_type_id uuid references banding_types(id),
     banded_length_m numeric(10,3) default 0,     -- meters banded per piece
     -- component-part fields:
     component_id uuid references products(id),   -- the bought component
     -- shared:
     qty numeric(10,2) not null default 1,
     sort_order int not null default 0,
     created_at timestamptz default now()
   )
   ```
   Enable RLS: office full; factory_worker read. (Match existing patterns.)

5. Provide everything in `db/05_bom.sql` to paste into Supabase. **In your final
   summary, clearly tell Samer to run `db/05_bom.sql` before the new UI works.**

## Part 2 — Pricing logic in code
Create `lib/pricing.ts` with pure, unit-testable functions:
- `panelPricePerM2(sheetLenMm, sheetWidMm, sheetPriceJod): number`
- `panelPartCost({widthMm,heightMm,qty,pricePerM2,bandedLenM,bandingRate}): {material, banding}`
- `componentPartCost(unitPrice, qty): number`
- `rollup(lines, {laborJod, marginPct}): {materials, components, base, calcPrice}`
Round to 3 decimals consistently. Keep all rounding in one helper.

### Embedded test case (must match)
For a panel sheet 2440×1220 mm priced 22.500 JOD → per m² = **7.559** (≈7.5585).
Two sides 720×580 mm, qty 2 → material **6.313**; banding 2.88 m @ 0.350/m =
**1.008**; plus 2 hinges @ 1.750 = **3.500**; base = **10.821**; +5.000 labor,
×1.30 margin → selling **20.567**. Add a small dev check (script or comment)
demonstrating these numbers so Samer can trust the math.

## Part 3 — Product editor UI (the BOM builder)
On the Products create/edit screen (office only), add a **BOM section** below the
basic fields:
- A table of BOM lines with an "Add panel part" and "Add component" button.
- **Panel part row**: part name, panel selector (only products that are panels
  with sheet dims), width, height, qty, banding type selector, banded length(m).
  Show that line's computed material+banding cost live.
- **Component row**: component selector (item_kind='component', excluding
  panels if you like), qty. Show line cost live.
- Below the table show the **rollup**: materials, components, base cost, then
  inputs for **labor (JOD)** and **margin (%)**, then the **calculated price**
  big and clear.
- The product's `unit_price_jod` field: auto-filled from calc price, with an
  **"override" toggle**; when overridden, the manual value is kept and
  `price_overridden=true`.
- Persist BOM lines to `bom_lines` on save (insert/replace the set for that
  product). Recompute and store the cached cost fields.

### Panel materials need their sheet fields
In the **Components** page, when editing a component whose subcategory is
"Materials"/panel-like, the form must expose `sheet_length_mm`,
`sheet_width_mm`, `sheet_price_jod`, plus the existing `stock_qty`,
`reorder_level`. (Panels live in Components and are stock-tracked.) Show derived
price-per-m² read-only next to the sheet price.

### Templates (both)
- Every product is a template by default. Add a **"Duplicate"** action on a
  product that deep-copies it + its BOM lines into a new product (name suffixed
  "(copy)"), so Samer can tweak dimensions for a project-specific size and the
  price recalculates.

## i18n
Add all new labels (BOM, Panel part, Component, Part name, Width, Height,
Banded length, Banding type, Materials, Components cost, Base cost, Labor,
Margin %, Calculated price, Override price, Duplicate, Sheet length, Sheet
width, Sheet price, Price per m²…) to BOTH en and ar.

## Acceptance
- `npm run build` passes; `lib/pricing.ts` matches the embedded test numbers.
- After Samer runs `db/05_bom.sql`: editing a product lets him add panel parts +
  components and see a live calculated price following the rollup formula; the
  price auto-fills unit_price_jod and can be overridden.
- Changing a panel's sheet price changes the calculated price of products using
  it (live lookup).
- Duplicate copies a product and its BOM.
- factory_worker cannot edit; bilingual + RTL correct; no hardcoded strings or
  currency.
- Commit: "Stage 4c: BOM auto-pricing engine".

When done: run the build, (a) remind Samer to run `db/05_bom.sql` in Supabase,
(b) give a 3-line summary, (c) show the worked example numbers from a real run
so he can verify the math, (d) how to test duplicate + price override + live
panel-price change.
