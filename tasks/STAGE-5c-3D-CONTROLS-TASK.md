# Stage 5c — Cabinet3D controls + view modes (Claude Code)

Improve the 3D viewer (`components/Cabinet3D.tsx`, and `lib/cabinet3d.ts` if the
controls live there). This is a self-contained UI/interaction update — do NOT
change geometry, dimensions, or the parsers. Read `CLAUDE.md` and the current
`Cabinet3D` first.

## 1. Scroll capture (mouse wheel)
When the cursor is INSIDE the 3D canvas/window, the mouse wheel must **zoom the
model only** and NOT scroll the page. When the cursor is outside, the wheel
scrolls the page as normal.
- Attach the wheel listener to the canvas/container with `passive: false` and
  call `e.preventDefault()` + `e.stopPropagation()` so the page doesn't scroll
  while zooming.
- On pointer leave, normal page scroll resumes (don't globally block scroll).

## 2–4. Mouse button mapping (match SketchUp/CAD feel)
- **Left button drag** → PAN the cabinet (translate the view).
- **Mouse wheel scroll** → ZOOM in/out (toward cursor or scene center).
- **Middle button (wheel click) drag** → ROTATE/orbit the cabinet.
- **Right button drag** → ALSO rotate (backup for laptops without a middle
  button). Suppress the browser context menu on the canvas
  (`oncontextmenu = e => e.preventDefault()`).
Implement clean pointer handling (pointerdown/move/up, track which button via
`e.button`: 0=left/pan, 1=middle/rotate, 2=right/rotate). Release capture on
pointerup; handle the cursor leaving mid-drag gracefully.

(Current scheme may differ — REPLACE the drag/zoom mapping with the above. Keep
it smooth; clamp zoom to sane min/max; keep the model from flipping past poles
on orbit if easy.)

## 5. View-mode buttons (top-right) — ADD, don't remove existing
Add two buttons in the top-right control area, ALONGSIDE the existing
**Reset view / Explode / Show doors** (keep those working):
- **Shaded** — solid MeshStandardMaterial panels with edge lines (current look).
- **Wireframe** — render panels as wireframe (edges only / `wireframe: true`
  material, or show only the EdgesGeometry line segments and hide the solid
  meshes).
- These two are a toggle pair (radio-like): one active at a time. **Shaded is
  the DEFAULT** on load. Highlight the active one.

## Acceptance
- Cursor over the 3D + wheel = zoom, page does NOT scroll. Cursor outside =
  page scrolls normally.
- Left-drag pans; middle-drag and right-drag both rotate; wheel zooms.
- No browser context menu pops up on right-drag inside the canvas.
- Shaded (default) and Wireframe buttons toggle the view; Reset/Explode/Show-
  doors still work.
- Works in the .3ds import 3D AND the SketchUp import 3D (same component).
- `npm run build` passes. Bilingual labels for "Shaded"/"Wireframe"
  (ar: "مظلّل" / "هيكلي" or similar). 
- Commit: "Stage 5c: Cabinet3D pan/rotate/zoom controls + shaded/wireframe view".

Dispose any added materials/geometries on unmount. Hard refresh (Ctrl+Shift+R)
to test after rebuild.
