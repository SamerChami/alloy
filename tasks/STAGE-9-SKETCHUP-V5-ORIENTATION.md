# Stage 9 — SketchUp extension v0.5 (orientation export for rotated/L-corner cabinets)

## What changed
`alloy_export.rbz` → **v0.5.0**, schema **`alloy.sketchup.v5`**.

The extension already computed each part's correct LOCAL size (`size_mm`, which is
rotation-invariant) and its full cumulative world transform `tr` — but it threw
the rotation away, keeping only the world center. That's why a rotated part (like
one leg of an L-shaped corner cabinet) scattered in the 3D preview: the viewer had
no orientation and assumed local axes = world axes.

v0.5 adds one field, `axes`, to **every node** — the part's three LOCAL axis
vectors expressed as unit vectors in world space, pulled straight from `tr`:

```json
"axes": {
  "x": [1.0, 0.0, 0.0],
  "y": [0.0, 1.0, 0.0],
  "z": [0.0, 0.0, 1.0]
}
```

- For a normal axis-aligned cabinet, `axes` is the identity above (so nothing
  about existing imports changes in meaning).
- For a part rotated 90° about the vertical (the corner-cabinet leg), e.g. local
  X points to world +Y: `"x": [0,1,0], "y": [-1,0,0], "z": [0,0,1]`.

This is **purely additive** — all v4 fields (`size_mm`, `sorted_mm`, `pos_mm`,
`cuts`, `is_leaf`, etc.) are unchanged. Vectors are normalized so any baked-in
uniform scale won't corrupt orientation.

Schema relationship: **v5 = v4 + `axes` on every node.** (Just as v4 = v3 + `cuts`.)

## Install (Samer)
1. In SketchUp: Window → Extension Manager → uninstall the old "ALLOY Export".
2. Restart SketchUp (clears the old loaded code).
3. Extension Manager → Install Extension → choose `alloy_export_0_5_0.rbz`.
4. Restart SketchUp again.
5. Confirm: Extensions/Plugins menu shows "Export to ALLOY (JSON)", and Extension
   Manager lists ALLOY Export **0.5.0**.

## Test — export the L-corner cabinet
1. Select **BC2.K3.120*120** (the L-shaped base corner cabinet).
2. Plugins → Export to ALLOY (JSON). Save it.
3. Send me the JSON.

## What we'll verify in the JSON
- `schema` == `alloy.sketchup.v5`, `version` == `0.5.0`.
- Every leaf now has an `axes` block.
- The cabinet's two legs: panels in the rotated leg should show a non-identity
  `axes` (e.g. their local X mapped to world ±Y), while the other leg's panels
  show identity-ish axes. That's the orientation the viewer was missing.
- `size_mm` values look sane (thickness still ~18 in local frame — it should,
  since size was always local).

Once the JSON confirms correct `axes`, the next stage rewrites the SketchUp 3D
build path to render each panel as an ORIENTED box (local size + axes rotation +
`pos_mm`), replacing the current "smallest world extent = thickness" guess. That
permanently fixes the corner cabinet AND subsumes the 8c/8d/8e cut placement into
"the cut lives in the panel's local frame, oriented correctly" — no per-panel
sign handling.

## Note
The v5 export is backward-compatible at the data level, but the current app
importers read up to v4 and will ignore `axes`. So until the viewer is updated
(next stage), a v5 file imports like a v4 file — normal cabinets look the same,
the corner cabinet still won't be correct until the viewer consumes `axes`. Don't
mass-re-export the catalog to v5 yet; just export the one corner cabinet to verify.
