# ALLOY App — Phase Roadmap & Open Items

> Reconciled against the actual STAGE task files through Stage 15 and the v6.5 export.
> Supersedes the earlier roadmap, which stopped at Stage 7 / v4.

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
- [x] **4c** BOM auto-pricing engine — `lib/pricing.ts`, `bom_lines`, `banding_types`, labor+margin rollup, override, duplicate/template
- [x] **4d** Live Three.js preview — `Cabinet3D.tsx`, `lib/cabinet3d.ts`, `part_role`/`depth_mm`/`pos_offset_mm`
- [x] **4e** Polyboard **DXF** importer + fixes — concluded DXF is a flat layout, 3D synthesized from roles
- [x] **4f/4g** Switched to **.3ds** importer — assembled geometry, real positions; render polish; E2E persist (`pos_x/y/z_mm`)

### Stage 5 — SketchUp JSON (v2) + 3D placement
- [x] **5** Bulk catalog import from `alloy.sketchup.v2`, panels-only BOM
- [x] **5b** Rotation-proof H/W/T derivation (sorted extents) + 3D from real positions
- [x] **5c** Cabinet3D controls (pan/zoom/rotate, scroll capture, shaded/wireframe)
- [x] **5d** Vertical-rotate fix + expand-to-modal viewer
- [x] **5e** Accurate SketchUp 3D placement — raw per-axis extents + real positions, Z-up map

### Stage 6 — SketchUp v3 importer
- [x] **6** `alloy.sketchup.v3` (nested tree) — Single + Project modes, recursive leaf collection (`lib/sketchup/parseV3.ts`)
- [x] **6b** Smart fitting shapes in 3D (cylinder legs, L/U channels, P2O)

### Stage 7 — Cut detection (Ruby extension)
- [x] **7** Cut/groove/rabbet/dado detection → schema `alloy.sketchup.v4`, `cuts[]` per panel leaf
- [x] **7b** Refined — fittings excluded, noise filter, `total_parts` fixed (v0.4.1)

### Stage 8 — Consume v4 + cuts in 3D
- [x] **8a** v4 ingest — parser carries `cuts[]`, reads `total_parts`; cuts persisted
- [x] **8b** Render cuts in 3D as recesses; cut-face placement
- [x] **8b/8c/8d/8e** Cut fixes — correct big-face, mirror handling, interior placement, depth

### Stage 9 — Oriented geometry (schema v5)
- [x] **9 / 9b** Viewer oriented-box from real axes
- [x] **9c/9d/9e** Fitting-orientation, leg-orientation, axes-regression fixes
- [x] **9e** `outline_mm` — panel silhouette loop + thickness, authoritative oriented sizing
- [x] **9f** `profile_mm` — channel cross-section extrusion
- [x] **11e** `open_normal` moved to **world space**; groove face placement geometry-driven (`szSign`)

### Stage 10 — Fitting mesh geometry (schema v6)
- [x] **10** Arbitrary fitting `mesh` geometry in top-level `meshes{}` + `mesh_ref`
- [x] **10 FIX / FIX2 / FIX3** mesh dedupe (hash), modal-viewer meshes

### Stages 11–13 — Rotated/mirrored cabinet bug arc (CLOSED)
- [x] **Root cause (12):** `THREE.Quaternion.setFromRotationMatrix` silently drops the
  −1 determinant on reflected panels, converting a reflection into a wrong rotation.
- [x] **Fix:** apply panel orientation as a full `Matrix4` with `matrixAutoUpdate=false`,
  translation baked in, so reflections survive (`det(C·Rworld) = −1` for reflected
  panels).
- [x] **13:** `mesh_ref` (leg) and `profile_mm` (channel) render paths made
  reflection-aware too. All three render paths verified across rotation + X/Y/Z flips.
- [x] Schema reached `alloy.sketchup.v6.3`.

### Stage 14 — Non-identity component axes / scale (CLOSED)
- [x] **14a** Viewer-side diagnostic — confirmed orientation, determinants, and
  reflection handling were all CORRECT; ruled out the viewer as the cause.
- [x] **14b** Export-side diagnostic — proved the discrepancy lives in the JSON:
  `defn.bounds` (unscaled definition box) was used, while `instance.bounds` (truth)
  differed by a per-axis scale on resized instances.
- [x] **14c** Fix (export-side, Option A) — measure in **instance space**: per-local-
  axis scale baked into `size_mm`, `outline_mm`, `mesh` vertices, and `cuts[]`. Schema
  **v6.4 / v0.6.9**. Viewer untouched. Verified: app BOM table matches SketchUp
  exactly (T=18, Back 752, Sides 770, Legs 110) and 3D preview renders flush rails,
  correct legs, full-height sides.
- [x] **Schema-gate fix** — single/project importers now accept the `alloy.sketchup.v*`
  family (major ≥ 3) instead of a hardcoded `v3`, so v6.4 imports.

### Stage 15 — Groups parity (schema v6.5) (CLOSED)
- [x] **15a** Export-side groups diagnostic — gated read-only dump (`groups_diag.txt`)
  over the same tree `build_node` walks. Proved: (1) orientation is correct via
  `world_axes`; (2) group scale was being thrown away (`[1,1,1]` hardcode) but is
  recoverable from `transformation.to_a` column magnitudes; (3) a first (unlabelled)
  test model appeared to show "baked Make-Group −1" — this was later disproven; (4)
  group faces are reachable, geometry helpers work once their source is swapped.
- [x] **15b** Fix — generalised `instance_scales` to groups; ungated `face_outline`,
  `cross_section`, `detect_cuts`, `detect_tooling` and swapped geometry source to
  `entities_of(e)` / `local_bounds(e)`; added a `reflected` leaf field (initially
  parity-relative). Groups now carry `outline_mm`/`cuts`/`tooling`/`profile_mm` and
  correct scale. Components **byte-identical** (`reflected` group-only). v0.6.10 / v6.5.
- [x] **15b-FIX** Corrected reflection signal — the parity-vs-root approach (v0.6.10)
  was built on a disproven assumption. A named 8-leaf control model (`groups_diag2.skp`)
  proved: the **normalized-basis determinant** (`det(xaxis.normalize, yaxis.normalize,
  zaxis.normalize) < 0`) cleanly separates reflected from non-reflected on all cases
  including rotated groups; `G_PLAIN`/`G_PLAIN_R` → +1; all four `G_MIRROR_*` → −1.
  Replaced parity machinery with the direct det computation; `@root_det_sign` and
  `world_det_sign` removed. v0.6.11 / schema unchanged (v6.5).

**Latest artifact:** the shipped export is **schema `alloy.sketchup.v6.5`, version
`0.6.11`** (`alloy_export_0_6_11.rbz`). v0.6.10 was the initial groups-parity build
(reflection signal was parity-relative; corrected in 15b-FIX).

---

## Open Items (next)

### 🟡 Routing-inside-a-part display (your item #1)
Refine how routing/cuts inside a part render to match SketchUp exactly. Cuts already
inherit the panel's reflection-correct matrix; remaining work is footprint/face/depth
fidelity. Pending screenshots specifying the exact discrepancy.

### 🟡 v6 persistence
Save `outline_mm`, `profile_mm`, `mesh`, and the new group `reflected` flag to
`bom_lines` so re-opened saved products rebuild accurately without re-importing from
SketchUp. Natural place to also revisit the "Make Unique" leg mesh-dedupe backlog
item (identical legs currently store multiple mesh copies — payload-size only).

### 🟡 Stage 15c — Viewer consumption of `reflected` (group leaves)
v6.5 emits `reflected: true/false` on group leaves; the viewer currently still
re-derives reflection from `axes`. Wire `Cabinet3D` to consume `reflected` directly
instead of self-deriving — this removes duplicated determinant logic and ensures the
viewer never disagrees with the export on group orientation. Trigger: next Cabinet3D
visit or a mismatch case. No schema change needed.

### 🔴 Phase B — SketchUp → Quotation importer (next major business feature)
Upload an export → match cabinet names to `products.code` (leading slash-segment,
e.g. `BDR.K3.120`) → auto-generate a priced **draft quotation** for a selected client.
Catalog import exists; the quotation-generation path does not yet.

### 🟢 Optional — Z-flip guard (upstream)
A Z-flip produces a physically upside-down cabinet (legs on top). The viewer renders
this faithfully — not a bug. A future export/import business-logic warning on
Z-flipped cabinets is possible but unscoped.

---

## Future Phases (backlog)
- **Phase C — Production & Job Orders:** approved quotation → job order; per-job cut
  list (unblocked by `cuts`); job status.
- **Phase D — Inventory & Purchasing:** component stock, low-stock alerts, POs.
- **Phase E — Reporting:** revenue by client/period, BOM-vs-quoted margins.

---

## SETUP-CHECKLIST (post `.rbz` install)

After installing a new `.rbz`, **always run both checks before exporting**:

1. **No bare `main.rb` at the Plugins root** — a stale orphan from an earlier
   bad-nesting install will shadow the real one and load the wrong version silently.
   In PowerShell: `Get-ChildItem "$env:APPDATA\SketchUp\*\SketchUp\Plugins\*.rb" | Where-Object Name -eq main.rb`
   → result must be empty. If not, delete the bare `main.rb` and restart SketchUp.

2. **Verify loaded version in the Ruby Console** (Window → Ruby Console):
   ```
   puts Alloy::Export::VERSION
   puts Alloy::Export::SCHEMA
   ```
   Expected: `0.6.11` / `alloy.sketchup.v6.5` (or the current shipped version).
   This reads loaded memory — the only reliable post-install version check, since
   file timestamps and Extension Manager UI can lag behind reality.

---

## Key Decisions
- Single-tenant (no multi-org) for now. Custom app — no ERPNext.
- All cabinet dimensions in **millimeters**.
- **Oriented sizing** uses `outline_mm` (panels) / `mesh`/`profile` (fittings) + `axes`
  + `pos_mm`, orientation applied as a reflection-safe `Matrix4`. `sorted_mm` is for
  cut-list H/W/T only; raw `size_mm` is a world-AABB and must not size oriented panels.
- **Export measures instance space, not definition space** (v6.4) — per-axis instance
  scale is baked into all measurements.
- **Groups reach parity with components** (v6.5) — same oriented + scale-aware paths,
  sourced via `entities_of`/`local_bounds`. Group reflection is the same
  normalized-basis `det(xaxis, yaxis, zaxis) < 0` test as components, pre-computed
  and emitted as the additive `reflected` boolean so the viewer never re-derives it.
- Product **code** = leading slash-segment of the SketchUp name; join key to catalogue.
- Import families kept separate: geometry importers (.3ds/.dxf) and SketchUp JSON
  importers (v2 bulk; v3–v6.5 single/project).

---

## Working principles (hard-won)
- **Runtime logs beat static reasoning.** The det/scale logs cracked both the
  scatter/fin bug (Stage 12) and the dimension bug (Stage 14) after wrong theories
  from screenshots/JSON alone.
- **Verify in the app, not just the JSON.** A correct export is necessary but not
  sufficient — re-import and eyeball the 3D + BOM before closing a stage.
- **`.rbz` packaging discipline** — `alloy_export.rb` loader at archive root +
  `alloy_export/main.rb`; uninstall → quit SketchUp → delete Plugins folder →
  reinstall to avoid stale installs.
- **Clean restart after every viewer-touching change** — kill Next.js, `npm run dev`
  fresh, hard-refresh (Ctrl+Shift+R).
