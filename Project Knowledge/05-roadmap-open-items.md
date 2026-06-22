# ALLOY App — Phase Roadmap & Open Items

> Reconciled against the actual STAGE task files (Stages 3–9) and the v5 export.
> Supersedes the earlier roadmap.

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
- [x] **4e** Polyboard **DXF** importer + dimension/door-leaf/depth fixes — concluded DXF is a *flat layout*, 3D synthesized from roles
- [x] **4f/4g** Switched to **.3ds** importer — assembled geometry, real positions; render polish; E2E persist (`db/08_bom_pos.sql` adds `pos_x/y/z_mm`)

### Stage 5 — SketchUp JSON (v2) + 3D placement
- [x] **5** Bulk catalog import from `alloy.sketchup.v2`, panels-only BOM
- [x] **5b** Rotation-proof H/W/T derivation (sorted extents) + 3D from real positions
- [x] **5c** Cabinet3D controls (left=pan, wheel=zoom, middle/right=rotate, scroll capture, shaded/wireframe)
- [x] **5d** Vertical-rotate fix + expand-to-modal viewer
- [x] **5e** Accurate SketchUp 3D placement — raw per-axis extents + real positions, Z-up map

### Stage 6 — SketchUp v3 importer
- [x] **6** `alloy.sketchup.v3` (nested tree) — Single + Project modes, recursive leaf collection (`lib/sketchup/parseV3.ts`)
- [x] **6b** Smart fitting shapes in 3D (cylinder legs, L/U channels, P2O)

### Stage 7 — Cut detection (Ruby extension)
- [x] **7** Cut/groove/rabbet/dado detection → schema `alloy.sketchup.v4`, `cuts[]` per panel leaf (v0.4)
- [x] **7b** Refined — fittings excluded, noise filter, `total_parts` fixed (v0.4.1)

### Stage 8 — Consume v4: render cuts in 3D
- [x] **8b** Cuts rendered as inset recess boxes on panel meshes (`addCutMeshes`)
- [x] **8b-fix** Cut recess front/back side
- [x] **8c** Removed SketchUp 3D mirror — the SkuPanels path was using `three.z=+su.y`
  (left-handed, det −1); corrected to `three.z=-su.y` + front-left camera default
- [x] **8d** Cut recess placed on the INNER (interior-facing) panel face, derived from
  panel-vs-cabinet centre (independent of the `face` field)
- [x] **8e** Cut footprint depth-axis flipped to match the mirror-corrected frame —
  grooves now correct in BOTH face and depth position

### Stage 9 — Rotated / L-corner cabinets (v5 orientation)
- [x] **9** SketchUp extension **v0.5.0**, schema `alloy.sketchup.v5` — adds per-node
  `axes` (the part's local orientation as world-space unit vectors). Purely additive
  over v4. Root cause: v4 discarded orientation, so rotated parts (L-corner legs)
  scattered. (`world_axes` helper in `alloy_export/main.rb`.)
- [x] **9b** Viewer **oriented-box** path (additive) — `buildBoxesFromOrientedPanels`;
  renders each part at LOCAL size + `axes` orientation + `pos_mm`, with the Z-up map
  as a fixed basis. Runs only when panels carry `axes`; v2/v3/v4 imports unchanged.
  Mirrored parts (det −1) handled via Matrix4 from the basis.
- [x] **9c-fix** Apply v5 orientation to FITTING objects too (channels/legs), so Gola
  profiles place and orient with the panels.
- [x] **9d** Leg/cylinder fitting orientation fix — radially-symmetric fittings
  (legs, P2O) now stand UPRIGHT regardless of part orientation. Root cause: viewer
  built the cylinder height from `size_mm.y` (not the tallest extent) AND applied the
  panel `orient` basis (which tipped local-Y onto three-Z). Fix: cylinder height =
  largest extent, and skip `box.orient` for `uprightCylinder` fittings
  (`isUprightCylinderFitting`). Viewer-only; no schema change. Verified on the corner
  cabinet — all legs upright.
- **Result:** the L-shaped base corner cabinet (`BC2.K3.120*120`) renders correctly —
  both perpendicular legs, doors, shelves, bottom, upright legs, channels in place.

- [x] **9e** Panel outline export — extension emits `outline_mm` (true 2D silhouette)
  on every leaf; viewer extrudes it, box fallback when absent. Fixes the L-shaped mobile
  shelf. Schema **v5.1**.
- [x] **9e-fix** Axes regression — a v5.1 build had dropped `axes` (0/23 leaves), forcing
  the legacy path so outlines never rendered. Reconciled to emit BOTH `axes` and
  `outline_mm`; schema **v5.2 / v0.5.2**. Shelf renders L; side cuts show.
- [x] **9f** Channel cross-section — extension emits `profile_mm` (END-face L/U section)
  for channel fittings; viewer extrudes it along the run axis. Real Gola L-profile with
  correct foot direction (foot heuristic retired). Schema **v5.3 / v0.5.3**.
- [x] **10** True fitting meshes — fittings that aren't profile-representable (legs,
  hardware) export full triangulated geometry, **deduped by canonical geometry hash**
  (10-fix2, after name-dedupe failed on unique-named leg defs). Viewer renders a
  `BufferGeometry`; cylinder fallback. Modal viewer also receives `meshes` (10-fix3).
  Schema **v6 / v0.6.2**. Panels keep `outline_mm`, channels keep `profile_mm` (meshes
  are preview-only; CNC still uses outlines/cuts).
- **Result:** the corner cabinet `BC2.K3.120*120` is fully solved across every part type
  and both viewers — panels with cuts, L-shaped shelf, L-profile Gola channels, true-mesh
  detailed legs.

**Latest artifacts:** `alloy_export.rbz` **v0.6.2**, schema **`alloy.sketchup.v6`**;
verified export `alloy_export_0_6_2.json` (axes + outline on all 23 leaves, profile on 2
channels, 2 deduped leg meshes via geometry hash — 7+1 from one mirrored instance).

---

## Open Items (next)

### 🟡 v6 persistence — outline / profile / mesh into saved products
The viewer consumes v6 live, but saved products (rebuilt from `bom_lines`) don't yet
store `outline_mm` / `profile_mm` / `mesh_ref` / `meshes`, so a re-opened product would
fall back to boxes/cylinders. Extend persistence (and a mesh store) if saved products
need the accurate rebuild. Live import preview is fully correct already.

### 🟡 Modelling note — legs as unique components
This cabinet's 8 legs were 8 separate component definitions (copied, not instanced), so
name-dedupe couldn't collapse them; geometry-hash dedupe handles it (8→1–2 meshes).
Cleaner long-term: model repeated fittings as instances of ONE component. Not blocking.

### 🟡 Migrate older imports to the oriented path (optional)
The oriented-box path is currently additive (v5 only). Existing v2/v3/v4 imports use
the legacy axis-aligned logic. Optionally route all SketchUp imports through the
oriented path once it's proven across more cabinets, retiring the legacy branch.
Pending Samer's multi-cabinet iteration testing.

### 🟡 v5 ingest persistence (cuts + axes to DB)
The viewer consumes v5 live, but persistence of `cuts`/orientation into `bom_lines`
for saved products is still the v4-era plan (`bom_lines.cuts_json jsonb`, migration
`db/09_cuts.sql`). Extend to also persist orientation if saved products need accurate
rebuild of rotated cabinets. Cut-list / CNC output remains a downstream consumer.

### 🔴 Phase B — SketchUp → Quotation importer (still open)
Upload an export → match cabinet names to `products.code` → auto-generate a priced
**draft quotation** for a selected client. Catalog import (Stage 5/6) exists; the
*quotation* generation path does not yet.

---

## Future Phases (backlog)
- **Phase C — Production & Job Orders:** approved quotation → job order; cut list per
  job (unblocked by v4 `cuts`); job status.
- **Phase D — Inventory & Purchasing:** component stock, low-stock alerts, POs.
- **Phase E — Reporting:** revenue by client/period, BOM-vs-quoted margins.

---

## Key Decisions
- Single-tenant (no multi-org) for now.
- Custom app — no ERPNext.
- All cabinet dimensions in **millimeters**.
- **3D placement (v5):** oriented box — LOCAL `size_mm` + `axes` orientation +
  `pos_mm`, with the Z-up→Y-up map `three=(su.x, su.z, -su.y)` as a fixed basis.
  `sorted_mm` is for cut-list H/W/T only.
- **Hybrid part representation (v6):** panels → `outline_mm` (flat extrude, CNC-ready);
  channels → `profile_mm` (cross-section extrude); other fittings → true `mesh` (deduped
  by geometry hash). Lightest representation that captures each part; meshes are
  preview-only and never replace outlines/cuts for CNC.
- **Orientation export is the source of truth for rotation** — bounding boxes alone
  cannot represent rotated/asymmetric parts; `axes` (v5) supplies what the AABB drops.
- Product **code** = leading slash-segment of the SketchUp name; join key to catalogue.
- Two import families kept separate: geometry importers (.3ds/.dxf) and SketchUp JSON
  importers (v2 bulk; v3/v4/v5 single/project).
- New viewer capabilities land **additively** first (gated on data presence), then
  optionally migrate older paths once proven.
