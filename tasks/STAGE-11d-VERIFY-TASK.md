# STAGE 11d-VERIFY — Confirm groove face correctness (verification only)

**Type:** Verification only. Do NOT change any rendering, parsing, or
export logic. The only code you may add is temporary diagnostic logging,
clearly marked for removal.

**Goal:** Prove whether `Drawer_Front#161` and `W_BDR_B#50` now render
their grooves on the correct (open) face after the Stage 11d-FIX
basis-swap change for thickness-on-Y panels.

---

## Background (context, not instructions to act on)

- Schema is v0.6.7. The floor face's own world normal is exported as
  `open_normal` (a.k.a. `floor_n_w`).
- Basis swap must be exact and consistent:
  `three.x = su.x`, `three.y = su.z`, `three.z = −su.y`.
- The suspected bug: a single-component read `open_normal[tI]` works for
  thickness-on-X and thickness-on-Z panels but DROPS the `−su.y`
  negation for thickness-on-Y panels, placing the groove on the wrong face.
- The two named parts are the test cases; one or both are thickness-on-Y.

---

## Step 1 — Re-export and confirm the JSON is current

Do not trust any existing JSON; assume it may be stale.

- Re-export the test model from SketchUp.
- If there is ANY doubt the extension is current, do a clean reinstall:
  uninstall the `.rbz`, fully quit SketchUp, manually delete the
  `alloy_export` folder from Plugins, reinstall, relaunch, re-export.
- In the exported JSON, locate `Drawer_Front#161` and `W_BDR_B#50` and
  confirm for EACH:
  - schema version is `alloy.sketchup.v...` at 0.6.7 (or note the actual value)
  - `open_normal` field is PRESENT
  - record the raw `open_normal` vector value
  - record the panel's thickness axis (X, Y, or Z)

Report these values before touching the viewer. If `open_normal` is
missing or the schema is older than 0.6.7, STOP and report — the export
is stale and verification cannot proceed.

## Step 2 — Add temporary diagnostic logging in the viewer

In the groove-placement path (the code that reads `open_normal` and
positions the groove mesh), add a clearly-marked temporary log:

    // TEMP-11dVERIFY — remove after verification
    console.log('[11dVERIFY]', partName, {
      open_normal_raw,        // the raw SU-space vector from JSON
      thickness_axis,         // 'X' | 'Y' | 'Z' as detected in the viewer
      mapped_normal_three,    // the Three.js-space normal after basis swap
      groove_face_chosen      // which face the groove was placed on
    });

- Log ONLY for the two named parts (gate on part name) to keep output clean.
- Do not alter the values or the logic — only observe and print.

## Step 3 — Run and capture

- Clean restart: kill dev server, `Remove-Item -Recurse -Force .next`,
  `npm run dev`, hard-refresh `Ctrl+Shift+R`.
- Open the model containing the two parts in the viewer.
- Capture the `[11dVERIFY]` console output for both parts.

## Step 4 — Report

For each of `Drawer_Front#161` and `W_BDR_B#50`, report the four logged
values, plus:

- the JSON `open_normal` and thickness axis from Step 1
- a clear verdict: did the `−su.y` negation survive into
  `mapped_normal_three` for the Y-thickness case, and is
  `groove_face_chosen` the correct (open) face?

State PASS or FAIL per part. Do not attempt a fix in this task — if a
part FAILs, just report the evidence so the fix can be scoped separately.

## Cleanup

Leave the `TEMP-11dVERIFY` log in place for now (do not remove) so the
output can be re-checked; note in your report that it is still present.
