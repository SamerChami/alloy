# ALLOY App — Phase Roadmap & Open Items

> Reconciled against the actual STAGE task files through Stage 13 and the
> v0.6.8 export. Supersedes the earlier roadmap, which stopped at Stage 7/v4.

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
- [x] **4b** Split into Products + Components via `item_kind` enum, `subcategory`, stock on components
- [x] **4c** BOM auto-pricing engine — `lib/pricing.ts`, `bom_lines`, `banding_types`, live panel-price lookup, labor+margin rollup, override, duplicate/template
- [x] **4d** Live Three.js preview — `Cabinet3D.tsx`, `lib/cabinet3d.ts`, `part_role`/`depth_mm`/`pos_offset_mm`
- [x] **4e** Polyboard DXF importer + fixes (concluded DXF is a flat layout)
- [x] **4f/4g** .3ds importer — assembled geometry, real positions; render polish; E2E persist

### Stage 5 — SketchUp JSON (v2) + 3D placement
- [x] **5** Bulk catalog import from `alloy.sketchup.v2`, panels-only BOM
- [x] **5b** Rotation-proof H/W/T derivation + 3D from real positions
- [x] **5c–5e** Cabinet3D controls, vertical-rotate fix, expand-to-modal, accurate placement

### Stage 6 — SketchUp v3 importer
- [x] **6** `alloy.sketchup.v3` (nested tree) — Single + Project modes (`lib/sketchup/parseV3.ts`)
- [x] **6b** Smart fitting shapes in 3D (cylinder legs, L/U channels, P2O)

### Stage 7 — Cut detection (Ruby extension)
- [x] **7 / 7b** Cut/groove/rabbet/dado detection → schema `v4`, `cuts[]` per leaf; fittings excluded, noise filter

### Stage 8 — Consume v4 (cuts + ingest)
- [x] **8a** v4 ingest — parser carries `cuts[]` on leaves, reads `total_parts`
- [x] **8b** Render cuts in 3D as recesses/insets on panel boxes
- [x] **8b–8e** Cut face/mirror/interior/depth fixes

### Stage 9 — Orientation (v5 `axes`)
- [x] **9** Extension exports per-part `axes` (local axis unit-vectors in world space) → schema `v5`
- [x] **9b** Viewer oriented-box rendering for `axes`
- [x] **9c–9f** Fitting-orient / leg-orientation / axes-regression / panel-outline / channel-profile fixes

### Stage 10 — Fitting mesh
- [x] **10** Real fitting geometry via `mesh_ref` + mesh dedupe/hash, modal meshes

### Stage 11 — Inner machining + face polarity
- [x] **11** `tooling[]` (compact pockets/bores) + `cuts[]` (grooves, ≥4:1); through-bores as open holes, blind pockets as recessed discs; grooves inset flush
- [x] **11d** Face-polarity fix using the floor face's own normal
- [x] **11e** `open_normal` exported in **WORLD** space (schema v0.6.8)

### Stage 12 — Rotation / reflection placement
- [x] Oriented-box sizing from `outline_mm` (u/v + thickness) routed to local axes by role (width→x, depth→y, height→z)
- [x] **Root fix:** apply panel orientation as a reflection-preserving **Matrix4** (not a quaternion, which drops det −1 on mirrored panels). Fixes the long-standing scattered/fin bug on rotated & mirrored cabinets. Grooves self-correct (cuts inherit parent matrix).

### Stage 13 — Reflection-aware fittings
- [x] Leg-mesh (`mesh_ref`) and channel-profile (`profile_mm`) render paths made reflection-aware (same Matrix4 approach as panels)
- [x] Verified correct across rotation + X/Y/Z flips, all three render paths, grooves/bores included

**Latest artifact:** `alloy_export_0_6_8_*.json` — schema `alloy.sketchup.v6.3`,
version `0.6.8`. Verified: rotated, X/Y/Z-flipped, and unrotated cabinets all
render correctly (panels, legs, channels, grooves).

---

## Open Items (next)

### 🟡 v6 persistence (deferred from Stage 10)
Saved products do not yet persist the full geometry needed to rebuild an
accurate 3D view on reopen. Persist `outline_mm`, `profile_mm`, and `mesh`
(or `mesh_ref`) to `bom_lines` so a re-opened saved product reconstructs the
exact oriented/reflected geometry (now that the viewer handles it correctly).
This is the natural next step — it preserves the geometry correctness the
viewer now guarantees.

### 🔴 Phase B — SketchUp → Quotation importer (still open)
Upload an export → match cabinet names to `products.code` → auto-generate a
priced **draft quotation** for a selected client. Catalog import exists; the
quotation-generation path does not.

### ⚪ Z-flip business-logic guard (minor, optional)
A Z-flipped cabinet renders faithfully but is physically upside-down (legs on
top) — almost always a modeling error. Optional future guard: warn at
export/import time when a cabinet's vertical axis is inverted. Not a viewer
bug; deliberately deferred.

---

## Future Phases (backlog)
- **Phase C — Production & Job Orders:** approved quotation → job order; cut list per job; job status.
- **Phase D — Inventory & Purchasing:** component stock, low-stock alerts, POs.
- **Phase E — Reporting:** revenue by client/period, BOM-vs-quoted margins.

---

## Key Decisions
- Single-tenant (no multi-org) for now.
- Custom app — no ERPNext.
- All cabinet dimensions in **millimeters**.
- 3D placement is **orientation-aware**: each part is an oriented box built
  from `outline_mm` extents + `axes`, applied as a reflection-preserving
  Matrix4. `size_mm` is the world-axis AABB and must NOT be used directly for
  oriented panels; `sorted_mm` is for cut-list H/W/T only.
- `open_normal` is exported in WORLD space (v0.6.8); groove face placement is
  geometry-driven (`szSign`), cuts ride the parent panel's matrix.
- Product **code** = leading slash-segment of the SketchUp name; join key to the catalogue.
- Three viewer render paths: panel/Matrix4 (`outline`), leg/mesh (`mesh_ref`),
  channel/profile (`profile_mm`) — all reflection-aware.
