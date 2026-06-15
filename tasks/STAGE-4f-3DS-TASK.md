# Stage 4f — Switch importer to .3ds (assembled geometry) — Claude Code

Replace the Polyboard DXF geometry parsing with a **.3ds parser**. The .3ds
export is fully ASSEMBLED with real positions — no flat-layout problem, no
synthesis, no dimension derivation. Verified against the real file:
overall bbox = **900 (X) × 580 (Y) × 2280 (Z)** exactly.

Read `CLAUDE.md`, `lib/cabinet3d.ts`, and the existing
`app/(app)/products/import/ImportShell.tsx` first. Keep the SAME import UI,
preview table, 3D, and "Create product" flow — only swap the parser + use real
positions.

## VERIFIED .3ds facts (build to these)
- Binary chunk format. Root chunk id `0x4D4D` (MAIN), spans whole file.
- Hierarchy: MAIN(0x4D4D) → EDIT3DS(0x3D3D) → NAMED_OBJECT(0x4000, name is a
  null-terminated string) → TRIMESH(0x4100) → VERTEX_LIST(0x4110) and
  FACE_LIST(0x4120).
- VERTEX_LIST(0x4110): uint16 count, then count × 3 float32 (x,y,z) in mm.
- FACE_LIST(0x4120): uint16 count, then count × 4 uint16 (a,b,c,flags); use a,b,c.
- **Axis map: X = width, Y = depth, Z = height.** (3ds Max Z-up.) Map to our
  app convention width/height/depth accordingly.
- 21 named objects in the sample; door leaves are SEPARATE objects already:
  "Door 1 (Double) [1]" appears twice (the two leaves), etc.
- All positions are REAL/assembled (e.g. Left Side center x≈9, Right Side x≈891;
  Bottom z≈10, Top z≈2270; shelves at true heights 308/725/1338/1806; trays at
  z≈1572; doors on front at y≈9).

## Part 1 — parser `lib/3ds/threeDsImport.ts`
Pure function `parse3ds(buffer: ArrayBuffer): ParseResult` returning the SAME
shapes the UI already uses (reuse `ImportedPanel`, `ImportedCabinet`,
`ParseResult` from the DXF module — or move those types to a shared file and
import in both). For each NAMED_OBJECT:
- Read its vertices (apply nothing — they're already world/assembled).
- Compute its bbox. Panel SIZE = three extents; thickness = smallest extent;
  the other two map to width/height per axis. POSITION = bbox center, mapped
  (px = X center, py = Z center as HEIGHT, pz = Y center as DEPTH) — i.e. carry
  real assembled position into `pos`.
- holeCount: 0 (the .3ds has no holes; holes come from DXF later). materialRef:
  guess from thickness (≤12 → back/8mm, else carcass; name contains door/front →
  front) — same heuristic as before.
- part_role: infer from the object name (same keyword rules as the DXF importer:
  left/right/top/bottom/back/shelf/tray/door/divider/space…). Strip the trailing
  numeric index from the name for display + role inference, but KEEP leaf
  duplicates as SEPARATE panels (do not merge the two door meshes).
- qty = 1 per object/leaf.

Overall cabinet dims = the GLOBAL bbox across all meshes, mapped:
width = X extent (900), depth = Y extent (580), height = Z extent (2280).
NO carcass-derivation, NO door-thickness addition — the .3ds already includes
everything. Verified: 900 × 580 × 2280.

Robustness: chunk walker must skip unknown chunks by their length; never read
past a chunk end; tolerate objects with no TRIMESH (skip with a warning).

## Part 2 — Import UI
- Accept `.3ds` (and keep `.dxf` working if trivial, but primary is now .3ds —
  update the dropzone text/accept attr to `.3ds`).
- Parse with `parse3ds` on file load; everything downstream (name, dims table,
  3D, create) stays the same.
- Read file as ArrayBuffer (`await file.arrayBuffer()`), not text.

## Part 3 — 3D preview uses REAL positions now
`Cabinet3D` should place each panel at its **actual `pos`** from the .3ds (mapped
axes), with its real size — NOT the role-synthesized layout. This yields an exact
model: true shelf heights, real door positions. Keep Reset/Explode/Show-doors.
(Role is still used for Show-doors filtering and coloring, but placement = real
pos.)

## Acceptance (verify against these)
- Importing `T-OV-MIC-D2-90.3ds`: overall **W=900, H=2280, D=580**.
- 21 panels listed; door leaves split (Door [1] ×2 at left/right, etc.);
  sides 2280, trays at worktop height, shelves at real heights.
- 3D shows an ACCURATE oven tower (real shelf positions, doors on front).
- `npm run build` passes. Commit: "Stage 4f: .3ds importer with assembled
  geometry + real 3D positions".

## Notes to relay to Samer
- .3ds gives geometry + real positions but NO holes/materials/banding. Those
  still come from the DXF/PDF. Since .3ds object names match DXF panel names, we
  can later MERGE: import .3ds for geometry, then match DXF by name to attach
  hole counts + materials. (Future task — not now.)
- Hard refresh (Ctrl+Shift+R) after rebuild.

Report back: the overall dims and a couple of panel positions (e.g. a shelf
height) so we confirm real assembled positions are flowing through.
