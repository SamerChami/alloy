# STAGE 16 — Faithful Per-Leaf Mesh (gated emit + viewer consume)

## Goal
Make the viewer show each leaf exactly as it appears in SketchUp — cutouts,
push/pull, mixed thickness, cut edges. Achieve this by emitting a triangulated
mesh for COMPLEX leaves only, and rendering it in place of the outline box.
PLAIN leaves are unchanged (still rendered from `outline_mm`).

Feature layers (`cuts`, `tooling`, `outline_mm`, `profile_mm`, `sorted_mm`,
`size_mm`) stay intact on ALL leaves — BOM and pricing are untouched. Mesh is
**display-only**.

Diagnostic evidence (Stage 16 DIAG, `mesh_diag.geomprobe.json`) validated the
gate: `plain` → 6 faces / 6 normals / axis-aligned / no inner loops → PLAIN;
`mesh` → 120 faces / 104 normals / 22 axis-aligned / inner loops → COMPLEX. No
gate misfires. `solid_vol_mm3` was null on both leaves — do NOT rely on
`.volume` / solidity anywhere.

---

## Part A — Exporter (`extension/alloy_export/main.rb`)

### A1. Geometry gate (validated rule — ship as-is)
Add `leaf_is_plain?(e)` using existing `entities_of(e)` / `local_bounds(e)`.
Returns true when ALL hold:
- face_count == 6
- no face has more than one loop (no inner loops / holes)
- every face normal (in the leaf LOCAL frame) is within 1e-3 of ±local X/Y/Z
- exactly 6 distinct local-frame normals (rounded 3dp)

Otherwise the leaf is COMPLEX.

### A2. Mesh emission for COMPLEX leaves
For each COMPLEX leaf, build a triangulated mesh **in the leaf's LOCAL frame**
(the same convention `mesh_ref` fittings already use — reuse that exact code
path; do not invent a second mesh serializer):
- Triangulate via `entities.each { |f| f.mesh }` polygon meshes, accumulate
  vertices + triangles in local coordinates (mm).
- Hash the mesh (same dedup hash used for fittings) and store under
  `meshes[<hash>]` = `{ vertices: [[x,y,z]...], triangles: [[i,j,k]...] }`.
- Set `mesh_ref: <hash>` on the leaf.
- Reflection: the leaf's `axes` already encode orientation incl. det<0; the
  local-frame mesh is placed by the viewer's `Matrix4` path. Do NOT bake
  world orientation into the emitted vertices — keep them local, exactly like
  fittings.

PLAIN leaves: emit NO mesh, NO `mesh_ref`. Untouched.

### A3. Do NOT
- Do NOT strip or alter `cuts`, `tooling`, `outline_mm`, `profile_mm`,
  `size_mm`, `sorted_mm` on any leaf (complex leaves keep them for BOM/pricing).
- Do NOT change fitting mesh emission (this generalises it, doesn't replace it).
- Do NOT rely on `.volume` or solid-manifold status.

### A4. Schema bump
- Bump `SCHEMA` to `alloy.sketchup.v6.6` and `VERSION` to `0.6.12`.
- v6.6 = v6.5 + `mesh_ref` may now appear on PANEL leaves (previously fittings
  only). Structurally backward-compatible; parser change is additive.

### A5. Remove the [16DIAG] probe
Delete the temporary `# [16DIAG]` probe blocks and the
`mesh_diag.geomprobe.json` sidecar writer added in the DIAG stage. Grep for
`16DIAG` — must return nothing after.

---

## Part B — Parser (`lib/sketchup/parseV3.ts`)

`mesh_ref` is already a carried field on `V3Part`. Confirm it is carried for
ALL leaves (panels included), not gated to fittings anywhere. If any
fitting-only guard exists around `mesh_ref`, remove it. No type changes expected
beyond that (the field already exists in `V3Node` and `V3Part`).

---

## Part C — Viewer (`components/Cabinet3D.tsx`, `lib/cabinet3d.ts`)

### C1. Unified render priority per leaf
Change leaf rendering to this precedence:
1. **`mesh_ref` present** → render the referenced mesh from the `meshes` dict.
2. else **`outline_mm` present** → existing oriented-outline path.
3. else → existing box path.

This unifies panels and fittings onto one mesh path. Fittings already use
`mesh_ref`; panels now join it when COMPLEX.

### C2. REPLACE, not overlay
When a leaf renders via `mesh_ref`, it is the SOLE visual for that leaf. Do NOT
also draw the outline box or the size_mm box for that leaf (avoids z-fighting).
`outline_mm` remains in the payload as pricing/fallback data only.

### C3. Reflection correctness
Place the mesh with the same reflection-preserving `Matrix4`
(`matrixAutoUpdate=false`, orientation from the leaf `axes`, det<0 survives)
already used for fittings and outline panels. Do NOT use
`quaternion.setFromRotationMatrix` (drops det=−1). Cuts/tooling children, if
still drawn, inherit the parent mesh matrix as today.

### C4. Cuts/tooling overlay on mesh leaves
For a COMPLEX leaf, the mesh already contains the true cutouts/holes visually.
Do NOT additionally render `cuts`/`tooling` geometry on top of a `mesh_ref`
leaf — that would double-draw. Keep cuts/tooling rendering ONLY on the
outline/box paths (leaves without `mesh_ref`).

---

## Verification (all must pass)

### JSON / export
1. Re-export `mesh_diag.skp`. Confirm:
   - `plain` leaf: NO `mesh_ref`, still has `outline_mm`.
   - `mesh` leaf: HAS `mesh_ref`; `meshes` dict has one entry; `cuts`/`tooling`/
     `outline_mm`/`sorted_mm`/`size_mm` all still present.
   - `schema: "alloy.sketchup.v6.6"`, `version: "0.6.12"`.
2. `grep 16DIAG` across the extension → nothing.

### App visual (REQUIRED — JSON correctness alone is insufficient)
3. Import `mesh_diag.skp` into the app. In the 3D viewer:
   - `plain` renders as a clean rectangular panel (unchanged).
   - `mesh` renders with its actual through-cutout, blind pocket, bored circle,
     mixed thickness, and cut edges — matching SketchUp. Compare side-by-side
     with SketchUp and confirm parity.
   - `mesh` is NOT double-drawn (no ghost box, no z-fighting, no duplicated
     cut geometry).
4. Rotate/flip check: confirm the `mesh` leaf is not mirrored/inverted
   (reflection matrix correct). If `mesh_diag.skp` has no flipped instance,
   note that a flipped-instance check is deferred to the next mesh model.

### Regression
5. Open an existing saved product / prior test model with fittings — confirm
   fittings still render (shared mesh path not broken) and plain panels still
   render from outline.

---

## Commit
- Extension + app in the SAME commit (schema + consumer move together):
  `feat: Stage 16 — faithful per-leaf mesh for complex parts (v6.6 / 0.6.12)`
- Update `03-sketchup-export-schema.md` and `05-roadmap-open-items.md` as part
  of stage close (mesh_ref now on panels; note the gate rule; mark Stage 16
  closed). Doc-sync folded into close, not mid-stream.

## Install / dev discipline
- Repackage `.rbz` (loader stub at archive root + nested `alloy_export/main.rb`).
- Uninstall → quit SketchUp fully → delete `Plugins\alloy_export` → reinstall.
  Verify no bare `Plugins\main.rb` at root.
- Confirm build via Ruby Console: `puts Alloy::Export::VERSION` / `::SCHEMA`.
- After viewer changes: kill Next.js, `npm run dev` fresh, hard-refresh
  (Ctrl+Shift+R).
- Set `$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000` before launching Claude Code.

## Report back
- Re-exported `mesh_diag.json` (both leaves).
- Screenshot pair: SketchUp vs app viewer for the `mesh` leaf.
- Confirmation of no double-draw and plain-panel regression clean.
