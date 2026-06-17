# Stage 5d — Cabinet3D rotate fix + expand-to-modal (Claude Code)

Two finishing touches to the 3D viewer (`components/Cabinet3D.tsx` /
`lib/cabinet3d.ts`). Self-contained UI; don't touch geometry or parsers. Read
`CLAUDE.md` and current `Cabinet3D` first.

## 1. Fix rotate vertical inversion (BOTH middle + right drag)
The orbit's UP/DOWN (vertical) rotation is reversed for both middle-button and
right-button drag; left/right (horizontal) is correct. Invert the sign of the
VERTICAL component of the orbit delta (the pitch / elevation), leaving the
horizontal (azimuth) unchanged. Apply to both buttons (they share the rotate
handler, so one sign flip fixes both). After the fix: dragging UP tilts the view
so you look more from above (or whatever is the natural/expected direction —
i.e. it should feel like grabbing and dragging the model the way SketchUp does).

## 2. Expand-to-modal button (larger popup)
Add an **expand / fullscreen icon button** to the 3D control area (top-right,
near Shaded/Wireframe). Clicking it opens the 3D in a **large modal overlay**:
- Large modal centered on screen with a **dark semi-transparent backdrop**
  (stays inside the app — NOT browser fullscreen). Roughly 90vw × 85vh, the 3D
  canvas filling it.
- The modal's 3D has the SAME controls/buttons: **Shaded, Wireframe, Reset view,
  Explode, Show doors**, plus the same mouse controls (left=pan, wheel=zoom,
  middle/right-drag=rotate with the corrected vertical), and the wheel
  scroll-capture.
- **Close via:** an **"X" button** top-right of the modal, AND the **Esc key**.
  Clicking the dark backdrop outside the canvas may also close it (optional,
  nice-to-have). Restore focus/scroll on close.
- The modal should render the same model/state currently shown (same cabinet,
  same view mode if reasonable). Reuse the Cabinet3D component inside the modal
  rather than duplicating logic — e.g. a `large`/`modal` prop, or render a
  second Cabinet3D instance with the same props inside a modal wrapper.
- Resize-aware: the 3D must fill the modal and re-fit on open (call the
  reset/fit-view so the cabinet is framed nicely at the larger size).
- Clean up the modal's three.js context on close (dispose / stop the render
  loop) to avoid leaks when opening/closing repeatedly.

Esc handling: add a keydown listener for `Escape` only while the modal is open;
remove it on close.

## Acceptance
- Up/down rotate now goes the correct direction for both middle and right drag.
- Expand button opens a large modal 3D with all five buttons + same controls.
- Esc closes it; X closes it; reopening works repeatedly with no leak/freeze.
- Inline (non-modal) viewer still works as before.
- `npm run build` passes. Bilingual labels for the expand/close affordances if
  they have text (icon-only is fine). 
- Commit: "Stage 5d: fix 3D vertical rotate + expand-to-modal viewer".

Hard refresh (Ctrl+Shift+R) to test.
