# Stage 4d — Live 3D Cabinet Preview (task for Claude Code)

Read `CLAUDE.md`, `db/05_bom.sql`, and `lib/pricing.ts` first. The BOM auto-
pricing engine (Stage 4c) is built. Now add a **live, rotatable 3D preview** of
the cabinet that updates as the user adds/edits panel parts — like a simplified
Polyboard view (boxes only; NO drill holes, hinge cups, or joinery).

Follow CLAUDE.md conventions (i18n en+ar, existing styles, RTL-safe, office-only
editing of products).

## Approach
Use **three.js** (already allowed; install `three` and `@types/three`). Render an
interactive `<canvas>` with orbit controls (rotate/zoom/pan) inside the product
editor, beside or below the BOM table. Each panel BOM line is drawn as a thin
box at its real dimensions and position. The preview is **derived** from the BOM
+ the cabinet's overall dimensions — it is a visualization, not stored geometry.

## Part 1 — Small schema addition: `db/06_part_role.sql`
(New migration file; Samer runs it in Supabase — remind him.)
Add to `bom_lines`:
- `part_role text` — one of:
  `side_left, side_right, top, bottom, back, shelf, divider_v, door, drawer_front, other`
- `depth_mm numeric(10,2)` — part depth (front-to-back). Optional; fall back to
  cabinet depth.
- `pos_offset_mm numeric(10,2)` — optional vertical (for shelves) or horizontal
  (for dividers) offset from the cabinet origin, so multiple shelves/dividers
  can be placed. Nullable.
Also ensure `products` has overall `width_mm, height_mm, depth_mm` (the existing
dimension columns) — these define the carcass bounding box. If missing for a
product, the preview uses the bounding box of the parts.

## Part 2 — Geometry rules (implement in `lib/cabinet3d.ts`)
Given cabinet overall W×H×D (mm) and a list of panel parts (role, w, h, depth,
thickness, qty, offset), produce an array of boxes `{w,h,d,x,y,z,role}` in a
right-handed scene (units = meters; divide mm by 1000). Use panel thickness from
the panel material if available, else default 18mm. Place by role:

- **side_left**: box (thickness × H × D) at left edge (x = +thickness/2).
- **side_right**: box (thickness × H × D) at right edge (x = W - thickness/2).
- **top**: box (W-2·thickness × thickness × D) at top (y = H - thickness/2),
  sitting between the sides.
- **bottom**: same as top at y = thickness/2.
- **back**: box ((W-2·thickness) × (H-2·thickness) × thickness) at rear
  (z = thickness/2), inset between sides/top/bottom.
- **shelf**: box ((W-2·thickness) × thickness × (D-back_thickness)) at vertical
  position from `pos_offset_mm` (or distribute evenly if multiple shelves and no
  offset given).
- **divider_v**: vertical box (thickness × (H-2·thickness) × D) at horizontal
  position from `pos_offset_mm` (or centered).
- **door**: box (panel_w × panel_h × thickness) on the front face
  (z = D - thickness/2), using the part's own width/height; if two doors,
  split width and offset left/right.
- **drawer_front**: like a door but shorter; stack by offset.
- **other**: render at origin with a distinct subtle color; don't fail.

Rules: never throw on missing data — use sensible fallbacks. If a part has no
role, infer from `part_name` keywords (e.g. "side", "shelf", "door", "back",
"top", "bottom", "divider") case-insensitively; else treat as `other`.

## Part 3 — The 3D component `components/Cabinet3D.tsx` (client)
- Props: cabinet dims + parsed parts (pass the BOM lines from the editor state).
- Render three.js scene: soft ambient + one directional light; panels as
  `MeshStandardMaterial` light grey (#D9D5CE-ish) with darker edges
  (EdgesGeometry) so parts read clearly — matches the brand's muted palette.
- Orbit controls (implement lightweight orbit; three's OrbitControls may be
  unavailable in some setups — if so, write a minimal custom orbit/zoom). Start
  at a 3/4 perspective like the reference images.
- A small toolbar: reset view, toggle "explode" (separate panels slightly along
  their normals to show construction), toggle doors on/off.
- Resize-aware; dispose geometries/materials on unmount (no memory leaks).
- Updates reactively as the BOM editor state changes (re-derive boxes when parts
  change) — debounce light so typing dimensions feels live but not janky.

## Part 4 — Wire into the product editor
- In the panel-part row form (from Stage 4c), add a **Role** select and a
  **Depth (mm)** and optional **Offset (mm)** field.
- Show `Cabinet3D` in the editor, updating live from the current parts.
- Performance: cap at a reasonable part count; this is a preview, not CAD.

## i18n
Add labels: "3D preview", "Reset view", "Explode", "Show doors", "Role", part
role names (Left side, Right side, Top, Bottom, Back, Shelf, Vertical divider,
Door, Drawer front, Other), "Depth", "Offset" — in BOTH en and ar.

## Acceptance
- `npm run build` passes; `three` added to package.json.
- After Samer runs `db/06_part_role.sql`: creating a cabinet and adding parts
  (2 sides, top, bottom, back, a shelf, two doors) shows a recognizable 3D
  cabinet that rotates/zooms; explode and door-toggle work.
- Editing a part's dimensions updates the model live.
- No crashes on missing roles/dims (fallbacks work); disposes cleanly.
- Bilingual + RTL; office-only editing; no hardcoded strings.
- Commit: "Stage 4d: live 3D cabinet preview (three.js)".

When done: run the build, (a) remind Samer to run `db/06_part_role.sql`,
(b) 3-line summary, (c) exact steps to build the sample tower from the reference
(two upper doors, open niche, mid bay, worktop, lower two doors) and confirm it
looks right.

## Note to relay to Samer
This is a simplified box preview to visualize construction and verify parts — it
intentionally does NOT reproduce Polyboard's drill maps, hardware, or exact
joinery. For true production tooling, keep using Polyboard and attach its
images/exports to the product (we can add file attachment next).
