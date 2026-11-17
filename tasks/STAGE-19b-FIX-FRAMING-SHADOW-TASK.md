# Stage 19b fix — camera re-framing on toggles; striping on surfaces

**Model:** Sonnet. One file: `components/Cabinet3D.tsx`. 19b Step 1 is done
and NOT committed; this is applied on top of it, then both are committed
together.

## What the tester found on 19b (17 Nov)
Everything in 19b works (orbit, Shift pan, wheel zoom to cursor, tools, keys,
Zoom Extents, Reset view; side panels' bottom end faces are solid). Two
things to fix:

1. **Every display toggle re-frames the camera, too tightly.** Explode, Show
   doors, Show cuts and Shaded / Wireframe each rebuild the scene, and the
   rebuild effect ends with

       const o    = orbitRef.current;
       o.cx       = cW / 1000 / 2;
       o.cy       = cH / 1000 / 2;
       o.cz       = cD / 1000 / 2;
       o.phi      = Math.PI * 0.4;
       o.radius   = Math.max(cW, cH, cD) / 1000 * 2.0;
       updateCamera();

   so the view the user set is thrown away (and that old framing cuts the
   front legs off at the bottom edge). It is also why the opening view is
   framed differently from Reset view. SketchUp never moves the camera when
   you change a display option.

2. **A fine diagonal stripe pattern on large flat surfaces** (drawer fronts,
   top rails, panels), in every view. Most likely cause (not yet proven):
   since 19b the part materials are `THREE.DoubleSide`; for a double-sided
   material three.js renders BOTH sides into the shadow map (the default
   `shadowSide` follows `side`), which makes lit faces shadow themselves in
   stripes ("shadow acne"). With the old one-sided materials three.js used
   the back faces for shadows, which avoids it.

## Step 1 — Claude Code (Sonnet)

### 1. Frame only when the model changes
- Add `const needsFrameRef = useRef(true);`
- Add a small effect that sets `needsFrameRef.current = true` whenever the
  MODEL changes: dependencies `[cabinetWidth, cabinetHeight, cabinetDepth,
  skuPanels, rawPanels, meshes]`. Do NOT include `parts`, `showDoors`,
  `showCuts`, `explode` or `viewMode`.
- In the rebuild effect, replace the seven lines quoted above with:
  - if `needsFrameRef.current`: set it to false, set
    `o.theta = Math.PI * 1.75; o.phi = Math.PI * 0.4;` and frame the model
    exactly like `zoomExtents()` does (same maths, same 1.15 margin);
  - else: just `updateCamera()` (camera untouched).
- `zoomExtents` is declared further down than this effect. Do not reference
  a `const` before its declaration in a dependency array. Either move the
  `zoomExtents` `useCallback` above the rebuild effect, or extract its body
  into a plain helper used by both. Keep one implementation of the framing
  maths, not two copies.
- Result wanted: the opening view and "Reset view" are the same picture;
  toggling Explode / Show doors / Show cuts / Shaded / Wireframe leaves the
  camera exactly where the user put it; opening a different product (or the
  fullscreen viewer, which is a new instance) frames it fresh.

### 2. Shadows as before double-siding
On the three materials that got `side: THREE.DoubleSide` in 19b (the one in
`addPartToGroup` and the two `ROLE_COLOR[box.role]` panel materials) add
`shadowSide: THREE.BackSide`. Nothing else about lights or shadows changes.
(The pocket-disc clone that 19b set back to `FrontSide`: set its
`shadowSide` to `null` so it keeps three.js's default for a one-sided
material.)

### Then
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — all must
pass (stop the dev server before the build). Report the diff summary. Do NOT
commit.

## Step 2 — tester agent re-checks (script by Claude chat), Samer tries it by hand
- Stripes gone on the drawer fronts and top rails; side panels' bottom end
  faces still solid from below.
- Toggles keep the camera; opening view = Reset view; legs not cut off.

## Step 3 — commit (19b + this fix together)
```
git add -A
git commit -m "feat(3d): Stage 19b — double-sided faces; SketchUp-style navigation; Reset view fixed"
git push
```

## Not changed on purpose
- Zoom has no near / far stop (SketchUp lets you zoom past the model too;
  Zoom Extents or Reset view brings it back).
- Zoom tool drag speed.
