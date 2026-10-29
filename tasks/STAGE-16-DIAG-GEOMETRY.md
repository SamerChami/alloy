# STAGE 16 — DIAG: Per-Leaf Geometry Detection

## Purpose
Decide, from **runtime evidence only**, how to make the viewer show each exported
leaf exactly as it appears in SketchUp — including cutouts, push/pull, mixed
thicknesses, and cut edges. This is a **diagnostic stage only**. Write NO exporter
emission logic and NO viewer changes yet. We are gathering geometry stats to
validate the "plain vs. complex" gate before building Stage 16 proper.

## Control model
`mesh_diag.skp` — one group containing exactly two named components:
- **`mesh`** — has cutouts, push/pull, different thicknesses, cut edges (COMPLEX).
- **`plain`** — a simple rectangular panel (PLAIN, control).

Both must be flagged explicitly by name in the probe output so we can read the
gate's verdict against ground truth.

## What to add (temporary probe — must be trivially removable)
In the Ruby extension (`extension/alloy_export/main.rb`), add a diagnostic probe
that runs during export for **every leaf** (`ComponentInstance` and `Group`),
using the existing `entities_of(e)` / `local_bounds(e)` helpers. For each leaf,
compute and log a JSON line with these fields:

```
{
  "name":            <leaf name>,
  "type":            "component" | "group",
  "face_count":      <number of Sketchup::Face in entities_of(e)>,
  "edge_count":      <number of Sketchup::Edge in entities_of(e)>,
  "has_inner_loops": <true if ANY face has more than one loop (i.e. a hole)>,
  "distinct_normals": <count of unique face normals, rounded to 3 dp,
                       expressed in the leaf's LOCAL frame>,
  "axis_aligned_faces": <count of faces whose local-frame normal is within
                         1e-3 of ±local X/Y/Z>,
  "bbox_vol_mm3":    <local_bounds volume>,
  "solid_vol_mm3":   <entities.respond_to?(:volume) ? volume : null>,
                     // group/component definition volume if SketchUp exposes it;
                     // null if the entities do not form a manifold solid
  "outline_loop_pts": <loop-point count that outline_mm WOULD emit for this leaf,
                       via the existing outline path; null if none>,
  "gate_verdict":    <"plain" | "complex" per the rule below>
}
```

### Gate rule to evaluate (this is the theory under test)
Mark a leaf **plain** when ALL of:
- `face_count == 6`
- `has_inner_loops == false`
- every face is axis-aligned (`axis_aligned_faces == face_count`)
- `distinct_normals == 6`

Otherwise mark it **complex**.

Log the verdict but ALSO log the raw fields above so we can see WHY — do not
collapse to just the verdict. If `mesh` comes back `plain` or `plain` comes back
`complex`, the raw fields tell us which sub-condition misfired.

## Output
- Write the probe JSON to the Ruby Console (one line per leaf) AND append the same
  lines to a sidecar file next to the export, e.g. `mesh_diag.geomprobe.json`
  (array of leaf objects). Do not alter the real export JSON payload at all.
- Keep the probe behind an obvious marker comment `# [16DIAG]` on every added
  block so removal in Stage 16 proper is a clean grep-and-delete, exactly like the
  `[14DIAG]` blocks were.

## Do NOT
- Do NOT add `mesh_ref` emission for panels yet.
- Do NOT touch `Cabinet3D.tsx`, `lib/cabinet3d.ts`, or `parseV3.ts`.
- Do NOT change `cuts`, `tooling`, `outline_mm`, `profile_mm`, `size_mm`,
  `sorted_mm`, or the meshes dict.
- Do NOT bump `VERSION` or `SCHEMA` — this probe is non-shipping.

## Verification / install discipline
1. Repackage the `.rbz` (loader stub at archive root + nested
   `alloy_export/main.rb`).
2. Uninstall old extension → quit SketchUp fully → manually delete
   `Plugins\alloy_export` → reinstall. Confirm no bare `Plugins\main.rb` at root
   (`Get-ChildItem Plugins\*.rb` shows none).
3. In Ruby Console confirm loaded build: `puts Alloy::Export::VERSION` /
   `::SCHEMA` (memory read, not Extension Manager).
4. Open `mesh_diag.skp`, run export, and capture `mesh_diag.geomprobe.json`.

## Report back (paste to me)
- The full `mesh_diag.geomprobe.json` (both leaves).
- Confirmation the `mesh` leaf shows `gate_verdict:"complex"` and `plain` shows
  `gate_verdict:"plain"`.
- If either misfires: the raw fields for that leaf so we can adjust the gate rule
  BEFORE writing any emission code.

Set `$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000` before launching.
