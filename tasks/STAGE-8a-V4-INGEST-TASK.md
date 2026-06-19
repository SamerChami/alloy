# Stage 8a — Ingest SketchUp v4 (carry `cuts`, persist them) — Claude Code

Read `CLAUDE.md`, `lib/sketchup/parseV3.ts`, the single/project SketchUp
importers (`/products/import-sketchup-single`, `/products/import-sketchup-project`),
`db/05_bom.sql` / `db/06_part_role.sql` / `db/07_import.sql` / `db/08_bom_pos.sql`,
and `03-sketchup-export-schema.md` (now describes v4) first.

Cut detection in the Ruby extension is DONE and verified clean (v0.4.1). The
exported JSON is now `alloy.sketchup.v4`. The app's importers currently top out
at **v3** and silently ignore the new data. This stage makes the app **read v4
and persist the cut data** — the prerequisite for displaying cuts in 3D (8b) and
cut-lists (8c). This stage does NOT render or surface cuts yet; it only ingests
and stores them.

Follow all CLAUDE.md conventions (i18n en+ar where any string is shown, JOD via
`jod()`, existing styles, RTL-safe, office-only).

## What v4 adds over v3 (verified against `alloy_export_0_4_1.json`)
Structurally v4 == v3 (same nested `roots[]` / `children[]` / `is_leaf` /
`size_mm` / `sorted_mm` / `pos_mm` / `item_type`) PLUS:
- top-level `total_parts` (int) — count of all leaf descendants. (Was `null`
  before v0.4.1; now real, e.g. 25.)
- top-level `version` string (e.g. "0.4.1").
- each **leaf** carries `cuts[]` (empty array if none).
- a leaf may carry `cut_warning` (string) instead of cuts when geometry was too
  complex. (Not present in the sample, but handle it.)

### Cut object shape (per `03-sketchup-export-schema.md`)
```ts
type Cut = {
  type: "dado" | "groove" | "rabbet" | "through";
  depth_mm: number;
  width_mm: number;          // across the channel
  length_mm: number;         // along the channel
  runs_along: "width" | "height" | "depth";
  face: "front" | "back" | "both";
  u_min_mm: number; u_max_mm: number;
  v_min_mm: number; v_max_mm: number;
};
```
Verified domains in the sample: types `groove|rabbet`, runs_along
`width|height|depth`, face `front|back`. Don't hardcode to only these — accept
the full union above so future exports (dado/through/both) ingest fine.

## Part 1 — Parser: accept v4 in the shared parser
In `lib/sketchup/parseV3.ts` (the shared recursive parser):
1. **Accept both schemas.** Where it validates `schema`, allow
   `alloy.sketchup.v3` AND `alloy.sketchup.v4` (and be lenient: if `schema` is
   missing but the shape matches, proceed with a warning). Add a tiny helper
   `isSupportedSchema(s)` rather than scattering string checks.
2. **Carry `cuts` on leaves.** Extend the leaf type the parser emits (the
   per-part object used by `cabinetToParts` / `collectLeaves`) with:
   - `cuts: Cut[]` (default `[]` if absent — v3 files have none)
   - `cutWarning?: string` (from `cut_warning` if present)
   Do NOT change the existing fields (name, raw size {x,y,z}, pos {x,y,z},
   sorted [t,w,h], isFitting, part_role inference). Just add cuts alongside.
3. **Read `total_parts`** into the parsed cabinet/result object (optional field).
   If absent (v3), leave undefined — don't compute it yourself.
4. Keep the existing recursive leaf collection, the panel-vs-fitting keyword
   rule, and the Z-up→Y-up 3D mapping EXACTLY as-is. This task adds data; it does
   not touch geometry/placement.
5. Define/lift the `Cut` type into a shared types file if the parser doesn't
   already have one (e.g. `lib/sketchup/types.ts`), so 8b/8c can import it.

## Part 2 — DB migration `db/09_cuts.sql`
(New file; do NOT edit earlier migrations. Samer runs it in Supabase — remind
him in the summary.)
1. Add `cuts_json jsonb` to `bom_lines` (nullable; stores the leaf's `cuts[]`
   array verbatim). Default `null` (NOT `[]`) so we can tell "no data ingested"
   apart from "ingested, zero cuts".
2. Add `cut_warning text` to `bom_lines` (nullable).
3. (Optional, if cheap) Add `products.export_version text` to record the
   exporter version string (e.g. "0.4.1") for traceability. Nullable.
RLS: `bom_lines` already has policies; new columns inherit them — no policy
changes needed. Confirm in the file's comment header.

## Part 3 — Persist cuts on import (both single + project paths)
In the import "Create product" / "Import N cabinets" save paths
(`ImportShell` for single, the project importer's batch save):
- When writing each panel's `bom_lines` row, also write:
  - `cuts_json` = the leaf's `cuts` array (JSON), or `null` if the part is a
    fitting or has no cuts. (Fittings always get `null`.)
  - `cut_warning` = the leaf's `cutWarning` if present, else `null`.
- Set `products.export_version` from the file's `version` field if you added that
  column.
- Everything else about the save path stays the same (dims, part_role,
  pos_x/y/z, hole_count, panel_id mapping, qty, sort_order). Do not regress
  Stage 4g/5/6 behavior.

## Part 4 — Reopen path (load cuts back, no UI yet)
When a product's `bom_lines` are loaded in the editor (`BomSection` / product
detail), parse `cuts_json` back into the in-memory line objects (as `Cut[]`), so
8b can consume them without another round trip. **Do not render anything yet** —
just make the data available on the loaded line. A `console.debug` count of
total cuts loaded is fine for now (remove later).

## Acceptance
- `npm run build` passes.
- After Samer runs `db/09_cuts.sql`:
  - Importing `alloy_export_0_4_1.json` (v4) via the SketchUp single OR project
    importer still works exactly as before (same dims, same 3D, same 25 leaves /
    16 panels + 9 fittings), AND now persists `cuts_json` on the panel rows.
  - A v3 file still imports fine (cuts_json just null everywhere).
  - In Supabase, the imported cabinet's `bom_lines`: the two side panels have a
    `cuts_json` with one cut each; the legs have `cuts_json = null`; `Difference`
    has 3 cuts; row count and dims unchanged from Stage 6.
  - Reopening the product loads the cuts back into memory (debug count matches,
    e.g. "9 cuts across 9 panels").
- No schema string is hardcoded such that v3 breaks; both v3 and v4 parse.
- Office-only; bilingual for any new visible string (there should be ~none);
  no hardcoded currency.
- Commit: "Stage 8a: ingest SketchUp v4, persist cuts_json on bom_lines".

When done: run the build, (a) remind Samer to run `db/09_cuts.sql` in Supabase,
(b) 3-line summary, (c) tell him to import `alloy_export_0_4_1.json` and report
the per-panel cut counts persisted (expect: sides 1 each, legs 0/null,
Difference 3, total 9 across 9 panels) so we confirm the data landed before we
build the 3D cut display (8b).

## Note to relay to Samer
8a is plumbing only — after this, the cuts are IN the database but not yet shown.
8b draws them on the panels in the 3D; 8c turns them into a machining cut-list.
We deliberately split ingest from display so we can verify the data is stored
correctly before building anything on top of it.
