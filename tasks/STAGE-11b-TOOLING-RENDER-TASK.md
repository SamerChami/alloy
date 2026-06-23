# Stage 11b — Viewer: render inner tooling (through-bores + blind pockets)

Render the `tooling[]` data (Stage 11a/FIX, schema v6.3 / v0.6.4) in the 3D viewer:
- **Through-bores** (`through:true`) → a genuinely OPEN hole through the panel (see
  through it), by adding a circular hole-path to the panel's extrude shape.
- **Blind pockets** (`through:false`) → a RECESSED disc cut into the named face to
  `depth_mm`, in the SAME panel material (subtle — no tint, no darkening).

Viewer-only: `lib/cabinet3d.ts`, `lib/sketchup/parseV3.ts`, `components/Cabinet3D.tsx`.
Surgical edits; do not rewrite files. Additive — panels without `tooling` render exactly
as before. Grooves (`cuts[]`) keep rendering via the existing `addCutMeshes`; do NOT
touch that path.

## Verified input (`alloy_export_0_6_4.json`, `Right_Side#2`)
Panel face axes: u=depth (0..560), v=height (0..770), thickness 18, axis X.
```
cuts:    [ groove 9×9×752, runs_along height, face back, v 9..761 ]   ← unchanged path
tooling: [
  { shape:"circle", through:true,  depth_mm:18, diameter_mm:160, cu_mm:287.2, cv_mm:141.3, face:"both" },
  { shape:"circle", through:false, depth_mm:8,  diameter_mm:200, cu_mm:297.2, cv_mm:517.5, face:"back" }
]
```
The `(cu,cv)` are panel-local mm on the SAME (u,v) frame as `outline_mm` (origin at the
panel min corner). Reuse the outline's u_axis/v_axis→box-axis mapping verbatim.

## Types — carry `tooling` through (mirror how `outline_mm` flows)

### `lib/cabinet3d.ts`
Add to the SketchUp panel input type (the one with `axes`, `outline_mm`):
```ts
tooling_mm?: {
  shape: "circle" | "polygon";
  through: boolean;
  depth_mm: number;
  diameter_mm?: number;          // present when shape==="circle"
  cu_mm?: number; cv_mm?: number;// center, panel-local (u,v) mm; circle only
  loop?: [number, number][];     // polygon fallback, panel-local (u,v) mm
  face: "front" | "back" | "both";
}[];
```
Add a matching `tooling?` on `Box3D` (convert mm→m to match the outline convention, or
keep mm and convert at mesh time — match whatever `outline` does, be consistent).

### `lib/sketchup/parseV3.ts`
Add `tooling` (raw, pass-through) to `V3Node`/`V3Part` and carry it in `cabinetToParts`,
exactly like `outline_mm`/`profile_mm`. No transform in the parser. Schema
`alloy.sketchup.v6.3` is already accepted (no SUPPORTED_SCHEMAS change — same string as
v6.3 from Stage 11a). Confirm it's present; add it if missing.

### Import shell → `SkuPanel3D`
Map `tooling_mm: part.tooling` through to the panel object, same line as `outline_mm`.

### `buildBoxesFromOrientedPanels` (`lib/cabinet3d.ts`)
When a panel has `tooling_mm`, attach it (converted) to the emitted `Box3D.tooling`.

## Render (`components/Cabinet3D.tsx`, PANEL branch)

The panel already builds an extruded `THREE.Shape` from `outline_mm` (Stage 9e). Two
additions, both using the SAME (u,v)→shape-XY mapping the outline uses (u→shapeX,
v→shapeY), so centers land correctly and inherit `box.orient` + position:

### 1. Through-bores → holes in the extrude shape
For each `tooling` item with `through === true` and `shape === "circle"`:
- Build a `THREE.Path` circle at the shape-local coords corresponding to `(cu,cv)`,
  radius `diameter/2`. Remember the outline shape is built in panel-local (u,v) with
  origin at the min corner, THEN centered by `(-cu_span/2,-cv_span/2,...)`. Apply the
  SAME centering offset to the hole center so it lines up with the (already centered)
  silhouette: `holeX = cu - uSpan/2`, `holeY = cv - vSpan/2` (in the shape's units).
- `shape.holes.push(path)` BEFORE `new THREE.ExtrudeGeometry(shape, …)`. ExtrudeGeometry
  honors `shape.holes` automatically → the extruded board has a real opening. Because the
  panel's full thickness is extruded, the hole is open end-to-end → you see through it.
- `shape === "polygon" && through`: build the `THREE.Path` from `loop` instead of a circle
  arc (same centering). Same `shape.holes.push`.

This composes with the L-shape notch outline (holes + concave outer loop coexist fine).

### 2. Blind pockets → recessed disc on the named face
A blind pocket is NOT a hole in the shape (partial depth). Render a separate short
cylinder/disc recessed into the panel face:
- `radius = diameter/2`, height = `depth_mm`.
- Use `THREE.CylinderGeometry(radius, radius, depth, 48)` (48 segments; r128 — do NOT use
  CapsuleGeometry). Cylinder's axis is Y by default; rotate so its axis aligns with the
  panel THICKNESS axis.
- Position it so it sits FLUSH with the named `face` and extends `depth` INTO the panel:
  - center it in (u,v) at `(cu,cv)` (apply the same centering offset as the holes),
  - along thickness: if `face==="front"` (t≈0 side) the disc top is at the front face and
    it goes inward by `depth`; if `face==="back"` (t≈th side) it sits at the back face
    going inward. Compute the thickness-axis offset = `±(thickness/2 - depth/2)` toward
    the named face.
- Material: clone the panel's `MeshStandardMaterial` (SAME material — subtle, no tint, no
  darkening). Apply the same wireframe toggle treatment as the panel.
- Map shape/cylinder local axes → panel box axes with the SAME permutation used for the
  outline extrude, then apply `box.orient` and `position.set(box.x,box.y,box.z)`. Parent
  the disc to the panel mesh (add as child) so it inherits the panel transform and there's
  no double-transform drift.
- Edge lines: optional. A subtle `EdgesGeometry` ring on the disc helps read the pocket;
  keep it the same edge treatment as the panel if added.

### Guard rails
- If `tooling_mm` absent → unchanged (existing extrude/box path).
- Legs/fittings never get tooling (extension emits `tooling:[]`); the fitting branch
  ignores it. Do not extrude tooling on the mesh/cylinder fitting path.
- `addCutMeshes` (grooves) stays exactly as-is and still receives the panel box w/h/d.
  A groove and a pocket can coexist on one panel (this panel has both) — both must show.

## Modal viewer (Stage 5d / 10-FIX3)
The expand-to-modal renders a SECOND `<Cabinet3D>`. Ensure the panel data carrying
`tooling` is the same `skuPanels`/`parts` forwarded to the modal instance (it is, since
tooling rides on the panel objects). No separate prop like `meshes` needed — but VERIFY
the modal shows the holes/pockets too. While here, confirm 10-FIX3's `meshes` forwarding
is present (the leg should render as a mesh in the modal, not a cylinder); if the leg
falls back to a cylinder in the modal, flag it (separate fix, do not block 11b).

## Verify (Part B)
Re-import `alloy_export_0_6_4.json` (`Right_Side#2` + `Leg_12cm#14`), clean restart:
- The **left Ø160 bore** is an OPEN hole through the panel — visible through it.
- The **right Ø200 pocket** is a shallow round recess on the back face, depth ~8mm, same
  material (subtle).
- The **9×9 groove** still renders (unchanged) alongside the pocket.
- The left-edge **step notches** (outline) still render. Leg still a mesh, upright.
- Inline AND modal viewers both show bore + pocket.
- Panels from older exports (no `tooling`) render unchanged. `npm run build` passes.

## Clean restart (page glitches otherwise)
Kill Next.js, `Remove-Item -Recurse -Force .next`, `npm run dev` fresh, browser
hard-refresh (Ctrl+Shift+R).

## Commit
"Stage 11b: viewer renders inner tooling — through-bores as open holes, blind pockets as
recessed discs (subtle, panel material)"

## Report
Whether the Ø160 reads as see-through, the Ø200 as a recessed disc, both visible in inline
+ modal, groove + edge notches intact, and whether the modal leg is a mesh (10-FIX3 check).
