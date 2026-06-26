# main.rb — ALLOY Export v0.6.11
# v0.6.11 = corrected group reflection signal: the v0.6.10 parity-vs-root test
#           was built on a disproven assumption. A named control model proved the
#           normalized-basis determinant (det < 0 on the xaxis/yaxis/zaxis unit
#           vectors) cleanly separates reflected from non-reflected on all cases
#           including rotated groups. Replaced with that direct computation;
#           @root_det_sign / world_det_sign removed. Schema unchanged (v6.5).
# v0.6.10 = groups parity: generalised instance_scales, ungated face_outline /
#           cross_section / detect_cuts / detect_tooling (source swapped to
#           entities_of/local_bounds), additive `reflected` leaf field on groups.
#           Schema alloy.sketchup.v6.5. Components byte-identical.
# v0.6.9 = scale-aware export: measure instance (not definition) extents so
#           non-uniformly scaled components report their true placed size.
#           Schema alloy.sketchup.v6.4 (corrected magnitudes, same field layout).
# v0.6.8 = v0.6.7-FIX: open_normal now emitted in world space (rotation applied).
# v0.6.6 = v0.6.5-FIX: open face computed in world space (mirror-stable).
#
# Safe: read-only, no model changes, no network.

require "json"
require "digest"

module Alloy
  module Export
    VERSION = "0.6.11"
    SCHEMA  = "alloy.sketchup.v6.5"
    MM      = 25.4   # inches → mm

    FITTING_KEYS   = %w[p2o leg_ atira hafele basket l_channel u_channel channel
                        blum hinge slide cutlery]
    APPLIANCE_KEYS = %w[blanco vw45 culina subline hood sink oven cooktop hob
                        microwave fridge dishwasher]
    WORKTOP_KEYS   = %w[quartz splash countertop worktop granite marble]
    TRIM_KEYS      = ["plinth", "cornice", "filler", "support box",
                      "wall_l_channel", "external_bottom", "table"]

    EDGE_TOL     = 1.0   # mm — used in detect_cuts rabbet/groove classification
    ROUND_TOL    = 0.08  # normalised residual threshold for circle vs polygon classification
    GROOVE_ASPECT = 4.0  # floor-face aspect ratio ≥ this → linear groove/dado → cuts[]; < this → pocket → tooling[]
    ALLOY_DIAG    = false  # 15a groups diagnostic — off for the 15b parity build

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

    def self.detect_cuts(e, tr, scales = nil)
      # Groups and components both expose a usable local coordinate frame
      # (component: definition; group: local_bounds + own entities — 15a Q4).
      return [] unless instance?(e)

      ents = entities_of(e)
      bb   = local_bounds(e)

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

      # World-space face polarity: floor face normal vs cabinet-interior direction.
      pc_w  = tr * bb.center
      int_w = @cab_center ? @cab_center - pc_w : nil

      # The two face-plane axes (everything except T)
      face_syms = [:x, :y, :z] - [t_sym]
      u_sym = face_syms[0]
      v_sym = face_syms[1]
      u_origin = coord(bb.min, u_sym)
      v_origin = coord(bb.min, v_sym)
      u_size   = extents[u_sym]
      v_size   = extents[v_sym]

      # Per-axis instance scale (default identity when not supplied)
      sc      = scales || [1.0, 1.0, 1.0]
      ax_sc   = { x: sc[0], y: sc[1], z: sc[2] }
      u_scale = ax_sc[u_sym]
      v_scale = ax_sc[v_sym]
      t_scale = ax_sc[t_sym]

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

        # Open-face direction: floor face's own world normal vs cabinet-interior.
        floor_n_local = faces.first.normal.normalize
        floor_n_world = (tr * floor_n_local).normalize
        face_side = if int_w
          n_w    = floor_n_world
          dot    = n_w.dot(int_w)
          dot > 0 ? "inner" : "outer"
        else
          (t_val - t_min) <= (t_max - t_val) ? "inner" : "outer"
        end

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
          type:        cut_type,
          depth_mm:    depth_mm,
          width_mm:    mm(cut_width_in),
          length_mm:   mm(cut_length_in),
          runs_along:  axis_label(runs_sym),
          face:        face_side,
          open_normal: [floor_n_world.x, floor_n_world.y, floor_n_world.z].map { |c| (c.abs < 1e-9 ? 0.0 : c).round(6) },
          u_min_mm:    mm(cu_min - u_origin),
          u_max_mm:    mm(cu_max - u_origin),
          v_min_mm:    mm(cv_min - v_origin),
          v_max_mm:    mm(cv_max - v_origin)
        }
      end

      # Filter noise: discard micro-features from mesh triangulation.
      # Real machining cuts are at least 3 mm wide, 5 mm long, 1 mm deep.
      cuts.select! { |c| c[:width_mm] >= 3.0 && c[:length_mm] >= 5.0 && c[:depth_mm] >= 1.0 }

      # Apply per-axis instance scale to all cut coordinates
      if scales
        cuts = cuts.map do |c|
          r_sym = { "width" => :x, "depth" => :y, "height" => :z }[c[:runs_along]]
          w_sym = (face_syms - [r_sym]).first
          r_sc  = ax_sc[r_sym] || 1.0
          w_sc  = ax_sc[w_sym] || 1.0
          c.merge(
            depth_mm:  (c[:depth_mm]  * t_scale).round(1),
            width_mm:  (c[:width_mm]  * w_sc).round(1),
            length_mm: (c[:length_mm] * r_sc).round(1),
            u_min_mm:  (c[:u_min_mm]  * u_scale).round(1),
            u_max_mm:  (c[:u_max_mm]  * u_scale).round(1),
            v_min_mm:  (c[:v_min_mm]  * v_scale).round(1),
            v_max_mm:  (c[:v_max_mm]  * v_scale).round(1),
          )
        end
      end

      cuts.sort_by { |c| [c[:face], c[:u_min_mm], c[:v_min_mm]] }

    rescue => ex
      []  # don't poison the export; cuts simply unknown
    end

    # ── Panel outline extraction ───────────────────────────────────────────────
    # Returns the largest thickness-parallel face's outer loop projected to local
    # (U, V) in mm, origin at the panel min corner — same axis convention as detect_cuts.
    # Returns nil for groups, degenerate geometry, or anything that fails.

    def self.face_outline(e, scales = nil)
      return nil unless instance?(e)

      ents = entities_of(e)
      bb   = local_bounds(e)

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

      ents.each do |f|
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

      # Per-axis instance scale for u/v/thickness directions
      sc      = scales || [1.0, 1.0, 1.0]
      ax_sc   = { x: sc[0], y: sc[1], z: sc[2] }
      u_scale = ax_sc[u_sym]
      v_scale = ax_sc[v_sym]
      t_scale = ax_sc[t_sym]

      # Outer loop → project to (u, v) in mm relative to panel min corner, scaled
      raw_pts = best_face.outer_loop.vertices.map do |v|
        p = v.position
        [((coord(p, u_sym) - u_origin) * MM * u_scale).round(1),
         ((coord(p, v_sym) - v_origin) * MM * v_scale).round(1)]
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
        thickness_mm: (th * MM * t_scale).round(1),
        loop:         deduped
      }

    rescue
      nil
    end

    # ── Channel cross-section extraction ─────────────────────────────────────
    # Returns the end-face (perpendicular to the run axis) outer loop projected to
    # the two cross-section axes (mm, origin at min corner) plus run length.
    # Run axis = the LARGEST local extent. Returns nil on any failure; never raises.

    def self.cross_section(e, scales = nil)
      return nil unless instance?(e)

      ents = entities_of(e)
      bb   = local_bounds(e)

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

      ents.each do |f|
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

      # Per-axis instance scale for p/q/run directions
      sc      = scales || [1.0, 1.0, 1.0]
      ax_sc   = { x: sc[0], y: sc[1], z: sc[2] }
      p_scale = ax_sc[p_sym]
      q_scale = ax_sc[q_sym]
      r_scale = ax_sc[r_sym]

      # Project outer loop to (p, q) in mm relative to cross-section min corner, scaled
      raw_pts = best_face.outer_loop.vertices.map do |v|
        pt = v.position
        [((coord(pt, p_sym) - p_origin) * MM * p_scale).round(1),
         ((coord(pt, q_sym) - q_origin) * MM * q_scale).round(1)]
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
        run_mm:   (r_extent * MM * r_scale).round(1),
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

    # Per-axis instance scale from transformation column magnitudes.
    # t.xaxis/yaxis/zaxis are unit-normalised in some SU versions, so we derive
    # scale from the raw 4×4 matrix (column-major, columns 0/1/2 are the local axes).
    def self.instance_scales(e)
      # Column magnitudes of the raw transform are valid for groups too (15a Q3):
      # the placed scale lives in the transform, local_bounds is the unit frame.
      return [1.0, 1.0, 1.0] unless instance?(e)
      m = e.transformation.to_a
      sx = Math.sqrt(m[0]**2 + m[1]**2 + m[2]**2)
      sy = Math.sqrt(m[4]**2 + m[5]**2 + m[6]**2)
      sz = Math.sqrt(m[8]**2 + m[9]**2 + m[10]**2)
      [sx, sy, sz]
    end

    # ── Diagnostic dump (gated on ALLOY_DIAG) ────────────────────────────────

    def self.diag_leaf(e, world_tr, lines)
      is_grp   = e.is_a?(Sketchup::Group)
      kind_str = is_grp ? "Group" : "ComponentInstance"
      nm       = name_of(e)
      respond_note = is_grp ? "  (respond_to?(:local_bounds)=#{e.respond_to?(:local_bounds)})" : ""

      lines << ""
      lines << "===== LEAF: #{nm}  [#{kind_str}]#{respond_note} ====="

      # 3. Local bounds
      lb   = local_bounds(e)
      lmin = lb.min
      lines << "local_bounds.min  = (#{lmin.x.round(4)}, #{lmin.y.round(4)}, #{lmin.z.round(4)}) in" \
               "   ext = (#{mm(lb.width).round(3)}, #{mm(lb.height).round(3)}, #{mm(lb.depth).round(3)}) mm"

      eb   = e.bounds
      emin = eb.min
      lines << "e.bounds.min      = (#{emin.x.round(4)}, #{emin.y.round(4)}, #{emin.z.round(4)}) in" \
               "   ext = (#{mm(eb.width).round(3)}, #{mm(eb.height).round(3)}, #{mm(eb.depth).round(3)}) mm"

      if e.is_a?(Sketchup::ComponentInstance)
        db   = e.definition.bounds
        dmin = db.min
        lines << "defn.bounds.min   = (#{dmin.x.round(4)}, #{dmin.y.round(4)}, #{dmin.z.round(4)}) in" \
                 "   ext = (#{mm(db.width).round(3)}, #{mm(db.height).round(3)}, #{mm(db.depth).round(3)}) mm"
      else
        lines << "defn.bounds.ext   = (n/a — group)"
      end

      # 4. Transform to_a (column-major)
      t  = e.transformation
      m  = t.to_a
      mf = m.map { |v| v.round(6) }
      lines << "xform.to_a        = [#{mf.join(', ')}]   (column-major)"

      # 5. Derived basis axes (xaxis/yaxis/zaxis as returned by SU API)
      xa = t.xaxis; ya = t.yaxis; za = t.zaxis
      lines << "xaxis=(#{xa.x.round(6)}, #{xa.y.round(6)}, #{xa.z.round(6)})  len=#{xa.length.round(6)}"
      lines << "yaxis=(#{ya.x.round(6)}, #{ya.y.round(6)}, #{ya.z.round(6)})  len=#{ya.length.round(6)}"
      lines << "zaxis=(#{za.x.round(6)}, #{za.y.round(6)}, #{za.z.round(6)})  len=#{za.length.round(6)}"

      # 6. Column-magnitude scale (instance_scales formula; computed for ALL leaves)
      csx = Math.sqrt(m[0]**2 + m[1]**2 + m[2]**2)
      csy = Math.sqrt(m[4]**2 + m[5]**2 + m[6]**2)
      csz = Math.sqrt(m[8]**2 + m[9]**2 + m[10]**2)
      star_note = is_grp ? "   (* computed for diagnosis; not applied to groups today)" : ""
      lines << "instance_scales*  = (#{csx.round(6)}, #{csy.round(6)}, #{csz.round(6)})#{star_note}"

      # 7. Determinant of 3×3 [xaxis|yaxis|zaxis] basis
      cx  = ya.y * za.z - ya.z * za.y
      cy  = ya.z * za.x - ya.x * za.z
      cz  = ya.x * za.y - ya.y * za.x
      det = xa.x * cx + xa.y * cy + xa.z * cz
      det_str = "#{det >= 0 ? '+' : ''}#{det.round(6)}"
      lines << "det(basis)        = #{det_str}"

      # 8 & 9. World AABB (transform 8 local-bounds corners by accumulated world_tr)
      corners = (0..7).map { |i| world_tr * lb.corner(i) rescue nil }.compact
      if corners.length == 8
        wxs = corners.map(&:x); wys = corners.map(&:y); wzs = corners.map(&:z)
        wex = mm(wxs.max - wxs.min).round(3)
        wey = mm(wys.max - wys.min).round(3)
        wez = mm(wzs.max - wzs.min).round(3)
        lines << "world.aabb.ext    = (#{wex}, #{wey}, #{wez}) mm  [X,Y,Z]"
        thinnest = [["X", wex], ["Y", wey], ["Z", wez]].min_by { |_, v| v }.first
        lines << "world.thinnest    = #{thinnest}"
      else
        lines << "world.aabb.ext    = (n/a — corner transform failed)"
        lines << "world.thinnest    = n/a"
      end

      # 10. Face reachability — can existing face-projection logic reach group faces?
      ents = entities_of(e)
      if ents
        all_faces = ents.select { |f| f.is_a?(Sketchup::Face) }
        fc = all_faces.length
        bw = lb.width; bh = lb.height; bd = lb.depth
        if bw > 0.001 && bh > 0.001 && bd > 0.001
          exts  = { x: bw, y: bh, z: bd }
          t_sym, _ = exts.min_by { |_, v| v }
          t_vec = case t_sym
            when :x then Geom::Vector3d.new(1, 0, 0)
            when :y then Geom::Vector3d.new(0, 1, 0)
            when :z then Geom::Vector3d.new(0, 0, 1)
          end
          t_min_val = coord(lb.min, t_sym)
          t_max_val = t_min_val + exts[t_sym]
          tol = 0.01
          thick_found = all_faces.any? do |f|
            next false if f.normal.dot(t_vec).abs < (1.0 - tol)
            tv = coord(f.vertices.first.position, t_sym) rescue nil
            next false unless tv
            (tv - t_min_val).abs <= tol || (tv - t_max_val).abs <= tol
          end
          lines << "faces=#{fc}  thickness_face_found=#{thick_found}"
        else
          lines << "faces=#{fc}  thickness_face_found=n/a (degenerate bounds)"
        end
      else
        lines << "faces=n/a  thickness_face_found=n/a (entities_of returned nil)"
      end

      lines << "=" * 62
    rescue => ex
      lines << "[DIAG ERROR in leaf #{name_of(e) rescue '?'}: #{ex.class}: #{ex.message}]"
      lines << "=" * 62
    end

    def self.diag_walk(e, parent_tr, lines)
      tr   = parent_tr * e.transformation
      kids = child_instances(e)
      if kids.empty?
        diag_leaf(e, tr, lines)
      else
        kids.each { |k| diag_walk(k, tr, lines) }
      end
    rescue => ex
      lines << "[DIAG ERROR walking #{name_of(e) rescue '?'}: #{ex.class}: #{ex.message}]"
    end

    def self.run_diag(roots, identity, save_path)
      lines = [
        "ALLOY Groups Diagnostic  [v#{VERSION}]",
        "Model: #{Sketchup.active_model.path rescue '?'}",
        "Run:   #{Time.now}",
        "=" * 62
      ]
      roots.each { |r| diag_walk(r, identity, lines) }
      txt       = lines.join("\n") + "\n"
      diag_path = File.join(File.dirname(save_path), "groups_diag.txt")
      File.write(diag_path, txt)
      puts "[ALLOY_DIAG] Written to: #{diag_path}"
      puts txt
      diag_path
    rescue => ex
      puts "[ALLOY_DIAG run error: #{ex.class}: #{ex.message}]"
      nil
    end

    # ── Inner tooling detection ───────────────────────────────────────────────

    # Fit a circle to a closed (u,v) loop in mm. Returns {cu,cv,r,residual} or nil.
    # Requires ≥6 points and r ≥ 2 mm; residual = max(|dist-r|)/r (0 = perfect circle).
    def self.fit_circle(loop_uv)
      pts = loop_uv.dup
      pts.pop if pts.length > 1 && pts.first == pts.last
      return nil if pts.length < 6
      cu = pts.inject(0.0) { |s, p| s + p[0] } / pts.length
      cv = pts.inject(0.0) { |s, p| s + p[1] } / pts.length
      dists = pts.map { |p| Math.sqrt((p[0] - cu)**2 + (p[1] - cv)**2) }
      r = dists.inject(0.0, :+) / dists.length
      return nil if r < 2.0
      residual = dists.map { |d| (d - r).abs }.max / r
      { cu: cu, cv: cv, r: r, residual: residual }
    end

    # Detect through-bores (inner loops of big faces) and blind pockets (interior
    # intermediate floor faces). Returns tooling[] (possibly empty). Never raises.
    def self.detect_tooling(e, tr, scales = nil)
      return [] unless instance?(e)

      ents = entities_of(e)
      bb   = local_bounds(e)

      bw = bb.width; bh = bb.height; bd = bb.depth
      return [] if bw < 0.001 || bh < 0.001 || bd < 0.001

      extents = { x: bw, y: bh, z: bd }
      t_sym, th = extents.min_by { |_, v| v }
      t_vec = case t_sym
        when :x then Geom::Vector3d.new(1, 0, 0)
        when :y then Geom::Vector3d.new(0, 1, 0)
        when :z then Geom::Vector3d.new(0, 0, 1)
      end
      t_min = coord(bb.min, t_sym)
      t_max = t_min + th

      # World-space face polarity: floor face normal vs cabinet-interior direction.
      pc_w  = tr * bb.center
      int_w = @cab_center ? @cab_center - pc_w : nil

      face_syms = [:x, :y, :z] - [t_sym]
      u_sym    = face_syms[0]
      v_sym    = face_syms[1]
      u_origin = coord(bb.min, u_sym)
      v_origin = coord(bb.min, v_sym)
      u_size   = extents[u_sym]
      v_size   = extents[v_sym]

      # Per-axis instance scale (default identity when not supplied)
      sc      = scales || [1.0, 1.0, 1.0]
      ax_sc   = { x: sc[0], y: sc[1], z: sc[2] }
      u_scale = ax_sc[u_sym]
      v_scale = ax_sc[v_sym]
      t_scale = ax_sc[t_sym]

      tol        = 0.01
      tooling    = []
      seen_bores = []  # de-dupe: same through-hole appears on front AND back big face

      # (a) Through-bores: inner loops on the two big (t-parallel) faces
      ents.each do |f|
        next unless f.is_a?(Sketchup::Face)
        next if f.normal.dot(t_vec).abs < (1.0 - tol)
        t_val = coord(f.vertices.first.position, t_sym)
        next unless (t_val - t_min).abs <= tol || (t_val - t_max).abs <= tol

        f.loops.each do |lp|
          next if lp.outer?
          uv_pts = lp.vertices.map do |vert|
            p = vert.position
            [mm(coord(p, u_sym) - u_origin), mm(coord(p, v_sym) - v_origin)]
          end
          pts_clean = uv_pts.dup
          pts_clean.pop if pts_clean.length > 1 && pts_clean.first == pts_clean.last
          next if pts_clean.length < 3

          # Bore centre in SU-local inches; skip if any intermediate floor face covers it.
          cu_in = pts_clean.inject(0.0) { |s, p| s + p[0] } / pts_clean.length / MM + u_origin
          cv_in = pts_clean.inject(0.0) { |s, p| s + p[1] } / pts_clean.length / MM + v_origin
          covered = ents.any? { |ff|
            next false unless ff.is_a?(Sketchup::Face)
            next false if ff.normal.dot(t_vec).abs < (1.0 - tol)
            ff_t = coord(ff.vertices.first.position, t_sym)
            next false if ff_t <= t_min + tol || ff_t >= t_max - tol
            ff_u = ff.vertices.map { |vt| coord(vt.position, u_sym) }
            ff_v = ff.vertices.map { |vt| coord(vt.position, v_sym) }
            cu_in >= ff_u.min - tol && cu_in <= ff_u.max + tol &&
            cv_in >= ff_v.min - tol && cv_in <= ff_v.max + tol
          }
          next if covered  # blind feature; floor-face pipeline handles it

          c = fit_circle(uv_pts)
          if c && c[:residual] <= ROUND_TOL
            dup = seen_bores.any? { |b|
              b[:kind] == :circle &&
              (b[:cu] - c[:cu]).abs < 1.0 &&
              (b[:cv] - c[:cv]).abs < 1.0 &&
              (b[:r]  - c[:r] ).abs < 1.0
            }
            next if dup
            seen_bores << { kind: :circle, cu: c[:cu], cv: c[:cv], r: c[:r] }
            tooling << {
              shape:       "circle",
              through:     true,
              depth_mm:    mm(th),
              diameter_mm: (2 * c[:r]).round(1),
              cu_mm:       c[:cu].round(1),
              cv_mm:       c[:cv].round(1),
              face:        "both",
              _loop_pts:   pts_clean.length
            }
          else
            key = uv_pts.map { |p| [p[0].round, p[1].round] }.sort.first(3).inspect
            dup = seen_bores.any? { |b| b[:kind] == :polygon && b[:key] == key }
            next if dup
            seen_bores << { kind: :polygon, key: key }
            tooling << {
              shape:    "polygon",
              through:  true,
              depth_mm: mm(th),
              loop:     uv_pts,
              face:     "both"
            }
          end
        end
      end

      # (b) Blind pockets: interior intermediate floor faces (touch no panel edge)
      ents.each do |f|
        next unless f.is_a?(Sketchup::Face)
        next if f.normal.dot(t_vec).abs < (1.0 - tol)
        t_val = coord(f.vertices.first.position, t_sym)
        next if t_val <= t_min + tol || t_val >= t_max - tol  # skip big faces

        u_vals = f.vertices.map { |vert| coord(vert.position, u_sym) }
        v_vals = f.vertices.map { |vert| coord(vert.position, v_sym) }
        fu_min = u_vals.min; fu_max = u_vals.max
        fv_min = v_vals.min; fv_max = v_vals.max

        span_u  = fu_max - fu_min
        span_v  = fv_max - fv_min
        shorter = [span_u, span_v].min
        longer  = [span_u, span_v].max
        next if shorter < 0.001 || longer / shorter.to_f >= GROOVE_ASPECT  # linear cut, not pocket

        depth_in      = [t_val - t_min, t_max - t_val].min
        floor_n_local = f.normal.normalize
        floor_n_world = (tr * floor_n_local).normalize
        face_side = if int_w
          n_w = floor_n_world
          n_w.dot(int_w) > 0 ? "inner" : "outer"
        else
          (t_val - t_min) <= (t_max - t_val) ? "inner" : "outer"
        end

        uv_pts = f.outer_loop.vertices.map do |vert|
          p = vert.position
          [mm(coord(p, u_sym) - u_origin), mm(coord(p, v_sym) - v_origin)]
        end
        next if uv_pts.length < 3

        c = fit_circle(uv_pts)
        on = [floor_n_world.x, floor_n_world.y, floor_n_world.z].map { |c| (c.abs < 1e-9 ? 0.0 : c).round(6) }
        if c && c[:residual] <= ROUND_TOL
          tooling << {
            shape:       "circle",
            through:     false,
            depth_mm:    mm(depth_in),
            diameter_mm: (2 * c[:r]).round(1),
            cu_mm:       c[:cu].round(1),
            cv_mm:       c[:cv].round(1),
            face:        face_side,
            open_normal: on
          }
        else
          tooling << {
            shape:       "polygon",
            through:     false,
            depth_mm:    mm(depth_in),
            loop:        uv_pts,
            face:        face_side,
            open_normal: on
          }
        end
      end

      if scales
        face_avg_sc = (u_scale + v_scale) / 2.0
        tooling = tooling.map do |ti|
          scaled = ti.dup
          scaled[:depth_mm] = (ti[:depth_mm] * t_scale).round(1)
          if ti[:shape] == "circle"
            scaled[:cu_mm]       = (ti[:cu_mm]       * u_scale).round(1)
            scaled[:cv_mm]       = (ti[:cv_mm]       * v_scale).round(1)
            scaled[:diameter_mm] = (ti[:diameter_mm] * face_avg_sc).round(1)
          else
            scaled[:loop] = ti[:loop].map { |u, v| [(u * u_scale).round(1), (v * v_scale).round(1)] }
          end
          scaled
        end
      end

      tooling
    rescue
      []
    end

    # ── Fitting mesh extraction (deduped by canonical geometry hash) ─────────
    # Meshes are keyed by a content hash so geometrically identical definitions
    # (even with distinct #NN names from "Make Unique") share one cache entry.
    # All computation is in definition LOCAL space — instance-independent.

    # Step 1: extract raw vertices+triangles from a definition.
    def self.mesh_geometry(defn, scales = nil)
      sc = scales || [1.0, 1.0, 1.0]
      verts = []; tris = []; base = 0
      defn.entities.grep(Sketchup::Face).each do |f|
        pm  = f.mesh
        pts = pm.points
        pts.each { |p| verts << [(mm(p.x) * sc[0]).round(1), (mm(p.y) * sc[1]).round(1), (mm(p.z) * sc[2]).round(1)] }
        pm.polygons.each do |poly|
          a, b, c = poly.map { |i| base + (i.abs - 1) }
          tris << [a, b, c]
        end
        base += pts.length
      end
      return nil if verts.empty? || tris.empty?
      { vertices: verts, triangles: tris }
    end

    # Step 2: canonical hash invariant to vertex order and triangle order.
    # Sort vertices, remap triangle indices, sort triangles, MD5 the JSON.
    def self.mesh_hash(mesh)
      vlist = mesh[:vertices]
      order = (0...vlist.length).sort_by { |i| vlist[i] }
      remap = Array.new(vlist.length)
      order.each_with_index { |old_i, new_i| remap[old_i] = new_i }
      sorted_verts  = order.map { |i| vlist[i] }
      remapped_tris = mesh[:triangles].map { |t| t.map { |i| remap[i] }.sort }
      remapped_tris.sort!
      Digest::MD5.hexdigest([sorted_verts, remapped_tris].to_json)[0, 16]
    end

    # Step 3: build geometry, key cache by "mesh_"+hash; identical geometry reuses.
    # Returns the cache key on success, nil on any failure.
    def self.definition_mesh(defn, scales = nil)
      geo = mesh_geometry(defn, scales)
      return nil if geo.nil?
      key = "mesh_" + mesh_hash(geo)
      @mesh_cache[key] ||= geo
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
        sx, sy, sz = instance_scales(e)
        ws = (mm(bb.width)  * sx).round(1)
        hs = (mm(bb.height) * sy).round(1)
        ds = (mm(bb.depth)  * sz).round(1)
        node[:size_mm]   = { x: ws, y: hs, z: ds }
        node[:sorted_mm] = [ws, hs, ds].sort
        # Normalized-basis det — same signal components use; group-only so
        # component output stays byte-identical.
        if e.is_a?(Sketchup::Group)
          ax = tr.xaxis.normalize; ay = tr.yaxis.normalize; az = tr.zaxis.normalize
          det = ax.x*(ay.y*az.z - ay.z*az.y) \
              - ay.x*(ax.y*az.z - ax.z*az.y) \
              + az.x*(ax.y*ay.z - ax.z*ay.y)
          node[:reflected] = det < 0
        end
        if has_any?(node[:name], FITTING_KEYS)
          # Fittings (legs, hinges, channels, etc.) — skip cut/tooling detection entirely.
          node[:cuts]    = []
          node[:tooling] = []
          # Non-channel fittings get a deduplicated mesh reference.
          if !has_any?(node[:name], ["l_channel","u_channel","channel"])
            mk = (e.is_a?(Sketchup::ComponentInstance) ? definition_mesh(e.definition, [sx, sy, sz]) : nil)
            node[:mesh_ref] = mk unless mk.nil?
          end
        else
          result = detect_cuts(e, tr, [sx, sy, sz])
          if result == :complex
            node[:cuts]        = []
            node[:tooling]     = []
            node[:cut_warning] = "complex geometry, skipped"
          else
            unless result.empty?
              # Strip interior-floor cuts (no edge touch) — they become tooling pockets.
              ext = { x: mm(bb.width), y: mm(bb.height), z: mm(bb.depth) }
              t_s, _ = ext.min_by { |_, v| v }
              fs = [:x, :y, :z] - [t_s]
              u_full = ext[fs[0]]; v_full = ext[fs[1]]
              result = result.select { |c|
                shorter = [c[:width_mm], c[:length_mm]].min
                longer  = [c[:width_mm], c[:length_mm]].max
                shorter < 1.0 || longer / shorter.to_f >= GROOVE_ASPECT
              }
            end
            node[:cuts]    = result
            node[:tooling] = detect_tooling(e, tr, [sx, sy, sz])
          end
        end
        ol = face_outline(e, [sx, sy, sz])
        node[:outline_mm] = ol unless ol.nil?
        if has_any?(node[:name], ["l_channel","u_channel","channel"])
          pf = cross_section(e, [sx, sy, sz])
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

      # Cabinet centre in world space — used for cabinet-relative face labelling.
      all_corners = roots.flat_map { |r| (0..7).map { |i| r.bounds.corner(i) rescue nil }.compact }
      if all_corners.empty?
        @cab_center = nil
      else
        xs = all_corners.map(&:x); ys = all_corners.map(&:y); zs = all_corners.map(&:z)
        @cab_center = Geom::Point3d.new((xs.min+xs.max)/2.0, (ys.min+ys.max)/2.0, (zs.min+zs.max)/2.0)
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
      run_diag(roots, identity, path) if defined?(ALLOY_DIAG) && ALLOY_DIAG
      UI.messagebox("Exported #{trees.length} root item(s), #{total_parts} part(s).\n#{summary}\n\nSaved to:\n#{path}")
    end

    unless @loaded
      @loaded = true
      UI.menu("Plugins").add_item("Export to ALLOY (JSON)") { Alloy::Export.run }
    end
  end
end
