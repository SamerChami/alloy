# Stage 8b-FIX — Cut recesses render on the wrong big face (Claude Code)

Read `CLAUDE.md` and `components/Cabinet3D.tsx` first. This is a **surgical,
two-line fix** — do NOT rewrite the file or refactor `addCutMeshes`. A wholesale
rewrite last time hit `CLAUDE_CODE_MAX_OUTPUT_TOKENS`. Make ONLY the edit below.

Before starting, in PowerShell:
`$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000`
(Switch to `/model sonnet` if the diff still won't apply cleanly.)

## Diagnosis (verified against `alloy_export_0_4_1.json`)
The cut recesses land on the WRONG big face for Left/Right sides, DR_Front, and
Bottom. The cause is NOT the axis mapping — the `tAxis/uAxis/vAxis` table in
`addCutMeshes` is CORRECT for all three thickness cases (verified by matching
each cut's u/v footprint to the panel's non-thickness extents).

The bug is the **front/back offset sign** inside the `drawFace` helper.

Ruby's cut detector (Stage 7) sets `face: "front"` when the groove FLOOR is
nearest `t_min` (it uses `depth = min(t, th - t)`, so "front" = the *nearer* big
face). The recess therefore opens on the `t_min` (`-t/2`) side. The current code
places `"front"` at `+thickness/2` (the FAR side), so every `face:"front"` cut —
which is all of them in real exports — renders on the opposite big face. A
symmetric `face:"both"` groove looks correct by coincidence, which is why the bug
appeared face-specific.

## The fix — in `components/Cabinet3D.tsx`, inside `addCutMeshes` → `drawFace`

**Swap the two offset expressions** for the `tAxis` position:

```diff
       pos[tAxis] = side === "front"
-        ?  thickness / 2 - depth / 2
-        : -thickness / 2 + depth / 2;
+        ? -thickness / 2 + depth / 2
+        :  thickness / 2 - depth / 2;
```

And replace the now-stale comment directly above that block:

```diff
-      // face="front" means the groove floor is closer to t_min (Ruby: min distance).
-      // The groove OPENS from the opposite face (t_max side). Show the recess at
-      // the opening face so it is visible from the correct side.
+      // Ruby face="front" => groove floor near t_min; the recess opens on the
+      // t_min (-t) side. Place it there so it's visible on the correct big face.
```

That is the ENTIRE change. Do not touch the `tAxis/uAxis/vAxis` assignment
table, the `sz`/`pos` u/v placement, geometry/material creation, or anything
else in the function.

## Acceptance
- `npm run build` passes.
- Re-import the v4 export and view a cabinet: the groove on Left_Side/Right_Side
  reads as a vertical channel on the INNER face; Bottom's rabbet sits on the
  correct face; DR_Front's groove is on the correct face. Nothing renders on the
  opposite (outer) face.
- Commit: "Stage 8b-fix: cut recess front/back side (correct big face)".

Hard refresh the browser (Ctrl+Shift+R) after rebuild.

## Note to Samer
The "front = nearer face" semantic is inferred from the Ruby detection algorithm
(`depth = min(t, th-t)`), not the raw `.rb` source — but it's consistent with all
cuts in the verified export. After applying, eyeball sides/bottom/DR_Front: if
they're correct, it's confirmed. If they ALL flip to wrong (unlikely), the
semantic is reversed and you swap the two lines back.
