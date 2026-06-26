# Stage 14b — DIAGNOSTIC: export-side bounds mismatch (Ruby extension)

> **Diagnostic only. Change NO export behavior. Add Ruby console logs, re-export,
> report numbers.** The fix lands in Stage 14c once we read the evidence.

## Where the bug actually is (correction to earlier theory)
The viewer is NOT at fault. We compared the app's imported dimensions against the
real SketchUp dimensions and the discrepancies are **already present in the exported
JSON** — so the bug is in the **Ruby extension** (`alloy_export/main.rb`), in how it
measures part extents / picks the outline face. The viewer faithfully renders bad
input. Orientation is fine (Stage 14a logs were clean: matrices, determinants, and
reflections all correct).

## The confirmed discrepancies (app/export vs real SketchUp)
| Part | Field | Exported | SketchUp (correct) | Delta |
|------|-------|---------:|-------------------:|------:|
| `Leg_12cm#480/481/482/483` | height | **168.5** | **110** | **+58.5** |
| `Back#95` | width | **703.2** | **752** | **−48.8** |
| `Right_Side#114` / `Left_Side#114` | height | **720** | **770** | **−50** |
| `Top_Back#91`, `Top_Front#92`, `Bottom#107` | thickness | 16.8 | 18 | −1.2 |

Key facts already established from the JSON + meshes:
- The leg's exported `size_mm.z` is **168.5**, and its **mesh vertices also span 168.5**
  (z from −33.8 to +134.7). So the over-measure is real geometry in the leg
  *definition* extending past the nominal 110mm leg (likely a modeled pin/adjuster
  below origin and/or extended foot). The extension is taking the full definition
  bounds, not the visible leg body.
- `Back#95`: exported `size_mm` and `outline_mm` AGREE at 782×703.2 — so the outline
  face-pick and the bounds agree with each other but both are ~49mm short of the true
  752 width. The error is upstream of outline (the bounds the extension reads), or the
  picked face is genuinely smaller than the panel.
- Sides: same shape — `size_mm.z` and outline v-extent both say 720, but truth is 770.
  The ~50mm shortfall on sides (height) and ~49mm on back (width) are suspiciously
  close — they may share one cause.

## Hypothesis to test (do NOT assume — log and confirm)
The extension works in the component **definition's LOCAL space** and reads
`defn.bounds` for extents. When a component's geometry does NOT fill its definition
bounds, or its axes/origin are not corner-aligned (your point #3), `defn.bounds` and
the **instance world bounds** and the **picked outline face bounds** can all diverge.
We need to see, per part, which of these three is right and which the export currently
trusts.

## What to add (Ruby logging ONLY — no behavior change)

In `alloy_export/main.rb`, inside the leaf branch of `build_node` (where `size_mm`,
`sorted_mm`, `outline_mm`, and `mesh_ref` are computed), add a temporary diagnostic
block that fires **only for the parts we care about**. Gate by name match:
```ruby
DIAG_NAMES = /\A(Back#|Right_Side#|Left_Side#|Top_Back#|Top_Front#|Bottom#|Leg_12cm#)/
```
(match on the leaf's display name). When it matches, print to the Ruby Console
(`Sketchup.active_model` console via `puts` / `SKETCHUP_CONSOLE.show` — use whatever
the extension already uses for its summary popup; plain `puts` to the Ruby Console is
fine). Emit one labeled block per matching leaf with these measurements:

For the instance `e` and its definition `defn = e.definition`:
1. **`defn.bounds` extents** — `bb = defn.bounds; [bb.width, bb.height, bb.depth]` in
   mm, and `bb.min` / `bb.max` corners in mm. (This is the local definition box the
   export currently relies on.)
2. **Instance world bounds** — `e.bounds` extents in mm and min/max corners.
   (SketchUp's `entity.bounds` is the instance's world AABB.)
3. **Definition geometry bounds from faces/edges** — iterate `defn.entities`,
   accumulate a fresh `Geom::BoundingBox` over every `Sketchup::Face` and
   `Sketchup::Edge` vertex position; print its extents + min/max in mm. This tells us
   the bounds of the ACTUAL drawn geometry, ignoring empty padding or guide points.
4. **Picked outline face** (only if the part has an outline / is a panel) — the face
   `face_outline` selects as the "big face": print its `face.bounds` extents in mm,
   its area in mm², and its `normal`. Also print the count of candidate big-faces it
   chose between.
5. **Transform sanity** — `e.transformation.to_a` (the 16 numbers) and whether the
   instance has a non-identity / non-corner origin: print `e.transformation.origin`
   in mm and the three axis vectors `e.transformation.xaxis/yaxis/zaxis`.
6. **What the export currently emits** for this leaf: the computed `size_mm`,
   `sorted_mm`, and (if panel) `outline_mm.thickness_mm` + outline u/v spans — so we
   can see, in one place, which of (1)/(2)/(3) the emitted value matches.

Label each clearly, e.g.:
```
[DIAG export] Back#95
  defn.bounds      ext=(W,H,D) min=(...) max=(...)
  instance.bounds  ext=(...) min=(...) max=(...)
  geom.bounds      ext=(...) min=(...) max=(...)
  picked_face      bounds_ext=(...) area=... normal=(...) n_candidates=...
  transform.origin=(...) xaxis=(...) yaxis=(...) zaxis=(...)
  EMITTED size_mm=(...) sorted=(...) outline thick=... uSpan=... vSpan=...
```

### Constraints
- **No export behavior change.** Do not alter how `size_mm`, `outline_mm`, `mesh`,
  or anything else is computed or written. Logging only.
- Do not touch the viewer / TypeScript — this stage is the Ruby extension only.
- Keep the gate tight (only the named parts) so the console stays readable.
- Do not "fix" anything you notice; record it in the report.
- The temporary logging will be removed in 14c.

## Repackage & install
- Rebuild the `.rbz` with correct nesting (`alloy_export.rb` loader at archive root +
  `alloy_export/main.rb`), as always — a `main.rb` at the archive root silently fails.
- Bump nothing schema-wise; this is a diagnostic build. (You may suffix the VERSION
  string with `-diag` if helpful, but do not change `SCHEMA`.)
- Reminder for the install: uninstall the old extension, **quit SketchUp entirely**,
  manually delete the Plugins `alloy_export` folder, then install the new `.rbz`
  (stale installs are a recurring hazard).

## Run it
1. In SketchUp, open the same test cabinet model used for `alloy_export_0_6_8_cabinet.json`.
2. Open the Ruby Console (Window → Ruby Console) BEFORE exporting.
3. Run the export.
4. Copy the full `[DIAG export]` console output.

## Report back (paste verbatim) + answer
Paste every `[DIAG export]` block. Then answer:
1. **Legs:** Do `defn.bounds`, `instance.bounds`, and `geom.bounds` agree at 168.5, or
   does `geom.bounds` (actual drawn faces) show ~110 while `defn.bounds` shows 168.5?
   I.e. is the extra 58.5mm empty definition padding, or real modeled geometry
   (pin/adjuster) below origin?
2. **Back#95:** Which of the three bounds equals the true 752 width? Does the
   picked outline face have a smaller bounds than the geometry (i.e. is `face_outline`
   selecting a partial/inner face), or are the bounds themselves short?
3. **Sides:** Same question for the 770→720 height. Do sides and back share the same
   failure mode (e.g. both reading `defn.bounds` that is short, or both picking a
   reduced face)?
4. Does `transform.origin` sit on a corner of the geometry for these parts, or off it?

Do **not** propose or write a fix here. We scope 14c from these numbers.

## After running — CLEAN RESTART (always)
Even though this stage is export-side, do the standard clean restart afterward so
nothing is left glitched:
- Kill the Next.js dev-server process and start it fresh (`npm run dev`).
- Hard refresh the browser (Ctrl+Shift+R).
The page reliably glitches/stale-renders after any change, so never skip this.
