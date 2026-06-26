# STAGE 15b — Groups Parity: Fix

**Extension:** `alloy_export` v0.6.9 → **v0.6.10**.
**Schema:** `alloy.sketchup.v6.4` → **v6.5** (group leaves now carry full oriented +
scale-aware data; no field renames, additive only).
**Predecessor:** Stage 15a diagnostic (`groups_diag.txt` + `alloy_export_0.6.9_diag_groups.json`).

---

## What 15a proved (decisions are locked by runtime evidence)

1. **Orientation — reuse as-is.** `world_axes(tr)` already reads group axes
   correctly; every group leaf in the dump had a faithful permuted basis. No
   change needed for orientation.
2. **Scale — recoverable, currently LOST.** `instance_scales` reads scale from the
   raw `transformation.to_a` column magnitudes. The "scaled shelf" group reported
   `(1.0, 1.6455, 1.0)` from `to_a`, but groups are hard-coded to `[1,1,1]`, so
   today they export the **unscaled** size (350 instead of ~575 mm). `local_bounds`
   is the unit frame ⇒ scale MUST be applied (no double-count). Verified: local
   564 × 1.6455 = 928 = reported world AABB extent.
3. **Reflection — det sign is CONTAMINATED, do NOT reuse the component test.**
   The dump reported `det(basis) = −1` for **all 16 leaves**, including the
   un-mirrored baseline, because `Make Group` bakes a `−1` into the transform's
   Y row (SU axis convention). Absolute determinant sign is therefore NOT a
   reflection signal for groups. 15b needs a parity-relative signal (below).
4. **Faces — reachable.** `faces=6`/`36`, `thickness_face_found=true` everywhere.
   `face_outline`/`detect_cuts`/`detect_tooling` run unchanged once the geometry
   source is swapped from `e.definition.entities` to `entities_of(e)`.

---

## The work

### 1. Generalise `instance_scales` to groups
Currently (~L452):
```ruby
def self.instance_scales(e)
  return [1.0, 1.0, 1.0] unless e.is_a?(Sketchup::ComponentInstance)
  m = e.transformation.to_a
  ...
```
Change the guard to accept any instance (`instance?(e)`), since `to_a` column
magnitudes are valid for groups too (15a Q3). Components unaffected (their
transform columns are unit unless non-uniformly scaled — same code path).
Keep the column-magnitude formula exactly as-is.

### 2. Make the geometry-measuring helpers group-capable
`face_outline` (~L261), `cross_section` (~L351), `detect_cuts` (~L86),
`detect_tooling` (~L480) all begin with
`return ... unless e.is_a?(Sketchup::ComponentInstance)` and then bind
`defn = e.definition; ents = defn.entities; bb = defn.bounds`.

Refactor each to source geometry generically:
```ruby
return ... unless instance?(e)
ents = entities_of(e)            # defn.entities for component, e.entities for group
bb   = local_bounds(e)           # already group-correct (15a: unit-frame extents)
```
Everything downstream (thickness-axis pick, face projection, u/v origins, scale
multiply) is geometry-driven and already correct — 15a Q4 confirms the
thickness-normal face is found for groups. Do **not** otherwise alter the
algorithms.

> Watch: `face_outline`/`cross_section`/`detect_*` read `bb.min`/`bb.center` as the
> local origin. For groups, `local_bounds` min may be nonzero (dump showed
> `(0,0,0)` mostly, but `(-0.7087,0,7.0866)` once). The code already references
> `coord(bb.min, …)` as the origin, so this is handled — just confirm no helper
> assumes a zero min.

### 3. Reflection signal that survives SU's baked −1  (the only NEW logic)
Do NOT use `det(basis) < 0` for groups. Instead compute reflection **parity
relative to the export root**, so the baked-in SU convention cancels out:

- Track sign of `det(parent_tr * e.transformation)` (the FULL world transform of the
  leaf, including accumulated parents) — call it `world_det_sign`.
- Also compute the root's own `world_det_sign_root` once.
- A leaf is **reflected** iff `world_det_sign(leaf) != world_det_sign_root`.

Rationale: the constant −1 SketchUp bakes into every `Make Group` is present in
BOTH the leaf and the root, so a *relative* parity check cancels it and leaves only
genuine mirroring. (For components this reduces to the existing absolute test
because their baseline sign is +1, but to avoid regressions keep components on
their current path and apply the parity test only on the group branch — or apply
parity to both and verify components still pass on a known-good v0.6.9 model.)

Emit the result as a leaf field `reflected: true|false` (additive, schema v6.5) so
the viewer's Matrix4 path can consume it deterministically instead of
re-deriving sign downstream. **Confirm against the 15a mirror twin**: the real
flipped group must come out `reflected: true` while its un-flipped baseline twin
comes out `reflected: false`, even though both show raw `det = −1`.

### 4. `mesh_ref` for group fittings (lower priority — gate on need)
`definition_mesh` is component-only (keys the cache by `definition`). Groups have no
definition to key on. Two options — pick per 15a/real-model need, do NOT over-build:
  - (a) skip group mesh for now (group fittings keep box/profile render), or
  - (b) hash the group's `entities` mesh geometry directly (reuse `mesh_geometry`
    against `entities_of(e)` + `mesh_hash`), keyed by content hash like components.
Default to (a) unless a real group-fitting case in the catalog needs (b).

### 5. Apply outputs in `build_node`
In the leaf branch (~L737): groups now get real `sx,sy,sz` from the generalised
`instance_scales`, so the existing `size_mm`/`sorted_mm` scale-multiply lines
start producing correct group sizes automatically. Then the now-ungated
`face_outline` / `detect_cuts` / `detect_tooling` / `cross_section` populate the
same fields they already do for components. Add `node[:reflected]` from step 3.

---

## Verification (runtime evidence required — do not declare done from reasoning)

Re-run the export on the **same `groups_diag.skp`** and confirm against 15a:

- [ ] **Scaled shelf** group `size_mm` now reflects scale: the 1.6455× axis reads
      ~928 (was 564) / ~575-class magnitude, matching its 15a world AABB — not the
      old unscaled 350/564.
- [ ] **Mirror twin** group: `reflected: true`; its **baseline twin**:
      `reflected: false`. (The discriminator that 15a showed raw-`det` cannot make.)
- [ ] **Grooved panel** group now emits a non-empty `cuts[]` matching the dado you
      cut (≈9 mm wide, 8 mm deep), where 15a showed `cuts: []`.
- [ ] `outline_mm` present on group panels (was absent in 15a JSON).
- [ ] Components on a known-good v0.6.9 model are **byte-identical** (no
      regression) — diff a component-only export before/after.
- [ ] Schema string now `alloy.sketchup.v6.5`, version `0.6.10`.

Provide the new JSON + a short diff note vs the 15a JSON for the scaled/mirror/
grooved leaves.

---

## Doc-sync (folded into this stage's close, per decision)
After verification passes, update BOTH stale project docs to current reality:
- `03-sketchup-export-schema.md`: bump to `alloy.sketchup.v6.5` / v0.6.10; document
  `outline_mm`, `profile_mm`, `cuts`, `tooling`, `mesh_ref`, `axes`, `reflected`;
  note groups now reach parity with components; correct the v2→v3→v4 history to the
  real v6.x lineage; state the `det`-sign caveat for groups (baked SU −1, parity
  test used).
- `05-roadmap-open-items.md`: mark Stages 8–15 closed with one-line summaries;
  re-state open items (v6 persistence of outline/profile/mesh to `bom_lines`;
  Phase B SketchUp→quotation importer; Z-flip upstream guard); drop the stale
  "v4 ingest is next" framing.

---

## Out of scope (15b)
- Viewer consumption of `reflected` (Cabinet3D already has the Matrix4 path; wiring
  the new field through is a separate viewer stage if needed).
- v6 persistence to `bom_lines`.
- Phase B quotation importer.
