# Stage 7 — SketchUp extension: cut/groove detection (v0.4) — Claude Code

Extend the ALLOY SketchUp extension to DETECT machining cuts (dado / groove /
rabbet / through-cut) on each panel and add them to the JSON as structured data
(absolute coordinates on the panel face, classified type). This is the
foundation for accurate 3D AND for cut-lists / CNC.

The extension source is the `alloy_export` Ruby files (you have the current
v0.3). This task MODIFIES the extension (Ruby), not the Next.js app. Output a new
`alloy_export.rbz`.

## Proven detection algorithm (VERIFIED on a real grooved panel)
A panel is a solid board: thickness axis = its smallest extent (e.g. X=18mm),
the two large faces sit at x=0 and x=thickness. A straight cut (dado/groove/
rabbet) removes material to some depth, creating an INTERMEDIATE face parallel to
the big faces, at x = (thickness - cut_depth) or x = cut_depth.

Algorithm per panel (leaf component), in the panel's LOCAL coordinates
(use the component's definition geometry so it's axis-aligned; thickness =
smallest bbox axis, call it T-axis; the other two are the face plane U,V):
1. Determine T (thickness) axis and full thickness `th`. Big faces at t=0 and
   t=th.
2. Find all faces whose normal is parallel to the T-axis (|n·T| ≈ 1) AND whose
   t-value is strictly between 0 and th (an intermediate plane). Each such face
   is the FLOOR of a cut.
3. For each intermediate-floor face, its (U,V) bounding rectangle = the cut's
   footprint on the face; `depth = min(t, th - t)` (distance from nearest big
   face); the cut runs along whichever of U/V is longer.
4. Group/merge coplanar adjacent floor faces into one cut region (a cut may be
   several triangles).
VERIFIED example: panel 18×560×770 → found intermediate plane at t=9 spanning
depth-axis 518..527 (9mm wide) × height 9..761 → a 9mm-wide, 9mm-deep groove
near the back edge. Correct.

## Classify each cut (straight cuts only for v1)
Using the cut's footprint relative to the panel's full face rectangle:
- **through-cut**: depth ≈ full thickness (goes all the way through). (For v1 we
  focus on partial cuts; still report if found.)
- **rabbet**: the cut is along an EDGE of the panel (its footprint touches one of
  the four panel edges) AND open on that edge — an L-shaped edge recess.
- **dado / groove**: a channel NOT at an edge (runs across the face interior).
  Convention: call it **dado** if it runs across the width (cross-grain), 
  **groove** if along the length — but since we may not know grain, you MAY label
  both as "groove" and include orientation. Acceptable: type="groove" with
  `runs_along: "height"|"width"`.
Keep it simple and include raw numbers so it's verifiable.

## JSON output (add to each leaf/part in schema, bump to v4)
Add to each part a `cuts` array (empty if none):
```
"cuts": [
  {
    "type": "groove",              // dado | groove | rabbet | through
    "depth_mm": 9.0,
    "width_mm": 9.0,               // across the channel
    "length_mm": 752.0,            // along the channel
    "runs_along": "height",        // height | width | depth
    "face": "front" | "back" | "both",   // which big face it's cut into (t≈0 vs t≈th); "both" if mirrored
    // absolute coords on the panel face (panel local origin at its min corner):
    "u_min_mm": 518.0, "u_max_mm": 527.0,   // across-thickness footprint axis 1
    "v_min_mm": 9.0,   "v_max_mm": 761.0    // axis 2
  }
]
```
Use ABSOLUTE coordinates on the panel face (panel-local, origin at the panel's
min corner), per decision. Keep `size_mm`, `pos_mm`, etc. as before. Bump schema
to `alloy.sketchup.v4`. Also FIX the existing `total_parts: null` bug (compute
the leaf count AFTER annotation).

## Robustness / scope
- v1 = STRAIGHT cuts (dado/groove/rabbet) only. Ignore holes/drilling/curves for
  now (a later phase). Don't crash on curved or complex panels — if a panel's
  geometry is too complex to analyze, set `cuts: []` and add a warning string.
- Work in the panel's local axes via its component definition. Apply the same
  recursive walk as v0.3 (this only adds cut analysis at leaf parts).
- Read-only; no model changes; no network. Output a new `alloy_export.rbz`.

## Acceptance
- Re-exporting the sample grooved panel yields a `cuts` array with the 9mm×9mm
  groove (and bottom/top rabbets if present) at correct coordinates.
- schema == "alloy.sketchup.v4"; `total_parts` is a real number.
- Ruby syntax valid; extension loads in SketchUp; menu item works; popup still
  shows the summary.
- Provide the rebuilt `alloy_export.rbz`.

NOTE: This is the FIRST version of cut detection — it will likely need a couple
of iterations on real panels. After building, Samer will export a few varied
panels and we'll refine. Tell Samer to install the new .rbz (uninstall old,
restart SketchUp) and export the grooved panel, then send the JSON to verify the
cuts array.
