# Stage 10-FIX3 — Pass `meshes` to the modal 3D viewer (Claude Code)

## The bug
True fitting meshes (Stage 10) render correctly in the INLINE 3D preview but NOT in
the expand-to-modal popup (Stage 5d). The legs in the modal fall back to cylinders.

Cause: the modal renders a SECOND `<Cabinet3D>` instance (the `!inModal && modalOpen`
block in `components/Cabinet3D.tsx`). It forwards `skuPanels`, view state, etc., but
does NOT forward the new `meshes` prop added in Stage 10-B. So the inner instance has
no mesh dictionary and falls back to the cylinder path.

Viewer-only, one file: `components/Cabinet3D.tsx`. Surgical — do not rewrite.

## The fix
1. Confirm `meshes` is in the component's Props type and destructured in the function
   signature (it should be, from Stage 10-B). If it is, no change there.
2. In the modal block, the inner `<Cabinet3D ... />` (rendered when
   `!inModal && modalOpen`) forwards several props — `skuPanels={skuPanels}`,
   `parts`, dims, `inModal`, `onClose`, etc. Add the `meshes` prop right next to
   `skuPanels`:
   ```tsx
   <Cabinet3D
     ...
     skuPanels={skuPanels}
     meshes={meshes}          // ← ADD: forward the mesh dict to the modal instance
     inModal
     onClose={() => setModalOpen(false)}
     ...
   />
   ```
3. Double-check the import shell passes `meshes` to the OUTER `<Cabinet3D>` too
   (`SingleImportShell.tsx`). If Stage 10-B already wired the outer instance, this
   modal forward is the only remaining gap. If the outer instance is ALSO missing
   `meshes`, add it there as well.

## Verify
- Open the inline preview: legs render as true meshes (already working).
- Click expand → the MODAL now also shows the detailed leg meshes (not cylinders).
- Shelf (outline), channels (profile), cuts, doors all correct in BOTH inline and
  modal. Wireframe/shaded, reset/explode/show-doors, pan/zoom/rotate all still work in
  the modal.
- `npm run build` passes.

## Commit
"Stage 10-fix3: forward meshes prop to modal Cabinet3D instance".

Do NOT push — I'll review. Clean dev-server restart + hard refresh to test.
