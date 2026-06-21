# Stage 9e — Panel outline export (L-shape shelf + L_channel) — extension + viewer

Two viewer defects share ONE root cause: the axis-aligned bounding box (`size_mm`)
drops a panel's true 2D silhouette.
1. **Mobile shelf** renders as a full square; the real part is L-shaped (a square
   with a rectangular notch). Verified: `Mobile_Shelve#41` has
   `size_mm {x:1144, y:1144, z:18}` — the enclosing rectangle only. The notch is
   not in the JSON, so the viewer's `BoxGeometry` fills it.
2. **L_Channel foot** points the wrong way on one of the two perpendicular runs,
   because `buildFittingObject` guesses the L-section flip from the bounding box.

Fix: export the real 2D outline for EVERY panel leaf and have the viewer extrude it.
This is split into TWO parts done in order:
- **Part A — Ruby extension** (`alloy_export/main.rb`): add `outline_mm` to leaves,
  bump schema to **v5.1**, output a new `alloy_export.rbz`.
- **Part B — Viewer** (`lib/cabinet3d.ts`, `components/Cabinet3D.tsx`): extrude the
  outline when present; box fallback when absent.

Both parts are ADDITIVE — v5/v4/v3/v2 imports without `outline_mm` keep working via
the existing box path. Make targeted edits; do not rewrite whole files.

---

## Part A — Ruby extension: extract & export `outline_mm`

### Where
`alloy_export/main.rb`. The extension already works in the component definition's
LOCAL space and already computes the thickness axis the same way (`detect_cuts`
finds `t_sym` = smallest-extent axis; the two remaining axes are the face plane).
Reuse that convention for the outline.

### New helper: `face_outline(e)`
Add a method that returns the panel's largest-face outline as an ordered 2D loop in
the panel's LOCAL frame, on the two NON-thickness axes (U, V), in **mm**.

Algorithm (mirror the `detect_cuts` setup):
1. `return nil unless e.is_a?(Sketchup::ComponentInstance)` (only components have a
   clean local frame). Box fallback covers groups.
2. `defn = e.definition; bb = defn.bounds`. Compute extents `{x,y,z}`; thickness axis
   `t_sym` = smallest; the two face-plane axes `u_sym, v_sym = [:x,:y,:z] - [t_sym]`
   (keep this axis ORDER stable — same as detect_cuts).
3. Among the definition's faces, pick the panel's **big face**: the face with the
   largest area whose normal is (anti-)parallel to the thickness axis
   (`f.normal.dot(t_vec).abs >= 1.0 - tol`) AND sitting on one of the two big-face
   planes (t-value ≈ `t_min` or ≈ `t_max`). If several share the max plane, take the
   one with the greatest area. This is the panel's silhouette face.
4. Take that face's OUTER loop: `face.outer_loop.vertices.map(&:position)`. For each
   vertex, project to `(u, v) = (coord(p, u_sym) - u_origin, coord(p, v_sym) - v_origin)`
   where `u_origin = coord(bb.min, u_sym)`, `v_origin = coord(bb.min, v_sym)` — so the
   loop is in panel-local coords with origin at the panel's min corner (SAME
   convention as cuts' u/v). Convert to mm via `mm()`.
5. Return `{ u_axis: axis_label(u_sym), v_axis: axis_label(v_sym),
   thickness_mm: mm(extents[t_sym]),
   loop: [[u0,v0],[u1,v1], ...] }`  (ordered; do NOT auto-close — the viewer closes it).
   Round each coord with `mm()` (1 decimal). Drop consecutive duplicate points.
6. Robustness: if the face has holes (inner loops), IGNORE them for v5.1 (outer
   silhouette only — notches that are true boundary concavities ARE in the outer loop;
   a fully-enclosed hole is rare for a shelf and out of scope). If anything fails or
   the outer loop has < 3 points, `return nil` (viewer falls back to box). Never raise.

### Wire into `build_node`
In the leaf branch (`if kids.empty?`), after the existing cuts logic, add for ALL
leaf parts (panels AND fittings — fittings benefit too, e.g. L_channel):
```ruby
ol = face_outline(e)
node[:outline_mm] = ol unless ol.nil?
```
Place it so it doesn't disturb the cuts keys. Outline is OPTIONAL — omit the key
entirely when nil (keeps JSON clean and the viewer's presence-check simple).

### Schema bump
- `SCHEMA = "alloy.sketchup.v5.1"` (or wherever the constant lives), `VERSION = "0.5.1"`.
- Keep everything else identical. `total_parts`, `axes`, `cuts`, tree shape unchanged.

### Output
Rebuild a new `alloy_export.rbz` (zip of `alloy_export.rb` + `alloy_export/main.rb`).
Valid Ruby syntax; extension loads; menu item works; popup summary still shows.

### Verify (Part A)
Re-export the corner cabinet. In the JSON:
- `Mobile_Shelve#41` has `outline_mm` with an **L-shaped loop of 6 points** (the
  notch corner makes it 6, not 4), `thickness_mm ≈ 18`, on the two horizontal axes.
- A rectangular panel (e.g. `Top_1#7`) has a **4-point** rectangular loop.
- `L_Channel#70/#71` carry an outline of their cross-section's run face (acceptable;
  viewer uses it if helpful, else its existing profile builder).
- schema == `alloy.sketchup.v5.1`; `total_parts` still a real integer.

---

## Part B — Viewer: extrude the outline when present

### Types (`lib/cabinet3d.ts`)
Add to the SketchUp panel input type (the one with `axes`, `su_width_mm`, etc.) an
optional:
```ts
outline_mm?: {
  u_axis: "width" | "height" | "depth";
  v_axis: "width" | "height" | "depth";
  thickness_mm: number;
  loop: [number, number][]; // ordered (u,v) in mm, panel-local, origin at min corner
};
```
Carry it through the parser (`lib/sketchup/parseV3.ts` or the v4/v5 path) so it
reaches the build functions. Purely pass-through; no transform in the parser.

### Box3D carries the outline
Add optional `outline?: {...}` (same shape, but in METRES after `m()` conversion, or
keep mm and convert at mesh time — pick one and be consistent; metres is cleaner to
match the rest of Box3D). In `buildBoxesFromOrientedPanels`, when a panel has
`outline_mm`, attach it to the emitted `Box3D` (converted). Leave the box `w/h/d`
as-is (used for fallback + bounds).

### Render (`components/Cabinet3D.tsx`)
In the PANEL branch (the non-fitting box path), BEFORE building the default
`BoxGeometry`:
- If `box.outline` is present, build the geometry by extrusion:
  - `const shape = new THREE.Shape();` move/line through the loop's (u,v) points,
    then `shape.closePath()`.
  - `const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });`
    ExtrudeGeometry extrudes along +Z, with the shape in the XY plane. So the shape's
    local axes are (u→X, v→Y) and thickness→Z.
  - **Center the geometry**: ExtrudeGeometry is built from the raw loop (origin at the
    panel min corner), so translate it to be centered: `geo.translate(-cu/2, -cv/2, -thickness/2)`
    where `cu, cv` are the loop's u/v spans. (Or `geo.center()` — but explicit is safer
    so thickness centering matches the box convention.)
  - **Map the shape's (u,v,thickness) local axes onto the panel's box axes.** The
    existing box uses `(w, h, d)` = `(su local x, y, z)` mapped through `orient`. The
    outline's u_axis/v_axis tell you which of width/height/depth u and v correspond to;
    thickness is the remaining one. Build a small permutation so the extruded shape's
    X(=u), Y(=v), Z(=thickness) line up with the panel box's local width/height/depth
    BEFORE applying `box.orient`. Concretely: after extrude+center, apply a rotation/
    swap that sends shape-local (u,v,thickness) → panel-local (width,height,depth),
    then apply the SAME `box.orient` Matrix4 the box path already applies, then
    `position.set(box.x,box.y,box.z)`. The net effect: the L silhouette lies in the
    panel's face plane with thickness along the panel's thin axis, oriented exactly
    like the box it replaces — but with the notch.
- If `box.outline` is absent → existing `BoxGeometry(box.w, box.h, box.d)` path,
  unchanged.
- Apply the same edges/material/wireframe treatment to the extruded geometry as the
  box (EdgesGeometry outline, MeshStandardMaterial, door transparency N/A for shelves).
- Cuts: `addCutMeshes` still works — cuts are positioned in panel-local u/v already.
  Keep passing the panel's box w/h/d for the cut frame (the cut footprint logic is
  unchanged; the notch doesn't move the cut planes). If a cut visibly lands in the
  removed notch on the L-shelf, note it but do NOT block — that's a later refinement.

### L_Channel (optional within this stage)
If the channel's `outline_mm` is present and gives a clean cross-section, you MAY
switch `buildFittingObject`'s l_channel/u_channel branch to extrude the outline
instead of guessing the flip — this fixes the foot direction exactly. If that proves
fiddly (the channel outline is the run face, not the cross-section), leave the channel
branch as-is and we'll do it as a focused follow-up. Do NOT block the shelf fix on the
channel.

### Verify (Part B)
- Corner cabinet `BC2.K3.120*120` (re-imported with the v5.1 JSON): the mobile shelf
  renders as a proper **L-shape** with the corner notch open (matches SketchUp).
- Rectangular panels (sides, top, bottom, backs) look identical to before (4-pt loop
  extrudes to the same box).
- Legs still upright (Stage 9d intact); doors, cuts, orientation all unchanged.
- Panels without `outline_mm` (older v5/v4/v3/v2 imports) still render as boxes.
- `npm run build` passes.

---

## Commits
- Part A: "Stage 9e-A: export per-panel outline_mm (schema v5.1, v0.5.1)".
- Part B: "Stage 9e-B: viewer extrudes panel outline (L-shape shelf); box fallback".

## After completing BOTH parts
Do a **clean dev-server restart** (kill the Next.js process, `npm run dev` fresh) —
the page glitches/stale-renders after updates otherwise. Then hard refresh the
browser (Ctrl+Shift+R), since the 3D is client-side and the browser caches the old
bundle.

Report: the `outline_mm` loop point-count for `Mobile_Shelve#41` (expect 6) and
`Top_1#7` (expect 4), and whether the shelf renders L-shaped.

## Note to Samer
Provide the rebuilt `alloy_export.rbz` to install (uninstall old, restart SketchUp).
The outline is also the foundation for accurate cut-lists / CNC nesting later — every
panel now ships its true cut profile, not just a bounding box.
