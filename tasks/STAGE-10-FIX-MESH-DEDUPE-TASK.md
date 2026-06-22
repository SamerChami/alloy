# Stage 10-FIX — Mesh dedupe keys by instance, not definition (Claude Code)

## The bug (verified against `alloy_export_0_6_0.json`)
The v6 export emits 8 separate mesh entries for 8 legs instead of deduping to 1. The
`meshes` dict keys are INSTANCE names (`Leg_12cm#266`, `#268`, … — note the `#NN`
suffixes), proving the cache is keyed by the instance name, not the component
DEFINITION. Geometry check confirms it's a keying bug, not real distinct parts:
7 of the 8 leg meshes are BYTE-IDENTICAL (same vertices+triangles); the 8th
(`Leg_12cm#2666`) differs only in triangulation order (a rotated/mirrored instance of
the same leg). So they should collapse to 1 (or at most 2) mesh entries, not 8.

Result: ~11,000 triangles in the file where ~1,400 would do — dedupe defeated.

This is a Part-A (extension) fix ONLY. The viewer needs no change — it renders
whatever keys exist; we just want fewer, shared keys. Surgical edit to
`alloy_export/main.rb`; do not rewrite the file.

## Root cause
In `definition_mesh` (or wherever the mesh cache key is set) and/or in the
`build_node` wiring, the key is the INSTANCE name (`name_of(e)` / `node[:name]`)
rather than `e.definition.name`. A ComponentInstance's `.definition.name` is shared
across all instances; the instance name (with `#NN`) is unique. Keying on the instance
name guarantees a cache miss every time → one mesh per instance.

## The fix
1. **Key the mesh cache by `defn.name`** (the definition), passed in as the argument.
   Ensure `definition_mesh(defn)` receives `e.definition` and uses `defn.name` as the
   hash key and as the returned `mesh_ref` value:
   ```ruby
   def self.definition_mesh(defn)
     key = defn.name                      # ← DEFINITION name, shared across instances
     return key if @mesh_cache.key?(key)  # cache hit → reuse, emit nothing new
     # ... build verts/tris from defn.entities ...
     return nil if verts.empty? || tris.empty?
     @mesh_cache[key] = { vertices: verts, triangles: tris }
     key
   end
   ```
2. **Confirm the call site passes the definition**, not the instance:
   ```ruby
   mk = (e.is_a?(Sketchup::ComponentInstance) ? definition_mesh(e.definition) : nil)
   node[:mesh_ref] = mk unless mk.nil?
   ```
   `mesh_ref` will now be the definition name (e.g. `"Leg_12cm"` — NO `#NN`).

3. **Edge case — unnamed definitions.** If `defn.name` is empty/blank (some
   definitions are unnamed), fall back to a stable key derived from the definition's
   `entityID` so distinct unnamed defs don't collide and identical ones still share:
   ```ruby
   key = defn.name
   key = "def_#{defn.entityID}" if key.nil? || key.strip.empty?
   ```
   (Prefer the name when present so keys stay human-readable.)

## Verify
Re-export the corner cabinet:
- `meshes` dict has **1 entry** (or 2 if `#2666` is genuinely a different/mirrored
  definition) — NOT 8. Keys are definition names like `Leg_12cm`, with NO `#NN`.
- All 8 leg leaves' `mesh_ref` point at that shared key (or split 7/1 at most).
- Total mesh triangles in the file drop ~8× (from ~11k to ~1.4k).
- `axes`, `outline_mm` (23 each), `profile_mm` (2 channels) all still intact.
- schema still `alloy.sketchup.v6`, version `0.6.0` (no bump — same schema, fixed
  dedupe). If you prefer, bump patch to `0.6.1` and note "fix mesh dedupe"; keep
  SCHEMA = `alloy.sketchup.v6`.

## Commit
"Stage 10-fix: dedupe meshes by definition name (not instance); ~8x fewer leg meshes".

Rebuild `alloy_export.rbz`. Do NOT push — I'll review. Clean dev-server restart after
if any viewer file was touched (shouldn't be). Report the mesh dict entry count and
the `mesh_ref` value on a leg leaf.

## Note
If after this the dict STILL has 8 entries with `#NN` keys, then these legs are NOT
instances of one shared definition in the model — they're 8 separate definitions (each
copied as a unique component). In that case report it: the fix is correct but the
model can't be deduped by definition, and Samer would need to make the legs true
instances of one component in SketchUp (or we accept per-instance meshes). State which
case you observe.
