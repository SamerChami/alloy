# Stage 4e-FIX2 — UI shows doubled dims, console logs correct (task for Claude Code)

A contradiction proves there are TWO different dimension computations:

- The dev console CORRECTLY prints:
  `[polyboardImport] T-OV-MIC-D2-90: W=900 H=2280 D=580 (18 panels)`
- But the **import UI form** (Overall dimensions W/H/D) and the **3D preview**
  still show the DOUBLED values: **1800 × 4560 × 1132**, and the 3D is still
  tall/thin.

So the previous fix corrected the function that produces the LOG, but the form
fields and `Cabinet3D` are reading overall dimensions (and possibly per-panel
geometry) from a DIFFERENT, still-buggy code path that collects both the
local-coordinate 3DFACEs AND the world-coordinate face sub-block 3DFACEs
(causing the ~2× span).

## What to do
1. In `lib/dxf/polyboardImport.ts`, find EVERY place overall cabinet
   width/height/depth and per-panel boxes are computed. There is more than one.
   The logged value uses the corrected `collectPanel`; the value returned to the
   UI (the `ImportedCabinet.width_mm/height_mm/depth_mm` and each
   `ImportedPanel`'s geometry used by the 3D preview) must use the **same
   corrected path**. Unify them so there is ONE function producing geometry, and
   both the log and the returned object use it.

2. Specifically confirm the object actually returned to the page (and passed to
   the form's default values and to `Cabinet3D`) carries 900×2280×580 — not a
   separately-computed overall bbox. If overall dims are recomputed by scanning
   all raw vertices (including local + world faces), replace that with the
   max/min over the SAME per-panel corrected boxes used in the log.

3. The form fields are controlled inputs initialized from the parsed cabinet. If
   they were initialized once from a stale parse and not updated, ensure they
   update when a new parse completes (state set from the corrected values).

4. The 3D preview must consume the corrected per-panel boxes. If `Cabinet3D`
   currently derives geometry from the doubled overall box or from raw faces,
   point it at the corrected panel list.

## Verify (must all agree)
After fix, for `T-OV-MIC-D2-90.dxf`, ALL THREE must show the same numbers:
- console log: 900 × 2280 × 580
- the UI "Overall dimensions" fields: **900 × 2280 × 580**
- door rows: 730 / 478 / 466 tall; sides 2280 tall
- 3D preview: a wide, correctly-proportioned oven tower (not tall/thin)

Add a temporary `console.table` of the per-panel W×H×T actually returned to the
UI so we can see they match the log. `npm run build` must pass.

Commit: "Fix: unify DXF dims so UI + 3D use corrected geometry".

After building, tell Samer the three door heights and overall dims AS SHOWN IN
THE RETURNED OBJECT (not just the log), so we know the UI path is fixed.
