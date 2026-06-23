# Stage 11b-FIX — Groove renders as a floating slab; inset it into the panel face

After 11b, the bore (open hole) and blind pocket (recessed disc) render correctly, but the
`cuts[]` groove renders as a DETACHED slab floating above/in front of the panel instead of
a recess cut into the face. Viewer-only (`components/Cabinet3D.tsx`), surgical.

This is the EXISTING `addCutMeshes` path (pre-11b) — 11b didn't change it; it just became
the obvious remaining defect now that everything else is correct.

## Symptom (verified in 3D_Preview_2 / _3)
The 9×9×752 groove is a separate bar hovering clear of the panel surface with a visible
gap (most obvious in the near-edge-on view _3). It should be a channel recessed into the
BACK face, flush with that face, 9mm deep.

## Ground truth (`Right_Side#2`, v0.6.4)
```
groove: depth 9, width 9, length 752, runs_along height, face "back",
        u 518..527 (depth axis), v 9..761 (height axis)
panel thickness = 18 (X axis)
```
So: flush with the back face, inset 9mm toward panel center; footprint u 518..527 on
depth, v 9..761 on height.

## Root cause
`addCutMeshes` positions the cut mesh along the THICKNESS axis using the wrong offset —
it places the groove AT or BEYOND the face plane (face_offset added the wrong way, or in
world units without the panel transform), so the slab sits proud of the surface instead of
sunk into it. It is likely also not parented to the panel mesh, so it doesn't inherit
`box.orient` + position and drifts.

## The fix — mirror the 11b blind-pocket placement
11b already solved this exact thickness-axis placement for the blind POCKET disc (it sits
flush with the named face and extends `depth` inward, parented to the panel). Apply the
SAME convention to the groove cut mesh:

1. **Thickness-axis offset:** the groove occupies the slab from the named face inward by
   `depth`. Center of the cut slab along thickness =
   `±(thickness/2 - depth/2)` toward the named `face`
   (`face==="back"` → toward +t side at t≈th; `face==="front"` → toward t≈0 side;
   `"both"` → centered / through). Use the SAME sign convention the pocket disc uses for
   `front`/`back` so the two agree.
2. **In-plane placement:** center the cut box at the footprint midpoint in (u,v):
   `cu = (u_min+u_max)/2`, `cv = (v_min+v_max)/2`, with the SAME min-corner centering
   offset applied to the panel silhouette (subtract `uSpan/2`, `vSpan/2`). Box dims:
   u-extent = `u_max-u_min` (9), v-extent = `v_max-v_min` (752), thickness-extent =
   `depth` (9).
3. **Parent to the panel mesh** (add as child), so it inherits `box.orient` and
   `position.set(box.x,box.y,box.z)` and cannot drift. Do NOT apply the world transform
   separately on top.
4. Material: same subtle panel material as the pocket (no tint). Keep the groove visible
   as a recess; a thin EdgesGeometry on the slab is fine if it already had one.

If `addCutMeshes` builds a single box per cut, this is a localized change to how that box's
position (thickness offset) and parenting are computed — do not rewrite the whole function.
Reuse the pocket's offset helper if 11b factored one out.

## Do NOT regress
- Bore (open hole) and pocket (recessed disc) from 11b stay exactly as they render now.
- Edge step notches (outline) unchanged.
- Leg mesh unchanged (10-FIX3 confirmed working in the modal).
- Panels from older exports still render their cuts (this fixes ALL grooves, not just this
  one — they all used the same broken offset).

## Verify
Re-import `alloy_export_0_6_4.json`, clean restart. The groove is now a channel SUNK into
the back face, flush at the surface, 9mm deep, running along the height at the right u
position — NOT a floating bar. Compare to SketchUp (groove is a shallow recess, not a
raised rail). Bore + pocket + notches + leg all still correct. `npm run build` passes.

## Clean restart
Kill Next.js, `Remove-Item -Recurse -Force .next`, `npm run dev` fresh, Ctrl+Shift+R.

## Commit
"Stage 11b-FIX: inset groove cut mesh into panel face (mirror pocket placement); was floating"

## Report
Whether the groove now reads as a recess flush with the face (not floating), and that bore
/ pocket / notches / leg are unregressed. Also note the bore VERTICAL position vs SketchUp
— in one steep view it looked high; confirm whether that's real or just camera angle.
