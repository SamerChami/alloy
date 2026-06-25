# Stage 11d-FIX — Groove offset sign not mapped through SU→Three basis swap (Y-thickness parts)

Extension v0.6.7 emits correct `open_normal`; viewer reads it (`Cabinet3D.tsx` lines
389/406/441/458/765). Still, Drawer_Front#161 and W_BDR_B#50 render on the wrong face.
Viewer-only fix.

## Diagnosis (verified from JSON)
`open_normal[tI]` IS the correct ±1 thickness-axis sign for all parts:
| part | thickness axis | open_normal | open_normal[tI] | renders |
|------|----------------|-------------|------------------|---------|
| Drawer_Front#161 | **Y** (idx1) | [0,+1,0] | +1 | WRONG |
| W_BDR_B#50       | **Y** (idx1) | [0,−1,0] | −1 | WRONG |
| W_BDR_RS#50      | X (idx0) | [−1,0,0] | −1 | ok |
| Top_Back#110     | Z (idx2) | [0,0,−1] | −1 | ok |

The two failures BOTH have thickness on local **Y**, with OPPOSITE open_normal signs, yet
both render wrong. The Z-thickness part with the same −1 sign renders right. So the failure
correlates with **thickness axis = Y**, not with the sign value.

## Root cause: SU→Three basis swap not applied to the offset direction
The project's axis convention is `three.x=su.x, three.y=su.z, three.z=−su.y` (Z-up→Y-up;
Y and Z swap, with a NEGATION on the su.y→three.z mapping). Vertices/outline points go
through this. But the groove offset takes `open_normal[tI]` (a sign defined on the
SketchUp-LOCAL thickness axis) and applies it to the Three.js box axis WITHOUT the basis
sign convention. For thickness-on-Z parts the mapping is benign; for thickness-on-**Y**
parts the missing `−su.y` negation inverts the offset → recess on the wrong face.

## Fix
Where the thickness-offset sign is computed from `open_normal[tI]` (lines 389, 406, 441,
458, and the placement at 765), map that sign into Three space using the SAME basis
convention used for vertices, instead of applying the raw SketchUp-local sign to the box
axis. Concretely:

- The offset must be applied along the panel's THREE.js thickness axis with the sign that
  results from transforming the local open-normal vector through the SU→Three basis
  (`three.x=su.x, three.y=su.z, three.z=−su.y`) AND the panel `orient`, exactly like a
  geometry direction — NOT by reading a single local-axis component and using it raw.

Cleanest implementation: build the open-normal as a 3-vector, transform it the SAME way the
code transforms a local direction to world/box space for the outline (apply the basis swap
+ orient), then offset the cut/pocket box center INWARD along the negated transformed
vector by `(thickness/2 − depth/2)`. Drop the `open_normal[tI]` single-component shortcut —
that's what loses the basis sign. If a vector transform helper already exists for outline
normals/axes, reuse it so the convention is identical.

Verify the transform matches vertices: a quick check is that after transform, the offset
direction for Drawer_Front and W_BDR_B flips relative to the raw-local version, while
Top_Back / RS / sides are unchanged.

## Guard
- Do NOT change the extension (open_normal is correct).
- Keep `face`-based fallback only for items lacking open_normal (older exports).
- Do not regress any currently-correct part (sides, back, Top_Back, RS/LS, shelf pocket,
  door bore, leg). Through-bores unaffected.

## Verify (clean restart)
Kill dev server, `Remove-Item -Recurse -Force .next`, `npm run dev`, Ctrl+Shift+R.
Re-import the v0.6.7 export. Drawer_Front and W_BDR_B grooves now on the correct inner
face; everything else unchanged. `npm run build` passes.

## If still wrong — log, don't guess
For Drawer_Front and Top_Back print: raw `open_normal`, the basis-swapped+oriented offset
vector, the box thickness axis in Three space, and final cut-box center vs panel center.
Compare the two to see where the sign diverges.

## Commit
"Stage 11d-FIX: map groove/pocket open_normal offset through SU→Three basis swap; fixes
Y-thickness parts (Drawer_Front, W_BDR_B)"
