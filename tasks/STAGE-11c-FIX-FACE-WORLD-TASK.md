# Stage 11c-FIX — Face polarity: compute open face in WORLD space; wire viewer to inner/outer

v0.6.5 switched to `inner`/`outer` but (a) the polarity is inverted/unreliable and (b) the
viewer never consumed the new values, so NOTHING changed visually. Fix both.
Extension (`alloy_export/main.rb`) + viewer (`components/Cabinet3D.tsx`). VERSION `0.6.6`.

## Evidence (v0.6.5 export vs SketchUp truth)
| part | v6.5 face | truth | |
|------|-----------|-------|--|
| Left_Side groove  | outer | inner | ✗ inverted |
| Right_Side groove | outer | inner | ✗ inverted (but now consistent w/ Left ✓) |
| Mobile_Shelve pocket | outer | inner (from top) | ✗ inverted |
| Drawer_Front groove | outer | inner | ✗ inverted |
| W_BDR_B rabbet | inner | inner | ✓ |
| W_BDR_RS rabbet | inner | inner | ✓ |
| W_BDR_LS rabbet | outer | inner | ✗ — DISAGREES with its mirror twin RS |
| Top_Back rabbet | inner | inner | ✓ |
| Door bore | both | through | ✓ |

Two distinct faults:
1. **Inverted/unreliable sign.** Most `inner` features came out `outer`.
2. **Mirror twins still disagree** (W_BDR_LS=outer vs W_BDR_RS=inner) even though both have
   identity axes and sit symmetric in X about the cabinet center. So it is NOT a clean
   global flip — the open-side normal is computed in LOCAL space and inferred to world
   incorrectly, so X-symmetric parts get opposite dot-product signs. The side panels only
   *appear* consistent by coincidence of where their groove lands locally.

## Root cause
The open-side normal `n_local` (±t) is derived from the floor-face's LOCAL thickness
position, then transformed to world. For mirrored/placed parts this local→world normal is
unreliable (a pure axes check misses the placement), so `n_world · interior` flips
inconsistently. Building anything off the LOCAL thickness sign is the trap we already hit
with cut placement.

## Fix A — determine the open face entirely in WORLD space (no local normal)
For each BLIND feature (groove/rabbet/pocket; through-bores stay `face:"both"`):
1. Take the feature's floor-face centroid → world point `Fw` (apply the part transform to
   the floor-face center you already have).
2. Take the panel's TWO big-face centers → world points `Aw`, `Bw` (the two faces normal
   to the thickness axis at t≈0 and t≈th; you already select these in `face_outline`).
   Transform both centers to world.
3. The open face is the big face the floor sits NEARER to:
   `open_w = (dist(Fw,Aw) <= dist(Fw,Bw)) ? Aw : Bw`.
   Its outward world normal `n_w = normalize(open_w - panel_center_w)`.
4. `interior_w = normalize(cabinet_center_w - panel_center_w)` (root bbox center;
   compute once, reuse).
5. `face = (n_w · interior_w > 0) ? "inner" : "outer"`.

This uses only world positions of faces and centers — no local thickness sign, no
local→world normal — so mirror twins resolve identically and the polarity is correct
(open face pointing toward cabinet interior = inner).

### Sanity expectations after Fix A (re-export `BDR.K3.85`)
- Left_Side, Right_Side grooves → BOTH `inner`.
- W_BDR_LS, W_BDR_RS rabbets → BOTH `inner` (twins now agree).
- Mobile_Shelve pocket → `inner` (opens toward interior/top).
- Drawer_Front groove → `inner`.
- Top_Back, W_BDR_B → `inner` (unchanged).
- Door bore → `both`.
If any part is still `outer`, log `n_w`, `interior_w`, the dot, and `Fw/Aw/Bw` for that
part so we can see the geometry (runtime log, not a guess).

## Fix B — viewer must consume `inner`/`outer` (this is why nothing changed)
`components/Cabinet3D.tsx` still reads `face === "front"/"back"` for the groove/pocket
thickness-offset sign. Those strings no longer exist → every blind feature falls through to
the default placement → no visible change. Update:
- Resolve the offset DIRECTION from `inner`/`outer` against the panel's cabinet-interior
  vector, which the viewer already computes for the existing cut interiorSign logic. Reuse
  it: `inner` → offset toward cabinet interior; `outer` → away. `both` → through (centered,
  full depth).
- This replaces the old front/back branch; remove the dead front/back read.
- Do NOT regress the 11b-FIX inset (groove flush + recessed into the chosen face), the
  bore open-hole, the pocket disc, or the leg mesh.

## Version
`VERSION = "0.6.6"`; SCHEMA stays `alloy.sketchup.v6.3`. Header: "v0.6.6 = 11c-FIX: open
face computed in world space (mirror-stable, correct polarity); viewer reads inner/outer".

## Verify
1. JSON: the table above — every blind feature `inner` except any genuinely outer-facing
   one; mirror twins agree.
2. Viewer (clean restart): grooves/rabbets sit on the correct PHYSICAL faces — cross-check
   each against Samer's annotated images (Left/Right side inner grooves, drawer inner
   groove, shelf pocket on top, W_BDR rabbets inner, Top_Back inner). Visible change THIS
   time. Bore see-through, pocket recessed, leg mesh upright.
3. `npm run build` passes.

## Clean restart
Kill Next.js, `Remove-Item -Recurse -Force .next`, `npm run dev` fresh, Ctrl+Shift+R.

## Commit
"Stage 11c-FIX: world-space open-face polarity (mirror-stable inner/outer) + viewer reads
inner/outer (v0.6.6)"

## Report
Per-part face table after re-export; confirm all mirror twins agree and grooves render on
the correct faces in BOTH inline and modal viewers.
