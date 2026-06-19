# Stage 7b — Refine cut detection (Claude Code, SketchUp extension)

Cut detection WORKS on real panels (verified): Left_Side/Right_Side report the
correct 9×9mm×752 groove; Bottom/Top_Back/DR_Front report correct single rabbets/
grooves. But three issues to fix. Modify the Ruby extension; output a new
`alloy_export.rbz` (bump to v0.4.1, keep schema `alloy.sketchup.v4`).

## Issue 1 (MAIN) — Don't run cut detection on FITTINGS
The Leg reported 36 bogus "cuts" — the detector is analyzing the leg's curved/
cylindrical facets as tiny cuts. Cut detection must ONLY run on PANELS, never on
fittings.
- A leaf is a fitting if its name matches the fitting keywords (p2o, leg_, atira,
  hafele, basket, l_channel, u_channel, channel, blum, hinge, slide) — the same
  rule already used to split panels vs fittings.
- For fitting leaves: set `cuts: []` and SKIP detection entirely.
- Only run detection on PANEL leaves (boards). This alone removes the 36 bogus
  leg cuts.

## Issue 2 — Filter noise / tiny slivers
Even on panels, ignore micro-features from triangulation:
- Discard any detected cut whose width_mm < 3.0 OR length_mm < 5.0 OR
  depth_mm < 1.0. These are noise, not real machining.
- Additionally, a real panel is a flat board: its thickness is uniform (the
  smallest bbox axis). If a "panel" is actually curved/complex (e.g. its mesh
  has many non-axis-aligned normals, like a leg that slipped classification),
  and detection would produce > 8 cuts, treat it as suspicious: set cuts:[] and
  add a warning string to the part (`"cut_warning": "complex geometry, skipped"`)
  rather than emitting dozens of slivers.

## Issue 3 — Fix total_parts (still null)
`total_parts` is still null. Compute it AFTER the tree is built and annotated:
total_parts = sum over roots of (count of leaf descendants). Put a real integer
in the payload.

## Keep / don't break
- The verified-correct panel cuts must remain (Left_Side groove 9×9×752 at
  u518–527, etc.). Don't over-filter and lose real cuts: 9mm-wide grooves and
  rabbets must survive the noise filter (they're well above the 3mm threshold).
- Recursive walk, classification, sizes/positions unchanged.
- Read-only, no network. Valid Ruby syntax. Output `alloy_export.rbz`.

## Acceptance
- Re-export the same cabinet: the Leg now has `cuts: []`; Left_Side/Right_Side
  still show the single 9×9×752 groove; Bottom/Top_Back/DR_Front still show their
  single correct cut; no panel shows dozens of sub-1mm slivers.
- `total_parts` is a real number (e.g. 25).
- Provide rebuilt `alloy_export.rbz`. Tell Samer to install (uninstall old,
  restart SketchUp), re-export, and send the JSON to verify.

NOTE: after this, we expect CLEAN cut data: each panel with 0–few real cuts,
fittings with none. Then we move to displaying cuts in the 3D and feeding
cut-lists.
