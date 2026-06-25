# STAGE 11e-EXPORT-FIX — Transform `open_normal` into world space (Ruby export)

**Type:** Targeted fix in the Ruby SketchUp extension. Do NOT touch the
viewer/parser — the viewer is correct and must remain unchanged.

**File:** `alloy_export/main.rb`

---

## Diagnosis (confirmed from JSON, not assumed)

On a rotated cabinet, `cuts[].open_normal` is written in the part's
**local** frame and is NOT transformed into world space. Evidence from
`alloy_export_0_6_7_rotated_cabinet.json`:

- `W_BDR_B#50`: `axes = { x:[0,-1,0], y:[1,0,0], z:[0,0,1] }` (clearly a
  90° rotation about Z), but `open_normal = [0,-1,0]` — i.e. pure local
  Y, untouched by that rotation.
- `Drawer_Front#161`: same `axes`, `open_normal = [0,1,0]`.

Applying the part's own `axes` to the local normal yields the correct
world normal:
- `W_BDR_B#50`:  `[0,-1,0]` → `[-1,0,0]`
- `Drawer_Front#161`: `[0,1,0]` → `[1,0,0]`

So the export already computes correct world placement (it's in `axes`);
it just fails to apply that same transform to `open_normal`. On an
unrotated cabinet local == world, which is why this passed before and
only fails under rotation (same root cause class as the mirror bug:
a normal derived without full world placement applied).

## The fix

In the code path that emits `open_normal` for each cut (and, if the same
helper feeds `tooling[]` face normals, there too):

1. Take the floor face's normal as currently derived (local).
2. Transform it by the **same instance/world transformation** already
   used to produce the part's `axes` — **rotation only**, no translation.
   Reuse the existing transform/axes derivation; do not invent a new one.
3. Normalize the result; clamp near-zero components to 0 to avoid
   `-0.0`/floating dust in the JSON.
4. Write that world-space vector as `open_normal`.

Constraints:
- Surgical edit. Touch only the normal-emitting code; leave geometry,
  positions, `axes`, and all other fields byte-for-byte unchanged.
- Do not change the field name or shape — still `open_normal: [x,y,z]`.
- Keep the schema additive; this is a value correction, not a contract
  change. If you bump the schema, only do so to a patch version and note it.
- If `face`/`inner`/`outer` labelling is derived from the same normal,
  ensure it now uses the world normal consistently.

## Verify the JSON BEFORE any viewer check

After the edit, re-export the **rotated** cabinet and confirm directly in
the JSON (do not rely on the viewer for this step):

- `W_BDR_B#50.cuts[0].open_normal` ≈ `[-1, 0, 0]`
- `Drawer_Front#161.cuts[0].open_normal` ≈ `[1, 0, 0]`

Also re-export the **unrotated** cabinet and confirm it is unchanged
(must still be `[0,-1,0]` and `[0,1,0]` respectively) — proving the fix
is a no-op when local == world and didn't regress the passing case.

If either check fails, STOP and report the actual values.

## Then re-run viewer verification

The `TEMP-11dVERIFY` logging from STAGE-11d-VERIFY is still in
`Cabinet3D.tsx`. Re-run it (clean restart: kill dev server,
`Remove-Item -Recurse -Force .next`, `npm run dev`, `Ctrl+Shift+R`) on
the rotated cabinet and confirm for both parts:

- `open_normal_raw` now reflects the world value (≈ `[∓1,0,0]`)
- `mapped_normal_three` and `groove_face_chosen` place the groove on the
  correct open face

State PASS/FAIL per part for both rotated and unrotated cabinets.

## Cleanup

- Only after both parts PASS on the rotated cabinet AND remain PASS on the
  unrotated cabinet, remove the `TEMP-11dVERIFY` logging block from
  `Cabinet3D.tsx`.
- Report the final diff summary.

## Reminder

SketchUp can't be driven by Claude Code — pause and ask the user to
re-export when an export is required, then continue once they confirm the
new JSON is in place.
