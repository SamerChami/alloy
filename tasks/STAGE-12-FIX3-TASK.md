# STAGE 12-FIX3 — Route outline extents to local axes by ROLE (width→x, depth→y, height→z)

**Type:** Targeted fix in `lib/cabinet3d.ts`, `buildBoxesFromOrientedPanels`.
Surgical. FIX2 sourced sizes from the outline but routed them to the wrong
local axes for front-facing panels (doors, drawer fronts, back), which now
render as thin perpendicular fins. This task fixes the routing.

---

## Root cause (confirmed by arithmetic on the rotated JSON)

`outline_mm.u_axis` / `v_axis` use role names ("width" / "depth" /
"height"); the remaining role is the thickness axis. These roles map to
the part's LOCAL axes by ONE fixed convention, consistent across every
panel and identical to the schema's `size_mm` axis order:

    width  -> local x   (orientation col0 = Cx(axes.x))
    depth  -> local y   (orientation col1 = Cx(axes.y))
    height -> local z   (orientation col2 = Cx(axes.z))

Verified across panel types in the rotated export:
- Bottom: u=width, v=depth, thick=height(18) -> size_mm thin = z  ✓ height→z
- Side:   u=depth, v=height, thick=width(18) -> size_mm thin = x  ✓ width→x
- Door/Back/Front: u=width, v=height, thick=depth -> size_mm thin = y ✓ depth→y

The current code routes by POSITION (u→bw/x, v→bh/y, thickness→bd/z) or a
partial map that happens to work for shelves/sides but mis-routes doors:
a door's thickness carries the **depth** role and must land on local **y**,
but it's being placed on local z → 18mm points vertical/sideways → the
door renders as a perpendicular fin. Same for Back and Drawer_Front.

## The fix — route by role, not position

For each PANEL, build the three local extents and assign by role:

    // resolve the three (role -> magnitude) pairs:
    //   u_axis role  -> u_extent
    //   v_axis role  -> v_extent
    //   remaining role -> thickness_mm
    // then route role -> local axis -> box dim:
    //   width  -> bw   (local x, col0)
    //   depth  -> bd_local_y  (local y, col1)
    //   height -> bh_local_z  (local z, col2)

Concretely:
1. Determine the thickness role = the one of {width, depth, height} that is
   NOT `u_axis` and NOT `v_axis`.
2. Make a map `roleExtent = { [u_axis]: u_extent, [v_axis]: v_extent,
   [thicknessRole]: thickness_mm }`.
3. Assign:
   - extent along **local x (col0)** = `roleExtent['width']`
   - extent along **local y (col1)** = `roleExtent['depth']`
   - extent along **local z (col2)** = `roleExtent['height']`
   (convert mm→m via the existing `m()`).
4. Box dims: the renderer builds `BoxGeometry(box.w, box.h, box.d)` and
   applies `orient` whose columns are `[Cx(axes.x), Cx(axes.y), Cx(axes.z)]`
   = [local x, local y, local z]. So `box.w` must be the local-x extent,
   `box.h` the local-y extent, `box.d` the local-z extent — **matching the
   column order**. Set `bw=local-x extent, bh=local-y extent,
   bd=local-z extent` accordingly. (Confirm against the existing orient
   packing so w/h/d line up with col0/col1/col2 — if the renderer pairs
   w↔col0, h↔col1, d↔col2, this is correct; verify and adjust only the
   pairing if the renderer differs.)

If any role name is unexpected (not width/depth/height), fall back to
current behaviour for that part and `console.warn` once.

## Constraints

- PANELS only. Fittings keep `size_mm` sizing (degenerate outlines).
- Orientation/position/recenter code UNCHANGED. Only (bw,bh,bd) assignment.
- Surgical diff. Legacy/raw paths untouched.

## Verification (logs + eyes)

Extend TEMP-12DIAG oriented-part log for `Door#553`, `Drawer_Front#161`,
`Back#197`, `Bottom#149` to print:
- `u_axis, v_axis, thicknessRole, u_extent, v_extent, thickness`
- `roleExtent` map
- final `(bw,bh,bd)` and which role each came from
- the three-space dir of each column `Cx(axes.*)`

Decisive checks in the log:
- `Door#553`: 18mm must land on the local axis whose three-space dir is
  front-back (the depth direction), NOT vertical/sideways.
- `Bottom#149`: must be UNCHANGED from FIX2 (814×546×18, 18 vertical).

Clean restart (kill dev server, `Remove-Item -Recurse -Force .next`,
`npm run dev`, `Ctrl+Shift+R`). Then:

1. **Rotated cabinet** — Samer confirms visually: doors flat on the front,
   drawer front flat, back flat against the rear, no perpendicular fins;
   carcass still correct; legs correct.
2. **Unrotated cabinet** — regression: identical to before (width→x,
   depth→y, height→z reduces to the existing size_mm order when axes are
   identity). Confirm a door and the back are unchanged.

Report PASS/FAIL per cabinet with the logs above. Keep TEMP-12DIAG.

## Out of scope

Grooves/cuts — checked separately once placement is fully correct.
