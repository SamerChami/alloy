# Stage 4e — Polyboard DXF Importer (task for Claude Code)

Read `CLAUDE.md`, `db/05_bom.sql`, `db/06_part_role.sql`, `lib/pricing.ts`, and
`lib/cabinet3d.ts` first. This is a major feature: **import a Polyboard DXF
export and auto-create a product with its full BOM, panel dimensions, drill
counts, and 3D positions.** It turns the factory's existing CAD output into app
data — no manual re-entry.

Follow CLAUDE.md conventions (i18n en+ar, JOD via `jod()`, existing styles,
RTL-safe, office-only).

## Background — the DXF structure (VERIFIED on a real Polyboard 7.09 file)
Polyboard exports an AutoCAD R2000 (AC1015) DXF where:
- The whole cabinet is one top-level block named after the cabinet
  (e.g. `T-OV-MIC-D2-90`), containing ~18 `INSERT`s — one per panel.
- Each panel is a sub-block named `"<cabinet>.<PartName>"`, e.g.
  `T-OV-MIC-D2-90.Left Side`, `.Top`, `.Bottom`, `.Fixed Shelve [1]`,
  `.Mobile Shelve [1]`, `.TRAY [1]`, `.Double-Back 2 [1]`, `.Door 1 (Double) [1]`.
- Each panel sub-block holds `CIRCLE` entities (drill holes; diameter =
  radius×2) and references face sub-blocks (`<name>1` / `<name> (1)`) made of
  `3DFACE` entities (the solid geometry).
- The INSERT carries a transform (use `ezdxf`-equivalent matrix; in JS use the
  INSERT translation/rotation/scale) to place each panel in cabinet space.

### How to derive each panel (verified approach)
For each top-level INSERT:
1. Resolve the panel sub-block + descend into its face sub-blocks.
2. Collect all 3DFACE vertices, apply the INSERT transform, compute the
   axis-aligned bounding box (min/max X,Y,Z).
3. The three box extents sorted ascending = [thickness, height, width].
   `thickness ≈ smallest` (≈18 or 8 mm), the other two are H and W.
4. Box center (cx,cy,cz) = panel position in cabinet space.
5. Count CIRCLEs = drill-hole count; capture each hole's (x,y,z,diameter) for
   later (store count now; full hole list optional in a JSON column).

### Verified reference output (the importer MUST reproduce these for this file)
Cabinet overall: H 2280 × W 900 × D 580 mm.
Panels (W×H×T mm, holes):
- Left Side 2280×560×18 (76), Right Side 2280×560×18 (76)  [these are H×D, side panels]
- Top 864×545.5×18 (30), Bottom 864×545.5×18 (46)
- Fixed Shelve [1] @ z725, [2] @ z1338, [3] @ z1806 (864×~525-545×18)
- Mobile Shelve 864×508×18
- TRAY [1] & [2] 525.5×450×18 @ z1572 (the worktop pair)
- Double-Back 2 [1] 882×597.5×8 (lower back), TOV_UP_BACK 882×464×8 (upper back),
  two small Double-Back side pieces 468×141×8
- FIXED_SPACE 864×132×18
- Door 1 (Double) [1] 730 tall, [2] 478 tall, [3] 466 tall (18mm fronts)
Hole diameters present: 35.2 (hinge cups ×12), 8.2 (cam/connector), 7.3 (dowel),
5.2 (shelf-pin/screw), 10.3, 3.1.
Costing (from PDF, for cross-check only — DXF has no prices): carcass 5.9 m²,
8mm 1.07 m², grand total ~$98.17.

## Part 1 — DXF parser `lib/dxf/polyboardImport.ts`
- Use a maintained JS DXF parser (e.g. `dxf-parser` from npm). Add to deps.
- Input: DXF file text. Output a normalized structure:
  ```ts
  type ImportedPanel = {
    partName: string;          // "Left Side", "Door 1 (Double) [1]"
    width_mm: number; height_mm: number; thickness_mm: number;
    pos: { x:number; y:number; z:number };
    holeCount: number;
    holes?: {x:number;y:number;z:number;dia:number}[];
    materialRef?: string;      // matched from PDF/material if available
    qty: number;               // collapse identical panels -> qty
  };
  type ImportedCabinet = {
    name: string; width_mm:number; height_mm:number; depth_mm:number;
    panels: ImportedPanel[];
  };
  ```
- Robustness: handle INSERT transforms (translation at minimum; also rotation/
  scale if present). If a panel yields no faces, skip gracefully with a warning.
  Never crash the whole import on one bad panel — collect warnings.
- **Role inference**: map partName → `part_role` (the Stage 4d enum) by keywords,
  case-insensitive: "left side"→side_left, "right side"→side_right, "top"→top,
  "bottom"→bottom, "back"→back, "shelve"/"shelf"/"tray"→shelf,
  "door"→door, "drawer"→drawer_front, "divider"/"space"→divider_v, else other.
- **Thickness→material guess**: 18mm → "Carcass 18", 8mm → "8MM back", door
  parts → "Front 18". (Best-effort; user can correct after import.)

## Part 2 — Import UI: `/products/import`
- Office-only page. A file picker accepting `.dxf`.
- On select: parse client-side, then show a **preview screen BEFORE saving**:
  - Cabinet name (editable), overall W/H/D.
  - Table of detected panels: part name, role (editable select), W×H×T, qty,
    holes, guessed material (editable select from existing panel components).
  - The **3D preview** (reuse `Cabinet3D` from Stage 4d) rendered from the
    imported panels — so the user sees the cabinet before committing.
  - Any parser warnings shown clearly.
- A **"Create product"** button (this is a regular save action — NOT a
  prohibited action) that, on confirm, writes:
  - a `products` row (item_kind='product', the cabinet name, overall dims,
    is_template=true);
  - one `bom_lines` row per panel (line_type='panel', part_role, width/height,
    depth from D, qty, panel_id matched to the chosen panel material if the user
    mapped it; store holeCount in a new `hole_count int` column);
  - leave pricing to the existing engine (materials roll up once panel_id is
    mapped; unmapped panels contribute 0 until mapped — show a note).
- Do NOT auto-import bought fittings (hinges/P2O) from the DXF — those come from
  the PDF costing, not the DXF. Leave a TODO note; user adds them via BOM or a
  future PDF importer.

## Part 3 — small migration `db/07_import.sql`
(New file; Samer runs it.) Add:
- `bom_lines.hole_count int default 0`
- `bom_lines.holes_json jsonb` (optional full hole list)
- `products.source text` (e.g. 'manual' | 'polyboard_dxf') and
  `products.source_filename text`.

## Part 4 — entry point
Add an **"Import from Polyboard (DXF)"** button on the Products list (office
only) linking to `/products/import`.

## i18n
All new labels (Import from Polyboard, Choose DXF file, Detected panels,
Role, Material, Holes, Create product, Parser warnings, "Map this panel to a
material", etc.) in BOTH en and ar.

## Acceptance
- `npm run build` passes; DXF parser dep added.
- Importing the sample `T-OV-MIC-D2-90.dxf` detects the cabinet at
  2280×900×580 and ~18 panels matching the verified reference (sides 2280 tall,
  3 fixed shelves at the right heights, worktop trays, doors, 8mm backs), with
  correct hole counts (e.g. sides 76 each, 12×35mm hinge cups total).
- The 3D preview renders a recognizable oven/microwave tower.
- After mapping panels to a panel material, the product price rolls up via the
  existing engine.
- Office-only; bilingual + RTL; no hardcoded strings/currency; no crash on odd
  panels (warnings instead).
- Commit: "Stage 4e: Polyboard DXF importer".

When done: run the build, (a) remind Samer to run `db/07_import.sql`, (b) 3-line
summary, (c) tell him to test with T-OV-MIC-D2-90.dxf and list what panel count
+ overall dims the importer detected so we can confirm against the verified
numbers above.

## Note to relay
The DXF gives geometry + drilling, not prices. Prices still come from your panel
materials (per-m²) and the BOM engine. A future enhancement could also parse the
Polyboard PDF costing for fittings — tell me if you want that later.
