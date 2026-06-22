# main.rb — ALLOY Export v0.6.1
# v0.6.1 = v0.6.0 + fix mesh dedupe (defn.name key, empty-name fallback).
# Schema: alloy.sketchup.v6
#
# Safe: read-only, no model changes, no network.

require "json"

module Alloy
  module Export
    VERSION = "0.6.1"
    SCHEMA  = "alloy.sketchup.v6"
    MM      = 25.4   # inches → mm

    FITTING_KEYS   = %w[p2o leg_ atira hafele basket l_channel u_channel channel
                        blum hinge slide cutlery]
    APPLIANCE_KEYS = %w[blanco vw45 culina subline hood sink oven cooktop hob
                        microwave fridge dishwasher]
    WORKTOP_KEYS   = %w[quartz splash countertop worktop granite marble]
    TRIM_KEYS      = ["plinth", "cornice", "filler", "support box",
                      "wall_l_channel", "external_bottom", "table"]

    def self.mm(v); (v * MM).round(1); end

    def self.instance?(e)
      e.is_a?(Sketchup::ComponentInstance) || e.is_a?(Sketchup::Group)
    end

    def self.entities_of(e)
      if e.is_a?(Sketchup::ComponentInstance)
        e.definition.entities
      elsif e.is_a?(Sketchup::Group)
        e.entities
      end
    end

    def self.name_of(e)
      n = e.name.to_s
      return n unless n.empty?
      return e.definition.name.to_s if e.is_a?(Sketchup::ComponentInstance)
      "(unnamed)"
    end

    def self.has_any?(str, keys)
      s = str.downcase; keys.any? { |k| s.include?(k) }
    end

    def self.child_instances(e)
      ents = entities_of(e)
      return [] unless ents
      ents.select { |c| instance?(c) }
    end

    def self.local_bounds(e)
      if e.is_a?(Sketchup::ComponentInstance)
        e.definition.bounds
      else
        e.respond_to?(:local_bounds) ? e.local_bounds : e.entities.parent.bounds
      end
    end

    # ── Cut detection ─────────────────────────────────────────────────────────
    # Works entirely in the component definition's local coordinate space.
    # The smallest bounding-box axis is the thickness (T) axis.
    # Faces whose normal is parallel to T and whose t-value is strictly between
    # 0 and the full thickness are the floors of machining cuts (dados/grooves/rabbets).

    def self.coord(pt, sym)
      case sym when :x then pt.x when :y then pt.y when :z then pt.z end
    end

    # Maps a local SU axis to a human-readable panel dimension label.
    # SU convention: X=width, Y=depth, Z=height.
    def self.axis_label(sym)
      case sym when :x then "width" when :y then "depth" when :z then "height" end
    end

    def self.detect_cuts(e)
      # Only ComponentInstances have a well-defined local coordinate system.
      return [] unless e.is_a?(Sketchup::ComponentInstance)

      defn = e.definition
      ents = defn.entities
      bb   = defn.bounds

      bw = bb.width   # X extent (inches)
      bh = bb.height  # Y extent
      bd = bb.depth   # Z extent
      return [] if bw < 0.001 || bh < 0.001 || bd < 0.001  # degenerate

      extents = { x: bw, y: bh, z: bd }

      # Thickness axis = smallest extent
      t_sym, th = extents.min_by { |_, v| v }

      t_vec = case t_sym
        when :x then Geom::Vector3d.new(1, 0, 0)
        when :y then Geom::Vector3d.new(0, 1, 0)
        when :z then Geom::Vector3d.new(0, 0, 1)
      end

      t_min = coord(bb.min, t_sym)
      t_max = t_min + th

      # The two face-plane axes (everything except T)
      face_syms = [:x, :y, :z] - [t_sym]
      u_sym = face_syms[0]
      v_sym = face_syms[1]
      u_origin = coord(bb.min, u_sym)
      v_origin = coord(bb.min, v_sym)
      u_size   = extents[u_sym]
      v_size   = extents[v_sym]

      tol = 0.01  # inch (~0.25 mm); used for normal check and edge detection

      # Step 1 — collect faces parallel to the big faces that are at intermediate depth.
      # Key = t-value in units of 1/10000 inch (avoids floating-point scatter).
      planes = {}
      ents.each do |f|
        next unless f.is_a?(Sketchup::Face)
        next if f.vertices.empty?

        # Normal must be (anti-)parallel to the T-axis
        next if f.normal.dot(t_vec).abs < (1.0 - tol)

        # t-value of this face (all verts share it for a flat face)
        t_val = coord(f.vertices.first.position, t_sym)

        # Strictly interior: not on either big face
        next if t_val <= t_min + tol || t_val >= t_max - tol

        key = (t_val * 10_000).round
        (planes[key] ||= []) << f
      end

      # Bail if the geometry is suspiciously complex (curved / non-flat parts).
      # A flat panel has at most a few intermediate planes; more than 8 means noise.
      return :complex if planes.length > 8

      # Step 2 — build one cut record per distinct t-plane
      cuts = []
      planes.each do |key, faces|
        t_val    = key / 10_000.0
        depth_in = [t_val - t_min, t_max - t_val].min

        # Bounding rectangle of the cut footprint in the (U, V) face plane
        all_pts = faces.flat_map { |f| f.vertices.map(&:position) }
        u_vals  = all_pts.map { |p| coord(p, u_sym) }
        v_vals  = all_pts.map { |p| coord(p, v_sym) }

        cu_min = u_vals.min; cu_max = u_vals.max
        cv_min = v_vals.min; cv_max = v_vals.max
        cut_u  = cu_max - cu_min   # span across U
        cut_v  = cv_max - cv_min   # span across V

        # The longer span is the direction the channel runs along
        if cut_v >= cut_u
          cut_width_in  = cut_u
          cut_length_in = cut_v
          runs_sym      = v_sym
        else
          cut_width_in  = cut_v
          cut_length_in = cut_u
          runs_sym      = u_sym
        end

        # Which big face is this closest to?
        face_side = (t_val - t_min) <= (t_max - t_val) ? "front" : "back"

        depth_mm  = mm(depth_in)
        th_mm     = mm(th)

        # Classify the cut
        at_u_edge = cu_min <= u_origin + tol || cu_max >= u_origin + u_size - tol
        at_v_edge = cv_min <= v_origin + tol || cv_max >= v_origin + v_size - tol

        cut_type = if depth_mm >= th_mm - 1.0
          "through"
        elsif at_u_edge || at_v_edge
          "rabbet"
        else
          "groove"
        end

        cuts << {
          type:       cut_type,
          depth_mm:   depth_mm,
          width_mm:   mm(cut_width_in),
          length_mm:  mm(cut_length_in),
          runs_along: axis_label(runs_sym),
          face:       face_side,
          u_min_mm:   mm(cu_min - u_origin),
          u_max_mm:   mm(cu_max - u_origin),
          v_min_mm:   mm(cv_min - v_origin),
          v_max_mm:   mm(cv_max - v_origin)
        }
      end

      # Filter noise: discard micro-features from mesh triangulation.
      # Real machining cuts are at least 3 mm wide, 5 mm long, 1 mm deep.
      cuts.select! { |c| c[:width_mm] >= 3.0 && c[:length_mm] >= 5.0 && c[:depth_mm] >= 1.0 }

      cuts.sort_by { |c| [c[:face], c[:u_min_mm], c[:v_min_mm]] }

    rescue => ex
      []  # don't poison the export; cuts simply unknown
    end

    # ── Panel outline extraction ───────────────────────────────────────────────
    # Returns the largest thickness-parallel face's outer loop projected to local
    # (U, V) in mm, origin at the panel min corner — same axis convention as detect_cuts.
    # Returns nil for groups, degenerate geometry, or anything that fails.

    def self.face_outline(e)
      return nil unless e.is_a?(Sketchup::ComponentInstance)

      defn = e.definition
      bb   = defn.bounds

      bw = bb.width; bh = bb.height; bd = bb.depth
      return nil if bw < 0.001 || bh < 0.001 || bd < 0.001

      extents = { x: bw, y: bh, z: bd }

      # Thickness axis = smallest extent
      t_sym, th = extents.min_by { |_, v| v }

      t_vec = case t_sym
        when :x then Geom::Vector3d.new(1, 0, 0)
        when :y then Geom::Vector3d.new(0, 1, 0)
        when :z then Geom::Vector3d.new(0, 0, 1)
      end

      t_min = coord(bb.min, t_sym)
      t_max = t_min + th

      # The two face-plane axes (same order as detect_cuts)
      face_syms = [:x, :y, :z] - [t_sym]
      u_sym = face_syms[0]
      v_sym = face_syms[1]
      u_origin = coord(bb.min, u_sym)
      v_origin = coord(bb.min, v_sym)

      tol = 0.01

      # Find the largest-area face that is normal to T and sits at t_min or t_max
      best_face  = nil
      best_area  = 0.0

      defn.entities.each do |f|
        next unless f.is_a?(Sketchup::Face)
        next if f.normal.dot(t_vec).abs < (1.0 - tol)
        t_val = coord(f.vertices.first.position, t_sym)
        next unless (t_val - t_min).abs <= tol || (t_val - t_max).abs <= tol
        a = f.area
        if a > best_area
          best_area = a
          best_face = f
        end
      end

      return nil if best_face.nil?

      # Outer loop → project to (u, v) in mm relative to panel min corner
      raw_pts = best_face.outer_loop.vertices.map do |v|
        p = v.position
        [mm(coord(p, u_sym) - u_origin), mm(coord(p, v_sym) - v_origin)]
      end

      return nil if raw_pts.length < 3

      # Drop consecutive duplicates (rounded mm values can collapse tiny segments)
      deduped = []
      raw_pts.each { |pt| deduped << pt if deduped.empty? || deduped.last != pt }
      # Remove trailing point if it duplicates the first (closed-loop sentinel)
      deduped.pop if deduped.length > 1 && deduped.last == deduped.first

      return nil if deduped.length < 3

      {
        u_axis:       axis_label(u_sym),
        v_axis:       axis_label(v_sym),
        thickness_mm: mm(th),
        loop:         deduped
      }

    rescue
      nil
    end

    # ── Channel cross-section extraction ─────────────────────────────────────
    # Returns the end-face (perpendicular to the run axis) outer loop projected to
    # the two cross-section axes (mm, origin at min corner) plus run length.
    # Run axis = the LARGEST local extent. Returns nil on any failure; never raises.

    def self.cross_section(e)
      return nil unless e.is_a?(Sketchup::ComponentInstance)

      defn = e.definition
      bb   = defn.bounds

      bw = bb.width; bh = bb.height; bd = bb.depth
      return nil if bw < 0.001 || bh < 0.001 || bd < 0.001

      extents = { x: bw, y: bh, z: bd }

      # Run axis = largest extent
      r_sym, r_extent = extents.max_by { |_, v| v }

      run_vec = case r_sym
        when :x then Geom::Vector3d.new(1, 0, 0)
        when :y then Geom::Vector3d.new(0, 1, 0)
        when :z then Geom::Vector3d.new(0, 0, 1)
      end

      r_min = coord(bb.min, r_sym)
      r_max = r_min + r_extent

      # Cross-section axes (stable ascending order)
      cs_syms  = [:x, :y, :z] - [r_sym]
      p_sym    = cs_syms[0]
      q_sym    = cs_syms[1]
      p_origin = coord(bb.min, p_sym)
      q_origin = coord(bb.min, q_sym)

      tol = 0.01

      # Find the end face: normal ∥ run axis, at one end, greatest area
      best_face = nil
      best_area = 0.0

      defn.entities.each do |f|
        next unless f.is_a?(Sketchup::Face)
        next if f.normal.dot(run_vec).abs < (1.0 - tol)
        t_val = coord(f.vertices.first.position, r_sym)
        next unless (t_val - r_min).abs <= tol || (t_val - r_max).abs <= tol
        a = f.area
        if a > best_area
          best_area = a
          best_face = f
        end
      end

      return nil if best_face.nil?

      # Project outer loop to (p, q) in mm relative to cross-section min corner
      raw_pts = best_face.outer_loop.vertices.map do |v|
        pt = v.position
        [mm(coord(pt, p_sym) - p_origin), mm(coord(pt, q_sym) - q_origin)]
      end

      return nil if raw_pts.length < 3

      deduped = []
      raw_pts.each { |pt| deduped << pt if deduped.empty? || deduped.last != pt }
      deduped.pop if deduped.length > 1 && deduped.last == deduped.first

      return nil if deduped.length < 3

      {
        p_axis:   axis_label(p_sym),
        q_axis:   axis_label(q_sym),
        run_axis: axis_label(r_sym),
        run_mm:   mm(r_extent),
        loop:     deduped
      }

    rescue
      nil
    end

    # ── Axis orientation ──────────────────────────────────────────────────────
    # Returns the component's three LOCAL axes as unit vectors in WORLD space.

    def self.world_axes(tr)
      ax = tr.xaxis.normalize
      ay = tr.yaxis.normalize
      az = tr.zaxis.normalize
      {
        x: [ax.x.round(6), ax.y.round(6), ax.z.round(6)],
        y: [ay.x.round(6), ay.y.round(6), ay.z.round(6)],
        z: [az.x.round(6), az.y.round(6), az.z.round(6)],
      }
    end

    # ── Fitting mesh extraction (deduped by component definition) ────────────
    # Returns the cache key (definition name) on success, nil on any failure.
    # Mesh is computed in definition LOCAL space — instance-independent.

    def self.definition_mesh(defn)
      key = defn.name
      # Fallback for unnamed definitions so distinct unnamed defs don't collide.
      key = "def_#{defn.entityID}" if key.nil? || key.strip.empty?
      return key if @mesh_cache.key?(key)

      verts = []
      tris  = []
      base  = 0
      defn.entities.grep(Sketchup::Face).each do |f|
        pm  = f.mesh                     # Geom::PolygonMesh, triangulated
        pts = pm.points                  # 1-indexed array of Geom::Point3d (local coords)
        pts.each { |p| verts << [mm(p.x), mm(p.y), mm(p.z)] }
        pm.polygons.each do |poly|       # signed 1-based indices; sign = soft edge
          a, b, c = poly.map { |i| base + (i.abs - 1) }
          tris << [a, b, c]
        end
        base += pts.length
      end
      return nil if verts.empty? || tris.empty?

      @mesh_cache[key] = { vertices: verts, triangles: tris }
      key
    rescue
      nil
    end

    # ── Tree building ─────────────────────────────────────────────────────────

    def self.build_node(e, parent_tr)
      tr     = parent_tr * e.transformation
      bb     = local_bounds(e)
      w = mm(bb.width); h = mm(bb.height); d = mm(bb.depth)
      center_world = tr * bb.center

      kids = child_instances(e)
      node = {
        name:      name_of(e),
        type:      e.is_a?(Sketchup::Group) ? "group" : "component",
        size_mm:   { x: w, y: h, z: d },
        sorted_mm: [w, h, d].sort,
        pos_mm:    { x: mm(center_world.x), y: mm(center_world.y), z: mm(center_world.z) },
        axes:      world_axes(tr),
      }

      if kids.empty?
        node[:role]    = "part"
        node[:is_leaf] = true
        if has_any?(node[:name], FITTING_KEYS)
          # Fittings (legs, hinges, channels, etc.) — skip cut detection entirely.
          node[:cuts] = []
          # Non-channel fittings get a deduplicated mesh reference.
          if !has_any?(node[:name], ["l_channel","u_channel","channel"])
            mk = (e.is_a?(Sketchup::ComponentInstance) ? definition_mesh(e.definition) : nil)
            node[:mesh_ref] = mk unless mk.nil?
          end
        else
          result = detect_cuts(e)
          if result == :complex
            node[:cuts]        = []
            node[:cut_warning] = "complex geometry, skipped"
          else
            node[:cuts] = result
          end
        end
        ol = face_outline(e)
        node[:outline_mm] = ol unless ol.nil?
        if has_any?(node[:name], ["l_channel","u_channel","channel"])
          pf = cross_section(e)
          node[:profile_mm] = pf unless pf.nil?
        end
      else
        node[:is_leaf]  = false
        node[:children] = kids.map { |k| build_node(k, tr) }
      end
      node
    end

    # ── Classification & annotation ───────────────────────────────────────────

    def self.leaf_names(node)
      return [node[:name]] if node[:is_leaf]
      (node[:children] || []).flat_map { |c| leaf_names(c) }
    end

    def self.classify(node)
      return "Part" if node[:is_leaf]
      name   = node[:name].downcase
      lnames = leaf_names(node)
      has_side    = lnames.any? { |n| n.downcase.include?("side") }
      has_tb      = lnames.any? { |n| d = n.downcase; d.include?("top") || d.include?("bottom") }
      has_carcass = has_side && has_tb
      s = node[:size_mm]
      return "Worktop"   if has_any?(name, WORKTOP_KEYS) || lnames.any? { |n| has_any?(n, WORKTOP_KEYS) }
      return "Appliance" if has_any?(name, APPLIANCE_KEYS) && !has_carcass
      return "Trim"      if has_any?(name, TRIM_KEYS) && !has_carcass
      return "Cabinet"   if has_carcass
      return "RoomBox"   if node[:name] == "(unnamed)" && (s[:x] > 5000 || s[:z] > 5000)
      "Other"
    end

    def self.fitting_leaf?(leaf)
      has_any?(leaf[:name], FITTING_KEYS)
    end

    def self.collect_leaves(node)
      return [node] if node[:is_leaf]
      (node[:children] || []).flat_map { |c| collect_leaves(c) }
    end

    def self.annotate(node)
      node[:item_type] = classify(node)
      (node[:children] || []).each { |c| annotate(c) }
      if node[:item_type] == "Cabinet"
        leaves = collect_leaves(node)
        node[:panel_count]   = leaves.count { |l| !fitting_leaf?(l) }
        node[:fitting_count] = leaves.count { |l| fitting_leaf?(l) }
      end
      node
    end

    # ── Export entry point ────────────────────────────────────────────────────

    def self.run
      @mesh_cache = {}   # reset per-export; prevents accumulation across runs
      model = Sketchup.active_model
      sel   = model.selection
      roots =
        if sel && !sel.empty?
          sel.to_a.select { |e| instance?(e) }
        else
          model.active_entities.to_a.select { |e| instance?(e) }
        end

      if roots.empty?
        UI.messagebox("Nothing to export.\nSelect one or more components/groups, or open a model with components, then try again.")
        return
      end

      identity = Geom::Transformation.new
      trees    = roots.map { |r| annotate(build_node(r, identity)) }

      # Compute AFTER annotation so all nodes are fully built.
      # Use inject instead of sum{} for compatibility across SketchUp Ruby versions.
      total_parts = trees.inject(0) { |acc, t| acc + collect_leaves(t).length }

      by_type = Hash.new(0)
      trees.each { |t| by_type[t[:item_type]] += 1 }
      summary = by_type.map { |k, v| "#{k}: #{v}" }.join(", ")

      payload = {
        schema:      SCHEMA,
        version:     VERSION,
        model:       File.basename(model.path.to_s),
        units:       "mm",
        root_count:  trees.length,
        total_parts: total_parts,
        summary:     by_type,
        roots:       trees,
        meshes:      @mesh_cache
      }

      path = UI.savepanel("Save ALLOY JSON", "", "alloy_export.json")
      return unless path
      path += ".json" unless path.downcase.end_with?(".json")
      File.write(path, JSON.pretty_generate(payload))
      UI.messagebox("Exported #{trees.length} root item(s), #{total_parts} part(s).\n#{summary}\n\nSaved to:\n#{path}")
    end

    unless @loaded
      @loaded = true
      UI.menu("Plugins").add_item("Export to ALLOY (JSON)") { Alloy::Export.run }
    end
  end
end
