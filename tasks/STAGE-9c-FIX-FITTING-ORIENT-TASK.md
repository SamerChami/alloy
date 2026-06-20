# Stage 9c-FIX — Apply v5 orientation to fittings too (Claude Code)

Read `CLAUDE.md` in the alloy folder first, then apply. **Surgical** — do NOT
rewrite `Cabinet3D.tsx`. One small block changes.

Before starting, in PowerShell:
`$env:CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000`

## Context
Stage 9b added the oriented-box path for v5 `axes` — the L-corner cabinet now renders
correctly (both legs, doors, shelves). Remaining bug: the two **L_Channel** Gola
profiles float out of place (a vertical bar punching through the top, a horizontal bar
offset to the side).

Cause: in the oriented path, `box.w/h/d` are the panel's LOCAL size and the rotation
lives in `box.orient`. Panels apply `box.orient`; the **fitting branch does NOT**.
`buildFittingObject` builds the L-profile from local dims (correct shape) but the
group is then placed with position only — no orientation — so the extrude direction
ends up along the wrong three-space axis. (Legs are radially symmetric cylinders, so
they look fine without orientation; channels do not.)

## The fix — `components/Cabinet3D.tsx`, the fitting branch in the render loop
Current:
```ts
        // Use smart fitting shape when the part name identifies a known fitting type
        if (fittingColor(name) !== null) {
          const obj = buildFittingObject(name, box.w, box.h, box.d, isWireframe);
          obj.position.set(box.x, box.y, box.z);
          group.add(obj);
          continue;
        }
```
Replace with (apply `box.orient` exactly like panels do):
```ts
        // Use smart fitting shape when the part name identifies a known fitting type
        if (fittingColor(name) !== null) {
          const obj = buildFittingObject(name, box.w, box.h, box.d, isWireframe);
          if (box.orient) {
            const m = new THREE.Matrix4();
            m.set(
              box.orient[0], box.orient[3], box.orient[6], 0,
              box.orient[1], box.orient[4], box.orient[7], 0,
              box.orient[2], box.orient[5], box.orient[8], 0,
              0, 0, 0, 1,
            );
            obj.quaternion.setFromRotationMatrix(m);
          }
          obj.position.set(box.x, box.y, box.z);
          group.add(obj);
          continue;
        }
```
Use the SAME Matrix4-from-orient construction the panel branch uses (Stage 9b). Do
not change `buildFittingObject` itself — it already builds from local dims, which is
what we want now that orientation is applied at placement.

## Acceptance
- `npm run build` passes.
- Re-import the v5 `BC2.K3.120*120`: the two L_Channel Gola profiles sit flush along
  their panel edges (no vertical bar through the top, no floating horizontal bar);
  legs unchanged; the L-cabinet otherwise still correct.
- A v4 cabinet still renders as before (no `axes` → `box.orient` undefined → fitting
  placement unchanged).
- Commit: "Stage 9c-fix: apply v5 orientation to fitting objects".

## After build — clean restart
- Stop dev server
- `Remove-Item -Recurse -Force .next`
- `npm run dev`
Then hard refresh (Ctrl+Shift+R).

## Note
For mirrored fittings (orient det -1) `setFromRotationMatrix` drops the reflection,
same caveat as panels. None of the channels in the current corner cabinet are
mirrored, so this is fine; if a future mirrored channel looks wrong we'll switch
fittings to `obj.applyMatrix4` with a full basis. Not needed now.
