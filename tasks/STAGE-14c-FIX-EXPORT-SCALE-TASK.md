# Stage 14c — FIX (Option A): scale-aware export — measure instance, not definition

> Export-side fix in the Ruby extension (`alloy_export/main.rb`). Surgical, diff-first.
> Viewer/TypeScript: **no changes** — it keeps applying the orientation it already does.

## Root cause (confirmed by Stage 14b logs — not a theory)
The extension measures geometry from the component **definition** box
(`defn.bounds`), which is in **unscaled definition-local space**. But several
instances are **scaled** in their placement transform (the user resized them in
SketchUp). So the export reports the definition size, not the placed size. Proof:
for every wrong part, `e.bounds` (instance world AABB) equals the true SketchUp value
and `defn.bounds` is off — by a clean per-axis scale factor:

| Part | defn z | instance z (truth) | local-axis scale |
|------|-------:|-------------------:|-----------------:|
| `Top_Back#91`, `Bottom#107` thickness | 16.8 | 18.0 | z ×1.0714 |
| `Back#95` (local z = width-ish) | 703.2 | 752.0 | z ×1.0694 |
| `Right_Side#114` / `Left_Side#114` height | 720.0 | 770.0 | z ×1.0694 |
| `Leg_12cm#*` length | 168.5 | 110.0 | z ×0.6528 |

The scale is **non-uniform** (only one local axis here) and can co-occur with
**rotation and reflection** (`Right_Side` is mirrored AND scaled). So we cannot apply
one scalar — we must respect per-axis scale. The axis vectors currently logged are
unit-normalized, which is exactly why orientation looked correct but sizes were wrong:
the scale was normalized away.

## The fix principle
**Measure in INSTANCE space, not definition space.** Apply the instance
transformation to the geometry before measuring extents, building the outline loop,
and emitting mesh vertices. This handles rotation + reflection + non-uniform scale in
one step, with no manual transform decomposition.

Concretely, the linear part of the instance transform maps definition-local → a
scaled/rotated frame. We want the part's true extents and silhouette **as placed**,
but still expressed in the part's own oriented local frame (so the existing
`axes` + viewer routing stays valid). The clean way: extract the **per-axis scale**
from the transformation and apply it to the local measurements, OR transform points
by the full linear part and re-derive the local outline. Pick the approach below that
fits the current code with the least churn.

### Recommended implementation: per-axis scale factors
SketchUp's `Geom::Transformation` exposes the basis columns. The per-local-axis scale
is the **length of each column vector** of the 3×3 linear part:
```ruby
t  = e.transformation
xa = t.xaxis ; ya = t.yaxis ; za = t.zaxis   # these are SCALED in raw form...
# NOTE: t.xaxis/yaxis/zaxis return UNIT vectors in some SU versions. Do NOT rely on
# them for scale. Get scale from the raw matrix instead:
m  = t.to_a                      # 16 floats, column-major
sx = Math.sqrt(m[0]**2 + m[1]**2 + m[2]**2)
sy = Math.sqrt(m[4]**2 + m[5]**2 + m[6]**2)
sz = Math.sqrt(m[8]**2 + m[9]**2 + m[10]**2)
# Also fold in t.scale (uniform component) if the SU version stores scale separately;
# verify against the table above: for Top_Back, the local-z factor must come out 1.0714.
```
`sx, sy, sz` are the scale on the definition's local x/y/z. Multiply the
definition-local extents and outline coordinates by the matching factor.

**Validate the scale extraction against the known table before trusting it.** During
this stage, temporarily print `sx, sy, sz` for the diagnostic parts and confirm:
`Top_Back` local-z ≈ 1.0714, `Leg` local-z ≈ 0.6528, `Right_Side` local-z ≈ 1.0694.
If they don't match, the scale is stored elsewhere in the transform (e.g. a separate
uniform `t.scale` times an embedded factor) — reconcile until the numbers match the
table, because that table is ground truth.

### Apply the scale everywhere the definition box is used
1. **`size_mm` / `sorted_mm`** — multiply each definition-local extent by its axis
   scale before writing. After fix, `size_mm` for these parts must equal the
   `instance.bounds` extents from the 14b logs (e.g. `Right_Side` → z 770, `Leg` → z
   110, `Top_Back` → thickness 18).
   - Simplest robust source: use `e.bounds` (instance world AABB) extents directly for
     `size_mm` where the part axes are a signed permutation (our case) — but be careful:
     `e.bounds` is a WORLD AABB, so for a rotated part its extent ORDER is world-axis
     order, not local. Keep `size_mm` defined exactly as it is today (definition-local
     axis order) but with each axis scaled by `sx/sy/sz`. Do NOT silently switch the
     axis convention — only scale it. Many downstream pieces depend on the current
     local-axis ordering of `size_mm`.
2. **`outline_mm.loop`** — the loop is built in definition-local (u,v). Scale each
   point's u by the u-axis scale and v by the v-axis scale, and scale
   `thickness_mm` by the thickness-axis scale. The u_axis/v_axis labels and the loop
   ordering stay the same. After fix, `Back#95` outline vSpan must be 752 (not 703.2),
   `Right_Side` vSpan must be 770 (not 720).
3. **Mesh (`mesh_ref` geometry)** — leg/fitting mesh vertices are captured in
   definition-local space (the leg mesh spans 168.5 today). They must be emitted at
   instance scale so the leg renders 110mm. Apply the same per-axis scale to each
   stored vertex BEFORE writing the mesh (or before hashing for dedupe — see caution
   below). After fix, the leg mesh z-extent must be 110, not 168.5.
4. **`cuts[]` u/v/depth** — cuts are also in definition-local coords. Scale their
   `u_*`, `v_*`, `depth_mm`, `width_mm`, `length_mm` by the matching axis factors so
   grooves stay on the panel after the panel grows/shrinks. (For these specific parts
   cuts may be empty, but do it for correctness so we don't regress cut placement on
   scaled panels.)

### Mesh dedupe caution
Mesh dedupe hashes vertex geometry (Stage 10 FIX2 mesh-hash-dedupe). If two leg
instances share a definition but have **different scales**, they must now produce
**different** meshes (or be parameterized by scale). Two cases:
- If all four legs share the SAME scale (they do here — all z×0.6528), the scaled mesh
  is identical across them → dedupe still collapses them to one `mesh_ref`. Good.
- If instances of one definition have DIFFERENT scales, scaling before hashing yields
  distinct hashes → distinct meshes. That's correct, just more mesh entries. Don't
  block on it; verify the four legs still dedupe to a single mesh here.

## Constraints
- **Viewer/TypeScript untouched.** The viewer already applies rotation/reflection via
  Matrix4; it must keep receiving geometry in the same local frame, just at true size.
- Do **not** change the `axes` output (still unit vectors / signed permutation) — the
  viewer relies on it. Scale is applied to measurements, not exposed as a new axis
  length.
- Do not change `pos_mm` (instance world center) — Stage 14a confirmed position is
  correct.
- Keep `size_mm` in its current definition-local axis ORDER; only scale magnitudes.
- Schema bump: `SCHEMA = "alloy.sketchup.v6.4"`, `VERSION = "0.6.9"` (additive — no
  new fields, just corrected magnitudes; bump so we can tell old/new exports apart).
- Remove the Stage 14b diagnostic `puts` blocks (keep only the temporary scale-factor
  validation prints during dev, then remove those too before final).
- Diff-first; no whole-file rewrites (token-limit risk).

## Repackage & install
Rebuild `.rbz` with correct nesting (`alloy_export.rb` loader at root +
`alloy_export/main.rb`). Uninstall old → quit SketchUp fully → delete the Plugins
`alloy_export` folder → install new. (Stale installs are a recurring hazard.)

## Verify (against the Stage 14b ground-truth table)
Re-export the same cabinet. In the new JSON, confirm EMITTED values now match the
SketchUp truth:

| Part | Field | Must now be |
|------|-------|------------:|
| `Top_Back#91`, `Top_Front#92`, `Bottom#107` | thickness_mm / size z | **18.0** |
| `Back#95` | outline vSpan / size | **752.0** |
| `Right_Side#114`, `Left_Side#114` | outline vSpan / size z | **770.0** |
| `Leg_12cm#480/481/482/483` | size z + mesh z-extent | **110.0** |

Also confirm the parts that were ALREADY correct did not change:
`Drawer_Front#96/97` (797), `DR_B/DR_BT` (721/491), `L_Channel`/`U_Channel` (800),
leg x/y (60). And confirm the four legs still share **one** `mesh_ref`.

Then re-import into the app and check the BOM table reads 18 / 752 / 770 / 110 for
those rows, and the 3D preview: top rails flush (no overhang, image 1), legs correct
height (images 1 & 2), sides full height.

## Commit
`Stage 14c: scale-aware export — measure instance not definition (schema v6.4, v0.6.9)`

## After completing — CLEAN RESTART (always, no exceptions)
The page reliably glitches/stale-renders after any change, so finish with:
- Kill the Next.js dev-server process and start it fresh (`npm run dev`).
- Hard refresh the browser (Ctrl+Shift+R) — the 3D is client-side and the bundle caches.

## Report back
- The EMITTED size/outline/mesh values for the four verify-table parts (expect
  18 / 752 / 770 / 110).
- The `sx, sy, sz` scale factors logged for `Top_Back`, `Right_Side`, and `Leg`
  (expect local-z ≈ 1.0714 / 1.0694 / 0.6528) — to confirm the scale extraction was
  correct, not coincidentally right.
- Whether the four legs still dedupe to one mesh.
- Confirmation that no previously-correct part changed.
