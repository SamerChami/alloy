# Stage 17e — BOM Save: stop losing cut data, make it atomic

**Model:** Sonnet.
**Phase:** 0 (Lockdown). Requires 17d (done).

## Problem (confirmed in code)
`app/(app)/products/ProductForm.tsx`:
- `bomStateToInsert` does not write `cuts_json`, `cut_warning`, `hole_count`
  or `holes_json`.
- `saveBomLines` deletes every BOM line, ignores the delete's error, then
  re-inserts. So saving or duplicating any imported product wipes its cuts and
  holes, and a failed insert leaves the product with no BOM at all.
- Opening a product that has NO BOM lines and is not price-overridden
  auto-fills its price with the rollup of nothing (0.000), and saving stores 0.

## Goal
1. Save goes through one database function that replaces the lines in a
   single transaction and writes every column.
2. Cut and hole data survive edit, save and duplicate.
3. A product without BOM lines keeps its typed price.

The migration is already written:
`supabase/migrations/20261116140000_replace_bom_lines.sql`
(function `replace_bom_lines(p_product_id uuid, p_lines jsonb)`).

---

## Step 1 — Samer: apply the migration

    npx supabase db push --dry-run

(Add `--remote` to both commands if the first line says `Target: local stack`.)
It must list exactly one migration: `20261116140000_replace_bom_lines.sql`.

    npx supabase db push

## Step 2 — Claude Code: app changes (surgical, three files max)

### 2a. `app/(app)/products/bom_types.ts`
In `BomLineState`, after the `cutWarning?: string;` line, add:

```ts
  // Hole data from the DXF importer; carried through save untouched.
  hole_count?: number;
  holes_json?: unknown;
```

### 2b. `app/(app)/products/ProductForm.tsx` — `dbLineToBomState`
After the `cutWarning: ...` line add:

```ts
    hole_count: (row.hole_count as number | null) ?? 0,
    holes_json: row.holes_json ?? null,
```

### 2c. `ProductForm.tsx` — `bomStateToInsert`
After the `pos_z_mm: ...` line add:

```ts
    hole_count: line.hole_count ?? 0,
    holes_json: line.holes_json ?? null,
    cuts_json: line.cuts ?? null,
    cut_warning: line.cutWarning ?? null,
```

### 2d. `ProductForm.tsx` — replace the body of `saveBomLines`
Replace the whole function with:

```ts
  async function saveBomLines(productId: string) {
    const supabase = createClient();
    const { error: err } = await supabase.rpc("replace_bom_lines", {
      p_product_id: productId,
      p_lines: bomLines.map((l, i) => bomStateToInsert(l, productId, i)),
    });
    return err ? err.message : null;
  }
```

### 2e. `ProductForm.tsx` — do not zero the price of a product with no BOM
In the effect commented `// Auto-fill unit price from rollup when not
overridden and BOM has loaded`, change the condition

```ts
    if (!form.price_overridden && !loadingBom) {
```
to
```ts
    if (!form.price_overridden && !loadingBom && bomLines.length > 0) {
```
and add `bomLines.length` to that effect's dependency array.

In `buildPayload`, replace

```ts
    const finalPrice =
      form.price_overridden
        ? (parseFloat(form.unit_price_jod) || 0)
        : (pricingOverride ?? rollupResult.calcPrice);
```
with
```ts
    const finalPrice =
      form.price_overridden || bomLines.length === 0
        ? (parseFloat(form.unit_price_jod) || 0)
        : (pricingOverride ?? rollupResult.calcPrice);
```

### DO NOT
- Do not touch `BomSection.tsx`, the import shells, `lib/pricing.ts`, or the
  3D code.
- Do not change how quantities are parsed (known inconsistency, Phase 1).
- Do not run any `supabase db` command.

## Verification (must pass before commit)
1. `npx tsc --noEmit` and `npm run build` pass.
2. `git grep -n 'from("bom_lines").delete' -- app` returns nothing.
3. Clean restart, hard refresh. Then, in the app, as Samer:
   a. Import one cabinet that has grooves or holes with **Import SketchUp
      (single)**. Open the product: cuts show in the 3D preview.
   b. In the Supabase SQL editor, note the numbers:

          select p.name_en,
                 count(*)                                   as lines,
                 count(*) filter (where b.cuts_json is not null) as lines_with_cuts
          from bom_lines b join products p on p.id = b.product_id
          group by p.name_en;

   c. In the app, edit that product (change the description), Save.
      Re-run the query: `lines` and `lines_with_cuts` are UNCHANGED.
      Re-open the product: cuts still show in 3D.
   d. Duplicate the product. Re-run the query: the copy has the same
      `lines` and `lines_with_cuts` as the original.
   e. Open one of the old products that has no BOM lines. Its price field
      shows its stored price, not 0.000. Save without changes; the price in
      the products list is unchanged.
4. Failure test (proves atomic): in the SQL editor run

          do $$ begin
            perform set_config('request.jwt.claims', json_build_object('sub',
              (select id from profiles where role='admin' and is_active limit 1),
              'role','authenticated')::text, true);
            set local role authenticated;
            perform replace_bom_lines(
              (select product_id from bom_lines limit 1),
              '[{"line_type":"not-a-valid-type"}]'::jsonb);
          end $$;

   It must FAIL with a check-constraint error, and the query from 3b must
   show the same numbers as before (the old lines are still there).

## Commit
Stage only the files this task changed (do not add the untracked
`extension/*_diag.rbz` files):
```
git add supabase/migrations/20261116140000_replace_bom_lines.sql tasks/STAGE-17e-BOM-SAVE-TASK.md "app/(app)/products/bom_types.ts" "app/(app)/products/ProductForm.tsx"
git commit -m "fix(bom): Stage 17e — atomic BOM save that preserves cuts and holes; keep price when no BOM"
git push
```
