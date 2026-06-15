# Stage 4e-FIX — DXF Importer dimension bug (task for Claude Code)

The Polyboard DXF importer works (18 panels detected, correct roles, correct
hole counts) but **computes wrong dimensions**. Fix the parser math in
`lib/dxf/polyboardImport.ts`. Do not change the UI or DB.

## Verified ground truth (from the same file, parsed independently)
The raw 3DFACE coordinates in the DXF are CORRECT. The bug is in how the JS
parser aggregates them. Correct values:

- **Overall cabinet: W 900 × H 2280 × D 580 mm.**
  (App currently shows 1800 × 4560 × 1132 — i.e. ~2× too big.)
- Left Side / Right Side: raw ranges are X 0–18 (thickness 18),
  Y 20–580 (depth 560), Z 0–2280 (height 2280). So side panel = H2280 × D560 × T18.
- Bottom: X 18–882 (width 864), Y 20.5–566 (545.5), Z 0.5–18.5 (T18).
- Door 1 (Double) [1]: X 1.5–898.5 (width 897 = full pair), Y 0–18 (T18),
  Z 0–730 (**height 730**, NOT 1347).

## Root cause to fix
Every INSERT in the file has scale (1,1,1), rotation 0, insert (0,0,0) — so
there is NO transform to apply; coordinates are already absolute. Two likely
bugs (check both):

1. **Bounding box must be computed PER PANEL from that panel's own 3DFACE
   vertices only**, taking min/max of X, Y, Z independently. The cabinet's
   overall size = min/max across ALL panels' vertices — NOT the sum of panel
   sizes, and NOT panel sizes multiplied or added. If overall = 2× a panel, the
   code is probably summing or double-accumulating. Compute overall strictly as
   `(max of all vtx) - (min of all vtx)` per axis.

2. **3DFACE has 4 vertices (vtx0..vtx3); the 4th may duplicate the 3rd for
   triangles.** Make sure the parser reads each vertex once. If the JS DXF lib
   returns vertices in a flat array, ensure you're not concatenating the same
   face's points into a running list that also feeds the overall box twice.

3. **Per-panel dimensions**: after the per-panel bbox, sort the three extents
   ascending → [thickness, mid, max]. thickness = smallest (8 or 18). The
   panel's stored width/height should be the two larger extents. For the
   **overall** cabinet dims, use the global bbox of all vertices, NOT derived
   from any single panel and NOT doubled.

4. **Door height bug (1347 vs 730)**: this comes from mixing a panel's absolute
   Z POSITION in the cabinet with its LOCAL height. Height must be
   `max(vtxZ)-min(vtxZ)` for that panel's own faces only. Don't add the panel's
   z-offset to its size. Verify Door[1] → 730, Door[2] → 478, Door[3] → 466
   (heights per PDF cutting list).

## Acceptance
- Re-importing `T-OV-MIC-D2-90.dxf` shows **Overall 900 × 2280 × 580**.
- Sides 2280 tall; Top/Bottom 864×545.5; Doors heights 730 / 478 / 466;
  TRAY 525.5×450; 8mm backs correct. Hole counts unchanged (sides 76, etc.).
- The 3D preview now looks like a proper oven tower (wider, correct proportions)
  not a tall thin box.
- `npm run build` passes.
- Commit: "Fix: DXF importer per-panel bbox + overall dims".

Add a tiny self-check (script or console log in dev) that asserts the imported
overall dims are 900×2280×580 for this file, so the math is provably right.
After the build, tell Samer the exact overall dims and the three door heights
the importer now reports.
