# STAGE 15a — Groups Parity: Export-Side Diagnostic

**Extension:** `alloy_export` v0.6.9 → diagnostic build (no version bump, no schema bump).
**Schema stays:** `alloy.sketchup.v6.4`.
**Goal:** Produce runtime evidence that decides how to give **groups** the same
oriented + scale-aware treatment components already get. This stage adds a
**gated, read-only diagnostic dump ONLY — no behavioural fix.**

---

## Why (current v0.6.9 gap — confirmed in main.rb)

Every oriented/scale-aware path is gated to `ComponentInstance` and keyed on
`e.definition` / `defn.bounds` / `defn.entities`:

- `detect_cuts`      — `return [] unless e.is_a?(Sketchup::ComponentInstance)` (~L88)
- `detect_tooling`   — `return [] unless ... ComponentInstance` (~L481)
- `face_outline`     — `return nil unless ... ComponentInstance` (~L262)
- `cross_section`    — `return nil unless ... ComponentInstance` (~L352)
- `instance_scales`  — `return [1.0,1.0,1.0] unless ... ComponentInstance` (~L453)
- `definition_mesh`/`mesh_ref` — only built for components (~L752)

Result: a **group leaf** today gets `size_mm` / `pos_mm` / `axes` but **no
`outline_mm`, no `cuts`, no `tooling`, no real scale, no `mesh_ref`**. It falls
through every accurate path. `local_bounds` (~L62) already handles groups
(`e.local_bounds` → fallback `e.entities.parent.bounds`), so bounds are reachable;
the rest is not.

**The crux is not "does the group have a definition" (it doesn't) — it's whether a
group's measurements live in a usable LOCAL frame the same way a component's
`defn.bounds` do, and whether scale/reflection are recoverable from
`group.transformation`.** The dump answers that.

---

## Prime directive
Runtime logs beat static reasoning. Do **not** implement the fix from this file.
Dump, read values, then 15b. Measure groups in **instance/world space** throughout.

---

## Part 1 — Test model spec (build `groups_diag.skp`)

One root assembly with **6 flat panels** as matched **group/component twins** in the
same pose, so each group can be read against a known-good component control.

Panel nominal size: **18 × 560 × 770 mm** (thickness × width × height) — three
clearly distinct extents so the thickness axis is unambiguous (equal extents hide
which axis a derivation picked).

| Part | Entity    | Pose                                   | Tests                            |
|------|-----------|----------------------------------------|----------------------------------|
| A1   | group     | axis-aligned, no rotation, no scale    | baseline group                   |
| A2   | component | identical to A1                        | baseline control                 |
| B1   | group     | rotated ~35° about vertical (SU Z)     | orientation recoverable?         |
| B2   | component | identical to B1                        | control                          |
| C1   | group     | mirrored on one axis (real flip)       | reflection (det = −1) recoverable?|
| C2   | component | identical to C1                        | control                          |

Bonus (if cheap to add): **D1 group non-uniformly scaled** (e.g. width ×1.5 only)
+ **D2 component** twin — directly tests the `instance_scales` double-count risk.

Build rules:
- Make groups via `Make Group` on raw geometry; components via `Make Component`.
  Keep each **natively** its kind — do not group-then-convert.
- For the mirror (C1/C2) use a true reflection (Flip Along, or −1 axis scale), NOT
  a 180° rotation — we specifically need a negative determinant.
- Cut at least one real **groove** into one panel pair (e.g. a 9mm-wide, 8mm-deep
  dado on a big face) so we can see whether group cut-detection is even reachable.
- Put all six (eight with D) under one root group/component so existing root
  traversal collects them as leaves. Save as `groups_diag.skp`.

If a group-containing model already exists, it may be substituted **only if** it
contains at least one rotated group and one mirrored group, each with a component
twin — otherwise the dump is inconclusive.

---

## Part 2 — Diagnostic dump

Add a temporary, **gated** diagnostic to `main.rb` behind a single constant:

```ruby
ALLOY_DIAG = true   # set false / delete in 15b
```

When on, during `run`, write a companion file next to the chosen JSON path named
`groups_diag.txt` (derive from the save path; also `puts` to the Ruby console as
backup). Walk the same tree `build_node` walks; for **every leaf** (group AND
component) emit one labelled block.

For each leaf dump — **with the group/component twin distinction explicit**:

1. **kind** — `Group` | `ComponentInstance`.
2. **name** — `name_of(e)`.
3. **local bounds** used by the measurement paths:
   - component: BOTH `e.definition.bounds` (min + w/h/d) AND `e.bounds`
     (instance, min + w/h/d) — show the split.
   - group: `local_bounds(e)` result (min + w/h/d) AND `e.bounds` (min + w/h/d).
     Note whether `e.respond_to?(:local_bounds)` was true (which branch fired).
4. **transform** — `e.transformation.to_a` (16 floats). Confirm/annotate ordering
   (current code at ~L454 assumes **column-major**: columns 0/1/2 = local axes).
5. **derived basis** — `t.xaxis`, `t.yaxis`, `t.zaxis` (vector + `.length` each).
   Axis `.length` ≠ 1.0 ⇒ scale carried in the transform.
6. **column-magnitude scale** — exactly what `instance_scales` would compute from
   `to_a`: `sx=√(m0²+m1²+m2²)`, `sy=√(m4²+m5²+m6²)`, `sz=√(m8²+m9²+m10²)`.
   Dump for groups too (even though the code currently forces [1,1,1] for them).
7. **determinant** — `det` of the 3×3 [xaxis|yaxis|zaxis] basis. `< 0` ⇒ reflection.
8. **world AABB** — transform all 8 local-bounds corners by the leaf's full world
   transform (`parent_tr * e.transformation`, accumulated down the tree); dump
   min/max + extents per world axis.
9. **world thinnest axis** — which world-AABB extent is smallest (thickness
   candidate if 15b must go geometry-driven for groups).
10. **face reachability** — count `Sketchup::Face` entities in `entities_of(e)`,
    and whether a largest thickness-normal face was found (mirror of what
    `face_outline` needs). For groups this proves whether the existing
    face-projection logic could run unchanged against `e.entities`.

Block format (one per leaf, clearly delimited):

```
===== LEAF: B1_panel  [Group]  (respond_to?(:local_bounds)=true) =====
local_bounds.min  = (.., .., ..)   ext = (18.0, 560.0, 770.0)
e.bounds.min      = (.., .., ..)   ext = (.., .., ..)
defn.bounds.ext   = (n/a — group)
xform.to_a        = [ ...16 floats... ]   (column-major)
xaxis=(..) len=.. yaxis=(..) len=.. zaxis=(..) len=..
instance_scales*  = (sx, sy, sz)          (* computed for diagnosis; not applied to groups today)
det(basis)        = +1.000 | -1.000
world.aabb.ext    = (.., .., ..)
world.thinnest    = X | Y | Z
faces=NN  thickness_face_found=true|false
==============================================================
```

Keep it defensive: wrap each leaf's dump in `rescue` so one bad leaf can't abort
the export. The dump must not alter the emitted JSON in any way.

---

## Part 3 — Questions the dump must answer (read AFTER running)

- **Q1 — Orientation.** Does B1 (rotated group) basis show the ~35° rotation the
  same way B2 (component) does? If yes → groups reuse `world_axes`/orientation
  path. If B1 is identity-ish while geometry is clearly rotated → orientation must
  come from world geometry, not the transform.
- **Q2 — Reflection.** Is `det = −1` present on C1 (mirrored group) like C2? If yes
  → the existing Matrix4 reflection handling carries over. If the group bakes the
  flip into geometry (det = +1) → 15b needs a different reflection signal.
- **Q3 — Scale double-count.** For the baseline pair A1/A2 and (if built) the
  scaled pair D1/D2: does `local_bounds(group)` ALREADY include the placed scale
  (so `instance_scales` on top would double it), or is it unit-frame like
  `defn.bounds` (so scale must be applied, exactly as components do)? This decides
  whether group `outline_mm`/`size_mm` need the scale multiply or not.
- **Q4 — Face reachability.** Is `thickness_face_found=true` for the group panels?
  If yes, `face_outline`/`detect_cuts`/`detect_tooling` can likely run against
  `e.entities` with only the definition→entities source swapped — no algorithm
  change. If no, the face-projection approach needs rework for groups.

**Do not choose the 15b derivation source until Q1–Q4 are answered from real values.**

---

## Part 4 — Run, report, clean restart

1. Repackage the `.rbz` with `ALLOY_DIAG = true`. Packaging discipline: archive
   must nest as `alloy_export.rb` (loader) + `alloy_export/main.rb`. `main.rb` must
   NOT be at the archive root.
2. **Clean reinstall (stale-install hazard):** in SketchUp, uninstall the old ALLOY
   Export extension → **quit SketchUp entirely** → manually delete the Plugins
   `alloy_export` folder → relaunch SketchUp → install the new `.rbz` → restart
   SketchUp once more so the extension loads fresh.
3. Open `groups_diag.skp`, run **Plugins → Export to ALLOY (JSON)**.
4. Paste back here: the full `groups_diag.txt` (all leaves) AND the exported JSON.
   We read Q1–Q4 together, then scope 15b.

---

## Out of scope (15a) — do NOT do these now
- Any change to `outline_mm` / `cuts` / `tooling` / `mesh_ref` for groups.
- Removing or relaxing the `ComponentInstance` gates.
- Touching `instance_scales` behaviour (only COMPUTE-and-dump for groups).
- `Cabinet3D.tsx` / `lib/cabinet3d.ts` / `parseV3` edits.
- Schema or VERSION bump.
- Doc-sync of `03-`/`05-` (those are ~6 stages stale; sync at 15b close when the
  schema actually changes — or as a separate standalone task).
