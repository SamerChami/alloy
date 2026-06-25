# STAGE 13-FITTINGS-FLIP — Make leg (mesh) and channel (profile) paths reflection-aware

**Type:** Interactive debugging + fix. The panel path is already correct
under reflection (Matrix4). This extends the SAME reflection handling to
the two OTHER render paths that don't yet have it. Diagnose against the
live render; confirm with a logged value before changing logic.

**Files:** `components/Cabinet3D.tsx` (and `lib/cabinet3d.ts` if the
fitting transforms are built there).

---

## Confirmed from JSON (flipped-X cabinet, schema v0.6.8)

Every part carries the flip correctly: `axes.x=[-1,0,0]`, det = -1 (a pure
X reflection). The data is correct; some render paths don't consume it.

Three distinct render paths, by part fields:
- **Panels** (doors, sides, back, drawer fronts): outline only, no mesh,
  no profile. Go through the reflection-preserving Matrix4 — CORRECT under
  flip (verified visually).
- **Legs**: have `mesh_ref` + degenerate outline (5×2). Rendered from the
  referenced MESH. BROKEN under flip — render as flat horizontal lines
  under the cabinet (mesh transform not preserving the reflection / not
  applying the flipped axes).
- **Channels** (`U_Channel`, `L_Channel`): have `profile_mm` (extruded
  cross-section), no mesh, no rectangular outline. Rendered by EXTRUDING
  the profile. BROKEN under flip — shoot out of the cabinet at the wrong
  angle (extrusion path not consuming the flipped axes).

## Goal

Both the mesh path (legs) and the profile-extrusion path (channels) must
apply the part's full `axes` basis as a Matrix4 with the reflection
(det -1) preserved — exactly as the panel path now does — so they render
correctly under X, Y, AND Z flips. This is general reflection handling,
NOT an X-axis-specific sign patch.

## How to debug (live, log first)

1. Find where leg/`mesh_ref` parts build their mesh and set its transform.
   Log, for `Leg_12cm#15`: the `axes`/orient used, the applied
   matrix/quaternion, and `det`. Confirm whether it goes through a
   quaternion (drops reflection) or omits the orientation entirely.

2. Find where channel/`profile_mm` parts are extruded and positioned. Log,
   for `U_Channel#1`: the orient applied to the extrusion and its det.
   Identify why the flipped axes don't reach it.

3. For each path, apply the SAME reflection-preserving approach used for
   panels: build the 3x3 from `Cx(axes.x|y|z)`, compose into a Matrix4
   with translation, `matrixAutoUpdate=false`, `mesh.matrix.copy(m)`. Do
   NOT route through `setFromRotationMatrix`/quaternion (drops det -1).
   - Legs: apply the matrix to the mesh object built from `mesh_ref`.
   - Channels: apply the matrix to the extruded profile geometry/object.

4. Confirm with logs that legs and channels now carry det -1 in their
   applied matrix, then verify visually.

## Constraints

- Do NOT regress the panel path or the non-flipped/rotated cases already
  fixed. Panels, grooves, rotation, and unrotated rendering must stay
  correct.
- Keep the fix general for X/Y/Z reflections.
- Surgical — only the leg-mesh and channel-profile transform application
  should change.

## Verification

Clean restart (kill dev server, `Remove-Item -Recurse -Force .next`,
`npm run dev`, `Ctrl+Shift+R`).

1. **Flipped-X cabinet**: legs render as upright cylinders in the correct
   positions (not horizontal lines); channels seated as rails in the
   carcass (not shooting out); panels/doors/grooves still correct.
2. **Regression**: re-import the rotated cabinet AND the unrotated cabinet
   — both must be unchanged (legs upright, channels seated, panels
   correct).

Report PASS/FAIL per cabinet with the logged det for a leg and a channel.
Note: a Z-flip and Y-flip export will be tested separately by Samer after
this; keep the fix axis-general so those are likely to pass too.
