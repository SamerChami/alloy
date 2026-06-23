# Stage 11a-FIX — Correct tooling detection: groove vs pocket + false through-bores

The v6.3 export (`alloy_export_0_6_3.json`, `Right_Side#2`) detected the two circles
correctly but produced THREE false entries. Extension-only (`alloy_export/main.rb`),
surgical. Bump VERSION to `0.6.4`; SCHEMA stays `alloy.sketchup.v6.3`.

## What v6.3 produced (verified)
`Right_Side#2.cuts = []`, `Right_Side#2.tooling` = 5 entries:
1. ✅ Ø160 through-bore — circle, through, center 287.2/141.3. CORRECT.
2. ❌ 9×9×752 **groove** emitted as `through:true` polygon (loop 518..527 × 9..761).
   Wrong: it's a 9mm-deep linear groove, not a through-hole, and belongs in `cuts[]`.
3. ❌ Ø200 pocket DUPLICATED as `through:true` circle (center 297.2/517.5).
4. ❌ 9×9 groove DUPLICATED again as `through:false` polygon, face:"front".
5. ✅ Ø200 blind pocket — circle, through:false, depth 8, face:"back". CORRECT.

So: the two circles are right; the groove leaked into tooling (twice, once as "through"),
and the pocket got duplicated as a phantom through-bore.

## Root causes (diagnosed)

### A. The groove-vs-pocket classifier is wrong
11a used an EDGE-TOUCH test: interior floor face → pocket; edge-touching → cut. But the
real groove runs v 9..761 while `v_full = 770` — it's INSET 9mm from both ends, so with
`EDGE_TOL=1.0` it reads as "interior" and was misclassified as tooling. Grooves are
commonly inset from the panel ends; edge-contact is the wrong discriminator.

**Fix:** classify by ASPECT RATIO of the floor-face footprint, not edge contact.
- groove span 9×752 → aspect 83.6:1 (linear channel)
- pocket 200×200 → aspect 1.0:1 (compact)
- bore 160×160 → aspect 1.0:1 (compact)

Rule: footprint `aspect = max(span_u,span_v) / min(span_u,span_v)`.
- `aspect >= GROOVE_ASPECT` (use **4.0**) → **linear cut** → stays in `cuts[]`
  (groove/dado/rabbet — keep the existing cut classification & `face`).
- `aspect < GROOVE_ASPECT` → **pocket** → `tooling[]` (then `fit_circle` decides
  circle vs polygon as before).
Add `GROOVE_ASPECT = 4.0` near the other constants. The 83.6 vs 1.0 gap is huge — this
threshold is safe.

### B. False through-bores: inner loops of blind features counted as through-holes
The through-bore scan currently treats EVERY inner loop on a big face as a through-hole,
so the Ø200 pocket's mouth (entry 3) and the groove (entry 2) were mis-read as through.

A genuine through-bore has its inner loop on a big face with **NO intermediate floor
face** at that footprint (you can see through it). A blind pocket/groove HAS a floor face
at that footprint.

**Fix:** in the through-bore detection, before emitting an inner loop as
`through:true`, check there is **no floor face** whose footprint overlaps that inner
loop's center. If a floor face covers that (u,v) location → it's blind, skip it from the
through path (the floor-face pipeline already handles it as pocket or, if linear, as a
cut). Concretely:
- Build the set of floor-face footprints once (you already scan them for cuts/pockets).
- For each big-face inner loop, compute its center `(cu,cv)`. If any floor-face footprint
  contains `(cu,cv)` (within its u/v bounds + small tol) → SKIP (blind; handled elsewhere).
- Only inner loops with no covering floor face become `through:true` bores.

This removes entries 2 and 3 from the through path. The groove then flows through the
floor-face pipeline → classifier A sends it to `cuts[]`. The Ø200 floor face → pocket
(entry 5, the correct one). No duplicates.

### C. De-dupe blind floor faces appearing on consideration twice
Entry 4 (groove as through:false polygon) suggests the floor-face pipeline emitted the
groove into tooling as well (before classifier A existed). Once classifier A routes
aspect≥4 floors to `cuts[]`, the groove cannot reach the pocket emitter. Verify the
floor-face loop emits each face to EXACTLY ONE destination (cut OR pocket), never both.

## Expected result after fix (`Right_Side#2`, re-export)
- `cuts[]` → **ONE** entry: groove, depth 9, width 9, length 752, runs_along height,
  face "back", v 9..761 (the original v6.2 groove, restored to cuts).
- `tooling[]` → **TWO** entries, no duplicates:
  - Ø160 `through:true`, center 287.2/141.3, depth 18, face "both".
  - Ø200 `through:false`, center 297.2/517.5, depth 8, face "back".
- `outline_mm`, `axes`, `meshes` unchanged. `Leg_12cm#14` still cuts:[] tooling:[].

## Version
`VERSION = "0.6.4"`; SCHEMA stays `alloy.sketchup.v6.3` (shape unchanged, detection
corrected). Header note: "v0.6.4 = 11a-FIX: aspect-ratio groove/pocket classifier;
through-bores exclude blind floor faces; de-dup". Rebuild `alloy_export.rbz`.

## Verify gate (JSON only)
Re-export `Right_Side#2`; report the exact `cuts[]` and `tooling[]`. Must match the
"Expected result" above EXACTLY (1 cut, 2 tooling, no through:true groove, no duplicate
Ø200). Do not touch the viewer.

## Commit
"Stage 11a-FIX: aspect-ratio groove/pocket split + exclude blind floors from through-bores (v0.6.4)"
