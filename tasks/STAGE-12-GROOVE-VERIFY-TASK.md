# STAGE 12-GROOVE-VERIFY — Groove face check + diag cleanup (final step)

**Type:** Verification + conditional cleanup. Add a temporary log if
needed, confirm groove faces on the two known parts on BOTH cabinets, then
(only if correct) remove all TEMP-12DIAG logging.

**Files:** `components/Cabinet3D.tsx`, `lib/cabinet3d.ts`.

---

## Context

Panel placement/orientation is now fully fixed on both rotated and
unrotated cabinets (reflection preserved via Matrix4). Cut meshes are
children of the panel mesh and inherit its transform, so the reflected
parts' cuts should now ride the corrected orientation.

Outstanding from the original Stage 11 work: `Drawer_Front` and `W_BDR_B`
previously rendered their grooves on the WRONG face (visible even on the
unrotated cabinet). This was never re-verified after the placement fixes.
Determine whether the groove face is now correct.

## Step 1 — Locate the groove face decision

Find where a cut/groove's face is chosen and where its mesh is positioned
on the panel (the `szSign` / face-side logic and the cut-mesh placement,
likely in `addCutMeshes` or the cut-building block in `Cabinet3D.tsx`).

## Step 2 — Log the groove face for the two parts (both cabinets)

For `Drawer_Front` and `W_BDR_B` (any instance suffix — match on name
prefix), log per groove:

    // TEMP-GROOVE — remove after verification
    console.log('[GROOVE]', part_name, {
      cut_type,            // groove/rabbet/etc
      face,                // 'inner'/'outer' as in JSON
      open_normal,         // from the cut
      placed_offset_sign,  // which side of the panel the mesh sits (the szSign or equivalent)
      panel_det,           // orientation determinant of the parent panel (-1 if reflected)
    });

The `panel_det` field matters: it tells us if the part is one of the
reflected ones and whether the inherited reflection now lands the cut on
the correct side.

## Step 3 — Verify on BOTH cabinets

Clean restart (kill dev server, `Remove-Item -Recurse -Force .next`,
`npm run dev`, `Ctrl+Shift+R`).

- Import the **unrotated** cabinet. Capture `[GROOVE]` logs. Visually:
  is the `Drawer_Front` groove on the correct (interior/named) face? Is
  the cabinet otherwise correct?
- Import the **rotated** cabinet. Same capture and visual check. `W_BDR_B`
  is an internal drawer-box panel — to see it, temporarily enable explode
  or hide neighbouring panels, OR rely on the logged
  `placed_offset_sign` vs `face` agreement if not visible.

Report, per part per cabinet: the logged fields and a PASS/FAIL on whether
the groove sits on the face named by `face`/`open_normal`.

## Step 4 — Conditional cleanup

**Only if** all groove checks PASS on both cabinets:
- Remove ALL `TEMP-12DIAG` logging blocks from `cabinet3d.ts` and
  `Cabinet3D.tsx`.
- Remove the `TEMP-GROOVE` log added here.
- Leave the actual fixes (Matrix4 reflection, outline sizing, role
  routing, world-normal export) in place.
- Report the cleanup diff.

**If any groove check FAILS:** do NOT clean up. Leave all logs in place and
report the evidence (the `[GROOVE]` lines for the failing part) so the
face bug can be scoped as its own fix. Do not attempt that fix in this
task.

## Constraints

- Surgical. No logic changes in this task except adding/removing logs.
- Do not alter placement/orientation code — that is confirmed correct.
