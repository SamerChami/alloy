# Stage 8e-FIX — Cut groove position is mirrored along the depth axis (Claude Code)

Read `CLAUDE.md` in the alloy folder first, then apply this. **Surgical fix** —
do NOT rewrite `Cabinet3D.tsx` or refactor unrelated code. A wholesale rewrite
previously hit `CLAUDE_CODE_MAX_OUTPUT_TOKENS`. Make ONLY the change below.

Before starting, in PowerShell:
`$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000`
(Switch to `/model sonnet` if the diff won't apply cleanly.)

## Context
Stage 8c fixed the mirror; Stage 8d put the grooves on the correct INNER face.
Both are confirmed good. Remaining bug: the groove's POSITION WITHIN the face is
wrong along the depth direction. Verified on `BDR.K3.120`:
- Left/Right side grooves sit toward the FRONT edge; should be toward the BACK.
- Bottom / Top_Back grooves likewise mispositioned along depth.
- DR_Front: correct.

## Root cause (verified against `alloy_export_0_4_1.json`)
The Stage 8c mirror fix negated the depth axis for panel POSITIONS
(`cz = -m(p.pos.y)` in `cabinet3d.ts`), but `addCutMeshes` still places the cut
footprint using the original (un-negated) `u`/`v` coordinates. So any cut whose
footprint runs along the depth axis is mirrored within its face.

After the mapping, the depth axis is THREE **z**. In `addCutMeshes`, whichever of
`uAxis`/`vAxis` equals `"z"` is the negated-depth axis and must have its placement
coordinate flipped. Verified: flipping it moves all four grooves from the front
(+offset) to the back (−offset) — the physically correct seat for back-panel and
shelf grooves. DR_Front uses neither u nor v on `z`, so it is unaffected (which is
why it was already correct).

## The fix — in `components/Cabinet3D.tsx`, inside `addCutMeshes`
Find the two placement lines inside the `drawFace` helper:

```ts
      pos[uAxis] = uCtr - uExtent / 2;
      pos[vAxis] = vCtr - vExtent / 2;
```

Replace them with a version that mirrors the coordinate for whichever face axis
maps to THREE `z` (the depth axis negated by the Stage 8c mirror fix):

```ts
      // The Stage 8c mirror fix negated the depth axis (three.z = -su.y) for panel
      // positions, but the cut u/v footprint is still in the original frame. Flip
      // the placement for whichever face axis maps to three.z so the groove sits at
      // the correct depth position (e.g. back-seated grooves render at the back).
      pos[uAxis] = uAxis === "z" ? (uExtent / 2 - uCtr) : (uCtr - uExtent / 2);
      pos[vAxis] = vAxis === "z" ? (vExtent / 2 - vCtr) : (vCtr - vExtent / 2);
```

Change NOTHING else: the `tAxis` interior-side offset (Stage 8d), the `sz`
assignments, and the geometry/material creation all stay exactly as they are.

## Acceptance
- `npm run build` passes.
- Re-import + view `BDR.K3.120`: the Left/Right side grooves now sit toward the
  BACK edge of the inner face (where the back panel seats); Bottom and Top_Back
  grooves at the correct depth; DR_Front still correct. All four grooves correct
  in BOTH face and position.
- Commit: "Stage 8e-fix: flip cut u/v depth axis to match mirror-corrected frame".

## After build — clean restart (page glitches after updates)
- Stop any running dev server
- Clear cache:  `Remove-Item -Recurse -Force .next`
- Start fresh:  `npm run dev`
Then hard refresh the browser (Ctrl+Shift+R).

## Note
This is the depth-axis counterpart to the Stage 8c position fix: positions were
negated on z, and now the cut footprint coordinate is too, keeping the cut frame
consistent with the panel frame. If a future export changes the axis convention,
the `=== "z"` test stays correct because it keys off the same THREE-axis the
mapping produces.
