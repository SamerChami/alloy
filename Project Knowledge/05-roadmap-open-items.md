# ALLOY App — Phase Roadmap & Open Items

> Reconciled against the actual STAGE task files (Stages 3–7) and the v4 export.
> Supersedes the earlier roadmap, which predated most of this work.

## Completed

### Phase A — Foundation
- [x] Supabase project, schema, RLS policies
- [x] Next.js 15 (App Router, TypeScript, Tailwind) scaffold
- [x] Supabase Auth (login, session, protected routes), office/factory_worker roles

### Stage 3 — Clients
- [x] Clients list (search/filter), create/edit modal, client detail page (`/clients/[id]`)
- [x] i18n en+ar, RTL, JOD via `jod()`, guarded delete

### Stage 4 — Products, Components, BOM, 3D, Importers
- [x] **4** Products library (catalog grouped by category)
- [x] **4b** Split into Products + Components via `item_kind` enum (`db/04_item_kind.sql`), `subcategory`, stock on components
- [x] **4c** BOM auto-pricing engine — `lib/pricing.ts`, `bom_lines`, `banding_types`, live panel-price lookup, labor+margin rollup, override, duplicate/template (`db/05_bom.sql`)
- [x] **4d** Live Three.js preview — `Cabinet3D.tsx`, `lib/cabinet3d.ts`, `part_role`/`depth_mm`/`pos_offset_mm` (`db/06_part_role.sql`)
- [x] **4e** Polyboard **DXF** importer (`lib/dxf/polyboardImport.ts`, `db/07_import.sql`) + dimension/door-leaf/depth bug fixes — concluded DXF is a *flat layout*, 3D synthesized from roles
- [x] **4f/4g** Switched to **.3ds** importer (`lib/3ds/threeDsImport.ts`) — assembled geometry, real positions; render polish; E2E persist (`db/08_bom_pos.sql` adds `pos_x/y/z_mm`)

### Stage 5 — SketchUp JSON (v2) + 3D placement
- [x] **5** Bulk catalog import from `alloy.sketchup.v2` (`/products/import-sketchup`), panels-only BOM
- [x] **5b** Rotation-proof H/W/T derivation (sorted extents) + 3D from real positions
- [x] **5c** Cabinet3D controls (left=pan, wheel=zoom, middle/right=rotate, scroll capture, shaded/wireframe)
- [x] **5d** Vertical-rotate fix + expand-to-modal viewer
- [x] **5e** Accurate SketchUp 3D placement — raw per-axis extents + real positions, Z-up map

### Stage 6 — SketchUp v3 importer
- [x] **6** `alloy.sketchup.v3` (nested tree) — Single (`/products/import-sketchup-single`) + Project (`/products/import-sketchup-project`) modes, recursive leaf collection (`lib/sketchup/parseV3.ts`)
- [x] **6b** Smart fitting shapes in 3D (cylinder legs, L/U channels, P2O)

### Stage 7 — Cut detection (Ruby extension)
- [x] **7** Cut/groove/rabbet/dado detection added to extension → schema `alloy.sketchup.v4`, `cuts[]` per panel leaf (v0.4)
- [x] **7b** Refined — fittings excluded from detection, noise filter, `total_parts` fixed (v0.4.1)

**Latest artifact:** `alloy_export_0_4_1.json` — schema `alloy.sketchup.v4`,
version `0.4.1`, clean cut data verified (legs `cuts:[]`, sides show 9×9×752
groove, etc.).

---

## Open Items (next)

### 🟡 Stage 8 — Consume v4 (`cuts` + ingest)
The app currently imports up to **v3**. The new export is **v4**. Pick the next move:

1. **v4 ingest** — extend `lib/sketchup/parseV3.ts` (or a v4 wrapper) to read
   `alloy.sketchup.v4`: same tree, plus carry `cuts[]` on leaves and read
   `total_parts`. Persist cuts (new `bom_lines.cuts_json jsonb`, migration
   `db/09_cuts.sql`).
2. **Render cuts in 3D** — show grooves/rabbets as recesses/insets on panel boxes
   in `Cabinet3D` using each cut's face + u/v footprint + depth.
3. **Cut-list / CNC output** — per-panel machining list (cut type, depth, length,
   position) feeding the future production phase.

(1) is the prerequisite for (2) and (3), since the app can't see `cuts` until it
ingests v4.

### 🔴 Phase B — SketchUp → Quotation importer (still open)
Upload an export → match cabinet names to `products.code` → auto-generate a
priced **draft quotation** for a selected client. Matching now parses the leading
slash-segment of the compound name (e.g. `BDR.K3.120`). Catalog import (Stage 5/6)
exists; the *quotation* generation path does not yet.

---

## Future Phases (backlog)
- **Phase C — Production & Job Orders:** approved quotation → job order; cut list
  per job (now unblocked by v4 `cuts`); job status.
- **Phase D — Inventory & Purchasing:** component stock, low-stock alerts, POs.
- **Phase E — Reporting:** revenue by client/period, BOM-vs-quoted margins.

---

## Key Decisions
- Single-tenant (no multi-org) for now.
- Custom app — no ERPNext.
- All cabinet dimensions in **millimeters**.
- 3D placement uses RAW `size_mm` + `pos_mm` with Z-up→Y-up map; `sorted_mm` is
  for cut-list H/W/T only.
- Product **code** = leading slash-segment of the SketchUp name; join key to the
  catalogue.
- Two import families kept separate: geometry importers (.3ds/.dxf) and SketchUp
  JSON importers (v2 bulk, v3 single/project, v4 next).
