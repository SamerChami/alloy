# Stage 18b — Standard sizes per model + update a catalogue entry from a new export

**Model:** Opus review of the migration (Step 1), then Sonnet for the app work.
**Phase:** 1 (Catalogue truth). Requires 18a (done, 87d957d).

## Decisions this implements (Samer, 16 Nov 2026)
- One catalogue entry per code = one cabinet MODEL.
- A model may have fixed STANDARD SIZES, each with a list price.
- A standard size's price: calculated from that size's parts, with a manual
  override ("both"). The calculation itself arrives with the pricing engine
  in Stage 18c; in THIS stage every size price is typed by hand
  (`price_overridden = true`) and `calc_price_jod` stays empty.
- Quotation rule (Phase 3, recorded here): a drawn cabinet uses a standard
  price only when its code is in the catalogue AND its width, height and depth
  equal a standard size exactly, in whole millimetres. Otherwise it is priced
  from its own parts. Therefore sizes are stored as WHOLE millimetres.
- Importing a code that already exists is no longer refused. The user chooses:
  **Update catalogue entry** or **Add as standard size**.

Already written (do not rewrite):
- `supabase/migrations/20261116160000_product_sizes.sql`
  (`product_sizes` table + RLS, `bom_lines.size_id`,
  `replace_bom_lines(p_product_id, p_lines, p_size_id default null)`).
- `lib/productCode.ts`: new `descriptionFromName` (+ tests; 17 tests total).

---

## Step 1 — Claude Code (Opus, fresh session): review the migration
Read `supabase/migrations/20261116160000_product_sizes.sql`, the three earlier
migrations, and `supabase/tests/17d_security_checks.sql`. You did not write it.
Report on:
1. Applies cleanly on top of the four existing migrations?
2. RLS on `product_sizes`: can a non-office user write? can anon read?
   (Note `20261116130000` revoked anon defaults for future tables.)
3. `replace_bom_lines` v2: is the delete scoped correctly (base lines vs one
   size)? Can a caller pass a size that belongs to another product? Does the
   2-argument call `rpc("replace_bom_lines", { p_product_id, p_lines })` used
   by `ProductForm.tsx` today still resolve after the old function is dropped?
4. `jsonb_populate_recordset(null::bom_lines, ...)` now that `bom_lines` has a
   `size_id` column: any way for a caller-supplied `size_id` or `product_id`
   in the JSON to end up in a row? (They must not; the function parameters win.)
5. Anything unsafe or missing within this stage's scope.
Fix real defects with a surgical edit (the migration is not applied yet) and
say what changed. Doubts only: report and STOP. Run no `supabase db` command.

## Step 2 — Samer: apply the migration (dev server stopped)

    npx supabase db push --remote --dry-run     (must list only 20261116160000_product_sizes.sql)
    npx supabase db push --remote

## Step 3 — Claude Code (Sonnet): app work

### 3a. Existing BOM load must ignore size parts
`ProductForm.tsx`, the effect that loads `bom_lines` for a product: add
`.is("size_id", null)` to the query (between `.eq("product_id", ...)` and
`.order(...)`). Nothing else in that effect changes. `saveBomLines` stays as
it is (it calls the RPC without a size, which now replaces base parts only).

### 3b. Shared import helpers — new file `lib/catalogImport.ts`
Move, do not redesign. Both import shells contain the same mapping from a
parsed part to a `bom_lines` row (the `panels.map((part, i) => { ... })`
block that builds `line_type: "panel"`, `cutListDims`, `inferRole`, positions,
`cuts_json`, `cut_warning`). Extract it unchanged into:

```ts
export function panelToBomRow(part: V3Part, sortOrder: number): BomRowInsert
export function panelsToBomRows(panels: V3Part[]): BomRowInsert[]
```
(`product_id` is no longer part of the row; the RPC sets it.) Add:

```ts
/** Whole-millimetre size of a root, as stored in product_sizes. */
export function roundedDims(root: V3Node): { width_mm: number; height_mm: number; depth_mm: number }
// = rootDims(root) with Math.round on each value

/** Keep the material choices already made on the catalogue entry: for each new
 *  row whose part_name equals an old base line's part_name (first match),
 *  copy panel_id, banding_type_id and banded_length_m from the old line. */
export function carryMaterialMapping(rows: BomRowInsert[], oldBaseLines: OldLine[]): BomRowInsert[]
```
Add `lib/catalogImport.test.ts` with tests for `carryMaterialMapping`
(match by name; no match leaves nulls; duplicate names use the first match)
and `roundedDims` (e.g. 599.6 → 600).

Then make BOTH shells create a NEW product the same way:
insert the product (as today, with `code`), then
`rpc("replace_bom_lines", { p_product_id, p_lines: panelsToBomRows(panels) })`;
on RPC error delete the just-created product and show the error (same
rollback behaviour as today). Remove the direct `from("bom_lines").insert`.

### 3c. Catalogue lookup by code
Both shells already load existing codes. Change that query to
`select("id, code")` and keep a `Map<string, string>` from `codeKey(code)` to
product id (do NOT look a code up with `ilike`: codes contain `_`, which is a
wildcard).

### 3d. Two actions when the code already exists — shared functions in `lib/catalogImport.ts`

```ts
// 1. Update catalogue entry: the model's reference geometry is replaced.
export async function updateCatalogueEntry(supabase, productId, root, panels, meta): Promise<string | null>
//   - read old base lines: bom_lines where product_id = productId and size_id is null
//     (part_name, panel_id, banding_type_id, banded_length_m)
//   - rows = carryMaterialMapping(panelsToBomRows(panels), oldBaseLines)
//   - update products set width_mm/height_mm/depth_mm (rootDims), source_filename,
//     export_version where id = productId   (do NOT touch name, code, prices, labor, margin)
//   - rpc replace_bom_lines(productId, rows)            (no size)
//   returns an error message or null

// 2. Add as standard size.
export async function addStandardSize(supabase, productId, root, panels, meta): Promise<string | null>
//   - dims = roundedDims(root); label = descriptionFromName(root.name)
//   - upsert product_sizes on (product_id, width_mm, height_mm, depth_mm):
//       insert { product_id, label, ...dims, price_jod: 0, price_overridden: true, source_filename }
//       if that size already exists, reuse its id (its price is NOT changed)
//   - rows = carryMaterialMapping(panelsToBomRows(panels), oldBaseLines)
//   - rpc replace_bom_lines(productId, rows, sizeId)
//   returns an error message or null
```

### 3e. `SingleImportShell.tsx`
When `codeTaken`: replace the "already exists" block-and-disable from 18a with
- an info line: `t("codeInCatalogue")` + the existing product's name is not
  needed; just the code;
- two buttons instead of "Create": **`t("importUpdateEntry")`** and
  **`t("importAddSize")`**, each calling the function above, then showing the
  existing success panel with a matching message
  (`t("importUpdatedOk")` / `t("importSizeAddedOk")`).
When the code is not taken, behaviour is unchanged (Create).

### 3f. `ProjectImportShell.tsx`
- Rows with status `in_catalogue` are now tickable. Each such row gets a
  small `<select>` in the Code cell with three options:
  `t("importSkip")` (default), `t("importUpdateEntry")`, `t("importAddSize")`.
  Choosing Update or Add ticks the row; choosing Skip unticks it; unticking
  the row sets it back to Skip. Store it on the row as
  `action: "create" | "skip" | "update" | "add_size"` (`create` for `new`).
- `duplicate_in_file` rows: unchanged from 18a (tagged, cannot be ticked),
  EXCEPT when the first occurrence's code is in the catalogue — then every
  occurrence is `in_catalogue` and independently selectable (two cabinets of
  the same model at two sizes can both be added as standard sizes).
- `handleImport` runs each ticked row by its action. Keep the progress text.
  On the first error, stop and show it (as today).
- The success panel counts: created / updated / sizes added.

### 3g. Standard sizes in the product form — new `app/(app)/products/StandardSizes.tsx`
Shown in `ProductForm.tsx` for an EXISTING product only (`product?.id`),
below the Bill of Materials card, office users only (the form is already
office-only). A card titled `t("standardSizes")` with a table:

| Label | W | H | D (mm) | Parts | Calculated | Price (JOD) | |
- Rows from `product_sizes` where `product_id = product.id`, ordered by
  width, height, depth. `Parts` = number of `bom_lines` with that `size_id`.
  `Calculated` shows `jod(calc_price_jod)` or "—".
- Price and Label are editable inline; a row saves itself on blur
  (`update product_sizes set label, price_jod, price_overridden = true`).
- "Add size" row: label, W, H, D, price → insert (values rounded to whole mm).
  A duplicate size shows `t("sizeExists")`.
- Delete button per row with the same confirm pattern the form uses for
  deleting a product. Deleting a size deletes its parts (DB cascade).
- This component talks to Supabase directly; it is independent of the form's
  main Save button. Use `jod()` for money and logical CSS classes only.

### 3h. i18n — BOTH `en` and `ar`
| key | en | ar |
|---|---|---|
| `standardSizes` | `Standard sizes` | `المقاسات القياسية` |
| `sizeLabel` | `Label` | `الوصف` |
| `sizeParts` | `Parts` | `القطع` |
| `sizeCalculated` | `Calculated` | `محسوب` |
| `sizeAdd` | `Add size` | `إضافة مقاس` |
| `sizeExists` | `This size already exists for this model.` | `هذا المقاس موجود مسبقاً لهذا الموديل.` |
| `sizeNone` | `No standard sizes yet.` | `لا توجد مقاسات قياسية بعد.` |
| `importSkip` | `Skip` | `تخطي` |
| `importUpdateEntry` | `Update catalogue entry` | `تحديث عنصر الكتالوج` |
| `importAddSize` | `Add as standard size` | `إضافة كمقاس قياسي` |
| `importUpdatedOk` | `Catalogue entry updated.` | `تم تحديث عنصر الكتالوج.` |
| `importSizeAddedOk` | `Standard size added.` | `تمت إضافة المقاس القياسي.` |
If any key already exists, STOP and report.

### DO NOT
- No pricing changes: do not touch `lib/pricing.ts`, `BomSection.tsx`, or how
  prices are calculated. `calc_price_jod` is never written in this stage.
- Do not touch `Cabinet3D.tsx`, `lib/cabinet3d.ts`, `lib/sketchup/parseV3.ts`,
  the DXF/3DS importer, or the extension.
- Do not run any `supabase db` command. Do not commit until Samer confirms.

## Verification
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` pass.
   `git grep -n 'from("bom_lines").insert' -- app` returns only the DXF/3DS
   importer (`app/(app)/products/import/ImportShell.tsx`), which this stage
   does not touch.
2. Samer, after a clean restart:
   a. Single import of a NEW code: creates the product with its parts, as before.
   b. Single import of an EXISTING code → **Add as standard size**. Open the
      product: the Standard sizes card shows one row with the export's W×H×D
      in whole mm, the label from the name (text after the code), Parts > 0,
      price 0.000. Type a price, click elsewhere, reopen: the price is kept.
   c. Same export again → Add as standard size: no second row appears; the
      typed price is unchanged.
   d. On the product's Bill of Materials, choose a Panel material for one part
      and Save. Then single import the same code → **Update catalogue entry**.
      Reopen: parts are replaced, and the part with the same name still has
      its Panel material.
   e. The product's own BOM does not show the standard size's parts, and
      saving the product does not delete them:

          select p.code, s.width_mm, s.height_mm, s.depth_mm, s.price_jod,
                 (select count(*) from bom_lines b where b.size_id = s.id) as size_parts,
                 (select count(*) from bom_lines b where b.product_id = p.id and b.size_id is null) as base_parts
          from product_sizes s join products p on p.id = s.product_id;

      Run before and after saving the product: numbers unchanged.
   f. Project import with a mix: new codes are created; for a code already in
      the catalogue the row's dropdown offers Skip / Update / Add as standard
      size and each does what it says.
   g. Add a size by hand in the Standard sizes card; adding the same W×H×D
      again shows the "already exists" message. Delete a size: its row and
      its parts are gone (query from e).
   h. Log in as the factory test user (reactivate it first, deactivate after):
      it cannot add, edit or delete a standard size.

## Commit
```
git add -A
git commit -m "feat(catalogue): Stage 18b — standard sizes per model; update entry or add size on import"
git push
```
