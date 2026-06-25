# STAGE 12-FIX — Oriented box sizing from local frame (`outline_mm`), not world `size_mm`

**Type:** Targeted fix in the viewer build path. Surgical. Do NOT rewrite
`cabinet3d.ts`. Touch only the oriented build path and only as described.

**File:** `lib/cabinet3d.ts`, function `buildBoxesFromOrientedPanels`.

---

## Root cause (confirmed from JSON + runtime logs)

The oriented path computes per-part orientation correctly
(`orient = [Cx(axes.x) | Cx(axes.y) | Cx(axes.z)]` = `C·Rworld`). That is
NOT the bug.

The bug is **box dimensions**. The code sets
`bw=su_width_mm (local x)`, `bh=su_height_mm (local y)`, `bd=su_depth_mm
(local z)` — i.e. it assumes `size_mm` is ordered along the part's LOCAL
axes. But in this export `size_mm.{x,y,z}` is ordered along **world**
X/Y/Z (it's the axis-aligned bounding box; schema doc line 63 confirms
"along SketchUp world X/Y/Z"). For a rotated part, world-ordered sizes
paired with local-ordered axes mis-assign each extent to the wrong axis,
so the oriented box has correct rotation but wrong dimensions-per-axis →
panels splay/scatter. Identity-axes (unrotated) parts are unaffected
because world order == local order, which is why unrotated cabinets render
correctly and rotated ones don't.

Evidence (rotated cabinet):
- `Back#197`: `axes.x=[0,-1,0]` (local x → world Y), `size_mm.y=8` (the
  8mm thickness sits on world y), but the 8mm thickness actually runs
  along the part's local x. `outline_mm` reports u=832, v=752, thickness=8
  with `u_axis=width, v_axis=height` — unambiguous in the LOCAL frame.

## The fix — dimension PANELS from `outline_mm`

`outline_mm` is present on all panel leaves and is expressed in the
panel's own frame:
```
outline_mm = { u_axis, v_axis, thickness_mm, loop: [[u,v],...] }
```
For each PANEL with a usable `outline_mm`:
- `u_extent = max(u) - min(u)` over the loop
- `v_extent = max(v) - min(v)` over the loop
- `thickness = thickness_mm`
- Map these to the box's local (bw,bh,bd) so they align with the
  orientation columns the code already builds from `axes.x|y|z`:
  - the box dimension along `axes.x` (col0) = the local extent that lies
    along local x, etc. Determine the u/v/thickness → local x/y/z mapping
    from `u_axis`/`v_axis` (e.g. `u_axis="width"` → local x;
    `v_axis="height"` → local z or y per the existing convention) and the
    remaining axis = thickness. **Verify this mapping against one known
    part (`Back#197`: expect 832 along local x, 8 along the thickness
    axis, 752 along the third) before trusting it.**

Keep the orientation code (lines 340–348) and the position/recenter code
EXACTLY as-is. Only the (bw,bh,bd) assignment changes, and only for panels.

## Fittings — leave on the existing path

Do NOT apply outline-based sizing to fittings. The legs
(`Leg_12cm#...`, cylinders, anything matched by the fitting-name rule:
`p2o, leg_, atira, hafele, basket, l_channel, u_channel, channel, blum,
hinge, slide`) have degenerate `outline_mm` (e.g. 5×2 loop for a 60mm
cylinder) and already render acceptably. For fittings, keep the current
`size_mm`-based sizing unchanged. Gate the new logic to panels only.

## Guardrails

- If a panel's `outline_mm` is missing or its loop is degenerate
  (u_extent or v_extent ≤ 1mm), fall back to the current `size_mm`
  behaviour for that part and `console.warn` its name once. (Should not
  happen for panels in this export, but don't crash.)
- Additive in spirit: non-oriented paths
  (`buildBoxesFromSkuPanels` legacy, `buildBoxesFromRawPanels`) stay
  byte-for-byte unchanged.
- Surgical diff only.

## Verification

Keep the existing TEMP-12DIAG logs. Extend the oriented-part log to also
print the chosen `(bw,bh,bd)` and their source (`'outline'` | `'size_mm'
fallback'`).

Clean restart (kill dev server, `Remove-Item -Recurse -Force .next`,
`npm run dev`, `Ctrl+Shift+R`). Then:

1. Import the **rotated** cabinet. Confirm in the logs that for `Back#197`
   the box is 832 × 8 × 752 distributed onto the correct local axes
   (8mm on the thickness axis), and visually confirm panels are no longer
   splayed — Back flush, sides parallel, doors on their faces, legs still
   correct.
2. Import the **original (unrotated)** cabinet. Confirm it is UNCHANGED
   (regression check) — parts still placed correctly, legs fine.

Report PASS/FAIL for both, with the `(bw,bh,bd)` log for `Back#197` and
`Bottom#149`. Do NOT remove TEMP-12DIAG yet — grooves still need a
separate check afterward.

## Note

Grooves/cuts are deliberately out of scope here. Fixing panel sizing may
also move the cut frame; we verify cuts in a follow-up once placement is
confirmed correct.
