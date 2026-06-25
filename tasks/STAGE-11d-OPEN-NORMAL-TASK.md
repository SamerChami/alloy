# Stage 11d — Viewer places Drawer_Front & W_BDR_B grooves on wrong face; pass open-normal,
# stop re-deriving direction in the viewer

The extension face labels are CORRECT (JSON v0.6.6): every blind feature is `inner`,
including Drawer_Front#161 and W_BDR_B#50. But the viewer renders those two grooves on the
WRONG physical face while all other `inner` parts render correctly. So this is a
VIEWER-side direction bug, not an extension bug.

Root cause: the viewer converts `inner`/`outer` back into a thickness-offset DIRECTION
using the panel's cabinet-interior vector. For panels whose thickness axis points along
cabinet DEPTH (Drawer_Front, W_BDR_B — front-facing horizontal members), that
reconstruction picks the wrong axis/sign and flips the offset. Parts whose thickness is on
X or Z (sides, back, Top_Back) happen to resolve correctly. This is the SAME class of
axis-reconstruction bug we already eliminated on the extension side by using the floor
face's own normal — the viewer is still re-deriving instead of using it.

## Fix: emit the open-face normal from the extension; viewer uses it verbatim
Single source of truth = the floor face's world normal (`floor_n_w`, already computed in
`alloy_export/main.rb`). Pass it through and let the viewer offset along it directly. No
reconstruction, no inner/outer→axis guessing in the viewer.

### Extension (`alloy_export/main.rb`) — additive
For every cut AND tooling item, in addition to `face`, emit the open-face direction in the
PANEL-LOCAL frame (so the viewer can apply it with the panel's existing orient, consistent
with how outline/cuts coords are panel-local):
- `open_normal`: the floor face normal expressed in the panel's LOCAL axes as a unit
  vector `[nx, ny, nz]` (local x=thickness or whichever — just be consistent with how the
  viewer maps local→box axes for outline/cuts). The viewer needs the direction the recess
  opens, in the same basis it already uses to place the groove box.
  - You already have `floor_n_w` (world). Express it in local by projecting onto the part's
    local axis unit vectors (dot with localX/Y/Z), then normalize. That gives the open
    direction in panel-local coords.
- Keep `face: "inner"/"outer"` too (still useful/observable), but the viewer will rely on
  `open_normal`.
Bump VERSION `0.6.7`, SCHEMA stays `alloy.sketchup.v6.3` (additive field). Verify
`ruby -c`, rebuild rbz CLEAN (delete old, no -Update), confirm the archive's main.rb
contains the new field.

### Viewer (`components/Cabinet3D.tsx` + types in `lib/cabinet3d.ts`,
### `lib/sketchup/parseV3.ts`)
- Carry `open_normal` through types + parser pass-through (like `outline_mm`/`tooling`).
- In the groove/pocket placement: compute the thickness-offset as
  `offset_dir = open_normal mapped through the SAME local→box-axis permutation used for the
  outline extrude` (so it inherits `box.orient`). Offset the recess so it sits flush with
  the face the normal points OUT of, and recesses `depth` INWARD (i.e. move the cut box
  center by `-(open_normal_dir) * (thickness/2 - depth/2)` — opposite the open normal, into
  the panel).
- REMOVE the `inner`/`outer`→cabinet-interior-vector reconstruction for the offset
  direction. That heuristic is what flips Drawer_Front/W_BDR_B. Use `open_normal` only.
- `through` bores unaffected (open hole, full depth, no offset).
- Do NOT regress: 11b groove inset (now correct for the working parts), bore open-hole,
  pocket disc, leg mesh, and all the parts that currently render right.

## Why this fixes exactly the two parts
Top_Back etc. currently work because their reconstructed direction happens to match. Using
`open_normal` directly makes the direction come from the actual cut geometry for EVERY
part, so Drawer_Front and W_BDR_B (depth-axis thickness) get the correct offset too — and
nothing that currently works can regress, because for those parts `open_normal` points the
same way the old reconstruction did.

## Verify (clean restart)
Re-export `BDR.K3.85`, clean reinstall extension, `Remove-Item -Recurse -Force .next`,
fresh `npm run dev`, Ctrl+Shift+R. Check against Samer's annotated images:
- Drawer_Front groove now on the correct (inner) face.
- W_BDR_B rabbet now on the correct (inner) face.
- ALL previously-correct grooves/pockets/bores still correct (sides, back, Top_Back, RS/LS
  rails, shelf pocket, door bore, leg).
- `npm run build` passes.

## Commit
Extension: "Stage 11d: emit open_normal (panel-local floor-face direction) for cuts &
tooling (v0.6.7)"
Viewer: "Stage 11d: place grooves/pockets via open_normal; remove inner/outer direction
reconstruction (fixes Drawer_Front & W_BDR_B face)"

## Report
Confirm both parts render on the correct face and nothing else regressed. If either is
still wrong, log the part's `open_normal` (local), the mapped box-axis offset_dir, and the
final cut-box center vs panel center — so we see the placement math, not guess.
