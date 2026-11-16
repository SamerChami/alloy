# Stage 18a-FIX — Project import accepts every top-level item, not only "Cabinet"

**Model:** Sonnet.
**Runs on top of the uncommitted Stage 18a working tree.** Do not commit 18a
separately; both go in one commit at the end.

## Problem (found by Samer in 18a check e)
`ProjectImportShell.tsx` keeps only roots where `item_type === "Cabinet"`:

    const cabinets = json.roots.filter((r) => r.item_type === "Cabinet");

The exporter (`extension/alloy_export/main.rb`, `classify`) labels a root
"Cabinet" ONLY when it has child parts whose names contain "side" AND
"top"/"bottom". Everything else is dropped by the web app:
- a group or component whose parts are named differently → `Other`
- a single solid at the top level (a loose mesh/part)     → `Part`
- `Worktop`, `Appliance`, `Trim`

The export file itself already contains these items with full geometry
(groups since Stage 15, mesh parts since Stage 16). The single import already
accepts any root. Only the project import filters them out.

## Goal
The project import lists every top-level item in the file except the room
shell (`RoomBox`), shows its type, and lets the user import it. No change to
the extension, the parser, or the viewer.

## Scope — `app/(app)/products/import-sketchup-project/ProjectImportShell.tsx`
(plus four i18n strings). Surgical edits only.

### 1. Which roots become rows
In `handleFile`, replace the `cabinets` filter with:

```ts
const items = json.roots.filter((r) => r.item_type !== "RoomBox");
```
and use `items` wherever `cabinets` was used (the empty check and the row
building added in Stage 18a). The empty check now shows `t("skuNoItems")`.

### 2. Which rows start ticked
Keep the Stage 18a status logic (`new` / `in_catalogue` / `duplicate_in_file`)
exactly as it is. Change only the initial `selected` value to:

```ts
const AUTO_TICK = new Set(["Cabinet", "Other", "Part"]);
selected: status === "new" && AUTO_TICK.has(root.item_type),
```
`Worktop`, `Appliance` and `Trim` rows are listed and CAN be ticked by hand
(they are `new`), they just do not start ticked. `selectAll` keeps its 18a
rule: it selects every row whose status is `new`, whatever its type.

### 3. Table
- Add a column `{t("skuItemType")}` directly after the Code column. Cell:
  `row.root.item_type` in `text-xs text-slate`. (The value is the exporter's
  English label; do not translate it.)
- The panels / fittings count cells currently read `row.root.panel_count` and
  `row.root.fitting_count`, which the exporter only fills for Cabinets.
  Compute them instead, once per row when the rows are built, and store them
  on the row:

  ```ts
  const { panels, fittings } = cabinetToParts(root);
  // CabinetRow gains: panelCount: number; fittingCount: number;
  ```
  and render `row.panelCount` / `row.fittingCount`.
  (`cabinetToParts` already handles a root that is itself a single part.)

### 4. "Skipped" summary line
`skippedTypes` currently lists every non-Cabinet type from `parsed.summary`.
Change its filter so it lists only `RoomBox`:

```ts
.filter(([type]) => type === "RoomBox")
```

### 5. i18n (`lib/i18n.ts`, BOTH `en` and `ar`)
New keys:
| key | en | ar |
|---|---|---|
| `skuItemType` | `Type` | `النوع` |
| `skuNoItems` | `No importable items found in this file` | `لا توجد عناصر قابلة للاستيراد في هذا الملف` |

Change the VALUE of two existing keys (keys stay the same):
| key | en | ar |
|---|---|---|
| `skuCabinetsLabel` | `Items to import` | `العناصر للاستيراد` |
| `skuNoCabinets` | leave as is (now unused by this file; do not delete) | leave |

If anything on the page shows a cabinet count taken from
`parsed.summary.Cabinet`, show `rows.length` instead.

### DO NOT
- Do not touch `extension/`, `lib/sketchup/parseV3.ts`, `Cabinet3D.tsx`,
  `lib/cabinet3d.ts`, or `SingleImportShell.tsx`.
- Do not change the insert logic, the code/status logic from 18a, or the
  3D preview wiring.
- Do not run any `supabase db` command. Do not commit until Samer confirms.

## Verification
1. `npm run lint`, `npm run typecheck`, `npm test` (10 tests), `npm run build`
   all pass.
2. Samer, after a clean restart, with the project export that failed in 18a
   check e:
   a. Every top-level item of the SketchUp selection appears as a row, with a
      Type (Cabinet / Other / Part / ...), a Code, and panel/fitting counts.
      Only a room shell, if any, is listed as skipped.
   b. Clicking a row shows its 3D preview, including rows of type Other and
      Part.
   c. Rows already in the catalogue, or repeated in the file, are tagged,
      unticked and cannot be ticked (18a rule still holds).
   d. Import: each ticked row becomes a product with its code; in the SQL
      editor

          select p.name_en, p.code,
                 (select count(*) from bom_lines b where b.product_id = p.id) as parts
          from products p where p.item_kind = 'product' order by p.created_at desc;

      shows the new products with parts > 0 (a product made only of fittings
      shows 0 until fittings are saved in a later stage; report any such row).

## Commit (after Samer confirms 18a checks a–f and the checks above)
```
git add -A
git commit -m "feat(catalogue): Stage 18a — products.code join key; project import accepts all top-level items"
git push
```
