# STAGE 15b-FIX — Simplify group reflection signal to normalized-basis determinant

**Extension:** `alloy_export` v0.6.10 → **v0.6.11**. Schema stays **v6.5** (no field
change; `reflected` already exists — only its computation changes).

## Why (runtime evidence — named control model `groups_diag2.skp`, 8 labelled leaves)

The 15a premise "SketchUp bakes a −1 into every Make Group, so absolute det is
unusable; must compare parity vs the export root" was **WRONG**. It came from
misreading the first (unlabelled) model, whose "baseline" leaves actually carried a
real y-flip (raw det −1) — they were genuinely mirrored, so that model's all-true
result was not a bug.

The named control model proves the truth. Normalized `axes` determinant alone
separates ground truth perfectly on all 8 leaves, INCLUDING the 90°-rotated row:

| leaf            | truth     | axes-det | note                              |
|-----------------|-----------|----------|-----------------------------------|
| G_PLAIN         | not refl. | +1       | clean identity                    |
| G_MIRROR_X      | reflected | −1       | Flip Along X                      |
| G_MIRROR_Y      | reflected | −1       | Flip Along Y                      |
| G_PLAIN_R       | not refl. | +1       | rotated 90° — STILL +1 (rotation) |
| G_MIRROR_X_R    | reflected | −1       | rotate + flip                     |
| G_MIRROR_Y_R    | reflected | −1       | rotate + flip                     |
| (C_PLAIN, C_PLAIN_R: components — reflected correctly absent, group-only field)  |

A proper rotation has det +1 regardless of axis permutation; only a real
reflection gives −1. So the normalized-basis determinant IS the clean signal —
identical to the component Matrix4 path. The parity-vs-root machinery solves a
non-existent problem and introduces a latent bug: a mirrored root or a flipped
intermediate sub-assembly would make `@root_det_sign` the wrong reference and
regress reflection for the whole subtree.

## Change

Replace the parity computation with a direct normalized-basis determinant on the
leaf's own world axes (the same vectors already emitted as `node[:axes]`).

1. **Delete** `@root_det_sign` setup in `run` (~L1037–1040) and the
   `world_det_sign` parity helper (~L479) IF it is used nowhere else (grep first;
   if the diag dump references it, keep the helper but stop using it for
   `reflected`).
2. In `build_node` leaf branch (~L915), replace:
   ```ruby
   if e.is_a?(Sketchup::Group)
     node[:reflected] = (world_det_sign(tr) != @root_det_sign)
   end
   ```
   with a normalized-basis determinant from the world axes:
   ```ruby
   if e.is_a?(Sketchup::Group)
     ax = tr.xaxis.normalize; ay = tr.yaxis.normalize; az = tr.zaxis.normalize
     det = ax.x*(ay.y*az.z - ay.z*az.y) -
           ay.x*(ax.y*az.z - ax.z*az.y) +     # NOTE: build from the SAME three
           az.x*(ax.y*ay.z - ax.z*ay.y)       # normalized axes as node[:axes]
     node[:reflected] = det < 0
   end
   ```
   (Use the exact same axis vectors `world_axes(tr)` already rounds into
   `node[:axes]`, so `reflected` and `axes` can never disagree. If cleaner, compute
   the determinant from `node[:axes]` directly after it's set.)

Keep `reflected` **group-only** (components stay byte-identical; the viewer derives
component reflection from its own Matrix4 axes path, unchanged).

## Verify (must hold on `groups_diag2.skp`)
- [ ] `G_PLAIN`, `G_PLAIN_R` → `reflected: false`
- [ ] all four `G_MIRROR_*` → `reflected: true`
- [ ] `C_PLAIN*` → `reflected` ABSENT (group-only)
- [ ] every group leaf: `reflected == (det(node[:axes]) < 0)` — i.e. field agrees
      with emitted axes
- [ ] scaled-shelf size, `outline_mm`, group `cuts[]` UNCHANGED from v0.6.10
      (this fix touches reflection only)
- [ ] component-only known-good model: export byte-identical
- [ ] header reads v0.6.11 / schema v6.5

## Then close Stage 15 (doc-sync, per earlier decision)
- `03-sketchup-export-schema.md` → v6.5 / v0.6.11; document groups-parity
  (outline_mm, cuts, tooling, profile_mm, axes, **reflected**); state the CORRECTED
  finding: reflection = normalized-basis det < 0 for groups AND components; remove
  any "baked Make-Group −1 / parity vs root" language — that theory was disproven.
- `05-roadmap-open-items.md` → mark Stages 8–15 closed; record open items
  (v6 persistence to `bom_lines`; Phase B quotation importer; Z-flip guard); add
  **15c** (viewer consumes `reflected` instead of self-deriving — trigger: next
  Cabinet3D visit or a mismatch case).
- Add to SETUP-CHECKLIST: post-install, (a) `Get-ChildItem Plugins\*.rb` confirm NO
  bare `main.rb` at Plugins root (orphaned-root-file hazard — cost us this cycle),
  and (b) Ruby Console `puts Alloy::Export::VERSION` / `::SCHEMA` reads loaded
  memory, the only reliable post-install version check.

## Out of scope
Viewer wiring of `reflected` (that's 15c). v6 persistence. Phase B.
