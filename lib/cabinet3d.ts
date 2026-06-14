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

export type Box3D = {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  role: PartRole;
};

const DEFAULT_T = 18; // structural panel thickness mm
const EXPLODE_M = 0.04; // metres to separate panels when exploding

function m(v: number): number {
  return v / 1000;
}

function inferRole(partName: string): PartRole {
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
