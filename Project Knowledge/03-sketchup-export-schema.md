# ALLOY App — SketchUp Export JSON Schema (alloy.sketchup.v6.5)

## Overview
The ALLOY SketchUp extension (`alloy_export.rbz`, currently **v0.6.11**) exports a
SketchUp model to a structured JSON file consumed by the app's import pipeline.

Schema evolution: **v2** (flat items) → **v3** (nested tree) → **v4** (tree +
machining `cuts`) → **v5** (oriented geometry: `axes`, `outline_mm`, `profile_mm`,
world-space `open_normal`) → **v6** (fitting `mesh` geometry + `mesh_ref` dedupe) →
**v6.3** (reflection-correct orientation finalized) → **v6.4** (scale-aware export:
instance scale baked into all measurements) → **v6.5** (groups reach full parity
with components: oriented + scale-aware geometry, plus an additive `reflected`
leaf field). This document describes **v6.5**, the current format. Older shapes are
summarized at the bottom.

> **What changed in v6.5 (Stages 15b + 15b-FIX — groups parity):** previously
> every oriented and scale-aware path (`instance_scales`, `face_outline`,
> `cross_section`, `detect_cuts`, `detect_tooling`) was gated to
> `ComponentInstance` and keyed on `e.definition`. A **group** leaf therefore
> exported only `size_mm`/`pos_mm`/`axes` — no scale, no `outline_mm`, no `cuts`,
> no `tooling`. v6.5 ungates those helpers and sources geometry generically
> (`entities_of(e)` + `local_bounds(e)`), so groups now carry the same oriented,
> scale-aware data as components. Two consequences:
> 1. **Scaled groups now report their true placed size.** A group resized in
>    SketchUp previously exported its unscaled local extent; `instance_scales` now
>    reads the placed scale from the group transform's column magnitudes (the same
>    formula already used for components) and applies it to all measurements.
> 2. **New additive `reflected` leaf field** on group leaves (see "Reflection"
>    below). `reflected` is `true` when the group's normalized world-axis basis has
>    a left-handed determinant (< 0) — the same test components use. Additive only —
>    no field renames. Component output is **byte-identical** to v6.4 (components
>    already hit every path; `reflected` is emitted on group leaves only), so v6.4
>    and v6.5 are interchangeable for existing parsers.

> **What changed in v6.4 (Stage 14c):** the extension now measures geometry in
> **instance space**, not unscaled component-definition space. Component instances
> that were resized in SketchUp (a per-axis scale in their placement transform) were
> previously exported at their *definition* size, producing wrong dimensions. v6.4
> applies the per-local-axis scale to `size_mm`, `outline_mm`, `mesh` vertices, and
> `cuts[]`. See "Scale handling" below. The JSON *shape* is unchanged from v6.3 —
> only magnitudes were corrected — so v6.3 and v6.4 are structurally interchangeable
> for parsers.

---

## Top-Level Structure (v6.4)

```json
{
  "schema": "alloy.sketchup.v6.5",
  "version": "0.6.11",
  "model": "test.skp",
  "units": "mm",
  "root_count": 1,
  "total_parts": 22,
  "summary": { "Cabinet": 1 },
  "roots": [ ...RootNode ],
  "meshes": { "mesh_<hash>": { "vertices": [...], "triangles": [...] } }
}
```

- `total_parts` — total count of leaf descendants across all roots.
- `summary` — count of roots by `item_type` (Cabinet, Appliance, Worktop, Trim,
  Other, RoomBox).
- `roots[]` — each root is one top-level component/group in the model.
- `meshes{}` — shared mesh store (v6+). Fitting leaves reference entries by
  `mesh_ref`; see "Fitting mesh" below.

---

## Node Structure (recursive tree)

Every node — root, intermediate sub-assembly, or leaf part — shares a common shape.
Nodes nest via `children[]`. **A model is a tree, not a flat list.**

```json
{
  "name": "Right_Side#114",
  "type": "component",
  "size_mm": { "x": 18.0, "y": 560.0, "z": 770.0 },
  "sorted_mm": [18.0, 560.0, 770.0],
  "pos_mm": { "x": 789.5, "y": 300.0, "z": 385.0 },
  "axes": { "x": [-1,0,0], "y": [0,1,0], "z": [0,0,1] },
  "is_leaf": true,
  "item_type": "Part",
  "role": "side_right",
  "reflected": false,
  "outline_mm": { ...Outline },
  "cuts": [ ...Cut ],
  "children": [ ...Node ]
}
```

### Field reference
| Field | Where | Meaning |
|-------|-------|---------|
| `name` | all | Component name + instance suffix `#NN`. Groups may be `(unnamed)`. |
| `type` | all | SketchUp entity kind (`component` / `group`). |
| `size_mm.{x,y,z}` | all | Instance bounding-box extents along SketchUp **world X/Y/Z**, **scaled** (v6.4). World-axis AABB — see warning below. |
| `sorted_mm[]` | all | The three extents sorted ascending. Use ONLY for cut-list H/W/T. |
| `pos_mm.{x,y,z}` | all | Instance bounding-box **center** in SketchUp world coords. Confirmed correct for placement (Stage 14a). |
| `axes` | leaves | The instance's local x/y/z basis as **unit** vectors in SketchUp world space. A signed permutation for axis-aligned parts. For **components** `det(axes) < 0` ⇒ reflected/mirrored; for **groups** this absolute test is unreliable (see `reflected` and "Reflection" below). Scale is NOT encoded here (vectors are normalized). |
| `reflected` | **group** leaves (v6.5+) | `true` if this group leaf has a left-handed (reflected/mirrored) world basis — i.e. `det(xaxis.normalize, yaxis.normalize, zaxis.normalize) < 0`. The same normalized-determinant test used for components, but emitted as an explicit field so the viewer never needs to re-derive it. Group leaves **only** — component leaves omit it (their `axes` determinant is authoritative directly). See "Reflection" below. |
| `is_leaf` | all | `true` = a real part; `false` = a sub-assembly with `children`. |
| `item_type` | all | `Cabinet` on roots; `Part` on leaves; `Other` on intermediate sub-assemblies. |
| `role` | leaves | Semantic role: `side_left`, `side_right`, `top`, `bottom`, `back`, `drawer_front`, `other`, etc. Drives panel-local axis routing in the viewer. |
| `outline_mm` | panel leaves | Oriented 2D silhouette + thickness. **Authoritative source for oriented panel sizing.** See below. |
| `profile_mm` | channel leaves | Extruded cross-section for channel fittings. |
| `mesh_ref` | fitting leaves | Key into top-level `meshes{}` for arbitrary fitting geometry (legs, etc.). |
| `open_normal` | panel leaves | Outward face normal in **world space** (v5+; was panel-local pre-v5 — do not regress). |
| `cuts[]` | panel leaves | Detected machining cuts (linear grooves/dados/rabbets/through). Empty array if none. |
| `tooling[]` | panel leaves | Detected drilling/pocketing (through-bores + blind pockets), circle or polygon. Empty array if none. |
| `children[]` | non-leaves | Child nodes (recursive). |
| `panel_count` / `fitting_count` | roots | Leaf counts under this root. |

> **⚠ `size_mm` is a world-axis AABB — do NOT use it to size oriented panels.**
> For a rotated/reflected part, `size_mm` lists extents in world-axis order, which
> does not match the part's local width/depth/height. Use **`outline_mm`** (u/v
> extents + `thickness_mm`) for oriented panel sizing. Fittings (legs, cylinders)
> keep `size_mm` sizing because their outlines are degenerate.

---

## Scale handling (v6.4)

SketchUp component **instances** can carry a per-axis **scale** in their placement
transformation (the user resized the instance after placing it). Pre-v6.4 the export
read the unscaled **definition** bounding box, so scaled instances exported at the
wrong size. v6.4 extracts the per-local-axis scale from the transform's linear part
(column lengths of the 3×3) and applies it to **every** measured quantity:

- `size_mm` / `sorted_mm` — extents multiplied by the matching axis scale.
- `outline_mm` loop coordinates (u, v) and `thickness_mm` — scaled.
- `cuts[]` `u_*`, `v_*`, `depth_mm`, `width_mm`, `length_mm` — scaled, so grooves stay
  on the panel after it grows/shrinks.
- Fitting `mesh` vertices — scaled before storage/hashing, so e.g. a leg definition
  modeled at 168.5 mm but placed at scale 0.653 exports as a 110 mm leg.

`axes` remains **unit** vectors (rotation/reflection only); scale lives in the
measurements, not the axes. This keeps the viewer's orientation math unchanged.

> **Known limitation (backlog):** "Make Unique" fitting instances each own a distinct
> definition, so identical-looking legs can hash to different `mesh_ref` keys and be
> stored multiple times. Payload-size only; geometry and BOM are correct. Candidate to
> address during v6 persistence.

---

## Outline (v5+) — oriented panel silhouette

Each **panel** leaf carries `outline_mm`: the panel's true 2D face loop plus
thickness, expressed in the panel's local frame.

```json
{
  "u_axis": "depth",          // which local role u maps to: width | depth | height
  "v_axis": "height",         // which local role v maps to
  "thickness_mm": 18.0,       // along the remaining local axis (scaled, v6.4)
  "loop": [ [0.0,0.0], [560.0,0.0], [560.0,770.0], ... ]  // u,v points, local min corner = origin
}
```

The viewer extrudes the loop by `thickness_mm`, routes (u, v, thickness) to local
width/depth/height per `u_axis`/`v_axis`/role, then applies the instance orientation
as a **`Matrix4`** (see orientation note). `outline_mm` is the reliable source for
oriented sizing; `size_mm` is not.

---

## Orientation — reflection-correct (v5/v6.3)

Panels may be **mirrored** (`det(axes) < 0`). A `THREE.Quaternion` cannot represent a
reflection (it silently drops the −1 determinant, turning a mirror into a wrong
rotation). **All three viewer render paths apply orientation as a full `THREE.Matrix4`
with `matrixAutoUpdate = false`, translation baked in**, so reflections survive:

1. **Panel / Matrix4** — `outline_mm` routed to local axes by `role`
   (`width→local x`, `depth→local y`, `height→local z`).
2. **Leg / mesh** — `mesh_ref` geometry with reflection-preserving `Matrix4`.
3. **Channel / profile** — `profile_mm` cross-section extruded along the run axis,
   reflection-preserving `Matrix4`.

Cuts are children of the panel mesh and inherit the parent's reflection-correct
matrix automatically.

---

## Reflection (v6.5)

A mirrored part has a **left-handed** local basis — `det(xaxis, yaxis, zaxis) < 0`
where the three axes are normalized world-space vectors. This is the same test for
**both** groups and components:

- A proper rotation has `det = +1` regardless of axis permutation.
- A genuine mirror/flip produces `det = −1`.
- This was validated at runtime (Stage 15b-FIX) with a named 8-leaf control model:
  `G_PLAIN` and `G_PLAIN_R` (rotated 90°) → `+1`; all four `G_MIRROR_*` variants →
  `−1`. The normalized determinant cleanly separates reflected from non-reflected in
  all cases.

For **components** the viewer derives reflection directly from `axes` (unchanged
since v5/v6.3). For **group** leaves the export pre-computes and emits it as the
additive `reflected` boolean (v6.5+) so the viewer can consume it without
re-deriving:

> A group leaf is `reflected: true` iff
> `det(tr.xaxis.normalize, tr.yaxis.normalize, tr.zaxis.normalize) < 0`,
> where `tr` is the leaf's accumulated world transform.

Component leaves omit `reflected`; their `axes` determinant is authoritative.
The viewer should consume `reflected` for group leaves rather than re-deriving from
`axes`, both for correctness and to avoid implementing the same determinant logic
twice.

---

## Cuts — machining detection

Each panel leaf carries `cuts[]` (fittings always get `cuts: []`). Coordinates are on
the panel face, panel-local origin at the min corner, **scaled** in v6.4. Noise-
filtered (width ≥ 3 mm, length ≥ 5 mm, depth ≥ 1 mm).

```json
{
  "type": "rabbet",          // dado | groove | rabbet | through
  "depth_mm": 8.4,
  "width_mm": 9.0,           // across the channel
  "length_mm": 752.0,        // along the channel (scaled)
  "runs_along": "width",     // width | height | depth
  "face": "front",           // front | back | both
  "u_min_mm": 0.0, "u_max_mm": 752.0,
  "v_min_mm": 518.0, "v_max_mm": 527.0
}
```

A complex/curved panel that would emit too many slivers gets `cuts: []` plus a
`cut_warning` string instead.

---

## Leaf classification: panel vs fitting
A leaf is a **fitting** if its name matches (case-insensitive):
`p2o, leg_, atira, hafele, basket, l_channel, u_channel, channel, blum, hinge,
slide`. Otherwise it is a **panel**. Fittings get `mesh_ref` and/or `profile_mm`;
panels get `outline_mm` + `cuts[]`.

---

## Dimensions & Coordinates
- All dimensions in **millimeters**.
- Positions in SketchUp world coordinates, **Z-up**.
- Cut-list / BOM table uses `sorted_mm`:
  `thickness = sorted_mm[0]`, `width = sorted_mm[1]`, `height = sorted_mm[2]`.
- **3D placement / oriented sizing** uses `outline_mm` (panels) or `mesh`/`profile`
  (fittings) + `axes` + `pos_mm`, with the Z-up → Y-up map:
  - `three.x = su.x`
  - `three.y = su.z`
  - `three.z = -su.y`
  Apply orientation as a `Matrix4` (reflection-safe). Do NOT use `sorted_mm` or raw
  `size_mm` for oriented parts — both lose/scramble local axis identity.

---

## Cabinet naming (real-world)
Names are compound descriptors, e.g. `BDR.K3.120 / Wood DR / P2O / LCH`. The leading
slash-delimited token (`BDR.K3.120`, trimmed) is the cabinet `code` used to match
against `products.code`. The old `^[BWTPC]\d+` convention (B600, W800) is superseded.

---

## Importers and which schema they read
| Importer (app route) | Schema accepted | Status |
|----------------------|-----------------|--------|
| `/products/import` (.3ds) | binary .3ds | assembled geometry, real positions |
| `/products/import` (.dxf) | Polyboard DXF | legacy; flat-layout, synthesized 3D |
| `/products/import-sketchup` | `alloy.sketchup.v2` | bulk catalog (flat `items[]`) |
| `/products/import-sketchup-single` | `alloy.sketchup.v3`–`v6.5` | one cabinet → one product |
| `/products/import-sketchup-project` | `alloy.sketchup.v3`–`v6.5` | many cabinets → bulk |

> The single/project importers' schema gate accepts the `alloy.sketchup.v*` family
> (major ≥ 3). The recursive parser (`lib/sketchup/parseV3.ts`) carries `cuts`,
> `axes`, `outline_mm`, `profile_mm`, `mesh_ref`, and `open_normal`. v6.5 is
> additive over v6.4 (group leaves now populate `outline_mm`/`cuts`/`tooling` and
> carry `reflected`); existing parsers read it unchanged — consuming `reflected` in
> the viewer is a separate, optional step.

---

## Legacy shapes (for the older importers)

**v2** — flat `items[]`, each with `overall_mm.{w,h,d}`, `panels[]`, `fittings[]`.
No nesting. Read by `/products/import-sketchup`.

**v3** — nested `roots[]` tree with `size_mm`/`sorted_mm`/`pos_mm`, recursive
`children`, `is_leaf`, `item_type`. No `cuts`, no oriented geometry.

**v4** — v3 + `cuts[]` on leaves + `total_parts`.

**v5** — v4 + oriented geometry (`axes`, `outline_mm`, `profile_mm`), world-space
`open_normal`, reflection-correct orientation.

**v6 / v6.3** — v5 + fitting `mesh` geometry in top-level `meshes{}` with `mesh_ref`
dedupe; reflection handling finalized across all render paths.

**v6.4** — v6.3 with instance **scale** baked into all measurements.

**v6.5** — v6.4 + **groups parity**: group leaves now carry oriented + scale-aware
geometry (`outline_mm`, `cuts`, `tooling`, `profile_mm`, scaled `size_mm`) on the
same paths as components, plus an additive `reflected` boolean on group leaves
(normalized-basis `det < 0` — the same clean signal components use; validated with
a named 8-leaf control model). Component output byte-identical to v6.4 (current).
