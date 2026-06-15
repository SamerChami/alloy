# Stage 4f-POLISH — 3D rendering quality (Claude Code)

IMPORTANT: the .3ds geometry is CORRECT. I verified every panel sits cleanly
within the 900×2280×580 envelope (nothing out of bounds). So do NOT change
positions or sizes or the parser. This task is ONLY about how `Cabinet3D`
RENDERS the panels, to fix the visual issues (thin slivers, doors looking
edge-on/missing, parts seeming to float).

## Verified geometry (for your reference — already correct)
- Sides: x 0–18 and 882–900, full height. Top/Bottom cap. ✓
- Shelves: full-width slabs at real heights (299, 716, 1329, 1797). ✓
- TRAY [1]/[2]: NARROW 18mm vertical pieces at x≈150 and x≈750, z 1347–1797
  (worktop side supports) — they are SUPPOSED to be thin. ✓
- Doors: 6 leaves on the front face y 0–18, full leaf sizes. ✓
- Backs: thin pieces at the rear (y≈538–546). ✓

## Rendering fixes in `components/Cabinet3D.tsx`
1. **Solid shaded panels with visible edges.** Each panel = a `BoxGeometry` at
   its real size/position, `MeshStandardMaterial` light grey (#D9D5CE-ish),
   PLUS `EdgesGeometry`/`LineSegments` outline in a darker tone so thin pieces
   (trays, backs, doors) read as solid boxes, not floating lines/slivers.
2. **Doors visible by default.** "Show doors" should START ON. When on, render
   door/drawer_front leaves as solid light panels on the front face. Right now
   they look edge-on/missing — ensure they get a Box (thickness along depth) and
   are shaded. When toggled off, hide them so the interior is visible.
3. **Lighting that shows depth.** One key directional light + soft ambient +
   maybe a subtle hemisphere light, so faces read with gentle shading (avoid
   flat silhouette where thin parts disappear). Enable basic shadows OR at least
   distinct face shading; don't rely on deprecated PCFSoftShadowMap (the console
   warns) — use PCFShadowMap or no shadow map.
4. **Slight transparency option for fronts (optional):** when "Show doors" is on,
   render doors at ~0.85 opacity so the interior shelves are faintly visible —
   helps confirm the build. Keep it optional/toggle if easy.
5. **Camera framing:** Reset view should frame the whole 900×2280×580 box nicely
   (3/4 front-top angle), centered, with the cabinet upright (height = vertical
   on screen). Confirm the up-axis is correct so it stands tall (it currently
   does — keep it).
6. **Explode:** offset each piece along the correct axis by piece type
   (sides outward in width, top/bottom in height, doors/backs outward in depth)
   so an exploded view is legible.

## Keep
- Real positions from the .3ds (do NOT switch back to role-synthesized layout).
- Dispose geometries/materials on unmount.
- Reset / Explode / Show doors controls.

## Acceptance
- The oven tower renders as SOLID panels with crisp edges; thin trays/backs look
  like real thin boards, not floating lines.
- Doors visible on the front by default; toggling "Show doors" reveals/hides
  them and shows the interior shelves.
- No deprecated-shadowmap console warning.
- `npm run build` passes. Commit: "Polish: solid shaded 3D panels, visible doors,
  better lighting".

Hard refresh (Ctrl+Shift+R) after rebuild.
