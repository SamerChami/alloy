# ALLOY App — SketchUp Export JSON Schema (alloy.sketchup.v4)

## Overview
The ALLOY SketchUp extension (`alloy_export.rbz`, currently **v0.4.1**) exports a
SketchUp model to a structured JSON file consumed by the app's import pipeline.

The schema has evolved: **v2** (flat items) → **v3** (nested tree) →
**v4** (nested tree + machining `cuts`). This document describes **v4**, which is
the current format. The older v2/v3 shapes are summarized at the bottom for the
importers that still read them.

---

## Top-Level Structure (v4)

```json
{
  "schema": "alloy.sketchup.v4",
  "version": "0.4.1",
  "model": "test.skp",
  "units": "mm",
  "root_count": 1,
  "total_parts": 25,
  "summary": { "Cabinet": 1 },
  "roots": [ ...RootNode ]
}
```

- `total_parts` — total count of leaf descendants across all roots (fixed in
  v0.4.1; was previously `null`).
- `summary` — count of roots by `item_type` (Cabinet, Appliance, Worktop, Trim,
  Other, RoomBox).
- `roots[]` — each root is one top-level component/group in the model.

---

## Node Structure (recursive tree)

Every node — root, intermediate sub-assembly, or leaf part — shares a common
shape. Nodes nest via `children[]`. **A model is now a tree, not a flat list.**

```json
{
  "name": "Left_Side#231",
  "type": "component",
  "size_mm": { "x": 18.0, "y": 560.0, "z": 770.0 },
  "sorted_mm": [18.0, 560.0, 770.0],
  "pos_mm": { "x": 9.0, "y": 440.5, "z": 495.0 },
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
| `size_mm.{x,y,z}` | all | Bounding-box extents along SketchUp **world X/Y/Z**. Already axis-oriented (NOT sorted). |
| `sorted_mm[]` | all | The three extents sorted ascending. Use ONLY for cut-list H/W/T. |
| `pos_mm.{x,y,z}` | all | Bounding-box **center** in SketchUp world coords. |
| `is_leaf` | all | `true` = a real part; `false` = a sub-assembly with `children`. |
| `item_type` | all | `Cabinet` on roots; `Part` on leaves; `Other` on intermediate sub-assemblies. |
| `role` | leaves | `"part"` (present on leaf parts). |
| `cuts[]` | leaves | Detected machining cuts (v4+). Empty array if none. |
| `children[]` | non-leaves | Child nodes (recursive). |
| `panel_count` | roots | Number of panel leaves under this root. |
| `fitting_count` | roots | Number of fitting leaves under this root. |

### Nesting is real — traverse recursively
Sub-assemblies appear as `is_leaf: false` nodes with their own `children`. Example
from the sample: `Wood_BDR#37` (item_type `Other`) holds 6 leaf parts
(`W_BDR_B`, `W_BDR_BT`, `W_BDR_RS`, `W_BDR_LS`, `DR_Front`, `W_BDR_partition`).
**To enumerate all parts of a cabinet, recursively collect every `is_leaf: true`
descendant** of the root.

---

## Cuts (v4) — machining detection

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

---

## Leaf classification: panel vs fitting
A leaf is a **fitting** if its name matches (case-insensitive):
`p2o, leg_, atira, hafele, basket, l_channel, u_channel, channel, blum, hinge,
slide`. Otherwise it is a **panel**. (Same rule used app-side and in the
extension's cut-detection gate.)

---

## Dimensions & Coordinates
- All dimensions in **millimeters**.
- Positions in SketchUp world coordinates, **Z-up**.
- For the cut-list / BOM table use `sorted_mm`:
  `thickness = sorted_mm[0]`, `width = sorted_mm[1]`, `height = sorted_mm[2]`.
- For **3D placement** use RAW `size_mm.{x,y,z}` + `pos_mm` with the Z-up → Y-up map:
  - `three.x = su.x`
  - `three.y = su.z`
  - `three.z = -su.y`
  Apply the same swap to BOTH box size and center, then recenter on the min corner.
  (Do NOT use `sorted_mm` for 3D — it loses axis identity and scrambles orientation.)

---

## Cabinet naming (real-world)
Names are now compound descriptors, e.g.
`BDR.K3.120 / Wood DR / P2O / LCH`. The leading token (`BDR.K3.120`) is the
cabinet code used to match against `products.code`. The old `^[BWTPC]\d+`
convention (B600, W800) is superseded — the matcher should parse the first
slash-delimited segment, trimmed.

---

## Importers and which schema they read
| Importer (app route) | Schema | Status |
|----------------------|--------|--------|
| `/products/import` (.3ds) | binary .3ds | assembled geometry, real positions |
| `/products/import` (.dxf) | Polyboard DXF | legacy; flat-layout, synthesized 3D |
| `/products/import-sketchup` | `alloy.sketchup.v2` | bulk catalog (flat `items[]`) |
| `/products/import-sketchup-single` | `alloy.sketchup.v3` | one cabinet → one product |
| `/products/import-sketchup-project` | `alloy.sketchup.v3` | many cabinets → bulk |
| **(next) v4 ingest** | `alloy.sketchup.v4` | **TODO** — adds `cuts`, `total_parts`; otherwise v3-compatible tree |

> v4 is structurally v3 + `cuts[]` on leaves + `total_parts`. The v3 recursive
> parser (`lib/sketchup/parseV3.ts`) should extend to v4 by also carrying `cuts`.

---

## Legacy shapes (for the older importers)

**v2** — flat `items[]`, each with `overall_mm.{w,h,d}`, `panels[]`, `fittings[]`.
No nesting beyond panels/fittings. Read by `/products/import-sketchup`.

**v3** — nested `roots[]` tree with `size_mm`/`sorted_mm`/`pos_mm`, recursive
`children`, `is_leaf`, `item_type`. No `cuts`. Read by the single/project
SketchUp importers.
