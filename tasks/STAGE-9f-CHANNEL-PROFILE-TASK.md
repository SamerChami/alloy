# Stage 9f — Real fitting shapes: channel cross-section profile (extension + viewer)

Make fittings render as their true shapes. Audit of this cabinet's fittings:
- **Legs** (`Leg_12cm`, ×8): already correct — Stage 9d draws them as upright
  cylinders. They need NOTHING here. Their `outline_mm` (a side rectangle) must be
  IGNORED for legs; do not extrude it.
- **L_Channel** (×2): renders wrong. Its `outline_mm` is the long RUN face
  (667×57.5 rectangle), not the L cross-section — so any extrude gives a flat slab,
  and the existing box/`buildFittingObject` guess gets the foot direction wrong.
- **Other fittings** (hinges, baskets, P2O, slides…): keep current behavior
  (cylinders for P2O per 9d; boxes for the rest). Out of scope here.

Root insight: for an EXTRUDED PROFILE fitting (a channel), the meaningful shape is
the **end-face cross-section** (the SMALLEST face, perpendicular to the run axis),
extruded along the **LONGEST** axis (the run). This is a DIFFERENT extraction than the
panel `outline_mm` (which is the LARGEST face). So add a separate `profile_mm` for
channels rather than overloading `outline_mm`.

Two parts: **A — extension** (export `profile_mm` for channels), **B — viewer**
(extrude it). Additive; bump to **v0.5.3 / schema `alloy.sketchup.v5.3`**.

---

## Part A — Extension: export `profile_mm` for channel fittings

### Where
`alloy_export/main.rb`. A leaf is a channel if its name matches `l_channel`,
`u_channel`, or `channel` (case-insensitive) — the channel subset of FITTING_KEYS.

### New helper `cross_section(e)`
Returns the channel's cross-section loop on the two NON-run axes, plus the run length.
Algorithm (work in the component definition's LOCAL space, like `face_outline`):
1. `return nil unless e.is_a?(Sketchup::ComponentInstance)`.
2. `defn = e.definition; bb = defn.bounds`. Extents `{x,y,z}`.
   **Run axis = the LARGEST extent** (call it `r_sym`); the other two axes are the
   cross-section plane `(p_sym, q_sym)` (keep stable order, e.g. ascending of
   `[:x,:y,:z] - [r_sym]`).
3. Find the channel's END FACE: among `defn.entities` faces, pick a face whose normal
   is (anti-)parallel to the run axis (`f.normal.dot(run_vec).abs >= 1.0 - tol`) AND
   that lies at one END of the run (t-value ≈ run_min or ≈ run_max). Of those, take
   the one with the GREATEST area (the full cross-section, not a chamfer sliver).
   That face's outer loop IS the L (or U) profile.
4. Project the face's `outer_loop` vertices onto `(p, q)` with origin at the
   cross-section's min corner (mm), same convention as `face_outline`. Drop
   consecutive duplicate points. Need ≥ 3 points or `return nil`.
5. Return:
   ```ruby
   {
     p_axis: axis_label(p_sym),    # cross-section axis 1 (width|height|depth)
     q_axis: axis_label(q_sym),    # cross-section axis 2
     run_axis: axis_label(r_sym),  # the extrude/run axis
     run_mm: mm(extent_along(r_sym)),
     loop: [[p0,q0],[p1,q1], ...], # cross-section profile, panel-local mm
   }
   ```
   Never raise; on any failure `return nil`.

### Wire into `build_node` (leaf branch)
For channel leaves only, after the cuts logic (channels are fittings → `cuts: []`):
```ruby
if has_any?(node[:name], ["l_channel","u_channel","channel"])
  pf = cross_section(e)
  node[:profile_mm] = pf unless pf.nil?
end
```
Keep emitting `axes` (all nodes) and `outline_mm` (all leaves) exactly as in v5.2 —
do NOT remove them. `profile_mm` is ADDITIVE and channel-only. Legs and other
fittings do not get `profile_mm`.

### Version / schema
- `VERSION = "0.5.3"`, `SCHEMA = "alloy.sketchup.v5.3"`.
- Header comment: v5.3 = v5.2 + `profile_mm` (channel cross-section).
- Rebuild `alloy_export.rbz`.

### Verify (Part A)
Re-export the corner cabinet. Both `L_Channel#70/#71` carry `profile_mm` with:
- `run_axis` = the long axis (width for #70, depth for #71),
- `run_mm ≈ 667`,
- a cross-section `loop` that is an **L** (6 points: a 27×57.5 bounding box with the
  inner notch) — NOT a 4-point rectangle. If the loop comes back as 4 points, the end
  face picked was a plain rectangle (wrong face) — re-check the face selection (must
  be the profile end cap, and the channel must actually be modelled as a solid L).

---

## Part B — Viewer: extrude the channel profile

### Types (`lib/cabinet3d.ts`)
Add an optional to `SkuPanel3D` and a matching `Box3D` field:
```ts
profile_mm?: {
  p_axis: "width" | "height" | "depth";
  q_axis: "width" | "height" | "depth";
  run_axis: "width" | "height" | "depth";
  run_mm: number;
  loop: [number, number][];
};
```
Carry it through `parseV3.ts` (add to `V3Node`, `V3Part`, and the `cabinetToParts`
map) and through the import shell's `SkuPanel3D` map (`profile_mm: part.profile_mm`).
Same pass-through pattern as `outline_mm`/`axes`.

In `buildBoxesFromOrientedPanels`, attach `profile_mm` to the emitted `Box3D` (convert
loop + run to metres, or keep mm and convert at mesh time — match how `outline` is
handled for consistency).

### Render (`components/Cabinet3D.tsx`, fitting branch)
In `buildFittingObject` (or the fitting path), priority order:
1. **Leg / P2O** (radially-symmetric, Stage 9d): upright cylinder. UNCHANGED. Never
   use profile/outline for these.
2. **Channel with `profile_mm`**: extrude the cross-section along the run axis.
   - Build `THREE.Shape` from the profile `loop` (p→shapeX, q→shapeY).
   - `ExtrudeGeometry(shape, { depth: run_mm/1000, bevelEnabled:false })` (extrudes
     along shape +Z = the run).
   - Center it: translate by `(-pMid, -qMid, -run/2)`.
   - Map shape axes (p, q, run) → the part's box axes (p_axis, q_axis, run_axis)
     via the SAME orient-column permutation used for the panel outline extrude, then
     apply `box.orient` and position at `box.x/y/z`. This places the L-profile with
     the foot oriented exactly as modelled — **the foot-direction cosmetic is solved
     for free** (no interior-heuristic needed).
   - `computeVertexNormals()` after translate.
3. **Channel WITHOUT `profile_mm`** (older export): fall back to the current
   `buildFittingObject` L/U builder. Keep that code as the fallback; do not delete it.
4. **Other fittings** (hinge, basket, slide, atira…): unchanged box.

Edges/material/wireframe: same treatment as other fittings.

### Schema accept
Add `"alloy.sketchup.v5.3"` to `SUPPORTED_SCHEMAS` in `parseV3.ts`.

### Verify (Part B)
- Re-import the v5.3 JSON. Both L_Channels render as a real **L-profile** running
  along their length, with the foot pointing the correct way (toward the carcass /
  matching SketchUp) on BOTH perpendicular runs.
- Legs unchanged (upright cylinders). Panels/cuts/shelf unchanged.
- Older exports (no `profile_mm`) still render channels via the existing builder.
- `npm run build` passes.

---

## Commits
- Part A: "Stage 9f-A: export channel cross-section profile_mm (schema v5.3, v0.5.3)".
- Part B: "Stage 9f-B: viewer extrudes channel profile along run axis; correct foot".

## After build (clean restart)
Kill Next.js, `npm run dev` fresh; browser hard refresh (Ctrl+Shift+R). Provide the
rebuilt `alloy_export.rbz`. Samer installs it (uninstall old, restart SketchUp),
re-exports the corner cabinet, re-imports.

Report: the `profile_mm.loop` point-count for `L_Channel#70` (expect 6 for an L), its
`run_mm` (expect ≈667), and whether both channels render as L-profiles with the foot
the right way.

## Note
This generalizes to U_Channel automatically (its end face is a U → the loop just has
more points). No special-casing per profile shape — whatever the end face is, that's
what extrudes. Legs deliberately excluded (a cylinder is not a profile extrude).
