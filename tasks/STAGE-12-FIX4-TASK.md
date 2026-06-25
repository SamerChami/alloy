# STAGE 12-FIX4 — Apply full orientation Matrix4 (preserve reflections), not a quaternion

**Type:** Targeted renderer fix. Root cause is CONFIRMED by logged
determinant — this is the correct, final fix for the fin bug.

**File:** `components/Cabinet3D.tsx`, where `box.orient` is applied to the
mesh (the block currently using `mesh.quaternion.setFromRotationMatrix`).

---

## Confirmed root cause (proven by logs)

Panels rendering as perpendicular fins are exactly the REFLECTED panels:
their orientation 3×3 has `det = -1` (logged `origRmDet: -1` for
`Back#197`, `W_BDR_B#50`, `Drawer_Front#161`, `Door#553`, `Door#493`).
Correct panels have `det = +1`.

The renderer applies orientation via
`mesh.quaternion.setFromRotationMatrix(m)`. A quaternion CANNOT represent
a reflection (det -1); `setFromRotationMatrix` silently drops the -1,
converting the reflection into a proper rotation. That misplaces the thin
axis by 90° → the panel renders as a fin. This is the exact failure the
Stage 9b notes warned about ("use a full Matrix4, NOT a quaternion").

## The fix

Apply the orientation as a full `Matrix4` so the determinant (reflection)
is preserved, instead of routing through a quaternion.

Where the mesh/line currently does something like:
```ts
const m = new THREE.Matrix4();
m.set(
  box.orient[0], box.orient[3], box.orient[6], 0,
  box.orient[1], box.orient[4], box.orient[7], 0,
  box.orient[2], box.orient[5], box.orient[8], 0,
  0, 0, 0, 1,
);
mesh.quaternion.setFromRotationMatrix(m);   // <-- drops reflection
mesh.updateMatrix();
...
mesh.position.set(box.x, box.y, box.z);
```

Replace the quaternion application with direct matrix application that
keeps the reflection. Use matrix autoupdate off + compose the full matrix,
e.g.:
```ts
mesh.matrixAutoUpdate = false;
const m = new THREE.Matrix4();
m.set(
  box.orient[0], box.orient[3], box.orient[6], box.x,
  box.orient[1], box.orient[4], box.orient[7], box.y,
  box.orient[2], box.orient[5], box.orient[8], box.z,
  0, 0, 0, 1,
);
mesh.matrix.copy(m);
mesh.matrixWorldNeedsUpdate = true;
```
(Do NOT also call `position.set` / `quaternion.set` afterwards when
`matrixAutoUpdate = false` — the composed matrix already carries the
translation. If the surrounding code relies on `position` being set for
later logic, instead keep autoupdate on and apply orientation as a
reflection-preserving step — but the matrixAutoUpdate=false path above is
cleanest. Choose one and keep it consistent for both the wireframe and
shaded branches.)

Apply the SAME change to BOTH mesh branches (wireframe/outline AND shaded)
wherever orientation is set — the log shows both an "rm" computation and a
"mesh (outline)" application; make sure the actual applied transform keeps
det -1.

## Cut children

Cut meshes are parented to the panel mesh and inherit its transform. Once
the parent carries the correct reflection matrix, cuts ride along. Do not
add per-cut sign logic. (Groove FACE correctness is a separate later
check; this task is only about panel placement.)

## Constraints

- Surgical. Only change how orientation is applied to the mesh. Do not
  touch `cabinet3d.ts` build logic — its `orient9` (with det -1) is
  correct and must reach the mesh intact.
- Non-oriented/legacy paths unchanged.

## Verification

Keep TEMP-12DIAG. Clean restart (kill dev server,
`Remove-Item -Recurse -Force .next`, `npm run dev`, `Ctrl+Shift+R`).

1. **Rotated cabinet** — the five reflected panels (`Back#197`,
   `Drawer_Front#161`, `Door#553`, `Door#493`, `W_BDR_B#50`) must now sit
   FLAT in their correct planes (no fins). Carcass + legs still correct.
   Samer confirms visually.
2. **Unrotated cabinet** — regression: must be unchanged (its panels are
   det +1 or identity; the matrix path must reproduce the current look).

Report PASS/FAIL for both. If any det -1 panel still fins, log the final
`mesh.matrix` elements for it so we can see whether the reflection
survived to the mesh.

Once both PASS, we remove TEMP-12DIAG in a follow-up and move to the
groove-face check.
