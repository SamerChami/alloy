# Stage 14a — DIAGNOSTIC: non-identity component axes mis-render in the viewer

> **Diagnostic only. Change NO behavior. Add logs, re-import, report numbers.**
> A surgical fix lands in Stage 14b once we read the runtime evidence.

## Read first
- `CLAUDE.MD` (root) for repo conventions and restart discipline.
- `components/Cabinet3D.tsx` and `lib/cabinet3d.ts` — the render + box-build path.
- `lib/sketchup/parseV3.ts` (or the v4/v5/v6 parse path) — where `axes` and
  `outline_mm` are carried through.

## Background (what we already know — do NOT re-derive)
A cabinet exported at schema `alloy.sketchup.v6.3` (v0.6.8) renders some parts
offset / overhanging / mis-oriented in the viewer. The affected parts are exactly
the leaves whose `axes` is **not** identity. SketchUp **components** carry their own
local axes; when those axes are rotated or reflected relative to world, the part
mis-renders. (Groups are a separate later task — ignore groups here.)

Static analysis of the export already established:
- `pos_mm` is the **world AABB center**. For these parts `axes` is a *signed
  permutation* (entries are 0/±1), so the AABB center mathematically equals the
  part's true oriented center. **Therefore position is NOT the suspect — orientation
  / handedness is.** Do not "fix" position.
- Stage 12's lesson applies: a reflected part has `det(axes) = -1`, and any path
  that derives orientation via a Quaternion/Euler silently drops the reflection.
  We need to confirm whether the **outline-extrude path** (and the no-outline box
  fallback) apply `axes` as a full reflection-safe `Matrix4`, or assume identity.

## The exact diagnostic targets (this cabinet)
Re-import the provided `alloy_export_0_6_8_cabinet.json`. These leaves are the
non-identity ones to instrument. Expected `axes` determinant and outline state:

| Part name | det(axes) | has outline_mm | u_axis / v_axis | loop pts | render path |
|-----------|:---------:|:--------------:|-----------------|:--------:|-------------|
| `Right_Side#114` | **−1** | yes | depth / height | 10 | outline-extrude (REFLECTED) |
| `DR_B#94` | +1 | yes | width / depth | 4 | outline-extrude (rotated) |
| `DR_B#95` | +1 | yes | width / depth | 4 | outline-extrude (rotated) |
| `(unnamed)` ×4 | +1 | **no** | — | — | box fallback (rotated) |

A correct identity-axes control to log alongside: `Top_Back#91`
(det +1, axes identity, u=width/v=depth, 4 pts) — must look right today and serves
as the baseline.

## What to add (logging ONLY)

In whichever function builds the per-panel object for the viewer (the outline-extrude
branch in `Cabinet3D.tsx`, plus the box-fallback branch, and the place in
`lib/cabinet3d.ts` where `axes`/`orient` is turned into a matrix), add a guarded
`console.log` that fires **once per leaf**, gated so it only prints for the parts we
care about. Suggested gate: log when `axes` is non-identity OR name starts with
`Top_Back` (the control). Keep it cheap; remove in 14b.

For each logged part, emit a single structured line, e.g.:
```
[DIAG axes] name=Right_Side#114
  raw_axes.x=[-1,0,0] y=[0,1,0] z=[0,0,1]
  det_axes=-1
  render_path=outline | box
  outline.u_axis=depth outline.v_axis=depth thickness=18 loop_pts=10
  routed_local: u->? v->? thickness->?        // which local width/height/depth u,v,thick mapped to
  orient_kind=Matrix4 | Quaternion | Euler | none   // HOW orientation is currently applied
  orient_det=<determinant of the matrix actually applied to the mesh>  // compute det of the 3x3 upper-left
  final_world_matrix.elements=[...]            // mesh.matrix.elements after build (the 16 numbers)
  mesh.matrixAutoUpdate=<true|false>
  pos_used=[x,y,z]                              // the position actually set (should track pos_mm mapped)
```

Notes for the logger:
- **`orient_det`** is the single most important number. Print the determinant of the
  3×3 rotation block of the matrix the code *actually applies* to the geometry. If
  the path uses a `THREE.Quaternion`, reconstruct its matrix and print that
  determinant (it will be **+1 even for the reflected part** — that is the smoking
  gun if so).
- **`orient_kind`**: report exactly what the current code instantiates for this
  branch — `Matrix4` with `matrixAutoUpdate=false`, or a Quaternion/Euler/`rotation.set`.
- **`routed_local`**: print how the outline's `u_axis`/`v_axis` (width/height/depth
  labels) get mapped onto the geometry's local X/Y/Z before `orient` is applied. We
  need to see whether rotated parts (`DR_B`) route u/v correctly or assume a fixed
  mapping.
- Do the same log in the **box-fallback** branch for the 4 unnamed sliders
  (no `outline_mm`), so we can compare whether the box path already handles
  non-identity axes correctly while the outline path does not (or vice versa).
- Use `console.log` (not `console.debug`) so it shows with default devtools settings.

## Hard constraints
- **No behavior change.** Do not alter geometry, position, orientation, matrices,
  routing, or fallbacks. Logging only.
- Do not refactor. Smallest possible insertions.
- Do not touch the Ruby extension or the export — this is viewer-side only.
- Do not "helpfully" correct anything you notice; note it in the report instead.

## Run it
1. Clean dev-server restart: kill the Next.js process, `npm run dev` fresh.
2. Hard refresh the browser (Ctrl+Shift+R) — 3D is client-side and the bundle caches.
3. Import `alloy_export_0_6_8_cabinet.json` via the SketchUp single-cabinet importer
   and open the 3D preview (and the expand-to-modal viewer, in case they differ).
4. Copy the console output.

## Report back (paste verbatim)
For each of these six parts — `Right_Side#114`, `DR_B#94`, `DR_B#95`, one
`(unnamed)` slider, and the control `Top_Back#91` — paste the full `[DIAG axes]`
line. Then answer in one or two sentences each:
1. For `Right_Side#114` (det −1): what is `orient_kind` and `orient_det`? Is the
   reflection preserved (`orient_det = -1`) or silently dropped (`orient_det = +1`)?
2. For `DR_B#94` (det +1, rotated): does `routed_local` show u/v mapped per the
   outline's `u_axis`/`v_axis`, or a hardcoded identity mapping?
3. For the box-fallback `(unnamed)`: does the box path apply `axes` at all, and as
   what `orient_kind`?
4. Does the outline path differ from the box path in how it applies `axes`?

Do **not** propose or write a fix in this task. We read the logs first, then scope
14b.
