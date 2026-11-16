# Stage 18c — Pricing engine in the database

**Model:** Opus review (Step 1), Sonnet for the app work (Step 4).
**Phase:** 1 (Catalogue truth). Requires 18b (done, 80f56e7).

## Decisions this implements (Samer, 17 Nov 2026)
1. The percentage is a **markup on cost** (cost 100 at 30 % → 130). Samer left
   this to us; markup is what the code already does and what the stored
   numbers mean, so nothing existing changes meaning. The label becomes
   "Markup %".
2. The markup **applies to labor too**: price = (materials + components +
   labor) × (1 + markup %).
3. **Sheet waste**: one global allowance, default **8 %** (Samer: 5–10 %),
   adjustable in the app.
4. The calculated price is **rounded up to the nearest 0.5 JOD** (adjustable).
5. **One default board per model**, used by every part with no board chosen.
6. A typed (overridden) price is never changed by the engine. A model with no
   parts keeps its typed price.

Already written (do not rewrite):
- `supabase/migrations/20261117090000_pricing_engine.sql`
  (`pricing_settings`, `products.default_panel_id`, `products.calc_price_jod`,
  `price_bom`, `reprice_product`, re-price triggers, `replace_bom_lines`
  now re-prices).
- `supabase/tests/18c_pricing_checks.sql` (P1–P4).
- `lib/pricing.ts` (mirror of the DB rules for the live preview; NEW
  signatures) and `lib/pricing.test.ts`.

After this stage the DATABASE is the source of truth for costs and prices.
`lib/pricing.ts` only drives the live preview in the form.

NOTE: `lib/pricing.ts` is already the new version. Its new inputs (`wastePct`,
`roundingStepJod`) are optional and default to 0, so the app still builds and
runs before Step 4; until Step 4 the form preview simply shows no waste and
no rounding. Step 4 must pass both values explicitly everywhere.

---

## Step 1 — Claude Code (Opus, fresh session): review the migration
Read the migration, the five earlier migrations, `supabase/tests/18c_pricing_checks.sql`,
`lib/pricing.ts`, `lib/pricing.test.ts`. You did not write them. Report on:
1. Applies cleanly on top of the five existing migrations? (object names,
   the `create or replace` of `replace_bom_lines` keeping its 18b signature,
   enum literal `'product'` for `item_kind`.)
2. **Money correctness.** Does `price_bom` implement the six decisions above
   exactly? Hand-compute the worked example in `lib/pricing.test.ts` against
   the SQL and confirm P1–P4's "Wanted" values. Any place where SQL numeric
   and the TypeScript mirror can disagree by rounding?
3. **Trigger loops.** `reprice_product` updates `products` and
   `product_sizes`. Can any trigger in this migration (5a–5e) re-fire itself
   or another one endlessly? Walk each path.
4. **Overrides.** Any path where a typed product price or a typed size price
   is overwritten? Any path where a model with no parts gets its price zeroed?
5. **Permissions.** `price_bom` / `reprice_product` are SECURITY INVOKER. Who
   can call them, and what can a factory/installation user change through
   them or through the triggers? Does the 17d `apply_stock_movement` path
   (a factory stock movement updating `products.stock_qty`) fire any of the
   new triggers?
6. The one-time re-price at the end: any risk on the live data (products with
   parts but no materials chosen become 0 + labor/markup, rounded; overridden
   prices untouched)?
7. Anything unsafe or missing within this stage's scope.
Fix real defects with a surgical edit (not applied yet) and say what changed.
Doubts only: report and STOP. Run no `supabase db` command.

## Step 2 — Samer: apply the migration (dev server stopped)

    npx supabase db push --remote --dry-run     (must list only 20261117090000_pricing_engine.sql)
    npx supabase db push --remote

## Step 3 — Samer: run the pricing checks
Open `supabase/tests/18c_pricing_checks.sql`; paste and run P1, P2, P3, P4 one
at a time. Each shows a red `RESULT ...` line (that also undoes the test).

| Check | Wanted |
|---|---|
| P1 | materials 7.826 · components 3.500 · base 11.326 · price 21.500 · stored 21.500 |
| P2 | with default board 21.500 · after board price doubles 30.500 |
| P3 | overridden stays 99.000 (calculated 21.500) · no-parts model stays 25.000 |
| P4 | size calculated 21.500, price 21.500 · after typing 30 → 30.000 · back to calculated → 21.500 |

If any value differs, STOP and report; do not continue to Step 4.

## Step 4 — Claude Code (Sonnet): app work

### 4a. Data loading — `app/(app)/products/page.tsx`
- Products select: add `default_panel_id, calc_price_jod` after `code`.
- Load the settings row and pass it down:
  `supabase.from("pricing_settings").select("waste_pct, rounding_step_jod").single()`
  → `PricingSettings` (`{ wastePct, roundingStepJod }`); fall back to
  `DEFAULT_PRICING_SETTINGS` from `lib/pricing.ts` if the row is missing.
- `types.ts` `Product`: add `default_panel_id?: string | null; calc_price_jod?: number | null;`.
- Thread a `pricingSettings` prop: `page.tsx` → `ProductsShell` → `ProductForm` → `BomSection`.

### 4b. `ProductForm.tsx`
- `FormState`: add `default_panel_id: string;` (`fromProduct`: `p?.default_panel_id ?? ""`).
- `buildPayload`: add `default_panel_id: form.default_panel_id || null,`.
- UI: next to the labor / markup inputs add a select labelled
  `t("defaultBoard")` with an empty option `t("defaultBoardNone")` and one
  option per entry of the `panels` prop (same option text the BOM panel select
  uses).
- `rollupResult`: for a panel line use
  `panels.find(p => p.id === (l.panel_id || form.default_panel_id))`;
  call `panelPartCost({ ..., wastePct: pricingSettings.wastePct })`;
  call `rollup(..., { laborJod, marginPct, roundingStepJod: pricingSettings.roundingStepJod })`.
  Add `form.default_panel_id` and `pricingSettings` to the memo dependencies.
- Do not change `saveBomLines`, the price auto-fill effect, or `handleSubmit`:
  the form still sends its preview numbers, and the database then stores its
  own (the RPC re-prices at the end of every save).

### 4c. `BomSection.tsx`
- New props `defaultPanelId: string` and `pricingSettings: PricingSettings`.
- `getLineCost`: same two changes as 4b (default-board fallback, `wastePct`).
  It returns an unrounded number now; wherever a line cost is displayed keep
  using `jod(...)` (which formats to 3 decimals).
- In the panel `<select>` of a line, the empty option's text becomes
  `t("usesDefaultBoard")` when `defaultPanelId` is set (else unchanged).

### 4c-bis. Banding must be counted even when a line has no board (review finding)
Today both `rollupResult` (ProductForm) and `getLineCost` (BomSection) return 0
for the WHOLE panel line when the board is missing or has no sheet size/price.
The database (`price_bom`) still counts that line's banding. Make the preview
match: when no usable board is found, the line's material is 0 but its banding
is still `bandedLenM x bandingRate x qty`. Simplest way: call `panelPartCost`
with `pricePerM2: 0` instead of returning early. (After the default-board
fallback of 4b/4c has been applied.)

### 4d. `StandardSizes.tsx` and `lib/catalogImport.ts`
- `addStandardSize`: insert with `price_overridden: false` (was `true`).
- `StandardSizes.tsx`:
  - the Calculated column now shows real values (already wired to `calc_price_jod`);
  - typing a price still sets `price_overridden: true`;
  - a row with `price_overridden === true` AND a non-null `calc_price_jod`
    shows a small ghost button `t("useCalculated")` that runs
    `update product_sizes set price_overridden = false` for that row and
    reloads the list (the database then sets the price to the calculated one);
  - a row that is not overridden shows its price input in `text-slate` with a
    title `t("priceIsCalculated")`;
  - the "Add size" row: leaving the price empty inserts
    `price_overridden: false`; a typed price inserts `price_overridden: true`.
  - reload the list after every change, since the database may alter prices.

### 4e. Pricing settings card — new `app/(app)/products/PricingSettingsCard.tsx`
Shown at the top of the Products page for office users only (`isOffice`).
Two number inputs: `t("wastePct")` (0–100, step 0.5) and
`t("roundingStep")` (0 or more, step 0.5), with a Save button that runs
`update pricing_settings set waste_pct, rounding_step_jod` and then
`router.refresh()`. Under the inputs one line of help text `t("pricingSettingsHelp")`.
Collapsed by default behind a ghost button `t("pricingSettings")`.

### 4f. i18n — BOTH `en` and `ar`
Change the VALUE of the existing key `marginPct`: en `Markup %`, ar `نسبة الربح على التكلفة %`.
New keys:
| key | en | ar |
|---|---|---|
| `defaultBoard` | `Default board` | `اللوح الافتراضي` |
| `defaultBoardNone` | `None` | `بدون` |
| `usesDefaultBoard` | `Default board` | `اللوح الافتراضي` |
| `useCalculated` | `Use calculated` | `استخدام السعر المحسوب` |
| `priceIsCalculated` | `Calculated price. Type a price to override it.` | `سعر محسوب. اكتب سعراً لتجاوزه.` |
| `pricingSettings` | `Pricing settings` | `إعدادات التسعير` |
| `wastePct` | `Sheet waste %` | `نسبة الهدر في الألواح %` |
| `roundingStep` | `Round price up to (JOD)` | `تقريب السعر للأعلى إلى (دينار)` |
| `pricingSettingsHelp` | `Saving re-prices every product that has parts. Typed prices are not changed.` | `الحفظ يعيد تسعير كل منتج له قطع. الأسعار المكتوبة يدوياً لا تتغير.` |
If any of the new keys already exists, STOP and report.

### 4g. `CLAUDE.md` — replace the sentence
`Totals/stock/codes are maintained by DB triggers — don't recompute them in app code.`
with
`Totals/stock/codes and product costs/prices are maintained by the database (triggers and the price_bom / reprice_product functions) — don't recompute or store them from app code. lib/pricing.ts is a preview that mirrors the database rules; change both together.`

### DO NOT
- Do not edit `lib/pricing.ts`, `lib/pricing.test.ts`, the migration, or the
  SQL checks. If the preview cannot match them, STOP and report.
- Do not touch `Cabinet3D.tsx`, `lib/cabinet3d.ts`, the parser, the DXF/3DS
  importer, or the extension.
- Do not run any `supabase db` command. Do not commit until Samer confirms.

## Verification
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` pass.
2. Samer, after a clean restart:
   a. Products page: a "Pricing settings" button (office only) opens waste 8
      and rounding 0.5.
   b. Open an imported model with parts and no materials. Choose a Default
      board, Save. The list price is now above 0 and ends in .000 or .500.
      Reopen: every part's cost is filled, and the price shown in the form
      equals the list price.
   c. Preview = database: with the form open note Materials cost, Base cost
      and the price; Save; then

          select name_en, materials_cost_jod, components_cost_jod, base_cost_jod,
                 calc_price_jod, unit_price_jod, price_overridden
          from products where item_kind = 'product' order by updated_at desc limit 3;

      The stored numbers equal what the form showed.
   d. Components page: change that board's sheet price, save. Without opening
      the model, the Products list already shows its new price.
   e. Tick "override price" on the model, type 99, Save. Change the board
      price again: the model stays 99.000; `calc_price_jod` in the query moved.
   f. Standard sizes card: the size imported in 18b shows a Calculated value.
      Its typed price (100) is unchanged and has a "Use calculated" button;
      click it: the price becomes the calculated one. Type a price again: it
      sticks.
   g. Pricing settings: set waste to 10, save. The model without an override
      changes price; the overridden one does not. Set it back to 8.
   h. A hand-made product with no parts still keeps its typed price after Save.

## Commit
```
git add -A
git commit -m "feat(pricing): Stage 18c — database pricing engine: waste, default board, round-up, auto re-price"
git push
```
