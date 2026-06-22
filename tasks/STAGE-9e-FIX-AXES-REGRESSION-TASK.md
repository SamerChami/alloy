# Stage 9e-FIX — Extension regression: v5.1 export dropped `axes` (Claude Code)

## The bug (verified against `alloy_export_0_5_1.json`)
The current SketchUp export is labelled `schema: "alloy.sketchup.v5.1"`, `version
"0.5.1"`, and every leaf carries `outline_mm` — but **NOT ONE leaf has `axes`**
(checked all 23 leaves: 0 have axes). `axes` is the v5.0 feature; it has been lost.

Consequence in the viewer: `buildBoxesFromSkuPanels` gates the oriented-box path on
`panels.every(p => p.axes !== undefined)`. With zero axes, it falls back to the
legacy axis-aligned path, which never sets `outline`/`orient` on the boxes — so the
L-shaped mobile shelf renders as a plain box (square). Runtime logs confirmed:
`[PATH] every-has-axes: false n=23` and
`[NO-EXTRUDE] Mobile_Shelve#41 hasOutline false hasOrient false`.

So `axes` and `outline_mm` ended up in TWO SEPARATE extension builds:
- the installed `alloy_export_0_5_0.rbz`: emits `axes`, has NO outline code.
- the build that produced the v5.1 JSON: emits `outline_mm`, dropped `axes`.

The fix: produce ONE extension (`alloy_export/main.rb`) that emits **both** `axes`
and `outline_mm` on every node/leaf, bump to **v0.5.2 / schema `alloy.sketchup.v5.2`**,
rebuild `alloy_export.rbz`.

## Step 0 — read the CURRENT extension source in the repo
`alloy_export/main.rb` in this repo is the source of truth — it may be the v5.0 build
(axes, no outline), the v5.1 build (outline, no axes), or something in between. Read
it first and determine WHICH of the two features is present and which is missing.
Report what you find before editing.

## Step 1 — ensure BOTH features are emitted in `build_node`
`build_node` builds a shared `node` hash for every node, then adds leaf-only fields in
the `if kids.empty?` branch. Required end state:

1. **`axes` on every node** — in the shared `node` hash:
   ```ruby
   node = {
     name:      name_of(e),
     type:      ...,
     size_mm:   { x: w, y: h, z: d },
     sorted_mm: [w, h, d].sort,
     pos_mm:    { ... },
     axes:      world_axes(tr),   # ← MUST be present
   }
   ```
   If `world_axes(tr)` (the helper that returns the three local axis unit-vectors in
   world space) is MISSING from the file, restore it. Reference implementation from
   v0.5.0:
   ```ruby
   # The panel's three LOCAL axes expressed as unit vectors in world space.
   def self.world_axes(tr)
     ax = tr.xaxis.normalize
     ay = tr.yaxis.normalize
     az = tr.zaxis.normalize
     {
       x: [ax.x.round(6), ax.y.round(6), ax.z.round(6)],
       y: [ay.x.round(6), ay.y.round(6), ay.z.round(6)],
       z: [az.x.round(6), az.y.round(6), az.z.round(6)],
     }
   end
   ```
   (If the file already has a working `world_axes`, keep it; do not duplicate.)

2. **`outline_mm` on every leaf** — in the `if kids.empty?` branch, after the cuts
   logic, for ALL leaves:
   ```ruby
   ol = face_outline(e)
   node[:outline_mm] = ol unless ol.nil?
   ```
   If `face_outline` (the helper that extracts the largest thickness-parallel face's
   outer loop as a local U/V mm loop) is MISSING, restore it from the v5.1 build /
   the Stage 9e task. It must return
   `{ u_axis:, v_axis:, thickness_mm:, loop: [[u,v],...] }` or `nil`, never raise.

Whichever of the two helpers/lines is absent in the current file, ADD it without
removing or breaking the one that is already there. Make targeted edits; do not
rewrite the whole file.

## Step 2 — version + schema bump
- `VERSION = "0.5.2"`
- `SCHEMA  = "alloy.sketchup.v5.2"`
Update the header comment to note: v5.2 = v5 (`axes`) + v5.1 (`outline_mm`) combined.

## Step 3 — app accepts the new schema string
In `lib/sketchup/parseV3.ts`, add `"alloy.sketchup.v5.2"` to `SUPPORTED_SCHEMAS`
(keep all existing entries). No other parser change — axes/outline are already typed
and carried.

## Step 4 — rebuild the .rbz
Repackage `alloy_export.rb` + `alloy_export/main.rb` into a fresh `alloy_export.rbz`
(zip). Valid Ruby syntax; loads in SketchUp; menu + summary popup still work.

## Step 5 — remove the temporary diagnostic logs
Remove the `[EXTRUDE]`, `[NO-EXTRUDE]`, `[BUILD]`, and `[PATH]` `console.log` lines
added in the previous diagnostic step (in `components/Cabinet3D.tsx` and
`lib/cabinet3d.ts`). Leave the real logic intact.

## Acceptance
- `alloy_export/main.rb` emits BOTH `axes` (every node) AND `outline_mm` (every leaf).
- `VERSION="0.5.2"`, `SCHEMA="alloy.sketchup.v5.2"`; parser accepts v5.2.
- A fresh `alloy_export.rbz` is produced.
- `npm run build` passes. Diagnostic logs removed.
- Two commits:
  - "Stage 9e-fix: extension emits axes + outline_mm together (v0.5.2, schema v5.2)"
  - "chore: remove outline diagnostic logs; accept schema v5.2"

## After build — Samer's manual step (state this in your summary)
Samer must: uninstall the old extension in SketchUp, install the new
`alloy_export.rbz`, restart SketchUp, RE-EXPORT the corner cabinet, then re-import the
new JSON into the app and hard-refresh (Ctrl+Shift+R). The new export will have axes
on every leaf → oriented path engages → the mobile shelf renders as an L. Report the
rebuilt `.rbz` path so Samer can install it.

Do NOT commit the old `alloy_export_0_5_1.json`. Do not attempt a viewer-side shape
change — the viewer is already correct; it just needs the export to carry axes.
