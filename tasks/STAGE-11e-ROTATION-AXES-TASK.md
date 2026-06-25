# Stage 11e — Rotated cabinet distorts: cut/pocket offset must use part `axes`, not a
# hardcoded basis-sign index

Stage 11d-FIX made grooves correct for the cabinet at IDENTITY orientation by applying a
per-axis basis sign `(tI === 1) ? -1 : 1`. But that hardcodes an assumption that local
axis index → fixed world axis. When the cabinet is ROTATED in SketchUp (export shows every
part's `axes` change from identity to a 90° Z-rotation, e.g. `x:[0,-1,0] y:[1,0,0]
z:[0,0,1]`), the hardcoded sign is computed in the wrong frame and the cuts/placement shear
away from the carcass (see rotated render: drawer fronts/doors/groove rails flung off at
angles while the carcass stays intact). Viewer-only fix.

## Verified facts
- Rotated export is CORRECT: each leaf carries `pos_mm` (world) + `axes` (world basis,
  cleanly rotated). `open_normal` stays panel-LOCAL (unchanged by world rotation) — correct.
- Carcass panels render in place under rotation → the panel-BOX path reads `axes` properly.
- Cuts/pockets shear off → the cut/pocket OFFSET path does NOT use `axes`; it uses the
  hardcoded `(tI===1)?-1:1` basis sign from 11d-FIX, which only holds at identity.

## Root cause
The cut/pocket recess offset direction is built from `open_normal[tI]` × a hardcoded
basis sign, applied directly to a Three axis. This ignores the part's `axes` rotation, so
once the part is rotated in world the offset points the wrong way and the feature detaches
from the panel.

## Fix — derive the offset direction the SAME way panel vertices are oriented
`open_normal` is a panel-LOCAL unit vector. To get its render-space direction, run it
through the EXACT chain the panel box / outline vertices use:
1. Rotate `open_normal` by the part's `axes` basis (local → world):
   `world = axes.x * on[0] + axes.y * on[1] + axes.z * on[2]`
   (i.e. the columns/rows of the axes basis — match whatever convention the box path uses
   for vertices; use the IDENTICAL helper).
2. Apply the SU→Three basis swap used everywhere else (`three.x=su.x, three.y=su.z,
   three.z=−su.y`).
3. The result is the world/Three open direction. Offset the cut/pocket box center INWARD
   along the NEGATED direction by `(thickness/2 − depth/2)`.

REMOVE the hardcoded `(tI === 1) ? -1 : 1` basis sign and the `open_normal[tI]`
single-component read entirely. They are subsumed: rotating the full `open_normal` vector
through `axes` + basis swap yields the correct sign automatically AT ANY orientation,
including identity (so the static BDR.K3.85 result must NOT regress).

Apply at every cut/pocket placement site (the `solid-cut` / `solid-pocket` sites ~389/406/
441/458/470 and the placement ~765). Reuse the existing vertex/outline orientation helper
so cuts inherit precisely the same transform as the panel body — that is the whole point
(cuts must move rigidly with their panel).

## Why this is the right fix
The panel box already transforms its geometry by `axes` and stays correct under rotation.
Cuts/pockets are part of that same body and must use the same transform. Any approach that
reconstructs direction from index rules or local-axis assumptions will break under some
orientation. Binding to `axes` makes it orientation-agnostic by construction.

## Verify (clean restart)
Kill dev server, `Remove-Item -Recurse -Force .next`, `npm run dev`, Ctrl+Shift+R.
1. Import `alloy_export_0_6_7_original_cabinet.json` (identity): BDR.K3.85 still fully
   correct — all grooves/door bore/drawer faces exactly as now. NO regression.
2. Import `alloy_export_0_6_7_rotated_cabinet.json` (90° rotated): cabinet renders as the
   same cabinet, just rotated — carcass + drawers + doors + grooves all rigid and in place,
   no shearing, no detached rails. The rotated render should look like image 1 rotated, not
   image 2.
3. `npm run build` passes.

## If still distorted — log
For one cut on a rotated part (e.g. Drawer_Front#161) and one on the carcass, log:
`open_normal` (local), the axes basis, the world-rotated normal, the post-basis-swap
direction, and the final box center vs panel center. Compare a carcass panel's transform
to the cut's transform — they must match. The mismatch is the bug.

## Commit
"Stage 11e: orient cut/pocket offset via part axes (rotation-proof); remove hardcoded basis
sign — fixes distorted rotated-cabinet render"
