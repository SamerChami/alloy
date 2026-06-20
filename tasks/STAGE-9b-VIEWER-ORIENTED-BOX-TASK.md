# Stage 9b — Viewer: oriented-box rendering for v5 `axes` (additive) (Claude Code)

Read `CLAUDE.md` in the alloy folder first, then apply this. **Additive** change —
the new code path runs ONLY when a panel carries `axes` (v5 export). Panels without
`axes` (existing v2/v3/v4 imports) keep the current logic UNCHANGED. Do NOT rewrite
`Cabinet3D.tsx` or `cabinet3d.ts` wholesale.

Before starting, in PowerShell:
`$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000`
(Switch to `/model sonnet` if a diff won't apply cleanly.)

## Background
The SketchUp extension is now v0.5 / schema `alloy.sketchup.v5`. Each node has a new
`axes` field: the panel's three LOCAL axis unit-vectors in SketchUp world space:
```json
"axes": { "x":[..], "y":[..], "z":[..] }
```
`size_mm.{x,y,z}` is the panel's size along its OWN local x/y/z (rotation-invariant).
Together they describe an ORIENTED box. This fixes rotated parts (L-shaped corner
cabinets) that the old "smallest world extent = thickness" logic scattered.

Verified math (against the real `BC2.K3.120*120` export):
- World orientation matrix `Rworld` has the panel's local axes as COLUMNS:
  `[axes.x | axes.y | axes.z]`.
- Apply the SAME global SU→three map used elsewhere — `three=(su.x, su.z, -su.y)` —
  as a fixed basis `C = [[1,0,0],[0,0,1],[0,-1,0]]` (det +1, the Stage 8c map).
- Three-space orientation = `C · Rworld`; three-space position = `C · pos_mm`.
- Some panels are mirrored (det(C·Rworld) = -1). Use a full Matrix4 from the basis
  (NOT a quaternion — quaternions can't represent reflections). BoxGeometry renders
  correctly under a reflection.

## Part 1 — Parser: carry `axes` (v5 = v4 + axes)
Wherever the SketchUp single/project importers map a parsed leaf into the
`SkuPanel3D` shape (the place that fills `su_width_mm`/`pos`/`cuts`), also copy
`axes` when present:
```ts
axes: leaf.axes
  ? { x: leaf.axes.x, y: leaf.axes.y, z: leaf.axes.z }
  : undefined,
```
If a shared v3 parser (`lib/sketchup/parseV3.ts`) builds these, extend it to also
read `axes` (optional). Do not require it — v3/v4 files won't have it.

## Part 2 — Types (`lib/cabinet3d.ts`)
Add an optional `axes` to `SkuPanel3D`:
```ts
export type SkuPanel3D = {
  part_role: PartRole | string;
  part_name?: string;
  su_width_mm:  number;
  su_height_mm: number;
  su_depth_mm:  number;
  pos: { x: number; y: number; z: number };
  cuts?: Cut[];
  axes?: { x: number[]; y: number[]; z: number[] }; // v5 orientation (local axes in SU world)
};
```
Add an optional orientation to `Box3D` (a 9-number row-major basis the renderer
turns into a Matrix4; null/undefined = axis-aligned, current behaviour):
```ts
export type Box3D = {
  w: number; h: number; d: number;
  x: number; y: number; z: number;
  role: PartRole;
  part_name?: string;
  cuts?: Cut[];
  orient?: number[]; // 9 numbers, three-space 3x3 basis (C·Rworld), column-major
};
```

## Part 3 — Oriented build path (`lib/cabinet3d.ts`)
In `buildBoxesFromSkuPanels`, branch at the TOP: if EVERY panel has `axes`, use a
new oriented build; otherwise run the EXISTING code unchanged.

Add a new function `buildBoxesFromOrientedPanels(panels, showDoors, explode)`:
- For each panel, the local box size is the LOCAL `size_mm`. NOTE the SkuPanel3D
  field names map to SU local axes as: `su_width_mm`=local x, `su_height_mm`=local y,
  `su_depth_mm`=local z. So `localSize = (su_width_mm, su_height_mm, su_depth_mm)` in
  mm → metres. (Do NOT swap here — orientation handles axis direction.)
- Build `Rworld` (column-major 9 array) from `axes.x|y|z`.
- Apply C = three=(x, z, -y) to both the basis and the position:
  - `Cx(v) = [v[0], v[2], -v[1]]`
  - Orientation columns = `Cx(axes.x), Cx(axes.y), Cx(axes.z)` → pack as 9 numbers.
  - Center three = `Cx(pos)` (pos in metres).
- Recenter: compute the min corner across all panels' WORLD-space AABBs. The simplest
  robust min/max: for each panel, its 8 local corners = center ± (localSize/2) along
  each oriented column; transform via the orientation; take min/max. Then subtract the
  global min so the cabinet sits at origin (same intent as the current recenter).
- Door/drawer_front filtering and the explode offsets stay as in the existing path
  (offset along role normal in three space).
- Emit `Box3D` with `w/h/d = localSize` (metres), `x/y/z = recentred center`,
  `orient = the 9-number basis`, plus `role`, `part_name`, `cuts`.

Keep the existing `buildBoxesFromSkuPanels` (non-axes) and
`buildBoxesFromRawPanels` exactly as they are.

## Part 4 — Renderer applies orientation (`components/Cabinet3D.tsx`)
Where each `box` becomes a mesh (the `new THREE.BoxGeometry(box.w, box.h, box.d)`
block, both wireframe and shaded branches), after creating the mesh/line object and
BEFORE `position.set`, apply orientation when present:
```ts
if (box.orient) {
  const m = new THREE.Matrix4();
  // column-major 3x3 into Matrix4 (rotation part); translation set separately
  m.set(
    box.orient[0], box.orient[3], box.orient[6], 0,
    box.orient[1], box.orient[4], box.orient[7], 0,
    box.orient[2], box.orient[5], box.orient[8], 0,
    0, 0, 0, 1,
  );
  mesh.quaternion.setFromRotationMatrix(m); // ok: reflections handled by geometry, see note
  mesh.updateMatrix();
}
mesh.position.set(box.x, box.y, box.z);
```
NOTE on reflections: `setFromRotationMatrix` drops a -1 determinant, which would
un-mirror a reflected panel. Since a reflected BOX is geometrically identical to a
rotated one for our purposes (it's a featureless slab), this is acceptable for the
carcass. **Cuts are the exception** — a mirrored panel's cut footprint must follow
the reflection. For now, render cuts with the SAME orientation matrix applied to the
cut child (the cut meshes are added to `mesh` as children, so they inherit `mesh`'s
transform automatically — verify they're parented to `mesh`, which they already are
via `addCutMeshes(mesh, ...)`). Do not add per-cut sign logic in the oriented path.

The cut placement inside `addCutMeshes` already works in the panel's local frame
(u/v/t), so under the oriented path it rides the panel's matrix for free. Leave
`addCutMeshes` UNCHANGED.

## Acceptance
- `npm run build` passes.
- Importing the v5 `BC2.K3.120*120` export renders a correct L-shaped corner
  cabinet: both perpendicular legs in the right place, side/back/filler panels of the
  rotated leg oriented correctly (no scattered/floating parts), doors on their faces.
- Importing an OLDER v3/v4 SketchUp file renders exactly as before (no `axes` → old
  path; verify a normal cabinet like BDR.K3.120 is unchanged, cuts still correct).
- Commit: "Stage 9b: additive oriented-box rendering for v5 axes (corner cabinets)".

## After build — clean restart (page glitches after updates)
- Stop any running dev server
- Clear cache:  `Remove-Item -Recurse -Force .next`
- Start fresh:  `npm run dev`
Then hard refresh the browser (Ctrl+Shift+R).

## Report back
For the corner cabinet, confirm: both legs present and perpendicular, no floating
panels, doors placed. For a v4 cabinet, confirm it looks identical to before. Samer
will then run several iterations on different cabinets.
