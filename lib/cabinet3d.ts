import type { Cut, ToolingItem } from "@/lib/sketchup/types";

export const PART_ROLES = [
  "side_left",
  "side_right",
  "top",
  "bottom",
  "back",
  "shelf",
  "divider_v",
  "door",
  "drawer_front",
  "other",
] as const;

export type PartRole = (typeof PART_ROLES)[number];

export type PartInput = {
  role: PartRole | null;
  part_name: string;
  width_mm: number;
  height_mm: number;
  depth_mm: number | null;
  pos_offset_mm: number | null;
  qty: number;
};

// Panel outline: the true 2D silhouette in panel-local (U, V) mm, origin at min corner.
// Matches what the Ruby extension emits in outline_mm.
export type PanelOutline = {
  u_axis: "width" | "height" | "depth";
  v_axis: "width" | "height" | "depth";
  thickness_mm: number;
  loop: [number, number][];
};

// Channel cross-section profile: the end-face loop (p, q) extruded along run_axis.
// Matches what the Ruby extension emits in profile_mm (channels only).
export type ChannelProfile = {
  p_axis:   "width" | "height" | "depth";
  q_axis:   "width" | "height" | "depth";
  run_axis: "width" | "height" | "depth";
  run_mm:   number;
  loop:     [number, number][];
};

export type Box3D = {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  role: PartRole;
  part_name?: string;
  cuts?: Cut[];
  orient?: number[]; // 9 numbers, three-space 3x3 basis (C·Rworld), column-major
  uprightCylinder?: boolean; // true for leg/p2o: skip orient, always stand on Y
  outline?: PanelOutline;   // v5.1: true 2D silhouette; renderer extrudes when present
  profile?: ChannelProfile; // v5.3: channel cross-section; renderer extrudes along run
  mesh_ref?: string;        // v6: key into meshes dict; renderer builds BufferGeometry
  tooling?: ToolingItem[];  // v6.3: inner tooling features (bores + blind pockets)
};

// Minimal panel shape for real-position 3D rendering (satisfied by ImportedPanel).
export type RawPanel3D = {
  part_role: PartRole | string;
  width_mm:     number; // middle sorted extent (mm)
  height_mm:    number; // largest sorted extent (mm)
  thickness_mm: number; // smallest sorted extent (mm)
  pos: { x: number; y: number; z: number }; // world centre: x=width, y=height, z=depth
};

const DEFAULT_T = 18; // structural panel thickness mm
const EXPLODE_M = 0.04; // metres to separate panels when exploding

function m(v: number): number {
  return v / 1000;
}

export function inferRole(partName: string): PartRole {
  const n = partName.toLowerCase();
  if (n.includes("left")) return "side_left";
  if (n.includes("right")) return "side_right";
  if (n.includes("side")) return "side_left";
  if (n.includes("top")) return "top";
  if (n.includes("bottom") || n.includes("base")) return "bottom";
  if (n.includes("back")) return "back";
  if (n.includes("drawer")) return "drawer_front";
  if (n.includes("door")) return "door";
  if (n.includes("divider") || n.includes("partition")) return "divider_v";
  if (n.includes("shelf") || n.includes("shelve")) return "shelf";
  return "other";
}

// Radially-symmetric fittings that always stand vertical (ignore part orientation).
export function isUprightCylinderFitting(name: string): boolean {
  const n = (name || "").toLowerCase();
  return n.includes("leg") || n.includes("p2o");
}

export function buildCabinetBoxes(
  cabinetWmm: number,
  cabinetHmm: number,
  cabinetDmm: number,
  parts: PartInput[],
  showDoors = true,
  explode = false,
): Box3D[] {
  const W = m(cabinetWmm || 800);
  const H = m(cabinetHmm || 720);
  const D = m(cabinetDmm || 580);
  const T = m(DEFAULT_T);

  const boxes: Box3D[] = [];

  // Group by effective role
  const byRole = new Map<PartRole, PartInput[]>();
  for (const p of parts.slice(0, 60)) {
    const role = p.role ?? inferRole(p.part_name);
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(p);
  }

  for (const [role, roleParts] of byRole) {
    if ((role === "door" || role === "drawer_front") && !showDoors) continue;

    switch (role) {
      case "side_left":
        boxes.push({
          w: T, h: H, d: D,
          x: T / 2 + (explode ? -EXPLODE_M : 0),
          y: H / 2,
          z: D / 2,
          role,
        });
        break;

      case "side_right":
        boxes.push({
          w: T, h: H, d: D,
          x: W - T / 2 + (explode ? EXPLODE_M : 0),
          y: H / 2,
          z: D / 2,
          role,
        });
        break;

      case "top":
        boxes.push({
          w: W - 2 * T, h: T, d: D,
          x: W / 2,
          y: H - T / 2 + (explode ? EXPLODE_M : 0),
          z: D / 2,
          role,
        });
        break;

      case "bottom":
        boxes.push({
          w: W - 2 * T, h: T, d: D,
          x: W / 2,
          y: T / 2 + (explode ? -EXPLODE_M : 0),
          z: D / 2,
          role,
        });
        break;

      case "back":
        boxes.push({
          w: W - 2 * T, h: H - 2 * T, d: T,
          x: W / 2,
          y: H / 2,
          z: T / 2 + (explode ? -EXPLODE_M : 0),
          role,
        });
        break;

      case "shelf": {
        // Count total shelf instances
        const totalShelves = roleParts.reduce(
          (s, p) => s + Math.max(1, Math.round(p.qty || 1)),
          0,
        );
        const innerH = H - 2 * T;
        let idx = 0;
        for (const p of roleParts) {
          const qty = Math.max(1, Math.round(p.qty || 1));
          const shelfD = p.depth_mm != null ? m(p.depth_mm) : D - T;
          for (let i = 0; i < qty; i++) {
            const yCenter =
              p.pos_offset_mm != null
                ? m(p.pos_offset_mm)
                : T + (innerH * (idx + 1)) / (totalShelves + 1);
            boxes.push({
              w: W - 2 * T, h: T, d: shelfD,
              x: W / 2,
              y: yCenter + (explode ? m(20 * idx) : 0),
              z: T + shelfD / 2,
              role,
            });
            idx++;
          }
        }
        break;
      }

      case "divider_v": {
        let idx = 0;
        for (const p of roleParts) {
          const qty = Math.max(1, Math.round(p.qty || 1));
          const divD = p.depth_mm != null ? m(p.depth_mm) : D;
          for (let i = 0; i < qty; i++) {
            const xCenter =
              p.pos_offset_mm != null
                ? T + m(p.pos_offset_mm)
                : W / 2 + m(DEFAULT_T * idx);
            boxes.push({
              w: T, h: H - 2 * T, d: divD,
              x: xCenter + (explode ? m(20 * idx) : 0),
              y: H / 2,
              z: divD / 2 + T,
              role,
            });
            idx++;
          }
        }
        break;
      }

      case "door": {
        const totalDoors = roleParts.reduce(
          (s, p) => s + Math.max(1, Math.round(p.qty || 1)),
          0,
        );
        let idx = 0;
        for (const p of roleParts) {
          const qty = Math.max(1, Math.round(p.qty || 1));
          const doorW = p.width_mm > 0 ? m(p.width_mm) : W / totalDoors;
          const doorH = p.height_mm > 0 ? m(p.height_mm) : H;
          const explodeZ = explode ? EXPLODE_M * 2 : 0;
          for (let i = 0; i < qty; i++) {
            boxes.push({
              w: doorW, h: doorH, d: T,
              x: doorW / 2 + idx * doorW,
              y: H / 2,
              z: D + T / 2 + explodeZ,
              role,
            });
            idx++;
          }
        }
        break;
      }

      case "drawer_front": {
        let idx = 0;
        for (const p of roleParts) {
          const qty = Math.max(1, Math.round(p.qty || 1));
          const dW = p.width_mm > 0 ? m(p.width_mm) : W;
          const dH = p.height_mm > 0 ? m(p.height_mm) : m(180);
          const explodeZ = explode ? EXPLODE_M * 2 : 0;
          for (let i = 0; i < qty; i++) {
            const yOff =
              p.pos_offset_mm != null
                ? m(p.pos_offset_mm)
                : m(DEFAULT_T) + m(180) * idx;
            boxes.push({
              w: dW, h: dH, d: T,
              x: W / 2,
              y: T + yOff + dH / 2,
              z: D + T / 2 + explodeZ,
              role,
            });
            idx++;
          }
        }
        break;
      }

      default:
        for (const p of roleParts) {
          boxes.push({
            w: m(Math.max(p.width_mm || 200, 10)),
            h: m(Math.max(p.height_mm || 200, 10)),
            d: T,
            x: W / 2,
            y: H / 2,
            z: D / 2,
            role: "other",
          });
        }
        break;
    }
  }

  return boxes;
}

// Raw SketchUp panel: per-axis extents in SketchUp world coords (NOT sorted cut-list dims).
// su_width_mm  = extent along SU X axis (local x for v5)
// su_height_mm = extent along SU Y axis (local y for v5)
// su_depth_mm  = extent along SU Z axis (local z for v5; vertical in SketchUp world for v3/v4)
export type SkuPanel3D = {
  part_role: PartRole | string;
  part_name?: string;
  su_width_mm:  number;
  su_height_mm: number;
  su_depth_mm:  number;
  pos: { x: number; y: number; z: number }; // SketchUp world-space center
  cuts?: Cut[];
  axes?: { x: number[]; y: number[]; z: number[] }; // v5 orientation (local axes in SU world)
  outline_mm?: PanelOutline;                          // v5.1 true 2D silhouette
  profile_mm?: ChannelProfile;                        // v5.3 channel cross-section
  mesh_ref?: string;                                  // v6 reference into top-level meshes dict
  tooling_mm?: ToolingItem[];                         // v6.3 inner tooling features
};

// Oriented build path for v5 exports where every panel carries `axes`.
// Applies the same SU→three basis C = (su.x, su.z, -su.y) to both position and axes,
// then emits an oriented Box3D so the renderer can apply a full 3×3 rotation matrix.
function buildBoxesFromOrientedPanels(
  panels: SkuPanel3D[],
  showDoors: boolean,
  explode: boolean,
): Box3D[] {
  function Cx(v: number[]): [number, number, number] {
    return [v[0], v[2], -v[1]];
  }
  const E = EXPLODE_M;

  const oriented = panels.map(p => {
    const role = (p.part_role || "other") as PartRole;
    const axes = p.axes!;
    // Dimension panels from outline_mm (local-frame extents); fittings use world size_mm fallback.
    // axis-name → local index: width→0 (=bw/col0), depth→1 (=bh/col1), height→2 (=bd/col2)
    const _isFitting = (() => {
      const n = (p.part_name || "").toLowerCase();
      return n.includes("p2o") || n.includes("leg") || n.includes("atira") ||
             n.includes("hafele") || n.includes("basket") || n.includes("l_channel") ||
             n.includes("u_channel") || n.includes("channel") || n.includes("blum") ||
             n.includes("hinge") || n.includes("slide");
    })();
    let bw = m(p.su_width_mm);
    let bh = m(p.su_height_mm);
    let bd = m(p.su_depth_mm);
    if (!_isFitting && p.outline_mm) {
      const ol = p.outline_mm;
      const us = ol.loop.map(pt => pt[0]);
      const vs = ol.loop.map(pt => pt[1]);
      const u_extent = Math.max(...us) - Math.min(...us);
      const v_extent = Math.max(...vs) - Math.min(...vs);
      if (u_extent > 1 && v_extent > 1) {
        const thicknessRole = (['width', 'depth', 'height'] as const).find(
          r => r !== ol.u_axis && r !== ol.v_axis,
        );
        if (!thicknessRole) {
          console.warn('[12FIX] unexpected axis names for', p.part_name, ol.u_axis, ol.v_axis, '— falling back to size_mm');
        } else {
          // Route by role: width→bw (local x/col0), depth→bh (local y/col1), height→bd (local z/col2)
          const roleExtent: Record<string, number> = {
            [ol.u_axis]: u_extent,
            [ol.v_axis]: v_extent,
            [thicknessRole]: ol.thickness_mm,
          };
          bw = m(roleExtent['width']);
          bh = m(roleExtent['depth']);
          bd = m(roleExtent['height']);
        }
      } else {
        console.warn('[12FIX] degenerate outline for', p.part_name, '— falling back to size_mm');
      }
    }
    // Three-space orientation columns (C applied to each SU local axis)
    const col0 = Cx(axes.x);
    const col1 = Cx(axes.y);
    const col2 = Cx(axes.z);
    // 9-number column-major basis for Box3D.orient
    const orient: number[] = [
      col0[0], col0[1], col0[2],
      col1[0], col1[1], col1[2],
      col2[0], col2[1], col2[2],
    ];
    // World-space center in three coords
    const ct = Cx([m(p.pos.x), m(p.pos.y), m(p.pos.z)]);
    const center = { x: ct[0], y: ct[1], z: ct[2] };
    // Enumerate 8 local corners in world space for AABB
    const hW = bw / 2, hH = bh / 2, hD = bd / 2;
    const corners: { x: number; y: number; z: number }[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      corners.push({
        x: center.x + col0[0]*sx*hW + col1[0]*sy*hH + col2[0]*sz*hD,
        y: center.y + col0[1]*sx*hW + col1[1]*sy*hH + col2[1]*sz*hD,
        z: center.z + col0[2]*sx*hW + col1[2]*sy*hH + col2[2]*sz*hD,
      });
    }
    return { role, part_name: p.part_name, bw, bh, bd, center, orient, corners, cuts: p.cuts, outline_mm: p.outline_mm, profile_mm: p.profile_mm, mesh_ref: p.mesh_ref, tooling_mm: p.tooling_mm };
  });

  // Global min-corner across all panel AABBs → shift cabinet to origin
  const allCorners = oriented.flatMap(p => p.corners);
  const minX = Math.min(...allCorners.map(c => c.x));
  const minY = Math.min(...allCorners.map(c => c.y));
  const minZ = Math.min(...allCorners.map(c => c.z));

  const boxes: Box3D[] = [];
  for (const p of oriented) {
    const { role } = p;
    if ((role === "door" || role === "drawer_front") && !showDoors) continue;

    let x = p.center.x - minX;
    let y = p.center.y - minY;
    let z = p.center.z - minZ;

    if (explode) {
      switch (role) {
        case "side_left":    x -= E;     break;
        case "side_right":   x += E;     break;
        case "top":          y += E;     break;
        case "bottom":       y -= E;     break;
        case "back":         z -= E;     break;
        case "door":
        case "drawer_front": z += E * 2; break;
      }
    }

    boxes.push({ w: p.bw, h: p.bh, d: p.bd, x, y, z, role, part_name: p.part_name, cuts: p.cuts, orient: p.orient, uprightCylinder: isUprightCylinderFitting(p.part_name ?? ""), outline: p.outline_mm, profile: p.profile_mm, mesh_ref: p.mesh_ref, tooling: p.tooling_mm });
  }

  return boxes;
}

// Build Box3D from real SketchUp panel data using raw per-axis extents + true positions.
// SketchUp is Z-up: SU X→three X, SU Y→three Z (depth), SU Z→three Y (vertical/up).
// Min-corner is subtracted so the assembled cabinet sits at origin.
export function buildBoxesFromSkuPanels(
  panels: SkuPanel3D[],
  showDoors = true,
  explode = false,
): Box3D[] {
  if (panels.length === 0) return [];
  // v5 export: all panels carry axes → use oriented build path
  if (panels.every(p => p.axes !== undefined)) {
    return buildBoxesFromOrientedPanels(panels, showDoors, explode);
  }
  const E = EXPLODE_M;

  // Apply Z-up axis swap to every panel:
  //   three X size  = su_width_mm   (SU X extent)
  //   three Y size  = su_depth_mm   (SU Z extent → vertical)
  //   three Z size  = su_height_mm  (SU Y extent → depth)
  //   three X ctr   = pos.x
  //   three Y ctr   = pos.z         (SU Z → up)
  //   three Z ctr   = pos.y         (SU Y → depth)
  const mapped = panels.map(p => ({
    role: (p.part_role || "other") as PartRole,
    part_name: p.part_name,
    bw: m(p.su_width_mm),
    bh: m(p.su_depth_mm),
    bd: m(p.su_height_mm),
    cx: m(p.pos.x),
    cy: m(p.pos.z),
    cz: -m(p.pos.y),
    cuts: p.cuts,
  }));

  // AABB min-corner across all panels → shift so the cabinet starts at origin
  const minX = Math.min(...mapped.map(p => p.cx - p.bw / 2));
  const minY = Math.min(...mapped.map(p => p.cy - p.bh / 2));
  const minZ = Math.min(...mapped.map(p => p.cz - p.bd / 2));

  const boxes: Box3D[] = [];
  for (const p of mapped) {
    const { role } = p;
    if ((role === "door" || role === "drawer_front") && !showDoors) continue;

    let x = p.cx - minX;
    let y = p.cy - minY;
    let z = p.cz - minZ;

    if (explode) {
      switch (role) {
        case "side_left":    x -= E;     break;
        case "side_right":   x += E;     break;
        case "top":          y += E;     break;
        case "bottom":       y -= E;     break;
        case "back":         z -= E;     break;
        case "door":
        case "drawer_front": z += E * 2; break;
      }
    }

    boxes.push({ w: p.bw, h: p.bh, d: p.bd, x, y, z, role, part_name: p.part_name, cuts: p.cuts });
  }

  return boxes;
}

// Build Box3D array from real assembled panel positions (e.g. from .3ds import).
// Uses role-based axis assignment to map sorted extents (T/W/H) to THREE.js w/h/d.
export function buildBoxesFromRawPanels(
  panels: RawPanel3D[],
  showDoors = true,
  explode = false,
): Box3D[] {
  const boxes: Box3D[] = [];
  const E = EXPLODE_M;

  for (const panel of panels) {
    const role = (panel.part_role || "other") as PartRole;
    if ((role === "door" || role === "drawer_front") && !showDoors) continue;

    const T = m(panel.thickness_mm); // smallest (thickness)
    const W = m(panel.width_mm);     // middle
    const H = m(panel.height_mm);    // largest

    // Assign sorted extents to THREE.js axes based on role orientation.
    // App axes: x=width, y=height, z=depth (same as 3ds after remapping).
    let bw: number, bh: number, bd: number;
    switch (role) {
      case "side_left":
      case "side_right":
      case "divider_v":
        bw = T; bh = H; bd = W; // thin in X, tall in Y, deep in Z
        break;
      case "top":
      case "bottom":
      case "shelf":
        bw = H; bh = T; bd = W; // wide in X, thin in Y, deep in Z
        break;
      default: // back, door, drawer_front, other
        bw = W; bh = H; bd = T; // medium-wide in X, tall in Y, thin in Z
        break;
    }

    // Real assembled position (already in app convention: x=width, y=height, z=depth)
    let x = m(panel.pos.x);
    let y = m(panel.pos.y);
    let z = m(panel.pos.z);

    if (explode) {
      switch (role) {
        case "side_left":    x -= E;     break;
        case "side_right":   x += E;     break;
        case "top":          y += E;     break;
        case "bottom":       y -= E;     break;
        case "back":         z -= E;     break;
        case "door":
        case "drawer_front": z += E * 2; break;
      }
    }

    boxes.push({ w: bw, h: bh, d: bd, x, y, z, role });
  }

  return boxes;
}
