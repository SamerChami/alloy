# Stage 4e-DEFINITIVE — DXF door/panel size inflation (task for Claude Code)

We have the EXACT root cause now, verified against the file. The console.table
proves the parser runs but mis-sizes some panels:
- Door 1 (Double) [1]: shows W=730 H=1347 — should be a 730mm-TALL door.
- Door 1 (Double) [3]: shows H=1645.5 — should be 466×148.5.
- Overall H shows 4560 — should be 2280.
Most carcass panels are correct; DOORS (and the overall height) are inflated.

## Verified structure of the problem (Door[1])
The panel block `....Door 1 (Double) [1]` contains:
- 12 CIRCLEs (holes — correct, count is right), and
- TWO INSERTs to face sub-blocks, EACH with:
    - sub-block 3DFACE local z-range: 0 .. 730
    - INSERT offset: position = (x, 0, **730**)   ← note z-offset 730
  i.e. `(1)` at insert (1.5, 0, 730) and `(2)` at insert (451.5, 0, 730).

So after applying the INSERT transform, the door faces land at world
z = 730..1460. The TRUE door panel height is **730** (the local face extent),
but the current code computes the panel bbox AFTER adding the 730 offset and/or
unions the two leaves such that the Z extent becomes inflated (≈1347/1645),
and the global cabinet bbox then reaches ~4560.

The carcass panels have INSERT offsets near 0, so they don't visibly inflate —
which is why only doors (placed high in the cabinet) show the bug clearly.

## The correct rule
A panel's SIZE (width, height, thickness) must be measured from its faces in the
panel's OWN local frame — i.e. the geometry extent — NOT including the panel's
placement offset within the cabinet. The placement offset is POSITION, used only
for `pos`/3D location, and must be kept separate from SIZE.

## Fix in `lib/dxf/polyboardImport.ts`
1. In `collectPanel` / `gatherFaces`, when descending into a panel's face
   sub-blocks, accumulate face vertices in TWO ways:
   - **localVerts**: faces WITHOUT the panel-level placement offset (so the
     panel's own size is correct). Practically: the size should be invariant to
     where the panel sits. Compute each panel's bbox, then SIZE = extents of
     that bbox, and POSITION = bbox center. The problem is the two door leaves
     are offset by the SAME z=730, so the union's Z extent should STILL be 730,
     not 1347 — unless faces from MORE than one coordinate space are being
     merged.
2. THEREFORE the real issue is almost certainly that the panel's faces are being
   collected from BOTH the sub-block faces (world, via INSERT) AND somewhere a
   second copy (e.g. the recursion also visits a nested INSERT, or the fallback
   path adds the panel block's own faces too). Audit `collectPanel`:
   - It must collect faces from EXACTLY ONE source per panel.
   - For this file, the panel block has NO direct 3DFACEs (only CIRCLEs +
     INSERTs), so the fallback must NOT run. Confirm the fallback only runs when
     truly zero vertices, and that the recursion does not double-visit.
   - The two door-leaf INSERTs are LEGITIMATE (two leaves) and both belong to
     the same door panel — their union gives width≈897 and height 730. That is
     correct. So if H comes out 1347, the code is adding the z=730 offset on top
     of the 0..730 faces for ONE leaf while the other leaf is at 0..730 without
     offset — i.e. the transform is applied inconsistently (once to faces that
     were already in world coords).
3. Add temporary debug for Door[1]: log its collected vertex Z min/max BEFORE
   size computation:
   `console.log("[door dbg]", name, "zmin", zmin, "zmax", zmax, "nverts", n)`.
   Expected correct: zmin≈730, zmax≈1460 → height 730. If you see zmin≈0
   zmax≈1460, the code mixed local(0..730) and world(730..1460) copies → that
   confirms double-collection; fix by collecting only the transformed
   sub-block faces (apply INSERT transform exactly once, do not also include the
   untransformed faces).

## After fixing
- Door heights: 730 / 478 / 466 (NOT 1347/1645).
- Overall: **900 × 2280 × 580**.
- Sides 2280; holes unchanged (sides 76, doors 12).
- 3D preview = correct oven tower.
- `npm run build` passes. Commit: "Fix: panel size = local extent, exclude
  placement offset; resolves door/overall inflation".

## Report back the [door dbg] zmin/zmax line and the console.table door rows so
Samer can confirm doors now read 730/478/466 and overall 900×2280×580.
Remind Samer: hard refresh the BROWSER (Ctrl+Shift+R) after rebuild — the parser
runs client-side, so the browser bundle must reload, not just the server.
