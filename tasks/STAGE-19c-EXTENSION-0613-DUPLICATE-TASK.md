# Stage 19c — Extension v0.6.13 (mesh orientation), Duplicate keeps the 3D

**Phase:** 2 (Geometry closure). Requires 19b (done, bb64617).
**Models:** the extension change is already written and tested by Claude
chat; Samer verifies it in SketchUp (Part A). Sonnet does the small app
wiring (Part B). No database change.

## What this stage fixes
1. **Reversed faces in exports.** SketchUp draws both sides of a face, so a
   model can carry reversed faces nobody sees there. Exported as-is, their
   triangles point into the solid. Measured in
   `tasks/test-exports/Accessories_Codes.json` (v0.6.12): the bottom end face
   of `Left_Side` and of `Right_Side` (2 triangles each). The viewer hides
   this since 19b (both sides drawn); the data should still be right.
2. **`mesh_hash` threw the facing away** (it sorted each triangle's corners),
   so within one export a part and a reversed-face copy shared one
   `mesh_ref` and were drawn as the first one (19a review).
3. Leftovers in the extension: the `ALLOY_DIAG` groups diagnostic and the
   internal `_loop_pts` field leaking into `tooling`.
4. **Duplicate loses the 3D.** A duplicated product gets no `source` mark and
   no geometry, so it falls through to the old drawing path and shows
   scattered slivers (`Coffee_Corner (copy)`).
5. "Fittings: 3" beside six fitting rows on the single-import screen.

## Already written and tested (do NOT rewrite)
- `extension/alloy_export/main.rb` **v0.6.13**, `extension/alloy_export.rb`
  (loader, 0.6.13), packaged as `extension/alloy_export_0_6_13.rbz`
  (same layout as 0.6.12: `alloy_export.rb` + `alloy_export/main.rb`).
  - `orient_outward(mesh)`: welds vertices by position, walks across shared
    edges flipping neighbours that disagree, then turns a closed, consistent
    piece inside-out if its signed volume is negative. Open / non-manifold /
    non-orientable pieces are left exactly as exported. Vertices never change.
  - `mesh_geometry` calls it; `remember_mesh` stores each mesh once and
    counts what was corrected; new top-level JSON field
    `mesh_report: { meshes, corrected_meshes, flipped_triangles, not_closed_meshes }`
    (also printed to the Ruby console).
  - `mesh_hash` rotates each triangle so its smallest corner is first and
    KEEPS the corner order.
  - `ALLOY_DIAG` (constant, `diag_leaf`, `diag_walk`, `run_diag`, the call)
    and `_loop_pts` removed. `FITTING_KEYS` untouched. Schema string
    unchanged (`alloy.sketchup.v6.6`): no existing field changed meaning.
  - Tested outside SketchUp by replaying the meshes of the v0.6.12 test
    export through the real `definition_mesh` path with stand-in SketchUp
    objects: `mesh_report = { meshes 8, corrected_meshes 2,
    flipped_triangles 4, not_closed_meshes 4 }`; `Left_Side` bottom end face
    10080 mm² all facing down, 0 up; the four leg meshes are not closed
    solids and are left as they are; synthetic cube tests (one face
    reversed, whole cube inside-out, open box, hash order-independent but
    facing-dependent) pass; `ruby -c` clean. NOT yet run inside SketchUp.
- `lib/geometry.ts`: `copyProductGeometry(supabase, fromId, toId)` + tests.

---

## Part A — Samer, in SketchUp (diagnostic gate: JSON first)
1. Install v0.6.13 the safe way: Extension Manager → uninstall ALLOY Export →
   quit SketchUp completely → delete the folder `Plugins\alloy_export\` and
   the file `Plugins\alloy_export.rb` if they are still there → start
   SketchUp → install `extension\alloy_export_0_6_13.rbz`.
2. Ruby Console: `puts Alloy::Export::VERSION` must print `0.6.13`.
3. Open the same model the test export came from (`test.skp`, cabinet
   `DR2-K3__80`), select the cabinet, Extensions → Export to ALLOY (JSON),
   save as `tasks\test-exports\Accessories_Codes_0613.json`.
   The Ruby Console prints a line `[ALLOY v0.6.13] mesh_report: {...}`.
4. Tell Claude chat. It compares the new file with the v0.6.12 one by data:
   wanted — `mesh_report` corrected 2 / flipped 4 / not closed 4; both side
   panels' bottom end faces outward; no `_loop_pts`; every leaf's name, size,
   position, axes, outline, profile, cuts and tooling unchanged; vertices of
   every mesh unchanged; only mesh keys and the 4 corrected triangles differ.
Do not go on to the app check of the new export until step 4 passes.

## Part B — Claude Code (Sonnet): app wiring
Surgical edits; every new string in BOTH `en` and `ar`.

### B.1 Duplicate keeps the 3D — `app/(app)/products/ProductForm.tsx`
In `handleDuplicate`:
- in the `insert({...})` add `source: product.source ?? null,`
- after `saveBomLines(newProd.id)` succeeds:

      const gErr = await copyProductGeometry(supabase, product.id, newProd.id);
      if (gErr) { setDuplicating(false); setError(t("duplicateNoGeometry")); return; }

  (import `copyProductGeometry` from `@/lib/geometry`). The copy is NOT
  rolled back when only the 3D fails; the message tells the user.
- i18n `duplicateNoGeometry`: `The copy was created, but its 3D model could not be copied. Import its SketchUp file onto the copy to get it.` / `تم إنشاء النسخة، لكن تعذّر نسخ النموذج ثلاثي الأبعاد. استورد ملف SketchUp على النسخة للحصول عليه.`

### B.2 Export report — `lib/sketchup/parseV3.ts`
Add to `V3Json` (optional, after `meshes`):

    // v0.6.13: what the exporter's face-orientation pass did
    mesh_report?: {
      meshes: number;
      corrected_meshes: number;
      flipped_triangles: number;
      not_closed_meshes: number;
    };

### B.3 Single import summary — `SingleImportShell.tsx`
- Fittings count: keep the number of LINES as the bold figure and add the
  number of drawn fitting parts after it, in `text-xs text-slate`:
  `({t("fittingPartsCount").replace("{n}", String(panels.length + fittings.length - priced.panelCount))})`.
- Under the counts, when `parsed.mesh_report && parsed.mesh_report.corrected_meshes > 0`,
  one `text-xs text-slate` line:
  `t("exportFixedFaces").replace("{parts}", …corrected_meshes).replace("{faces}", …flipped_triangles)`.
- i18n:
  - `fittingPartsCount`: `{n} drawn parts` / `{n} قطعة مرسومة`
  - `exportFixedFaces`: `The export corrected reversed faces in {parts} part(s) ({faces} triangles). The model in SketchUp still has them.` / `صحّح التصدير أوجهاً معكوسة في {parts} قطعة ({faces} مثلثات). ما زالت موجودة في نموذج SketchUp.`

### Then
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — all must
pass (stop the dev server before the build). Report the diff summary. Do NOT
commit.

## Part C — in-app test (tester agent, script by Claude chat)
- Import `Accessories_Codes_0613.json` (single): counts, the "corrected
  reversed faces" line, 3D right, both side-panel bottom faces solid.
- Duplicate `DR2-K3`: the copy opens with the same 3D (no slivers, no note).
- Samer looks at the copy and at the re-imported model.

## Part D — Claude Code: commit
```
git add -A
git commit -m "feat(3d): Stage 19c — extension v0.6.13 orients mesh faces outward, facing-aware mesh hash; Duplicate keeps the 3D"
git push
```
Then Claude chat updates `03-sketchup-export-schema.md` (mesh_report,
orientation rule, hash) and the status doc.

## Out of scope
- The four leg meshes are not closed solids (open / non-manifold edges in the
  leg component itself); they are exported as before. Cleaning that component
  in SketchUp is a modelling job, not an exporter one.
- The old `Coffee_Corner (copy)` stays broken (made before this fix): delete
  it or re-import onto it.
- Stage 16 control model (mirrored / reversed-face / stray-edge) and
  double-click-to-centre in the viewer.
