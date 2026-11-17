# Stage 19b — Viewer: both sides of every face, and SketchUp navigation

**Model:** Sonnet. One file of app code: `components/Cabinet3D.tsx` (+ i18n).
No database, no extension, no change to `lib/cabinet3d.ts` or to how geometry
is built or placed.
**Phase:** 2. Requires 19a COMMITTED first (do not start on an uncommitted 19a).

## Why
A. **See-through bottom edge (Samer, 17 Nov).** Seen from below, the left and
   right side panels have no bottom edge. Measured in
   `tasks/test-exports/Accessories_Codes.json`: in the meshes of `Left_Side`
   and `Right_Side`, every triangle of the bottom end face (18 × 560 mm,
   local z = 10.1) has its normal pointing INTO the panel — a reversed face
   from the SketchUp model. The viewer's materials are one-sided, so a
   reversed face is invisible from outside. SketchUp itself draws both sides
   of every face. Decision (Samer): the viewer draws both sides now; the
   exporter will also correct reversed faces in the next extension version
   (Stage 19c, not here).
B. **Navigation must match SketchUp exactly (Samer, 17 Nov).** Today: left
   drag pans, middle/right drag orbits, wheel zooms towards the centre.
   Assumption made by Claude (Samer did not pick an option): SketchUp's mouse
   behaviour AND SketchUp's navigation tool buttons.
C. **Reset view bug (tester).** The viewer opens at `theta = 1.75π`
   (front-left) but "Reset view" sets `0.75π` (back-right).

Geometry rule that still applies: do NOT touch any matrix, orientation,
`matrixAutoUpdate`, vertex or position code. This stage changes materials'
`side` and the camera/pointer code only.

---

## Step 1 — Claude Code (Sonnet)

### A. Draw both sides
In `components/Cabinet3D.tsx` add `side: THREE.DoubleSide` to every
`THREE.MeshStandardMaterial` that draws a part's own geometry:
- the material in `addPartToGroup` (fittings, meshes, channel profiles);
- the main panel material (`color: ROLE_COLOR[box.role] …`, the one with
  `transparent: isDoor`), and the other panel material created with
  `ROLE_COLOR[box.role]`.
Do NOT add it to the cut / tooling recess materials (`color: 0x8A857C`) or to
their cloned disc materials: those are drawn as separate faces on purpose
and double-siding them risks z-fighting. Nothing else in the drawing code
changes. `computeVertexNormals` stays as it is.

### B. SketchUp navigation
All in `Cabinet3D.tsx`. Keep `orbitRef` (`theta, phi, radius, cx, cy, cz`)
and `updateCamera` as the camera model. Keep the existing signs of orbit
(`theta -= dx * 0.008`, `phi -= dy * 0.008`, same clamp): dragging down
looks from above, as in SketchUp.

**B.1 Tools.** New state `tool: "select" | "orbit" | "pan" | "zoom"`,
default `"select"`.

**B.2 Mouse (exactly SketchUp's):**
| Input | Action |
|---|---|
| Middle button drag | Orbit |
| Shift + middle button drag | Pan (Shift is read on every move, so pressing / releasing it mid-drag switches, like SketchUp) |
| Wheel | Zoom towards the point under the cursor; wheel up = zoom in |
| Left button drag | The active tool: Select = nothing; Orbit = orbit (Shift = pan); Pan = pan; Zoom = drag up zooms in, drag down zooms out (towards the centre of the view) |
| Right button | Nothing (no orbit). Keep suppressing the browser context menu on the canvas. |

Implementation notes:
- In `onPointerDown` store the button; decide the action per move from
  `drag.button`, `e.shiftKey` and `tool`.
- Stop the browser's middle-click auto-scroll: a native non-passive
  `mousedown` listener on the container that calls `preventDefault()` when
  `e.button === 1` (add and remove it next to the existing `wheel` listener).
- **Pan** must make the model follow the cursor 1:1: world units per pixel =
  `2 * radius * tan(fov / 2) / containerHeightPx` (fov in radians, from the
  camera). Use that as the speed in the existing right/up pan maths
  (replace `o.radius * 0.0015`).
- **Wheel zoom towards the cursor:** `f = Math.exp(e.deltaY * 0.001)`;
  `newRadius = clamp(radius * f, 0.02, 50)`; recompute `f = newRadius /
  radius`. Find the point `P` under the cursor on the plane through the
  pivot `(cx, cy, cz)` perpendicular to the view direction (ray from the
  camera through the cursor's normalised device coordinates, intersected
  with that plane). Then `pivot += (P - pivot) * (1 - f)` and
  `radius = newRadius`; `updateCamera()`. (With the cursor at the centre of
  the view this is a plain zoom.)
- **Zoom tool drag:** `f = Math.exp(dy * 0.005)` applied to `radius` with the
  same clamp, no pivot move.

**B.3 Zoom Extents** (new function `zoomExtents()`): compute
`new THREE.Box3().setFromObject(groupRef.current)`; if empty, fall back to
the cabinet-size box used by `resetView` today. Set the pivot to the box
centre and `radius = (sphereRadius / Math.sin(fovY / 2)) * 1.15`, where
`sphereRadius` is half the box diagonal and `fovY` the camera's vertical fov
in radians; if the canvas is narrower than tall use the horizontal fov
instead. Keep `theta` / `phi`. `updateCamera()`.

**B.4 Reset view** = opening camera + extents: set `theta = Math.PI * 1.75`,
`phi = Math.PI * 0.4` (the values `orbitRef` starts with — fix C), then
`zoomExtents()`. Also set `tool` back to `"select"`.
The call that frames the model after a rebuild keeps working as today.

**B.5 Toolbar.** Before the "Reset view" button add five icon buttons
(`btn-ghost py-1 px-2`, lucide icons, `size={14}`), the active tool
highlighted with `text-brass`:
- Select — `MousePointer2` — `title={t("navSelect")}`
- Orbit — `Rotate3d` — `title={t("navOrbit")}`
- Pan — `Hand` — `title={t("navPan")}`
- Zoom — `ZoomIn` — `title={t("navZoom")}`
- Zoom Extents — `Expand` — `title={t("navZoomExtents")}` (an action, not a
  tool: it calls `zoomExtents()` and leaves the tool unchanged)
then a `w-px h-4 bg-line mx-1` divider, then the existing buttons unchanged.

**B.6 Cursor** on the canvas div by tool: select `cursor-default`, orbit
`cursor-grab`, pan `cursor-move`, zoom `cursor-zoom-in`; remove the fixed
`cursor-grab active:cursor-grabbing`.

**B.7 Keyboard, SketchUp's own keys, only while the pointer is over this
viewer** (track with `onPointerEnter` / `onPointerLeave` in a ref) and never
when the event target is an `input`, `textarea` or `select`: `O` orbit, `H`
pan, `Z` zoom, `Space` select, `Shift+Z` zoom extents. One `keydown`
listener on `document`, added in an effect and removed on unmount;
`preventDefault()` only when a key was handled (so Space does not scroll the
page while over the viewer).

**B.8 The modal (fullscreen) instance** is the same component, so it gets
all of this automatically; make sure each instance has its own `tool` state
and its own "pointer is over me" ref.

### C. i18n (en / ar)
- `navSelect`: `Select (Space)` / `تحديد (Space)`
- `navOrbit`: `Orbit (O) — or drag with the mouse wheel button` / `تدوير (O) — أو اسحب بزر عجلة الفأرة`
- `navPan`: `Pan (H) — or Shift + wheel-button drag` / `تحريك (H) — أو Shift مع سحب زر العجلة`
- `navZoom`: `Zoom (Z) — or roll the wheel` / `تكبير (Z) — أو أدر العجلة`
- `navZoomExtents`: `Zoom Extents (Shift+Z)` / `إظهار الكل (Shift+Z)`

### Then
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — all must
pass (stop the dev server before the build). Report the diff summary and
anything that did not match the code. Do NOT commit.

## Step 2 — in-app test (tester agent, script by Claude chat) + Samer's hand
The agent checks, on `DR2-K3`: the bottom end faces of both side panels are
solid from below; every tool, the middle-button orbit, Shift pan, wheel zoom
towards the cursor, Zoom Extents, Reset view and the keys. **Samer tries the
navigation by hand** — feel cannot be judged by an agent.

## Step 3 — Claude Code: commit
```
git add -A
git commit -m "feat(3d): Stage 19b — double-sided faces; SketchUp-style navigation; Reset view fixed"
git push
```

## Out of scope (stay out) — Stage 19c
- Extension v0.6.13: `mesh_hash` must keep triangle winding; correct
  reversed faces on export; remove `ALLOY_DIAG` and `_loop_pts`.
- Duplicate must copy the 3D model and the `source` mark
  (`Coffee_Corner (copy)` draws scattered slivers).
- "Fittings: 3" beside six fitting rows on the import screen (wording).
- Double-click the wheel button to centre the view (SketchUp has it; later).
