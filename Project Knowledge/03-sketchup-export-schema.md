# ALLOY App — SketchUp Export JSON Schema (alloy.sketchup.v6)

## Overview
The ALLOY SketchUp extension (`alloy_export.rbz`, currently **v0.6.8**,
schema string `alloy.sketchup.v6.3`) exports a SketchUp model to structured
JSON consumed by the app's import pipeline.

Schema evolution: **v2** (flat) → **v3** (nested tree) → **v4** (+ `cuts`) →
**v5** (+ `axes` orientation) → **v6** (+ `outline_mm`, `profile_mm`,
`mesh_ref`/`meshes`, `tooling`, and `open_normal` in WORLD space). This
document describes **v6**, the current format. Earlier shapes are summarized
at the bottom for importers that still read them.

> **Critical:** v6 placement is **orientation-aware**. Each part is an
> oriented box, not an axis-aligned one. See "3D placement" below — the old
> "use raw size_mm + pos_mm" recipe from v4 is NO LONGER correct for rotated
> or mirrored parts and must not be used.

---

## Top-Level Structure (v6)

```json
{
  "schema": "alloy.sketchup.v6.3",
  "version": "0.6.8",
  "model": "test.skp",
  "units": "mm",
  "root_count": 1,
  "total_parts": 20,
  "summary": { "Cabinet": 1 },
  "roots": [ ...RootNode ],
  "meshes": { ...meshId: MeshData }
}
```

- `meshes` — a top-level dictionary of deduplicated mesh geometry, keyed by a
  hash/id. Leaf fittings reference entries here via `mesh_ref` (Stage 10).
- Other top-level fields unchanged from v4.

---

## Node Structure (recursive tree)

Nodes nest via `children[]`; enumerate parts by recursively collecting every
`is_leaf: true` descendant.

```json
{
  "name": "Left_Side#2",
  "type": "component",
  "size_mm": { "x": 18.0, "y": 560.0, "z": 770.0 },
  "sorted_mm": [18.0, 560.0, 770.0],
  "pos_mm": { "x": 9.0, "y": 440.5, "z": 495.0 },
  "axes": { "x": [1,0,0], "y": [0,1,0], "z": [0,0,1] },
  "is_leaf": true,
  "item_type": "Part",
  "role": "part",
  "cuts": [ ...Cut ],
  "tooling": [ ...Tool ],
  "outline_mm": { ...Outline },
  "profile_mm": { ...Profile },   // channels only
  "mesh_ref": "abc123",            // mesh-based fittings only (legs)
  "children": [ ...Node ]
}
```

### Field reference
| Field | Where | Meaning |
|-------|-------|---------|
| `name` | all | Component name + instance suffix `#NN`. Suffix changes between exports. |
| `type` | all | SketchUp entity kind. |
| `size_mm.{x,y,z}` | all | AABB extents along SketchUp **world X/Y/Z**. **World-axis order — NOT the part's local axes.** Do not use directly for oriented panel sizing. |
| `sorted_mm[]` | all | Extents sorted ascending. Cut-list H/W/T only. |
| `pos_mm.{x,y,z}` | all | AABB **center**, SketchUp world coords. |
| `axes.{x,y,z}` | all | The part's three LOCAL axis unit-vectors expressed in SketchUp world space (v5+). Identity for unrotated parts; non-identity for rotated; **det = −1 for reflected/mirrored parts**. |
| `is_leaf` | all | `true` = real part; `false` = sub-assembly. |
| `item_type` | all | `Cabinet` / `Part` / `Other`. |
| `role` | leaves | `"part"`. |
| `cuts[]` | leaves | Grooves/rabbets/dados (aspect ratio ≥ 4:1). Empty if none. |
| `tooling[]` | leaves | Compact pockets & bores (v6). Through-bores & blind pockets. |
| `outline_mm` | panel leaves | The panel's 2D face loop in its OWN frame + thickness. Source of truth for oriented box sizing. |
| `profile_mm` | channel leaves | Extruded cross-section profile (L/U channels). |
| `mesh_ref` | mesh fittings | Key into top-level `meshes` (legs, complex fittings). |
| `children[]` | non-leaves | Child nodes. |

---

## `outline_mm` — panel face in local frame (v6, KEY for placement)

```json
"outline_mm": {
  "u_axis": "width",        // width | height | depth
  "v_axis": "height",
  "thickness_mm": 18.0,
  "loop": [[0,0],[832,0],[832,752],[0,752]]   // [u,v] points, mm
}
```

- `u_axis` / `v_axis` name which dimensional ROLE the in-plane axes carry; the
  remaining role is the thickness (out-of-plane) axis.
- Role → local axis mapping (consistent across all panels, matches `size_mm`
  ordering for identity-axes parts): **width → local x, depth → local y,
  height → local z.**
- The viewer builds the oriented box from outline extents routed by role, NOT
  from `size_mm`. See placement below.

---

## Cuts & Tooling

### `cuts[]` — grooves/rabbets (long, thin features)
```json
{
  "type": "groove",         // groove | rabbet | dado | through
  "depth_mm": 9.0,
  "width_mm": 8.0,
  "length_mm": 786.0,
  "runs_along": "width",
  "face": "inner",          // inner | outer (relative to open_normal)
  "open_normal": [0,1,0],   // the floor face's own normal, in WORLD space (v0.6.8)
  "u_min_mm": 30.5, "u_max_mm": 816.5,
  "v_min_mm": 45.0,  "v_max_mm": 53.0
}
```
- **`open_normal` is in WORLD space** (Stage 11e). For a rotated/flipped part
  it reflects the part's placement (e.g. `[1,0,0]` after a 90° Z-rotation,
  `[-1,0,0]` after an X-flip).
- Groove face placement in the viewer is geometry-driven (`szSign`), and cut
  meshes are children of the panel mesh — so they inherit the panel's
  reflection-correct matrix automatically.

### `tooling[]` — compact pockets & bores (v6)
Through-bores (rendered as open holes via `THREE.Shape.holes`) and blind
pockets (recessed cylinder discs). Aspect-ratio classifier sends long-thin
features to `cuts[]` and compact ones to `tooling[]`.

---

## Leaf classification: panel vs fitting
A leaf is a **fitting** if its name matches (case-insensitive):
`p2o, leg_, atira, hafele, basket, l_channel, u_channel, channel, blum, hinge,
slide`. Otherwise a **panel**.

Render-path consequence (three paths, all reflection-aware):
- **Panel** → oriented box from `outline_mm`, applied via Matrix4.
- **Channel fitting** (`profile_mm`) → extruded profile, applied via Matrix4.
- **Mesh fitting** (`mesh_ref`, e.g. legs) → referenced mesh, applied via Matrix4.

Fittings keep `size_mm`-based sizing where outlines are degenerate (e.g. a leg's
outline is a tiny 5×2 loop), but ALL three paths apply the full `axes` basis as
a reflection-preserving Matrix4.

---

## 3D placement (v6) — orientation & reflection aware

**Do NOT use the old v4 recipe** (raw `size_mm` + `pos_mm`, axis-aligned). It
only works for unrotated parts and scatters rotated/mirrored cabinets.

Current pipeline:
1. **Box dimensions** (panels): from `outline_mm` — u-extent, v-extent,
   thickness — routed to local axes by role (width→x, depth→y, height→z).
   Fittings size from their mesh/profile (or `size_mm` fallback).
2. **Orientation:** build the 3×3 from the part's `axes`, each column passed
   through the SU→three basis swap `Cx(v) = [v.x, v.z, −v.y]`. The result is
   `C·Rworld`; reflected parts have **det = −1**.
3. **Apply as a Matrix4, NOT a quaternion.** A quaternion cannot represent a
   reflection and silently drops the −1 determinant, rotating mirrored panels
   90° off (the historical "fin" bug). Use
   `matrixAutoUpdate = false; mesh.matrix.copy(M)` with translation baked in.
4. **Cuts/tooling** are children of the panel mesh and inherit its matrix —
   no per-cut sign logic.

SU→three basis swap (unchanged, applies everywhere):
`three.x = su.x`, `three.y = su.z`, `three.z = −su.y`.

> A Z-flip yields a physically upside-down cabinet (legs on top). The viewer
> renders this faithfully; it is a modeling concern, not a viewer bug.

---

## Cabinet naming (real-world)
Compound descriptors, e.g. `BDR.K3.120 / Wood DR / P2O / LCH`. The leading
slash-delimited segment (`BDR.K3.120`), trimmed, is the cabinet code matched
against `products.code`.

---

## Importers and which schema they read
| Importer (app route) | Schema | Status |
|----------------------|--------|--------|
| `/products/import` (.3ds / .dxf) | binary / DXF | legacy geometry importers |
| `/products/import-sketchup` | `v2` | bulk catalog (flat `items[]`) |
| `/products/import-sketchup-single` | `v3`–`v6` tree | one cabinet → one product |
| `/products/import-sketchup-project` | `v3`–`v6` tree | many cabinets → bulk |

> v6 is structurally the v3 tree + `cuts` + `axes` + `outline_mm`/`profile_mm`/
> `mesh_ref` + `tooling`. `lib/sketchup/parseV3.ts` carries the additive fields;
> the viewer (`lib/cabinet3d.ts`, `components/Cabinet3D.tsx`) consumes `axes`/
> `outline_mm` for oriented rendering.

---

## Legacy shapes (older importers)
**v2** — flat `items[]` with `overall_mm`, `panels[]`, `fittings[]`.
**v3** — nested `roots[]` tree, no `cuts`/`axes`.
**v4** — v3 + `cuts[]` + `total_parts`.
**v5** — v4 + `axes` on every node.
