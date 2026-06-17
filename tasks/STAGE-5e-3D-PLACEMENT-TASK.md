# Stage 5e — Fix SketchUp 3D placement (accurate like SketchUp) — Claude Code

The SketchUp import 3D places panels WRONG (shelves jut out sideways, divider
floats, worktop pokes through) even though panel SIZES are right. Compared to
SketchUp, positions/orientations are off. Root cause + exact fix below. This is
verified against the real export. Touch only the 3D placement for the SketchUp
import path (and the shared Cabinet3D mapping); do not change parsers' saved
data or the cut-list dimension rule.

## Root cause (VERIFIED)
The JSON gives each panel:
- `width_mm`, `height_mm`, `depth_mm` = the panel's extents along SketchUp's
  WORLD X, Y, Z axes respectively. **These are already axis-aligned to the
  world — they are NOT sorted.** (e.g. Left_Side = w18, h560, d2480 → it's thin
  in X, 560 in Y, 2480 tall in Z.)
- `pos_mm` = the panel's bounding-box CENTER in SketchUp world coords.

The 3D is currently drawing boxes using the SORTED [thickness,width,height]
dimensions (the cut-list rule) instead of the RAW per-axis extents. That gives
correct SIZE but WRONG ORIENTATION/placement → parts stick out.

The sorted H/W/T rule is for the CUT-LIST/table ONLY. The 3D must use the RAW
per-axis extents + real position.

## The fix — in the SketchUp 3D build (and Cabinet3D consume)
For each panel, build a three.js Box with:
- size: **X = width_mm, Y = height_mm, Z = depth_mm** (RAW values, as given)
- center at pos: **(pos_mm.x, pos_mm.y, pos_mm.z)** (RAW)
Then apply ONE consistent SketchUp→three.js axis map with **Z up**:
- threeX = SU x
- threeY = SU z   (SketchUp Z is vertical/height → three.js up)
- threeZ = SU y
Apply the SAME swap to BOTH the box size and its center:
- boxSize(threeX,threeY,threeZ) = (width_mm, depth_mm, height_mm)
  → because along three.js Y(up)=SU z, and the panel's extent along SU z is its
    `depth_mm`? NO — careful: the panel extent along SU **z** is whichever of
    w/h/d was measured on z. The JSON's width_mm/height_mm/depth_mm correspond
    to SU X/Y/Z EXTENTS. So:
    - extent along SU X = width_mm
    - extent along SU Y = height_mm
    - extent along SU Z = depth_mm
  Therefore after mapping (threeX=SUx, threeY=SUz, threeZ=SUy):
    - three box X size = width_mm   (SU X extent)
    - three box Y size = depth_mm   (SU Z extent)  ← vertical
    - three box Z size = height_mm  (SU Y extent)
  And center: threeX=pos.x, threeY=pos.z, threeZ=pos.y.

IMPORTANT: implement it by literally mapping component arrays:
`boxThree = { x: ext.suX, y: ext.suZ, z: ext.suY }` where
ext.suX=width_mm, ext.suY=height_mm, ext.suZ=depth_mm; and
`centerThree = { x: pos.x, y: pos.z, z: pos.y }`. Then VERIFY against the test
numbers below — if the cabinet comes out lying down or too flat, the swap is
wrong; the correct result is an UPRIGHT cabinet ~1424 wide × 2600 tall × 580
deep.

Finally **recenter**: compute the min corner across all mapped boxes and
subtract it (or center the group) so the cabinet sits at origin and the camera
frames it.

## Verify against the real oven tower (TQDR2.OV1.K3.90)
- Left_Side / Right_Side: tall panels (2480 vertical), at left/right, full depth.
- Top / Bottom: horizontal caps (864 × 546, 18 thick vertically).
- Doors (Top_Door_Left/Right): on the FRONT face, 447 wide × ~1144 tall.
- Result must look like the SketchUp screenshots: solid upright oven tower with
  shelves INSIDE flush to the sides, divider centered, doors on the front — NOT
  parts sticking out sideways.
- Overall envelope ≈ 1424 (W) × 2600 (H) × ~580–910 (D).

## Also
- This same raw-extent + pos placement should be how ANY positioned import feeds
  Cabinet3D (the .3ds path already had real positions — keep it working; if it
  used a different mapping that looked right, don't break it — but ideally unify
  so both use raw-extent + Z-up mapping).
- Keep all the Stage 5c/5d controls (pan/zoom/rotate, shaded/wireframe, modal,
  reset/explode/show-doors).

## Acceptance
- The SketchUp import 3D matches the SketchUp screenshots: clean upright cabinet,
  shelves flush inside, divider centered, doors on front, nothing protruding.
- `npm run build` passes. Commit: "Stage 5e: SketchUp 3D uses raw per-axis
  extents + real positions (Z-up); accurate placement".

Test with alloy_export_0_2.json → preview cabinet TQDR2.OV1.K3.90 and compare to
SketchUp. Report back how it looks (or paste a screenshot).
