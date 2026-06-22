# Stage 10 — True mesh export for fittings (deduped by definition) — extension + viewer

Render detailed fittings (legs, hardware) as their REAL SketchUp geometry — tapered
shafts, mounting plates, holes, flared feet — which no 2D profile can represent. Keep
the lightweight, CNC-ready representations we already have for the parts that don't
need a mesh:
- **Panels** keep `outline_mm` (flat board extrude — exact, tiny, feeds cut-lists).
- **Channels** keep `profile_mm` (cross-section extrude — Stage 9f).
- **Legs / other non-channel fittings** get a TRUE MESH.

Meshes are **deduped by component definition**: 8 identical legs share ONE definition,
so we export ONE mesh and place 8 instances via the `axes` + `pos_mm` we already emit.

Two parts: **A — extension** (export meshes), **B — viewer** (render them). Additive;
bump to **v0.6.0 / schema `alloy.sketchup.v6`**.

---

## Part A — Extension: export deduped meshes

### Which leaves get a mesh
A leaf gets a mesh when it is a **fitting that is NOT a channel**:
`has_any?(name, FITTING_KEYS) && !has_any?(name, ["l_channel","u_channel","channel"])`.
(Channels keep `profile_mm`; panels keep `outline_mm`. Do not mesh those.)

> Scope note: this is fittings-only by design. Do NOT mesh panels — they must keep
> `outline_mm` for CNC. If we later want meshes for other parts, we extend the gate.

### Dedupe key
Use the component DEFINITION name as the mesh key, NOT the instance name. Instances
are `Left side`-style unique names with `#NN`; the DEFINITION is shared. In Ruby:
`e.definition.name` for a ComponentInstance. Strip nothing — use the raw definition
name as the dictionary key. Maintain a module-level hash `@mesh_cache = {}` populated
during the walk; a definition's mesh is computed once, on first encounter.

### Mesh extraction `definition_mesh(defn)`
Compute in the definition's LOCAL space (so it's instance-independent; the viewer
orients/places each instance via `axes`+`pos`). Use SketchUp's PolygonMesh:
```ruby
def self.definition_mesh(defn)
  key = defn.name
  return key if @mesh_cache.key?(key)

  verts = []
  tris  = []
  base  = 0
  defn.entities.grep(Sketchup::Face).each do |f|
    pm = f.mesh                      # Geom::PolygonMesh, triangulated
    pts = pm.points                  # 1-indexed array of Geom::Point3d (local coords)
    pts.each { |p| verts << [mm(p.x), mm(p.y), mm(p.z)] }
    pm.polygons.each do |poly|       # each poly is 3 signed 1-based indices
      a, b, c = poly.map { |i| base + (i.abs - 1) }
      tris << [a, b, c]
    end
    base += pts.length
  end
  return nil if verts.empty? || tris.empty?

  @mesh_cache[key] = { vertices: verts, triangles: tris }
  key
end
```
Notes:
- `f.mesh` returns a triangulated `Geom::PolygonMesh`; `polygons` returns triangles as
  signed 1-based indices (sign encodes soft edges — use `.abs`). Convert to 0-based.
- Coordinates already in the definition's local frame (no transform) → reusable.
- Round via `mm()` (1 decimal) for compactness.
- Holes/curves come through as triangles automatically — full SketchUp detail, no
  simplification (per decision).
- Never raise; on any failure return `nil` (leaf simply has no mesh → viewer falls
  back to its current fitting shape).

### Wire into `build_node` (leaf branch)
For meshed fittings, after the `cuts: []` line:
```ruby
if has_any?(node[:name], FITTING_KEYS) &&
   !has_any?(node[:name], ["l_channel","u_channel","channel"])
  mk = (e.is_a?(Sketchup::ComponentInstance) ? definition_mesh(e.definition) : nil)
  node[:mesh_ref] = mk unless mk.nil?
end
```
So each meshed leaf carries `mesh_ref: "<definition name>"`. Keep emitting `axes`
(all nodes), `outline_mm` (all leaves), `profile_mm` (channels) — all UNCHANGED.

### Top-level meshes dictionary
After the tree is built (in `run`, where the payload hash is assembled), attach the
cache as a top-level dictionary so each mesh appears ONCE:
```ruby
payload[:meshes] = @mesh_cache   # { "<defn name>": { vertices:[[x,y,z]...], triangles:[[a,b,c]...] }, ... }
```
Reset `@mesh_cache = {}` at the start of `run` so repeated exports don't accumulate.

### Version / schema
- `VERSION = "0.6.0"`, `SCHEMA = "alloy.sketchup.v6"`.
- Header comment: v6 = v5.3 + deduped `meshes` dict + `mesh_ref` on meshed fittings.
- Rebuild `alloy_export.rbz`.

### Verify (Part A)
Re-export the corner cabinet:
- Top-level `meshes` has ONE entry for the leg definition (NOT 8). Its `vertices`/
  `triangles` arrays are non-trivial (a detailed leg → hundreds+ of triangles).
- All 8 `Leg_12cm#NN` leaves carry `mesh_ref` = that one definition name.
- Channels have NO `mesh_ref` (still `profile_mm`); panels have NO `mesh_ref` (still
  `outline_mm`).
- `axes`, `outline_mm`, `profile_mm`, `cuts` all still present as in v5.3.

---

## Part B — Viewer: render referenced meshes

### Types (`lib/sketchup/parseV3.ts`)
- Add to `V3Json`: `meshes?: Record<string, { vertices: [number,number,number][]; triangles: [number,number,number][] }>`.
- Add to `V3Node` / `V3Part`: `mesh_ref?: string`.
- Carry `mesh_ref` through `cabinetToParts`. Expose the `meshes` dict to the import
  shell (return it alongside parts, or read `json.meshes` there).
- Add `"alloy.sketchup.v6"` to `SUPPORTED_SCHEMAS`.

### Plumb the mesh dict to the viewer
- Import shell (`SingleImportShell.tsx`): pass the `meshes` dict and each part's
  `mesh_ref` into `SkuPanel3D`. Simplest: add `mesh_ref?: string` to `SkuPanel3D`, and
  pass the whole `meshes` dict as a new prop on `<Cabinet3D meshes={...} />`.
- `lib/cabinet3d.ts`: add `mesh_ref?: string` to `SkuPanel3D` and `Box3D`; carry it
  through `buildBoxesFromOrientedPanels`.

### Render (`components/Cabinet3D.tsx`, fitting branch — TOP priority)
New priority order in the fitting path:
1. **`box.mesh_ref` present AND `meshes[mesh_ref]` exists** → build a `BufferGeometry`
   from the mesh:
   ```ts
   const md = meshes[box.mesh_ref];
   const g = new THREE.BufferGeometry();
   const pos = new Float32Array(md.vertices.length * 3);
   md.vertices.forEach((v, i) => { pos[i*3]=v[0]/1000; pos[i*3+1]=v[1]/1000; pos[i*3+2]=v[2]/1000; });
   g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
   g.setIndex(md.triangles.flat());
   g.computeVertexNormals();
   ```
   The mesh is in the part's LOCAL frame (SU local coords). Apply the SAME mapping the
   oriented box path uses: the change-of-basis `C` is already baked into `box.orient`,
   but note the mesh vertices are raw SU-local (x,y,z), NOT pre-mapped. So:
   - First map each vertex SU→three: `(x, z, -y)` (the `C` basis), the same transform
     `buildBoxesFromOrientedPanels` applies to size/center. Apply this when filling the
     `pos` array: `pos[i*3]=x/1000; pos[i*3+1]=z/1000; pos[i*3+2]=-y/1000;`.
   - Then apply `box.orient` (the part's `axes` rotation) and translate to `box.x/y/z`,
     exactly like the panel/profile paths. (For identity-axes parts `orient` is just
     `C`-derived; verify the leg lands upright and at the right corner.)
   - `computeVertexNormals()` for shading.
   Use the fitting material/color; support wireframe (set `wireframe:true` or render
   edges) consistent with other fittings.
2. **Leg/P2O without a usable mesh** → existing upright cylinder (Stage 9d) as fallback.
3. **Channel with `profile_mm`** → Stage 9f extrude (unchanged).
4. **Other fittings** → unchanged box.

> Important: the cylinder leg code STAYS as a fallback (older exports, or a mesh that
> failed to load). Do not delete it.

### Dispose
BufferGeometries must be disposed on unmount like the others (add to the dispose loop).

### Verify (Part B)
- Re-import the v6 JSON: all 8 legs render as the DETAILED leg (plate, holes, taper,
  flared foot), each correctly placed and upright at its corner.
- One mesh in memory reused for 8 instances (dedupe), not 8 copies parsed separately.
- Shelf (outline), channels (profile), cuts, doors — all unchanged.
- Older exports (no `meshes`/`mesh_ref`) → legs fall back to cylinders; nothing breaks.
- `npm run build` passes.

---

## Commits
- Part A: "Stage 10-A: export deduped fitting meshes + mesh_ref (schema v6, v0.6.0)".
- Part B: "Stage 10-B: viewer renders true fitting meshes; cylinder fallback".

## After build (clean restart)
Kill Next.js, `npm run dev` fresh; browser hard refresh (Ctrl+Shift+R). Provide the
rebuilt `alloy_export.rbz`. Samer installs it (uninstall old, restart SketchUp),
re-exports, re-imports.

Report: how many entries in the top-level `meshes` dict (expect 1 for this cabinet's
single leg definition), the triangle count of the leg mesh, and whether the 8 legs
render as the detailed shape.

## Notes
- File size will grow with mesh detail — that's expected and bounded by dedupe (unique
  definitions only). Panels/channels stay lightweight (no mesh).
- This is geometry for the 3D PREVIEW only. Cut-lists/CNC still use `outline_mm` /
  `cuts` — meshes do not replace them.
