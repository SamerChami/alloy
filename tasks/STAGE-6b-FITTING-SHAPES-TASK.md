# Stage 6b — Smart fitting shapes in 3D (Claude Code)

Improve how FITTINGS render in the cabinet 3D (`components/Cabinet3D.tsx` /
`lib/cabinet3d.ts`). Currently every part is a box; fittings look wrong (a round
leg as a box, an L-shaped Gola channel as a flat slab). Use cheap, name-based
shape rules from the bounding-box data we already have — NO mesh export needed.
PANELS stay as boxes (panels really are flat boards — already correct).

Read `CLAUDE.md` and the current Cabinet3D first. This is cosmetic/visual only;
do not change parsing, dimensions, BOM, or positions.

## Shape rules (by leaf/part name, case-insensitive)
Apply to a part's bounding box (raw size {x,y,z} at pos, with the same Z-up
mapping already used). Replace the box mesh with a fitted primitive sized to the
bounding box:

- **Leg** (name contains "leg") → a **cylinder** standing vertically:
  radius ≈ min(boxWidth, boxDepth)/2, height = the tallest box extent. Add a
  thin wider disk at top (flange) and bottom (foot) if cheap (optional). Color:
  dark grey (legs are usually black/grey plastic).
- **L_Channel / Gola L** (name contains "l_channel") → an **L-shaped profile**
  extruded along its longest axis: build an L cross-section (two thin rectangles
  meeting at a right angle) and extrude it the length of the longest extent.
  Orient the L so the long axis matches the part's longest bounding-box axis.
- **U_Channel / Gola U** (name contains "u_channel") → a **U-shaped profile**
  extruded similarly (three-sided channel).
- **P2O** (name contains "p2o") → a small **cylinder** (push-to-open plunger);
  it's tiny, a simple cylinder is fine.
- **Hinge / Atira / Basket / other fittings** → leave as a box for now (a
  reasonable placeholder), distinct subtle color so they read as hardware not
  carcass.
- **Everything else / panels** → unchanged box with edges (current look).

Implementation: a helper `fittingMesh(part)` that returns the right THREE
geometry based on the name; default to BoxGeometry. Build L/U cross-sections with
`THREE.Shape` + `ExtrudeGeometry` (or assemble from 2–3 boxes if Extrude is
fiddly — assembling thin boxes into an L is perfectly acceptable and simpler).
Keep it lightweight; this runs for many parts.

## Keep working
- All Stage 5c/5d/5e controls (pan/zoom/rotate, shaded/wireframe, modal,
  reset/explode/show-doors), real positions, recenter, dispose on unmount.
- Wireframe mode should still work for the new shapes.
- Doors/panels unchanged.

## Acceptance
- Legs render as vertical cylinders at the cabinet corners; L_Channel renders as
  an L profile; U_Channel as a U; P2O as a small cylinder. Panels still boxes.
- No performance regression on a full cabinet. `npm run build` passes.
- Commit: "Stage 6b: smart fitting shapes (cylinder legs, L/U channels) in 3D".

Test with a cabinet that has legs + an L_Channel (e.g. the BDR.K3.120 import)
and confirm the fittings look more like their real shapes. Panels unaffected.

## Note
Grooves/rabbets in panels are a SEPARATE upcoming feature requiring richer export
data (the bounding box doesn't contain them) — do NOT attempt grooves here.
