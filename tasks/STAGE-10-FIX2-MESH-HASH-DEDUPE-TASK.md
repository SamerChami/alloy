# Stage 10-FIX2 — Dedupe meshes by geometry hash (Claude Code)

## Why
Keying the mesh cache by `defn.name` did NOT dedupe: this model's 8 legs are 8
SEPARATE component definitions, each named with a `#NN` suffix baked into the
definition name (`Leg_12cm#266`, `#268`, …). Verified earlier: 7 of the 8 leg meshes
are byte-identical, the 8th differs only in triangulation order. So name-based dedupe
can't collapse them — but GEOMETRY-based dedupe can. Change the cache to key by a hash
of the mesh geometry itself, canonicalized so vertex/triangle ORDER differences don't
defeat the match.

Extension-only fix (`alloy_export/main.rb`). Surgical; do not rewrite the file. Viewer
unchanged (it reads whatever keys exist).

## The fix — hash-keyed mesh cache

### 1. Build the mesh first, then key by canonical hash
Refactor `definition_mesh` (or the mesh-emitting code) so it computes the
vertices+triangles FIRST, then derives a stable key from a canonical form:

```ruby
require 'digest'

def self.mesh_geometry(defn)
  verts = []; tris = []; base = 0
  defn.entities.grep(Sketchup::Face).each do |f|
    pm = f.mesh
    pts = pm.points
    pts.each { |p| verts << [mm(p.x), mm(p.y), mm(p.z)] }
    pm.polygons.each do |poly|
      a, b, c = poly.map { |i| base + (i.abs - 1) }
      tris << [a, b, c]
    end
    base += pts.length
  end
  return nil if verts.empty? || tris.empty?
  { vertices: verts, triangles: tris }
end

# Canonical hash: invariant to vertex order and triangle order, so two
# instances of the same physical leg collapse even if re-triangulated.
def self.mesh_hash(mesh)
  # Sort vertices, build an old->new index remap, rewrite triangles, sort tris.
  vlist = mesh[:vertices]
  order = (0...vlist.length).sort_by { |i| vlist[i] }      # sort by [x,y,z]
  remap = Array.new(vlist.length)
  order.each_with_index { |old_i, new_i| remap[old_i] = new_i }
  sorted_verts = order.map { |i| vlist[i] }
  remapped_tris = mesh[:triangles].map { |t| t.map { |i| remap[i] }.sort }
  remapped_tris.sort!
  Digest::MD5.hexdigest([sorted_verts, remapped_tris].to_json)[0, 16]
end
```

### 2. Cache by hash; mesh_ref = hash
```ruby
def self.definition_mesh(defn)
  geo = mesh_geometry(defn)
  return nil if geo.nil?
  key = "mesh_" + mesh_hash(geo)        # geometry-content key
  @mesh_cache[key] ||= geo              # store once; identical geometry reuses
  key
end
```
Call site unchanged:
```ruby
mk = (e.is_a?(Sketchup::ComponentInstance) ? definition_mesh(e.definition) : nil)
node[:mesh_ref] = mk unless mk.nil?
```
Now `mesh_ref` is a content hash like `"mesh_a1b2c3d4e5f6..."`, and every leg with
identical (canonicalized) geometry shares ONE dict entry.

### 3. Keep everything else
`axes` (all nodes), `outline_mm` (all leaves), `profile_mm` (channels), `cuts`
unchanged. SCHEMA stays `alloy.sketchup.v6`; bump VERSION to `0.6.2`.
Reset `@mesh_cache = {}` at the start of `run` (already done — confirm).

## Verify
Re-export the corner cabinet:
- `meshes` dict has **1 entry** (all 8 legs canonicalize to the same geometry) — or 2
  at worst if the mirrored leg is a true reflection (a reflection is NOT
  vertex-order-equal to the original; that's acceptable). Report which.
- Keys are `mesh_<hash>` (no `#NN`). All 8 leg leaves' `mesh_ref` point at that key
  (or 7/1 split).
- Total leg triangles in the file drop from ~11k to ~1.4k (×8 → ×1).
- `axes`/`outline_mm` (23 each), `profile_mm` (2) intact.

> If the 8th leg (`#2666`) is a MIRRORED instance, its local geometry is a reflection
> and won't hash-match the other 7 — you'll get 2 entries (7 + 1). That's correct and
> fine; don't try to force reflections to match. Just report 1-vs-2.

## Commit
"Stage 10-fix2: dedupe meshes by canonical geometry hash (handles unique-named defs)".

Rebuild `alloy_export.rbz`. Do NOT push — I'll review. Report the mesh dict entry
count and one `mesh_ref` value.
