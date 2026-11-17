# Stage 19a — Saved products draw their real 3D

**Model:** Opus review in a FRESH Claude Code session (Step 1), Sonnet for the
app work (Step 3).
**Phase:** 2 (Geometry closure), first item. Requires 18f (done, 241742f).

## Diagnosis (done, 17 Nov 2026)
The import preview is right; the saved-product preview is empty. Cause:
- On import only each panel's sorted size and its SketchUp position are
  stored (`bom_lines.pos_x/y/z_mm` = SketchUp world centre, Z up). In
  `tasks/test-exports/Accessories_Codes.json` the cabinet sits at X = 11400 mm.
- `ProductForm.tsx` hands those positions to `rawPanels` →
  `buildBoxesFromRawPanels` (written for the 3DS importer), which assumes
  viewer coordinates (Y up) near the origin. The cabinet is drawn 11.4 m off
  to the side with height and depth swapped; the camera looks at nothing.
- Orientation (`axes`), true outlines, channel profiles, meshes, tooling and
  all fitting positions are not stored at all.

## Decisions (Samer, 17 Nov 2026)
1. Save the model's geometry on import, separately from the price lines, and
   draw the saved product through the SAME path as the import preview.
2. The picture is the model **as imported**. Editing the parts list by hand
   does not change it; re-importing does. Products made by hand keep today's
   simple box drawing.
3. Existing imported products need one re-import ("Update catalogue entry")
   to get their 3D; until then they show a short "re-import" note, not an
   empty box.

## Already written (do NOT rewrite; read first)
- `supabase/migrations/20261117150000_product_geometry.sql`
  - `geometry_meshes (mesh_ref pk, data)`: meshes stored once, keyed by a
    fingerprint of the exact stored data that the APP computes
    (`meshContentRef` in `lib/geometry.ts`), not by the export's own ref;
    insert-only for office, read for staff, never updated or deleted;
  - `product_geometry (product_id, size_id, leaves jsonb, …)`: one record per
    model and one per standard size;
  - `save_product_geometry(product, size, leaves, meshes, meta)` and
    `get_product_geometry(product, size)`, both SECURITY INVOKER.
- `supabase/tests/19a_geometry_checks.sql` (G1–G8).
- `lib/geometry.ts`: `GeometryLeaf`, `partsToLeaves`, **`leavesToSkuPanels`
  (the ONE mapping to what Cabinet3D draws)**, `partsToSkuPanels`,
  `meshesForLeaves`, `saveProductGeometry`, `loadProductGeometry`.
  Tests: `lib/geometry.test.ts` (uses the real test export).
- `lib/catalogImport.ts`: `ImportMeta` gains optional `export_schema` and
  `meshes`; `updateCatalogueEntry` / `addStandardSize` now also save the
  geometry and return `geometryError` in `ImportOutcome`.

The migration and checks were run against a local PostgreSQL 16 copy built
from the seven existing migrations (stand-ins for Supabase's `auth` schema
and roles): it applied cleanly, G1–G8 gave the wanted results, and the 18d
checks still pass. That is not the live database.

The app builds as it is now (new fields are optional); until Step 3 nothing
calls the new code.

---

## Review history
First review (17 Nov): everything fine except point 4 — the export's
`mesh_ref` (`mesh_hash` in `main.rb`) sorts each triangle's corner numbers,
so a part and a reversed-face copy share a ref while their triangles differ;
with a shared, never-replaced mesh table the first one stored would win for
ever. **Fix made (no extension change needed for the database):** the app no
longer uses the export's ref as the key. `contentAddress` re-keys every mesh
by SHA-256 of its exact vertices + triangles and rewrites the leaves' refs
before saving; tests in `lib/geometry.test.ts` ("content keys for stored
meshes"). Also added from that review: index on `product_geometry
(product_id)`, comment about instance scale. The extension's own hash is
still wrong WITHIN one export (a reversed-face copy is drawn like the first
copy, in the import preview too): that is fixed in the next stage (19b,
extension v0.6.13), not here.

## Step 1 — Claude Code (Opus, fresh session): review, no app edits
Read in full: the eight files in `supabase/migrations/`,
`supabase/tests/19a_geometry_checks.sql`, `lib/geometry.ts`,
`lib/geometry.test.ts`, `lib/catalogImport.ts`, `lib/cabinet3d.ts`
(`SkuPanel3D`, `buildBoxesFromSkuPanels`), `components/Cabinet3D.tsx` (how
`skuPanels` and `meshes` are consumed), and the 3D-preview code in
`app/(app)/products/ProductForm.tsx` and the two import shells. You did not
write any of the new files. Report on each point:
1. Applies cleanly on top of the seven earlier migrations? (FK to
   `product_sizes (id, product_id)` — the unique constraint from 18b;
   `set_updated_at`; names; enum literal `'product'`.)
2. **Access.** RLS on both tables, grants for `authenticated` / `anon` /
   `public`, default privileges. Can anyone who logs in update or delete a
   stored mesh? Can a non-office user write anything? Can a deactivated user
   read anything? Do the two functions leak or allow anything their RLS does
   not? (`on conflict do nothing` under RLS; `jsonb_each` on hostile input.)
3. **No money.** Confirm nothing in `leaves`, `meshes` or the two functions
   can carry or expose a price, cost, labor, markup or supplier (18d rule),
   so staff-wide read is right.
4. **Mesh identity (re-check after the fix above).** A mesh is stored under
   `meshContentRef(mesh)` and the first one stored wins. Confirm: two meshes
   get the same key only if their vertices and triangles are identical,
   order and winding included; every leaf is re-pointed to the new key and
   still finds its own data; no path saves a mesh under the export's ref
   (`saveProductGeometry` is the only writer). `crypto.subtle` availability
   where this runs (browser on localhost / https; Node 22 in CI). If two
   different meshes could still share a key, that is a defect: say so and STOP.
5. **Same picture.** Is `leavesToSkuPanels(partsToLeaves(parts))` exactly
   what the import shells build inline today, field for field, including
   after a JSON round trip (undefined vs missing, number precision)? Is any
   field the viewer reads from `SkuPanel3D` or from the leaf missing from
   `GeometryLeaf` (check `reflected`, `role`, `item_type`, `sorted_mm`)?
   Is anything the viewer needs kept ONLY at file level besides `meshes`?
6. **Size and limits.** One cabinet's payload (leaves + its meshes; the test
   export is about 300 KB) against PostgREST / Supabase request limits and
   row size; the `get` function's cost per call.
7. **Failure modes.** Parts saved but geometry not (the `geometryError`
   path); a standard size deleted; a product deleted; a re-import replacing
   geometry while another user has the product open.
8. Anything the migration should do and does not, within this stage.

If you find a real defect: fix it with a surgical edit to the migration, the
checks or the two lib files (nothing is applied or called yet) and say
exactly what you changed and why. If you only have doubts, report them and
STOP. Do NOT run any `supabase db` command. Do not touch app code.

## Step 2 — Samer: apply, then check
Only after Step 1 reports no open defects.

    npx supabase db push --remote --dry-run

It must list exactly one migration: `20261117150000_product_geometry.sql`.

    npx supabase db push --remote

Then run **G1 to G8** from `supabase/tests/19a_geometry_checks.sql`, one
block at a time.

| Check | Wanted |
|---|---|
| G1 | new meshes 1 · leaves 2 · meshes 1 · file TEST.skp |
| G2 | second save new meshes 0 · geometry rows 1 · leaves now 1 · mesh rows 1 · first mesh kept [[0, 0, 0]] |
| G3 | REFUSED (good) · geometry rows 0 |
| G4 | reads leaves 1 · save BLOCKED · mesh insert BLOCKED · geometry delete 0 rows · mesh update BLOCKED or 0 rows |
| G5 | admin update BLOCKED or 0 rows · admin delete BLOCKED or 0 rows |
| G6 | installation leaves 1 |
| G7 | deactivated user: nothing · 0 · 0 |
| G8 | wrong-product size REFUSED · size leaves 1 · base leaves 2 · after delete 0 |

Any other result: stop and report it. Do not continue to Step 3.

## Step 3 — Claude Code (Sonnet): app wiring
Surgical edits. Every new string in BOTH `en` and `ar`. Do NOT touch
`components/Cabinet3D.tsx` or `lib/cabinet3d.ts`.

### 3.1 Import previews use the one mapping
In `SingleImportShell.tsx` (`allLeaves`) and `ProjectImportShell.tsx`
(`previewPanels3D`): replace the inline `.map((part) => ({ part_role: …}))`
with `partsToSkuPanels([...panels, ...fittings])` from `@/lib/geometry`.
Remove imports that become unused (`inferRole` if nothing else uses it).

### 3.2 Imports save the geometry
Both shells, everywhere `meta` is built for `updateCatalogueEntry` /
`addStandardSize`: add `export_schema: parsed.schema` and
`meshes: parsed.meshes`.

Both shells, CREATE path: right after a successful `replace_bom_lines` (and
also when there are no rows), call

    const gErr = await saveProductGeometry(
      supabase, prod.id, null, parts, parsed.meshes,
      { source_filename: parsed.model, export_version: parsed.version ?? null, export_schema: parsed.schema },
    );

(`parts` = all leaves, panels + fittings.) A geometry failure must NOT roll
the product back.

Reporting a geometry failure (`gErr` on create, `out.geometryError` on
update / add size):
- Single import: append to the success message, in rust, on its own line:
  `t("geometryNotSaved")`.
- Project import: count them; after the run, if the count > 0, show one rust
  line in the result box: `t("geometryNotSavedCount").replace("{n}", …)`.

### 3.3 The saved product draws from its geometry
`app/(app)/products/types.ts`: add `source?: string | null;` to `Product`.
`app/(app)/products/page.tsx` (office path only): add `source` to the
selected product columns.

`app/(app)/products/ProductForm.tsx`:
- New state `geometry: StoredGeometry | null` and `geometryLoaded: boolean`.
  In an effect keyed on `product?.id`: when there is an id, call
  `loadProductGeometry(createClient(), product.id)` and store the result;
  with no id, set null / loaded.
- 3D preview block — replace the current condition and props with, in order:
  1. `geometry` is set →
     `<Cabinet3D cabinetWidth… cabinetHeight… cabinetDepth… parts={[]}
       skuPanels={geometry.skuPanels} meshes={geometry.meshes} />`
     (same three dimension props as today).
  2. else, `geometryLoaded` and `product?.source === "sketchup_json"` → no
     viewer; a bordered note (`border border-line rounded-lg p-4 text-sm
     text-slate`): `t("geometryReimportNote")`.
  3. else → exactly today's behaviour (the existing condition, `parts` and
     `rawPanels` props), so 3DS / DXF imports and hand-made products are
     unchanged.
  While geometry is still loading for a `sketchup_json` product, render the
  same 400 px placeholder box the dynamic import uses, not the note.
- Do not change `rawPanels3D` or anything else in the form.

### 3.4 i18n
- `geometryNotSaved`: `The parts were saved, but the 3D model was not. Import the file again to retry.` / `تم حفظ القطع، لكن لم يُحفظ النموذج ثلاثي الأبعاد. أعد استيراد الملف للمحاولة مجدداً.`
- `geometryNotSavedCount`: `{n} item(s) were saved without their 3D model. Import the file again to retry.` / `حُفظ {n} عنصر بدون النموذج ثلاثي الأبعاد. أعد استيراد الملف للمحاولة مجدداً.`
- `geometryReimportNote`: `This model was imported before 3D models were saved. Import its SketchUp file again and choose "Update catalogue entry" to see it in 3D.` / `تم استيراد هذا الموديل قبل حفظ النماذج ثلاثية الأبعاد. أعد استيراد ملف SketchUp واختر "تحديث عنصر الكتالوج" لعرضه ثلاثي الأبعاد.`

### 3.5 `CLAUDE.md`
After the Fittings paragraph add:

    3D of a saved product: the geometry is stored on import
    (product_geometry + geometry_meshes, via save_product_geometry /
    get_product_geometry) and drawn through lib/geometry.ts
    leavesToSkuPanels — the same mapping the import preview uses. Never
    build SkuPanel3D anywhere else, and never draw a SketchUp import from
    bom_lines positions.

### Then
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — all must
pass (stop the dev server before the build). Report the diff summary and
anything that did not match the code. Do NOT commit.

## Step 4 — in-app test (tester agent, script by Claude chat) + Samer's eye
Samer: clean restart, signed in in the browser pane, tell Claude chat.
The agent re-imports `DR2-K3` ("Update catalogue entry") and compares the
saved product's 3D with the import preview. **Samer gives the final look**:
open `DR2-K3` and one of his own models after re-importing it.

## Step 5 — Claude Code: commit
Only after Step 2 and Step 4 are accepted.
```
git add -A
git commit -m "feat(3d): Stage 19a — model geometry saved on import; saved products draw their real 3D"
git push
```

## Out of scope (stay out)
- 3D preview per standard size in `StandardSizes.tsx` (geometry is stored per
  size from now on; showing it is a later stage).
- Removing `bom_lines.pos_*` or `buildBoxesFromRawPanels` (3DS still uses them).
- Stage 16 visual verification, the `ALLOY_DIAG` / `_loop_pts` extension clean-up.
- Any change to the viewer's drawing code.
