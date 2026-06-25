# STAGE 12-FIX2 — Assign oriented box extents by outline SEMANTICS (u/v/thickness → correct local axis)

**Type:** Targeted fix in `lib/cabinet3d.ts`, `buildBoxesFromOrientedPanels`.
Surgical. The previous attempt (12-FIX) changed `sizeSource` to 'outline'
but produced the SAME `(bw,bh,bd)` values in the same wrong order, so the
defect is unchanged. This task corrects the actual axis assignment.

---

## Why 12-FIX didn't work (computed, not assumed)

For `Back#197` (`axes.x=[0,-1,0], y=[1,0,0], z=[0,0,1]`), the box is built
as `bw→axes.x, bh→axes.y, bd→axes.z`. The logged `(bw,bh,bd)=(832,8,752)`
puts the **8mm on the `axes.y` column**, whose three-space direction is
`[1,0,0]` = world X. So the Back's 8mm thickness points sideways. It must
point front-to-back (out of the panel plane). Pulling the same 832/8/752
from the outline and assigning them in the same order changes nothing.

The magnitudes were never the problem — the **axis each magnitude is
assigned to** is. That must be driven by the outline's semantics.

## Correct rule

`outline_mm = { u_axis, v_axis, thickness_mm, loop }` describes the panel
in its own frame:
- `u_extent = max(u)-min(u)` is the in-plane size along the local axis
  named by `u_axis`.
- `v_extent = max(v)-min(v)` is the in-plane size along the local axis
  named by `v_axis`.
- `thickness_mm` is the size along the REMAINING (out-of-plane) local axis.

The orientation columns are already `col0=Cx(axes.x)`, `col1=Cx(axes.y)`,
`col2=Cx(axes.z)` — i.e. local x, y, z. So you must assign:
- the extent for local-x → `bw`
- the extent for local-y → `bh`
- the extent for local-z → `bd`

…by resolving which of {u, v, thickness} corresponds to local x, y, z.

**Resolve the axis names.** `u_axis`/`v_axis` use role-ish names
("width", "height", "depth"). Establish the mapping from those names to
the part's LOCAL x/y/z. Do this from the data, not assumption: for a panel
where `axes` is identity, the existing `size_mm.{x,y,z}` ordering already
agrees with local x/y/z, so you can calibrate which name ("width" /
"height" / "depth") maps to local x / y / z by matching outline extents to
`size_mm` on one or two IDENTITY-axes panels (from the unrotated cabinet).
Then apply that same name→local-axis mapping to all oriented panels.

Expected outcome for `Back#197`: `width(832)→` its local axis,
`height(752)→` its local axis, `thickness(8)→` the out-of-plane local
axis, such that the **8mm lands on the orientation column whose
three-space direction is the panel's true thickness direction** (for the
Back, front-to-back). Concretely, verify the resulting box renders the
Back as a thin slab whose 8mm runs front-to-back, NOT sideways.

## Constraints

- PANELS only. Fittings (legs/cylinders and anything matched by the
  fitting-name rule) keep current `size_mm` sizing — their outlines are
  degenerate (e.g. 5×2 loop for a 60mm leg). Do not touch them.
- Orientation code (the `col0/col1/col2 = Cx(axes.*)` block and the
  orient9 packing) stays EXACTLY as-is. Only the (bw,bh,bd) assignment
  changes.
- Position/recenter/corner code stays as-is.
- Fallback: if outline missing/degenerate (u or v ≤ 1mm), use current
  size_mm behaviour and warn once.
- Surgical diff. Legacy/raw paths untouched.

## Verification (logs + eyes)

Extend the TEMP-12DIAG oriented-part log to print, for `Back#197` and
`Bottom#149`:
- `u_extent, v_extent, thickness`
- the resolved `name→local-axis` mapping
- final `(bw,bh,bd)` AND which orientation column each landed on
- for each column, its three-space direction `Cx(axes.*)`

The decisive line: for `Back#197`, the 8mm must be on the column whose
three-space dir is the front-back direction, NOT `[1,0,0]`.

Then clean restart (kill dev server, `Remove-Item -Recurse -Force .next`,
`npm run dev`, `Ctrl+Shift+R`) and:

1. **Rotated cabinet** — report the logs above AND describe the render:
   are panels un-splayed, Back a thin front-back slab, sides parallel,
   doors on faces, legs still correct? (Samer will confirm visually.)
2. **Unrotated cabinet** — regression check: must be unchanged. Because
   the name→local mapping was calibrated on identity-axes panels, the
   assignment for identity panels must reproduce the current
   `(bw,bh,bd)` exactly. Confirm `Back`/`Bottom` dims match pre-change.

Report PASS/FAIL per cabinet. Keep TEMP-12DIAG in place.

## Out of scope

Grooves/cuts — verified separately once placement is confirmed.
