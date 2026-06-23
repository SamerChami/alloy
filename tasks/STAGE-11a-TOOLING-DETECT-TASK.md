# Stage 11a — Inner tooling: detect & export `tooling[]` (bores + pockets) — extension only

Add detection of **inner tooling** — round bores (through) and pockets (blind) drilled
perpendicular into a panel's big face — and emit them as a NEW `tooling[]` array per
panel leaf. Also FIX a misclassification: interior bounded floor faces are currently
emitted as rectangular `cuts[]` grooves; they must move to `tooling[]` as pockets.

Extension-only (`alloy_export/main.rb`). Surgical edits; do NOT rewrite the file.
Additive on the JSON: `cuts`, `outline_mm`, `profile_mm`, `meshes`, `axes` all stay.
Bump to **v0.6.3 / schema `alloy.sketchup.v6.3`**.

## Ground truth (verified against `alloy_export_0_6_2.json`, panel `Right_Side#2`)
Panel 18×560×770, thickness axis = X (size_mm.x=18). Face plane axes from
`outline_mm`: u_axis=depth (0..560), v_axis=height (0..770).

Four features exist on the real panel (per Samer's SketchUp screenshot):
1. **Through-bore** (left circle) — currently **MISSING** from JSON. It is an inner
   loop on a big face; 9e's `outline_mm` drops inner loops, and `detect_cuts` never
   sees it (no intermediate floor plane for a clean through-hole). Must be recovered
   from the big face's INNER LOOPS.
2. **Blind pocket** (right circle, 10mm deep) — currently MIS-EMITTED as a `cuts[]`
   groove: `{type:groove, depth 8, 200×200, u 197.2..397.2, v 417.5..617.5}`. Its
   footprint touches NO panel edge and is a perfect 200×200 square = the bounding box
   of a Ø200 circle, center (297.2, 517.5). Must move to `tooling[]` as a circular
   pocket, and be REMOVED from `cuts[]`.
3. **Groove** (9×9×752, v 9..761) — spans height edge-to-edge. Correct. STAYS in `cuts`.
4. **Edge cuts** (left-edge steps) — already correct in `outline_mm` outer loop. Untouched.

### The classifying rule (the crux)
For an intermediate floor face (what `detect_cuts` already finds):
- Its (u,v) footprint **touches at least one panel edge** (u≈0 | u≈u_full | v≈0 |
  v≈v_full, within tol) → it is a linear cut → **stays a `cut`** (groove/dado/rabbet).
- Its footprint is **fully interior** (touches no edge) → it is a **pocket** → emit to
  `tooling[]`, and do NOT emit it as a cut.

Use a small edge tolerance (e.g. `EDGE_TOL = 1.0` mm). `u_full/v_full` = panel extents
on the two face-plane axes (already known from the bbox; same axes as `outline_mm`).

## Modelling facts (from Samer)
- Round holes are **faceted polygons** in SketchUp but should be emitted as **true
  circles** (fit center + radius; emit `shape:"circle"`, `diameter_mm`). The CNC wants
  a circle, not N segments.
- All bores are **perpendicular to the face** (axis = panel thickness axis). No angled
  drilling. So detection is a pure 2D problem on the face plane; the bore axis is always
  the thickness axis.

---

## Implementation (`alloy_export/main.rb`)

Work in the component definition's LOCAL space, same setup as `detect_cuts` /
`face_outline`: thickness axis `t_sym` = smallest extent; face-plane axes `(u_sym,
v_sym)` in the SAME stable order those helpers use; origin at bbox min corner; `mm()`
rounding; project with `coord(p,axis) - coord(bb.min,axis)`. Never raise — on any
failure return `[]` / skip the feature.

### Helper 1 — `fit_circle(loop_uv)`
Input: array of `[u,v]` points (a closed loop, faceted). Output: `{cu, cv, r,
residual}` or `nil`.
- `cu, cv` = centroid (mean of the points; drop the closing duplicate if present).
- `r` = mean distance from centroid to each point.
- `residual` = max(|dist_i - r|) / r  (normalized roundness error).
- Return `nil` if < 6 points (too few to be a faceted circle) or `r` < 2mm.
- Caller decides circle vs polygon by `residual <= ROUND_TOL` (e.g. 0.08).

### Helper 2 — `detect_tooling(e, t_sym, u_sym, v_sym, u_full, v_full, th)`
Returns `tooling[]` (possibly empty). Two sources:

**(a) Through-bores — inner loops of the big faces.**
- Big faces = the two faces with normal ∥ t-axis at t≈0 and t≈th (the same faces
  `face_outline` selects; reuse that selection).
- For each big face, iterate `face.loops`; skip `loop.outer?` (that's the silhouette
  9e already exports). Each INNER loop is a hole through the board.
- Project the inner loop's vertices to (u,v). `c = fit_circle(loop_uv)`.
  - If `c` and `c.residual <= ROUND_TOL` → circular through-bore:
    ```
    { shape:"circle", through:true, depth_mm: mm(th), diameter_mm: mm(2*c.r),
      cu_mm: mm(c.cu), cv_mm: mm(c.cv), face:"both" }
    ```
  - Else (not round enough) → polygon through-hole:
    ```
    { shape:"polygon", through:true, depth_mm: mm(th),
      loop:[[u,v],...], face:"both" }
    ```
- De-dupe: the SAME hole appears as an inner loop on BOTH big faces. Collapse bores
  with the same (cu,cv) within 1mm and same diameter within 1mm to ONE entry.

**(b) Blind pockets — interior intermediate floor faces.**
- These are exactly the floor faces `detect_cuts` finds, FILTERED to the fully-interior
  ones (footprint touches no edge — see rule above). For each such interior floor face:
  - `depth = min(t, th - t)`; `face = (t < th/2) ? "front" : "back"` (match the cut
    convention already in the file).
  - Take the floor face's OUTER loop, project to (u,v), `c = fit_circle`.
    - round → `{ shape:"circle", through:false, depth_mm: mm(depth),
      diameter_mm: mm(2*c.r), cu_mm: mm(c.cu), cv_mm: mm(c.cv), face: face }`
    - not round → `{ shape:"polygon", through:false, depth_mm: mm(depth),
      loop:[[u,v],...], face: face }`

### Wire into `build_node` (leaf branch, panels only)
Panels only — same gate as cuts (`!has_any?(name, FITTING_KEYS)`); fittings get
`tooling: []`.
1. Run cut detection as today, but BEFORE emitting `cuts`, partition the intermediate
   floor faces into edge-touching (→ cuts) and interior (→ pockets). Easiest surgical
   path: keep `detect_cuts` returning all of them, then in `build_node` move any cut
   whose footprint is fully interior into the tooling pipeline and EXCLUDE it from the
   `cuts` array. (Or pass a flag into `detect_cuts` to skip interior floors — whichever
   is the smaller diff. Do NOT duplicate the floor-face scan if avoidable.)
2. `node[:cuts] = <edge-touching cuts only>` (the 9×9 groove stays; the 200×200 entry
   is GONE from cuts).
3. `node[:tooling] = detect_tooling(...)` — the through-bore + the Ø200 pocket.
   Emit `tooling: []` when empty (keep JSON shape uniform, like `cuts`).

### Constants
`EDGE_TOL = 1.0`, `ROUND_TOL = 0.08`. Put them near the existing cut thresholds.

### Version / schema
- `VERSION = "0.6.3"`, `SCHEMA = "alloy.sketchup.v6.3"`.
- Header comment: v6.3 = v6 + `tooling[]` (round bores + pockets); interior floor
  faces reclassified from `cuts` to `tooling`.
- Rebuild `alloy_export.rbz`.

---

## Verify (Part A — JSON only, before any viewer work)
Re-export `Right_Side#2`. In the JSON:
- `schema == "alloy.sketchup.v6.3"`, `version == "0.6.3"`.
- `cuts[]` now has **ONE** entry: the 9×9×752 groove (v 9..761). The 200×200 groove is
  GONE.
- `tooling[]` has **TWO** entries:
  - a `through:true` circle (the left bore) — `diameter_mm` ≈ its real Ø,
    `cu_mm/cv_mm` at its center, `depth_mm ≈ 18`.
  - a `through:false` circle (the right pocket) — `diameter_mm ≈ 200`,
    `cu_mm ≈ 297.2`, `cv_mm ≈ 517.5`, `depth_mm ≈ 8–10`, `face:"back"`.
- `outline_mm` UNCHANGED (still the 10-pt loop with the left-edge steps).
- `axes`, `meshes` unchanged.

Report back the raw `tooling[]` and `cuts[]` arrays from the re-export so we confirm
the split before building the viewer (Stage 11b). Per project discipline: verify the
JSON export before investing in viewer geometry.

## After build
Provide the rebuilt `alloy_export.rbz`. Samer: uninstall old, restart SketchUp,
re-export `Right_Side#2`, send the JSON.

## Commit
"Stage 11a: detect inner tooling (round bores + pockets); split interior pockets out
of cuts (schema v6.3, v0.6.3)".

## Next (not this task)
- **11b** viewer: through-bores → holes in the panel extrude shape (`shape.holes` =
  `THREE.Path` circle) so you see through them; blind pockets → recessed disc on the
  named face (round analogue of `addCutMeshes`).
- **11c** full machining pass: confirm groove + edge cuts + bore + pocket all render
  together on `Right_Side#2`, matching the screenshot.
