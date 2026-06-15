# Stage 4e-DEPTH — Add door thickness to cabinet depth (Claude Code)

The importer now derives correct overall W=900, H=2280, but D=560 (carcass
side depth only). The TRUE cabinet depth is 580 because the door sits on the
front face, adding its thickness + a small reveal.

## Fix in `lib/dxf/polyboardImport.ts`
Where overall depth D is derived (currently = side panel's depth extent, 560),
change it to:

```
D = carcass_side_depth + front_thickness + reveal
```

where:
- `carcass_side_depth` = the side panel's depth extent (560), as now.
- `front_thickness` = thickness of a door/front panel if any door/front panels
  exist (here 18). Find it from the panels whose role is `door`/`drawer_front`
  (their thickness, the smallest extent). If multiple, use the max door
  thickness. If NO door/front panels exist, front_thickness = 0.
- `reveal` = 2 (small constant standoff between door back and carcass front).
  Only add the reveal when front_thickness > 0.

Verified: 560 + 18 + 2 = **580** (matches the PolyBoard PDF header exactly).

For a cabinet with NO doors (e.g. open shelving), D stays = carcass depth (no
front added). Keep that behavior.

The user can still edit D in the form. Log it:
`console.log("[depth]", {carcass: carcass_side_depth, front: front_thickness, total: D})`.

## Acceptance
- Re-importing T-OV-MIC-D2-90.dxf shows **D = 580** (W=900, H=2280 unchanged).
- A door-less cabinet would show D = carcass depth only.
- `npm run build` passes. Commit: "Fix: cabinet depth = carcass + door thickness".

Hard refresh browser (Ctrl+Shift+R) after rebuild. Report the [depth] line.
