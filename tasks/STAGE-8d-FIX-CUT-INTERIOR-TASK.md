# Stage 8d-FIX — Cut recesses must sit on the INTERIOR face (Claude Code)

Read `CLAUDE.md` in the alloy folder first, then apply this. **Surgical fix** —
do NOT rewrite `Cabinet3D.tsx` or refactor unrelated code. A wholesale rewrite
previously hit `CLAUDE_CODE_MAX_OUTPUT_TOKENS`. Make ONLY the changes below.

Before starting, in PowerShell:
`$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000`
(Switch to `/model sonnet` if the diff won't apply cleanly.)

## Context
The mirror fix (Stage 8c) is in and correct — the cabinet is oriented properly.
Remaining bug: cut recesses (grooves/rabbets) render on the wrong panel face.
Verified observation on `BDR.K3.120`:
- Left/Right sides: groove on outer face + wrong front/back side
- Bottom: same
- Top_Back: correct face, wrong side
- DR_Front: fully correct

## Root cause (verified against `alloy_export_0_4_1.json`)
`addCutMeshes` places the recess using the cut's `face` ("front"/"back") field
with a fixed local-axis sign. But which local `+t`/`-t` direction points toward
the cabinet interior depends on where the panel sits in the cabinet — it flips
between Left and Right, Bottom and Top_Back. A fixed sign can't satisfy all of
them, which is why earlier sign-swaps fixed some panels and broke others.

Physical truth: a joinery groove/rabbet always sits on the panel face that points
toward the cabinet **interior**. Verified for ALL five cut panels in the sample:
each real groove is on the interior-facing side. So the correct, stable rule is to
place the recess on the thickness-axis side pointing toward the cabinet center —
independent of the `face` field.

Rule: `interiorSign = sign(cabinetCenter[tAxis] − panelCenter[tAxis])`, then offset
the recess along `tAxis` by `interiorSign × (thickness/2 − depth/2)`.

## Change 1 — extend `addCutMeshes` signature (`components/Cabinet3D.tsx`)
Add the panel's world center and the cabinet center so the function can compute
the interior direction:

```diff
 function addCutMeshes(
   parent: THREE.Object3D,
   cuts: Cut[],
   bw: number, bh: number, bd: number,
   wireframe: boolean,
+  panelCenter: { x: number; y: number; z: number },
+  cabinetCenter: { x: number; y: number; z: number },
 ) {
```

## Change 2 — replace the front/back offset with the interior-sign offset
Inside `addCutMeshes`, in the `drawFace` helper, replace the `pos[tAxis]`
assignment. Currently it branches on `side === "front"`. Replace that block with
an interior-direction offset that ignores `side`:

```diff
-      // Ruby face="front" => groove floor near t_min; the recess opens on the
-      // t_min (-t) side. Place it there so it's visible on the correct big face.
-      pos[tAxis] = side === "front"
-        ? -thickness / 2 + depth / 2
-        :  thickness / 2 - depth / 2;
+      // The groove/rabbet always sits on the panel face pointing toward the
+      // cabinet interior. Derive that direction from panel-vs-cabinet center
+      // along the thickness axis (independent of the front/back field).
+      const panelT = tAxis === "x" ? panelCenter.x : tAxis === "y" ? panelCenter.y : panelCenter.z;
+      const cabT   = tAxis === "x" ? cabinetCenter.x : tAxis === "y" ? cabinetCenter.y : cabinetCenter.z;
+      const interiorSign = (cabT - panelT) >= 0 ? 1 : -1;
+      pos[tAxis] = interiorSign * (thickness / 2 - depth / 2);
```

Leave the `uAxis`/`vAxis` placement (`pos[uAxis]`, `pos[vAxis]`), the `sz`
assignments, and the geometry/material creation exactly as they are. The
`drawFace(side)` calls below can stay — `side` is now unused inside, which is
fine; do not spend effort removing the `face`-based call branching.

## Change 3 — pass the new args at BOTH call sites
There are two `addCutMeshes(...)` calls (wireframe branch and shaded branch).
The cabinet center is the recentered half-extent: `cW/cH/cD` are in mm and the
recentered cabinet spans 0..dim, so center = `(cW/1000/2, cH/1000/2, cD/1000/2)`.
The panel center is `box.x/box.y/box.z`.

Wireframe branch:
```diff
-            addCutMeshes(lines, box.cuts, box.w, box.h, box.d, true);
+            addCutMeshes(lines, box.cuts, box.w, box.h, box.d, true,
+              { x: box.x, y: box.y, z: box.z },
+              { x: cW / 1000 / 2, y: cH / 1000 / 2, z: cD / 1000 / 2 });
```

Shaded branch:
```diff
-            addCutMeshes(mesh, box.cuts, box.w, box.h, box.d, false);
+            addCutMeshes(mesh, box.cuts, box.w, box.h, box.d, false,
+              { x: box.x, y: box.y, z: box.z },
+              { x: cW / 1000 / 2, y: cH / 1000 / 2, z: cD / 1000 / 2 });
```

(`cW/cH/cD` are already defined in that effect scope as the cabinet dims.)

## Acceptance
- `npm run build` passes.
- Re-import + view `BDR.K3.120`: on Left AND Right sides the vertical groove is on
  the INNER face; Bottom's rabbet on the interior face; Top_Back correct; DR_Front
  still correct. No groove on an outer face.
- Commit: "Stage 8d-fix: place cut recesses on interior-facing panel face".

## After build — clean restart (page glitches after updates)
- Stop any running dev server
- Clear cache:  `Remove-Item -Recurse -Force .next`
- Start fresh:  `npm run dev`
Then hard refresh the browser (Ctrl+Shift+R).

## Note
This rule assumes the groove belongs on the interior face, which holds for all
cut panels in the verified export (carcass joinery faces inward). If a future
panel legitimately needs an OUTER-face cut, we'll reintroduce the `face` field as
a tiebreaker — but for current cabinets the interior rule is correct and stable.
