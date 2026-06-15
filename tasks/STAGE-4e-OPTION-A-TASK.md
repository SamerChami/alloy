# Stage 4e-OPTION-A — Cabinet dims from panel sizes + split door leaves (Claude Code)

ROOT CAUSE (now fully diagnosed against the real file): this Polyboard DXF is a
FLAT PARTS LAYOUT, not an assembled cabinet. Each panel sits at its own scattered
position (Top at z≈4549, doors at z≈4321, etc.), so deriving overall cabinet
size from the global vertex bounding box gives garbage (1800×4560×1132). The
per-panel SIZES are correct, but their POSITIONS are a nesting layout, not an
assembly.

Two fixes, both verified to produce correct numbers:

## FIX 1 — Split multi-leaf panel blocks into separate panels
A "Door 1 (Double)" block contains TWO INSERTs = two door leaves placed side by
side (that's why the block spans 1347mm: two 447mm leaves apart). Each leaf is a
real, separate panel.

Rule: when a panel block has **N INSERT children to face sub-blocks**, treat EACH
INSERT as its own panel/leaf. Each leaf's size = the bbox of THAT sub-block's
faces (with that one INSERT's offset applied). Do NOT union multiple leaves into
one panel.

Verified result for this file:
- Door 1 (Double) [1] → 2 leaves, each **447 × 730 × 18**
- Door 1 (Double) [2] → 2 leaves, each **447 × 478 × 18**
- Door 1 (Double) [3] → 2 leaves, each **148.5 × 466 × 18**
(Matches the PDF cutting list: doors are 730×447, 478×447, qty per leaf.)

Name the split rows e.g. "Door 1 (Double) [1] — L" / " — R" (or append leaf
index). Holes: distribute by which leaf each CIRCLE falls in if easy; otherwise
put the block's hole count on the first leaf and 0 on the rest, and note it.
Keep qty=1 per leaf.

For NON-door panels that have a single face sub-block, behavior is unchanged
(one panel). Only multi-INSERT blocks split.

## FIX 2 — Derive OVERALL cabinet dimensions from CARCASS PANEL SIZES
Do NOT use the global vertex bounding box for overall dims (positions are a flat
layout). Instead derive from carcass panel SIZES (position-independent):

Let `thick` = carcass panel thickness (the most common thickness among
side/top/bottom, here 18).
- **Height H** = the largest extent among the SIDE panels
  (role side_left/side_right). Here 2280.
- **Width W** = (top/bottom panel's largest extent) + 2 × thick.
  Here 864 + 36 = 900.
- **Depth D** = the side panel's middle extent (its depth dimension).
  Here 560. (Optionally add a small front standoff; PolyBoard header lists 580.
  Use the side depth, 560, unless a back/door offset is trivially available.)

Fallbacks if a role is missing:
- No sides → H = max extent across all carcass panels.
- No top → W = max width among shelves + 2×thick.
- No side → D = max middle-extent among shelves.

Verified: this yields **H=2280, W=900, D=560** for the sample (header says
900×2280×580 — H & W exact; D 560 vs 580 is the door standoff, acceptable).

The form fields and 3D should use THESE derived dims. The user can still edit
them. (If the user typed/edited values, respect those.)

## Implementation notes
- In `lib/dxf/polyboardImport.ts`: change the panel loop so multi-INSERT blocks
  emit multiple `ImportedPanel`s (one per leaf). Compute each panel's size from
  its own faces (sorted extents → thickness/width/height) — this already works
  per leaf.
- Replace the overall-dims computation (the gMin/gMax global union) with the
  carcass-size derivation above. Remove or keep-but-ignore the global union.
- Keep the dev console.table; ADD a line:
  `console.log("[overall derived]", {W, H, D})`.

## 3D preview caveat (tell Samer)
Because positions are a flat layout, the 3D can't show a true assembly from this
DXF. Build the 3D from the ROLES + derived cabinet box (place sides/top/bottom/
shelves/doors by role into the derived W×H×D box, as the Stage 4d geometry rules
already do) — i.e. SYNTHESIZE the assembly from roles + sizes, ignoring the
DXF's scattered positions. This gives a correct-looking cabinet.

## Acceptance (verify against these exact numbers)
- Overall dims: **900 × 2280 × 580** (D may read 560 — acceptable).
- Door leaves split: 447×730 (×2), 447×478 (×2), 148.5×466 (×2).
- Sides 2280; Top/Bottom 864×545.5; holes intact (sides 76, each door block 12).
- 3D = recognizable oven tower (synthesized from roles, not DXF positions).
- console.table + `[overall derived]` print the right values.
- `npm run build` passes. Commit: "Fix: derive cabinet dims from carcass sizes;
  split door leaves; synthesize 3D from roles".

Tell Samer to HARD REFRESH the browser (Ctrl+Shift+R) after rebuild (parser runs
client-side). Then report the [overall derived] line and the door rows.
