# Stage 8c-FIX — SketchUp 3D is mirrored (left↔right) + camera view (Claude Code)

Read `CLAUDE.md` in the alloy folder first, then apply this. It is a **surgical,
two-change fix** — do NOT rewrite `cabinet3d.ts` or `Cabinet3D.tsx`, and do NOT
refactor any function. A wholesale rewrite previously hit
`CLAUDE_CODE_MAX_OUTPUT_TOKENS`. Make ONLY the two edits below.

Before starting, in PowerShell:
`$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000`
(Switch to `/model sonnet` if the diff won't apply cleanly.)

## Diagnosis (verified against `alloy_export_0_4_1.json`)
The imported SketchUp cabinet renders MIRRORED: the SketchUp Left side appears on
the preview's Right and vice-versa. Verified root cause: the SketchUp 3D build
path `buildBoxesFromSkuPanels` in `lib/cabinet3d.ts` maps
`three.z = +su.y` (no negation). That single non-negated axis makes the transform
**left-handed (determinant −1)** — a true reflection. The documented rule and the
`.3ds` path both use `three.z = −su.y`. The missing minus sign is the mirror.

Negating `cz` makes the map right-handed (det +1, no mirror) and matches the
schema doc. It also turns the cabinet so the door face moves to high `three.z`;
to keep the doors facing the camera (front-left view, like SketchUp), the camera's
default azimuth `theta` is rotated to view from the front-left.

## Change 1 — remove the mirror (`lib/cabinet3d.ts`)
In `buildBoxesFromSkuPanels`, inside the `panels.map(p => ({ ... }))` block,
negate the `cz` mapping:

```diff
     cx: m(p.pos.x),
     cy: m(p.pos.z),
-    cz: m(p.pos.y),
+    cz: -m(p.pos.y),
     cuts: p.cuts,
```

Touch nothing else in that function — `bw/bh/bd`, `cx`, `cy`, the min-corner
recenter, and the explode logic all stay exactly as they are. (The recenter uses
`minZ = min(cz - bd/2)`, which self-adjusts to the negated values — correct.)

## Change 2 — aim the camera front-left (`components/Cabinet3D.tsx`)
In the `orbitRef` initial state, change ONLY `theta`:

```diff
   const orbitRef = useRef({
-    theta:  Math.PI * 0.75,
+    theta:  Math.PI * 1.75,
     phi:    Math.PI * 0.4,
     radius: 2,
     cx: 0, cy: 0, cz: 0,
   });
```

Leave `phi`, `radius`, `cx/cy/cz` untouched. (The render effect recomputes
`cx/cy/cz/phi/radius` per model but does NOT touch `theta`, so this default
takes effect on load.)

Do NOT change `addCutMeshes` or the `drawFace` front/back offsets — the existing
Stage 8b-fix front/back logic stays as-is for now (see note below).

## Acceptance
- `npm run build` passes.
- Re-import the SketchUp export and view cabinet `BDR.K3.120`: the Left side panel
  is on the LEFT, Right on the RIGHT (no longer mirrored), doors face the camera,
  cabinet stands upright — matching the SketchUp screenshot orientation.
- Commit: "Stage 8c-fix: remove SketchUp 3D mirror (three.z=-su.y) + front-left camera".

## After build — clean restart (the page glitches after updates)
- Stop any running dev server.
- Clear the Next.js cache:  `Remove-Item -Recurse -Force .next`
- Start fresh:  `npm run dev`
Then in the browser, hard refresh (Ctrl+Shift+R) to drop the stale client bundle.

## IMPORTANT — report back before we touch the groove again
The cut recesses (groove/rabbet) were previously fixed for front/back side while
the model was still MIRRORED. Removing the mirror may make that earlier fix either
correct OR reversed — the two signs are coupled, so we verify visually rather than
guess. After the restart, look at cabinet `BDR.K3.120` and tell Samer:
- Is the cabinet correctly oriented (Left on left, doors facing you)? (expected: yes)
- The Left_Side / Right_Side vertical groove — is it on the INNER face (facing the
  cabinet interior)? And the Bottom rabbet / DR_Front groove — correct face?

If the grooves are now on the WRONG face, the earlier front/back swap was
compensating for the mirror; the one-line revert is ready (swap the two `pos[tAxis]`
expressions in `drawFace` back). Do NOT make that change in this task — just
report what you see.
