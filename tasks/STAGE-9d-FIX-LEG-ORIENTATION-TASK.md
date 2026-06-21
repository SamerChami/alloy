# Stage 9d — Fix leg/cylinder fitting orientation (Claude Code)

Legs render as squat cylinders lying on their side at varied angles (see
screenshot) instead of standing upright. SURGICAL viewer-only fix — do NOT touch
the Ruby extension, the schema, parsers, or panel/cut logic. Two files only:
`components/Cabinet3D.tsx` and `lib/cabinet3d.ts`. Make targeted edits; do not
rewrite either file wholesale (avoids the output-token limit).

## Root cause (verified against `alloy_export_0_5_0.json`)
A `Leg_12cm` leaf has `size_mm = {x:60, y:60, z:110}`, identity `axes`, centre at
`z≈55` (so it spans z 0–110 — already vertical/upright in SketchUp Z-up). Two bugs
combine in the viewer:

1. **Wrong height axis.** `buildFittingObject` builds the leg as
   `CylinderGeometry(r, r, h, 20)` where `h = box.h`. A three.js cylinder's length
   runs along its LOCAL Y. But `box.h` (= `su_height_mm` = `size_mm.y` = 60) is NOT
   the leg's tall axis — the tall extent is `size_mm.z = 110`, which arrives as
   `box.d`. So the cylinder is built 60 tall × ~110 across: a squat disk.
2. **Inherited panel orientation.** The cylinder-fitting branch then has
   `box.orient` applied at the call site (`obj.quaternion.setFromRotationMatrix`).
   For an identity-axes part, `orient = C = (su.x, su.z, -su.y)`, which maps the
   cylinder's local Y onto three's Z (horizontal). So even a correctly-built
   cylinder would be laid flat.

A leg (and a P2O plunger) is radially symmetric about its long axis and is ALWAYS
vertical in the assembled cabinet. It does not need — and is broken by — the part's
full orientation basis. It just needs to stand on three-Y at `pos`.

## The fix

### 1. `lib/cabinet3d.ts` — flag cylinder fittings so the renderer skips `orient`
We need the renderer to know a box is a "stand-up cylinder" fitting. Add an
OPTIONAL boolean to the `Box3D` type (find its definition) — e.g.
`uprightCylinder?: boolean`. Do not reorder or rename existing fields.

In the place(s) that emit `Box3D` for SketchUp parts — at minimum
`buildBoxesFromOrientedPanels`, and the same `boxes.push({...})` sites in the other
build paths if trivial — set `uprightCylinder: true` when the part name marks a
radially-symmetric fitting. Add a tiny helper near the top of the file:

```ts
// Radially-symmetric fittings that always stand vertical (ignore part orientation).
export function isUprightCylinderFitting(name: string): boolean {
  const n = (name || "").toLowerCase();
  return n.includes("leg") || n.includes("p2o");
}
```

Where the oriented path builds each `boxes.push(...)`, include:
`uprightCylinder: isUprightCylinderFitting(p.part_name)`.
(For the non-oriented SketchUp paths, set it too if the push site is obvious; if
not, skip — the corner cabinet is a v5/oriented import, so the oriented path is the
one that matters here.)

### 2. `components/Cabinet3D.tsx` — build the cylinder upright, skip `orient`
In the fitting branch (where `fittingColor(name) !== null` and it calls
`buildFittingObject(name, box.w, box.h, box.d, isWireframe)`):

- When `box.uprightCylinder` is true, **do NOT apply the `box.orient` matrix** to
  `obj`. Only set `obj.position`. (Guard the existing
  `if (box.orient) { ...setFromRotationMatrix... }` with
  `if (box.orient && !box.uprightCylinder)`.)

### 3. `components/Cabinet3D.tsx` — `buildFittingObject`, cylinder height from MAX extent
In the cylinder branch:

```ts
if (n.includes("leg") || n.includes("p2o")) {
  const dims = [w, h, d].sort((a, b) => a - b); // ascending
  const height = dims[2];                        // tallest extent = cylinder length
  const r      = dims[1] / 2;                     // mid extent → radius (≈ the other two)
  addPartToGroup(g, new THREE.CylinderGeometry(r, r, height, 20), color, wireframe);
  return g;
}
```

A three.js CylinderGeometry is already aligned to local Y, and three-Y is world-up,
so with `orient` skipped the leg stands upright automatically. Centre stays at
`pos` (legs sit at their true x/y, and their z-centre puts them at floor level).

## Do NOT change
- The L_Channel / U_Channel branch (separate Stage 9e fix via exported outline).
- Panel boxes, cut meshes, the orient matrix for panels and channels.
- Recenter/min-corner logic, explode, controls.
- The Ruby extension or JSON schema.

## Acceptance
- Re-viewing the corner cabinet `BC2.K3.120*120` (v5 import): all legs stand
  UPRIGHT as vertical cylinders at the cabinet's base, consistent size, none lying
  on their side or tilted.
- P2O plungers (if present in other cabinets) also render upright.
- Panels, doors, channels, cuts unchanged. Wireframe mode still works for legs.
- Non-leg fittings (hinges, baskets → boxes) unchanged.
- `npm run build` passes. Commit: "Stage 9d: legs/P2O render as upright cylinders
  (ignore part orientation for radially-symmetric fittings)".

Hard refresh (Ctrl+Shift+R) after rebuild. Report back whether the legs stand up.
