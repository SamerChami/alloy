# STAGE 12-DEBUG — Oriented panels render as perpendicular fins (interactive debugging)

**Type:** Interactive debugging session. You have the live code and the
live render; use them together. Do NOT just apply a prescribed edit — the
prescriptions tried so far were wrong. Diagnose against the running render,
confirm the cause with a log, then fix and visually verify.

**File in play:** `lib/cabinet3d.ts` (`buildBoxesFromOrientedPanels`) and
`components/Cabinet3D.tsx` (where `box.orient` → mesh transform).

---

## Established facts (verified, do not re-derive)

- Export is healthy. Schema v0.6.8. All 20 leaves carry `axes`. The
  oriented path runs (`every_has_axes=true, chosen_path='oriented'`).
- The cabinet is rotated 90° about vertical; every part shares the same
  world rotation, so every part's `orient9` is identical:
  `[0,0,1, 1,0,-0, 0,1,-0]` (column-major: col0=Cx(axes.x)=[0,0,1],
  col1=Cx(axes.y)=[1,0,0], col2=Cx(axes.z)=[0,1,0]).
- Box dimensions are NOT the problem. Three prior fixes produced
  byte-identical `(bw,bh,bd)` and the render never changed.

## The actual symptom

These panels render as thin panels standing PERPENDICULAR to where they
belong (fins jutting into the cabinet), on the ROTATED cabinet only:
`Back#197`, `Drawer_Front#161`, `Door#553`, `Door#493`, `W_BDR_B#50`.

Panels that render CORRECTLY: sides, shelves, bottom, top rails, drawer
box sides.

The exact correlation: the broken panels are precisely those whose
thinnest extent lands on the orientation column pointing in three-space
**[1,0,0]** (i.e. `col1` = Cx(axes.y)). Correct panels are thin along
`[0,0,1]` (col0) or `[0,1,0]` (col2).

So the broken set = "thin axis on [1,0,0]". That is the thread to pull.

## What is unresolved (the real question)

Either:
- (A) The geometry is actually correct and the render is being cached/not
  reloaded (we have seen stale `.next` cause "no visual change" before), OR
- (B) For these parts the thickness is being routed/oriented so its thin
  axis points [1,0,0] when the part's true thickness direction is
  something else, OR
- (C) The orientation matrix application in the renderer
  (`mesh.quaternion.setFromRotationMatrix`) is mishandling these parts
  (note: `setFromRotationMatrix` silently drops a -1 determinant /
  reflection — check whether the broken parts are the reflected/mirrored
  ones, det(C·Rworld) = -1).

(C) is a live hypothesis we have NOT checked and it fits "only some panels
break": mirrored panels lose their reflection under
`setFromRotationMatrix`, which can flip a thin panel into the wrong plane.

## How to debug (live, not from static reasoning)

1. **Rule out stale build first.** Kill dev server, `Remove-Item -Recurse
   -Force .next`, `npm run dev`, hard refresh. Confirm the
   `[12DIAG] roleExtent` log lines appear (proves new build loaded). Look
   at the cabinet. If fins persist with the confirmed-fresh build,
   continue.

2. **Check the determinant / reflection hypothesis (C).** For each of the
   broken parts and a couple of correct ones, compute and log
   `det(orient 3x3)`. If broken parts have det = -1 and correct parts
   det = +1, the renderer's `setFromRotationMatrix` is dropping the
   reflection — that's the bug. The 9b task itself warned a quaternion
   "can't represent reflections" and said to use a full Matrix4. Verify
   the renderer actually applies the matrix via `mesh.matrix` /
   `mesh.applyMatrix4` (preserving reflection) rather than collapsing it
   through a quaternion.

3. **Cross-check one part against SketchUp ground truth.** For
   `Drawer_Front#161`: its `axes` are
   `x:[0,-1,0], y:[1,0,0], z:[0,0,1]`, thickness 18 on the depth role.
   In the real model the drawer front is a wide panel whose 18mm faces
   front-to-back. Determine from `axes` which world direction the 18mm
   SHOULD point, and compare to where the current pipeline puts it
   ([1,0,0]). If they disagree, the routing/orientation is wrong; if they
   agree, the render/reflection is wrong.

4. Form a single hypothesis, confirm it with a logged value, fix the one
   thing, and visually confirm the fins are gone on the rotated cabinet
   AND the unrotated cabinet is unchanged.

## Constraints

- Surgical. Don't rewrite either file. Touch only what the confirmed cause
  requires.
- Keep fittings on their existing path.
- After fixing, regression-check the unrotated cabinet (must be unchanged)
  and confirm carcass + legs still correct on both.

## Report

State the confirmed root cause with the log/determinant value that proves
it, the one-line(ish) fix, and PASS/FAIL on: rotated fins gone, carcass
correct, unrotated unchanged. Leave grooves out of scope (separate step).
