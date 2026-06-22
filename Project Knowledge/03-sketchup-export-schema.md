# ALLOY App — SketchUp Export JSON Schema (alloy.sketchup.v6)

## Overview
The ALLOY SketchUp extension (`alloy_export.rbz`, currently **v0.6.2**) exports a
SketchUp model to a structured JSON file consumed by the app's import pipeline.

The schema has evolved: **v2** (flat items) → **v3** (nested tree) →
**v4** (nested tree + machining `cuts`) → **v5** (adds per-node `axes`
orientation). This document describes **v5**, the current format. Older shapes are
summarized at the bottom for the importers that still read them.

**Why v5 exists:** v4 gave each part an axis-aligned bounding box (`size_mm`) and a
world centre (`pos_mm`) but NO orientation. That works for cabinets modelled
axis-aligned, but breaks for any rotated part — most importantly the **L-shaped
base corner cabinet** (`BC2.K3.120*120`), whose two perpendicular legs cannot both
be axis-aligned. v5 adds `axes` (the part's local orientation), so the viewer can
render each part as an ORIENTED box and rotated cabinets render correctly.

---


---

## v5.1 → v6 additions (current)

Everything below the next divider describes the **v5** base (axes, placement, cuts),
which is still current. The fields added since v5 are summarized here.

### `outline_mm` (v5.1+) — panel silhouette, on every leaf
The true 2D outer loop of the leaf's largest thickness-parallel face, in panel-LOCAL
mm, origin at the panel min corner. Lets the viewer extrude the real silhouette
(e.g. an L-shaped corner shelf) instead of a bounding box. Also the CNC/cut-list cut
profile.
```json
"outline_mm": {
  "u_axis": "width", "v_axis": "depth", "thickness_mm": 18.0,
  "loop": [[u0,v0],[u1,v1], ...]   // ordered; may include tessellated curves (fillets)
}
```
- Loop point count varies: a plain rectangle = 4 pts; an L = 6 logical corners (more
  if an inner corner is filleted — the arc is tessellated).
- Viewer builds a `THREE.Shape` + `ExtrudeGeometry`; box fallback when absent.

### `profile_mm` (v5.3+) — channel cross-section, on channel fittings only
For extruded-profile fittings (`l_channel`/`u_channel`/`channel`): the END-face
cross-section (the profile), extruded along the run axis. This renders the true Gola
L/U section with the foot oriented as modelled (the old foot-direction guess is gone).
```json
"profile_mm": {
  "p_axis": "depth", "q_axis": "height", "run_axis": "width",
  "run_mm": 667.0,
  "loop": [[p0,q0], ...]   // cross-section profile, local mm
}
```
- The cross-section is the SMALLEST face (perpendicular to the run = LONGEST axis) —
  distinct from `outline_mm` (largest face).
- Panels do NOT get `profile_mm`; channels keep it instead of a mesh.

### `meshes` + `mesh_ref` (v6) — true geometry for detailed fittings
Fittings that are NOT profile-representable (legs, hardware) export their full
triangulated SketchUp geometry. Meshes are **deduped by canonical geometry hash**
(invariant to vertex/triangle order), so identical parts share one entry regardless of
how the model named or copied them.

Top-level dictionary (each unique geometry once):
```json
"meshes": {
  "mesh_<hash>": {
    "vertices":  [[x,y,z], ...],   // local mm
    "triangles": [[a,b,c], ...]    // 0-based indices into vertices
  }
}
```
Each meshed leaf references its geometry:
```json
"mesh_ref": "mesh_<hash>"
```
- Gate: `fitting && !channel`. Panels keep `outline_mm`; channels keep `profile_mm`;
  legs/hardware get `mesh_ref`. (Mirrored instances are reflections → may form a 2nd
  hash entry; that is correct.)
- Viewer builds a `BufferGeometry` from the referenced mesh, maps SU→three `(x,z,-y)`,
  applies `axes` orientation + `pos_mm`. Cylinder fallback (Stage 9d) when no mesh.
- Meshes are for the 3D PREVIEW only — cut-lists/CNC still use `outline_mm`/`cuts`.

### Supported schema strings (app parser)
`alloy.sketchup.v3`, `v4`, `v5`, `v5.1`, `v5.2`, `v5.3`, `v6`.


## Top-Level Structure (v5)

```json
{
  "schema": "alloy.sketchup.v5",
  "version": "0.5.0",
  "model": "test.skp",
  "units": "mm",
  "root_count": 1,
  "total_parts": 23,
  "summary": { "Cabinet": 1 },
  "roots": [ ...RootNode ]
}
```

- `total_parts` — total count of leaf descendants across all roots.
- `summary` — count of roots by `item_type` (Cabinet, Appliance, Worktop, Trim,
  Other, RoomBox).
- `roots[]` — each root is one top-level component/group in the model.

---

## Node Structure (recursive tree)

Every node — root, intermediate sub-assembly, or leaf part — shares a common
shape. Nodes nest via `children[]`. **A model is a tree, not a flat list.**

```json
{
  "name": "Left_Side#231",
  "type": "component",
  "size_mm": { "x": 18.0, "y": 560.0, "z": 770.0 },
  "sorted_mm": [18.0, 560.0, 770.0],
  "pos_mm": { "x": 9.0, "y": 440.5, "z": 495.0 },
  "axes": {
    "x": [1.0, 0.0, 0.0],
    "y": [0.0, 1.0, 0.0],
    "z": [0.0, 0.0, 1.0]
  },
  "is_leaf": true,
  "item_type": "Part",
  "role": "part",
  "cuts": [ ...Cut ],

  "children": [ ...Node ]
}
```

### Field reference
| Field | Where | Meaning |
|-------|-------|---------|
| `name` | all | Component name + instance suffix `#NN` (e.g. `Left_Side#231`). |
| `type` | all | SketchUp entity kind (`component` / `group`). |
| `size_mm.{x,y,z}` | all | Bounding-box extents along the part's **LOCAL** x/y/z axes (from the component definition's bounds). Rotation-invariant. NOT sorted. |
| `sorted_mm[]` | all | The three extents sorted ascending. Use ONLY for cut-list H/W/T. |
| `pos_mm.{x,y,z}` | all | Bounding-box **center** in SketchUp world coords. |
| `axes` | all | **(v5)** The part's three LOCAL axis unit-vectors expressed in SketchUp world space. See below. |
| `is_leaf` | all | `true` = a real part; `false` = a sub-assembly with `children`. |
| `item_type` | all | `Cabinet` on roots; `Part` on leaves; `Other` on intermediate sub-assemblies. |
| `role` | leaves | `"part"` (present on leaf parts). |
| `cuts[]` | leaves | Detected machining cuts (v4+). Empty array if none. |
| `children[]` | non-leaves | Child nodes (recursive). |
| `panel_count` | roots | Number of panel leaves under this root. |
| `fitting_count` | roots | Number of fitting leaves under this root. |

### `axes` (v5) — orientation
`axes.x`, `axes.y`, `axes.z` are the part's LOCAL x/y/z axes, each a unit vector in
SketchUp world space, taken from the part's cumulative transform. Together with
`size_mm` (measured along those same local axes) they describe an **oriented box**.

- **Axis-aligned part** (normal cabinet) → identity:
  `{"x":[1,0,0],"y":[0,1,0],"z":[0,0,1]}`.
- **Part rotated 90° about vertical** (corner-cabinet second leg), local X pointing
  to world +Y: `{"x":[0,1,0],"y":[-1,0,0],"z":[0,0,1]}`.
- Vectors are normalized (uniform scale stripped). Mirrored parts keep their sign,
  so the 3×3 basis `[axes.x | axes.y | axes.z]` may have determinant **−1** — a
  reflection. The viewer handles this when building the orientation matrix.

---

## 3D placement (v5 — oriented box)
For each part build a `BoxGeometry` at its LOCAL `size_mm`, orient it by `axes`,
and place it at `pos_mm`. Apply ONE global SketchUp→three (Z-up → Y-up) map to the
whole assembly:
- `three.x =  su.x`
- `three.y =  su.z`
- `three.z = -su.y`

As a fixed change-of-basis `C = [[1,0,0],[0,0,1],[0,-1,0]]` (determinant +1). The
part's three-space orientation is `C · [axes.x | axes.y | axes.z]`; its three-space
centre is `C · pos_mm`. Recenter on the assembly's min corner so it sits at origin.

> The app's SketchUp 3D path consumes `axes` when present (oriented-box render);
> imports without `axes` (v2/v3/v4) fall back to the legacy axis-aligned logic.

### Cut-list / BOM dimensions (unchanged)
For the cut-list / BOM table use `sorted_mm`: `thickness = sorted_mm[0]`,
`width = sorted_mm[1]`, `height = sorted_mm[2]`. (Orientation-independent; correct
even for rotated parts, since `size_mm`/`sorted_mm` are local.)

---

## Cuts (v4+) — machining detection

Each leaf **panel** carries a `cuts[]` array (fittings always get `cuts: []`).
Coordinates are **absolute on the panel face**, panel-local origin at the panel's
min corner. Cut detection runs only on panels and is noise-filtered
(width ≥ 3mm, length ≥ 5mm, depth ≥ 1mm).

```json
{
  "type": "rabbet",          // dado | groove | rabbet | through
  "depth_mm": 8.4,
  "width_mm": 9.0,           // across the channel
  "length_mm": 1164.0,       // along the channel
  "runs_along": "width",     // width | height | depth
  "face": "front",           // front | back | both (which big face: t≈0 vs t≈th)
  "u_min_mm": 0.0, "u_max_mm": 1164.0,   // footprint axis 1
  "v_min_mm": 518.0, "v_max_mm": 527.0   // footprint axis 2
}
```

A complex/curved panel that would emit too many slivers gets `cuts: []` plus a
`cut_warning` string instead.

**Viewer cut rendering (Stage 8b–8e):** cuts render as inset recess boxes in the
panel's LOCAL frame, on the panel face pointing toward the cabinet interior, at the
correct depth position. Under the v5 oriented-box path, the cut meshes are children
of the panel mesh, so they inherit the panel's orientation automatically.

---

## Leaf classification: panel vs fitting
A leaf is a **fitting** if its name matches (case-insensitive):
`p2o, leg_, atira, hafele, basket, l_channel, u_channel, channel, blum, hinge,
slide, cutlery`. Otherwise it is a **panel**. (Same rule app-side and in the
extension's cut-detection gate.)

---

## Cabinet naming (real-world)
Names are compound descriptors, e.g. `BDR.K3.120 / Wood DR / P2O / LCH`. The
leading token (`BDR.K3.120`) is the cabinet code used to match against
`products.code`. The matcher parses the first slash-delimited segment, trimmed.

---

## Importers and which schema they read
| Importer (app route) | Schema | Status |
|----------------------|--------|--------|
| `/products/import` (.3ds) | binary .3ds | assembled geometry, real positions |
| `/products/import` (.dxf) | Polyboard DXF | legacy; flat-layout, synthesized 3D |
| `/products/import-sketchup` | `alloy.sketchup.v2` | bulk catalog (flat `items[]`) |
| `/products/import-sketchup-single` | `alloy.sketchup.v3`/`v4`/`v5` | one cabinet → one product |
| `/products/import-sketchup-project` | `alloy.sketchup.v3`/`v4`/`v5` | many cabinets → bulk |

> v5 is structurally v4 + `axes` on every node. The recursive parser carries `axes`
> through (optional); the 3D path uses it when present and falls back to the legacy
> axis-aligned logic when absent (v3/v4).

---

## Legacy shapes (for the older importers)

**v2** — flat `items[]`, each with `overall_mm.{w,h,d}`, `panels[]`, `fittings[]`.
No nesting beyond panels/fittings. Read by `/products/import-sketchup`.

**v3** — nested `roots[]` tree with `size_mm`/`sorted_mm`/`pos_mm`, recursive
`children`, `is_leaf`, `item_type`. No `cuts`, no `axes`.

**v4** — v3 + `cuts[]` on leaf panels + `total_parts`. No `axes`. Parts assumed
axis-aligned; `size_mm` treated as world-axis extents by the viewer (correct only
for un-rotated cabinets).
