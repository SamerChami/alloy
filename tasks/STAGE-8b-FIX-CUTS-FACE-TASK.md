# Stage 8b-FIX — Cuts land on the wrong face (per-panel thickness axis) — Claude Code

Read `CLAUDE.md`, `components/Cabinet3D.tsx`, `lib/cabinet3d.ts`, and the Stage
8b cut-rendering code first. 8b draws cuts, but they land on the WRONG FACE for
several panels (Left/Right sides, DR_Front, Bottom). This is a placement-axis
bug. Visual-only fix — do NOT touch parsing, dimensions, positions, or data.

## Root cause (VERIFIED against the real export)
The thickness axis is a DIFFERENT world axis on different panels:
- Left_Side / Right_Side: size_mm x=18 → **thickness axis = X**
- Bottom / Top_Back: size_mm z≈18 → **thickness axis = Z**
- DR_Front: size_mm y=18 → **thickness axis = Y**

A cut's `face` means: recess `depth_mm` into the panel FROM one end of THAT
panel's own thickness axis:
- `face==="front"` → from the t=0 end → recess-box center at `depth/2` along the
  thickness axis (panel-local, origin at min corner).
- `face==="back"`  → from the t=thickness end → center at `thickness - depth/2`.
- `face==="both"`  → one box each end.

The 8b code is placing the recess offset on a FIXED or WRONG axis (or applying
the front/back offset on the wrong side, and/or after the Z-up→Y-up swap so the
direction flips). Because Left(`front`) and Right(`back`) mirror, a sign/axis
error makes BOTH look wrong in opposite directions — exactly the reported
symptom.

## The fix
1. **Derive the thickness axis PER PANEL** from its RAW `size_mm`: the axis whose
   extent is the smallest (`sorted_mm[0]`). The other two axes are the face
   plane (u, v). Do this independently for every panel — never assume a global
   thickness axis.
2. Build the recess box in the panel's **local** frame:
   - extent along thickness axis = `depth_mm`
   - extents along the two face axes = `(u_max-u_min)` and `(v_max-v_min)`
   - local center along thickness axis:
     `face==="front"` → `depth/2`;
     `face==="back"`  → `thickness - depth/2`;
     `face==="both"`  → emit two boxes (front + back).
   - local center along the two face axes = midpoints of u and v.
   (Origin = panel min corner, consistent with how the export defines u/v.)
3. **Apply the EXACT SAME transform chain the panel box uses** — the Z-up→Y-up
   axis map (`three.x=su.x, three.y=su.z, three.z=-su.y`) and the recenter — to
   the recess box, by composing it in panel-local space and carrying it through
   the identical mapping. The cut must inherit the panel's full placement so it
   sits on that panel wherever it is. Do NOT map the cut independently with a
   hand-written axis order — reuse the panel's transform so front/back can't flip
   relative to the panel.
4. Easiest robust implementation: make each cut recess a **child of the panel's
   mesh/group** (add it in panel-local coordinates BEFORE the panel's world
   transform is applied), so it automatically inherits position, the axis
   mapping, recenter, and explode. Then "front/back" is just a local offset along
   the panel's own thickness axis and cannot land on a different world axis.

## Verify against these (must all be correct after fix)
- **Left_Side** (thick=X, face=front): groove recesses from the x=0 face →
  on the cabinet-INTERIOR side. Right_Side (thick=X, face=back) mirrors → its
  groove on its interior side too. The two grooves should FACE EACH OTHER across
  the cabinet, both vertical near the same edge — not on the outer faces.
- **Bottom** (thick=Z, face=front): rabbet recesses from the bottom z=0 face,
  long edge strip — on the correct face, not the top.
- **DR_Front** (thick=Y, face=front): groove recesses from the y=0 face.
- **Difference** (thick=Z, both faces present): small recesses appear on BOTH
  faces.
- Panels with no cuts unchanged.

If any still mirror wrong, the front/back local offset sign is flipped — fix the
sign, don't special-case panels.

## Acceptance
- Side-panel grooves face the cabinet interior and mirror correctly (L=front,
  R=back), vertical near the edge.
- Bottom rabbet on the correct (bottom) face; DR_Front groove on the correct
  face; Difference shows both-face recesses.
- "Show cuts" toggle, explode, wireframe, modal all still correct.
- `npm run build` passes. No data/parser/dimension changes.
- Commit: "Stage 8b-fix: place cut recesses on per-panel thickness axis (correct
  front/back face)".

When done: 3-line summary; tell Samer to reopen the v4 cabinet and confirm the
two side grooves now face each other (interior) and Bottom's rabbet is on the
bottom face.

## SEPARATE ISSUE — Bottom reads 16.8mm, not 18mm (NOT this task)
This is NOT a viewer bug. `Bottom#224` is exported with `size_mm.z = 16.8`; every
other panel is a clean 18.0. The app faithfully shows what the extension
measured. The 16.8 means that panel's bounding box came out thin in SketchUp —
most likely the component is slightly off-axis (tilted a hair, so its AABB is
thinner than the true 18mm board) or it was modeled thin. The cut-list thickness
for that part will read 16.8 until the source is corrected.

Fix belongs upstream, options for Samer to decide later (do NOT implement now):
- (a) Correct/realign that panel in the SketchUp model and re-export, OR
- (b) Add a thickness-snap in the Ruby extension: if a panel's smallest extent is
  within a tolerance (e.g. ±1.5mm) of a known nominal board thickness
  (8, 16, 18, 25…), snap `sorted_mm[0]` to the nominal. This would also make
  cut-lists clean. We'll spec this as a small extension task (Stage 8d) if Samer
  wants it.

For now: leave the value as-is; this fix task is only about the wrong-face
rendering.
