# Stage 4d-POLISH — Clean 3D assembly from roles (Claude Code)

The import 3D currently looks scattered (shelf juts out the side, doors float).
Because this Polyboard DXF is a FLAT LAYOUT, the 3D must be SYNTHESIZED from each
panel's ROLE + SIZE inside the derived cabinet box (W×H×D), ignoring the DXF's
scattered positions entirely. Fix `lib/cabinet3d.ts` (and how `Cabinet3D`
consumes it) so it assembles a clean, recognizable cabinet.

Coordinate convention: X = width (left→right), Y = height (floor→top),
Z = depth (back→front). Units meters (mm/1000). Cabinet box = W × H × D with
origin at the back-bottom-left corner. `thick` = carcass thickness (default 18mm).
`back_t` = back panel thickness (default 8mm). `front_t` = door thickness (18mm).

## Placement rules by role (apply to ALL panels, override DXF positions)

- **side_left**: box sized (thick, H, D). Position so its outer face is at X=0:
  center x = thick/2, y = H/2, z = D/2.
- **side_right**: center x = W − thick/2, y = H/2, z = D/2.
- **top**: box (W − 2·thick, thick, D). Center x = W/2, y = H − thick/2, z = D/2.
- **bottom**: box (W − 2·thick, thick, D). Center x = W/2, y = thick/2, z = D/2.
- **back**: box (W − 2·thick, H − 2·thick, back_t). Center x = W/2, y = H/2,
  z = back_t/2 (against the back). If multiple backs, stack/centre them simply;
  don't scatter.
- **shelf**: box (W − 2·thick, thick, D − back_t − front_t). Distribute shelves
  EVENLY in the interior height: for N shelves, place them at
  y = H * (k)/(N+1) for k = 1..N. Center x = W/2, z = (back_t + (D−front_t))/2.
  (Even distribution — the DXF has no real heights.)
- **divider_v**: vertical box (thick, H − 2·thick, D − back_t). Place centered
  (x = W/2) unless multiple, then distribute across width. z like shelves.
- **door** / **drawer_front**: box (leaf_w, leaf_h, front_t) on the FRONT face,
  z = D − front_t/2. Lay the door leaves across the front: split the width among
  the door leaves left→right, and stack vertically by leaf height so they cover
  the front like real doors. Don't place them floating off to the side. If the
  exact arrangement is ambiguous, tile them bottom-up, left-right across the
  front face within the W×H envelope.
- **other**: skip from the 3D (or render faint), never let it break layout.

## Robustness
- Use each panel's REAL size where the rule says "leaf_w/leaf_h" (so split door
  leaves show at 447×730 etc.). For carcass parts, size from the rule + cabinet
  box (not the DXF position).
- Never use the DXF pos/offset for placement in this synthesized view.
- Dispose three.js geometries/materials on unmount (no leaks).
- Keep Reset view / Explode / Show doors working. "Show doors" toggles the
  door/front meshes. "Explode" offsets each piece outward along its placement
  normal (sides out in X, top/bottom in Y, doors out in Z) by a small gap.

## Acceptance
- Importing T-OV-MIC-D2-90.dxf shows a clean oven tower: two tall sides, capped
  top & bottom, shelves stacked inside dividing it into compartments, six door
  leaves flat across the front (toggle-able), back panel behind.
- Nothing juts out sideways; no floating parts.
- `npm run build` passes. Commit: "Polish: synthesize clean 3D cabinet from
  roles, ignore DXF layout positions".

Hard refresh (Ctrl+Shift+R) after rebuild.

## Note to Samer
This synthesized 3D is a clean schematic of the cabinet (correct parts, sensible
arrangement) — shelf heights are evenly distributed because the flat-layout DXF
doesn't contain real assembled positions. If you later export an ASSEMBLED 3D
DXF from Polyboard, we can use true positions for an exact model.
