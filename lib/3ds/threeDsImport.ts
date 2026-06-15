// Polyboard .3ds importer — assembled geometry, real world positions.
// Pure client-side function (no dynamic import needed, no SSR issues with ArrayBuffer).
// Returns the same ParseResult / ImportedPanel shapes used by the DXF importer.

import type { ParseResult, ImportedPanel } from "@/lib/dxf/polyboardImport";
import type { PartRole } from "@/lib/cabinet3d";

// ── helpers ──────────────────────────────────────────────────────────

function r1(n: number): number { return Math.round(n * 10) / 10; }

function inferRole(name: string): PartRole | "" {
  const n = name.toLowerCase();
  if (n.includes("left"))  return "side_left";
  if (n.includes("right")) return "side_right";
  if (n.includes("side"))  return "side_left";
  if (n.includes("top"))   return "top";
  if (n.includes("bottom") || n.includes("base")) return "bottom";
  if (n.includes("back"))  return "back";
  if (n.includes("drawer")) return "drawer_front";
  if (n.includes("door"))  return "door";
  if (n.includes("divider") || n.includes("partition") ||
      n.includes("space")  || n.includes("fixed_space")) return "divider_v";
  if (n.includes("shelve") || n.includes("shelf") ||
      n.includes("tray")   || n.includes("mobile")) return "shelf";
  return "other";
}

function guessMaterial(name: string, thickness: number): string {
  const n = name.toLowerCase();
  if (n.includes("door") || n.includes("front")) return "Front 18";
  if (thickness < 12) return "8MM back";
  return "Carcass 18";
}

// ── chunk walker ──────────────────────────────────────────────────────

// .3ds chunk header: uint16 id (LE) + uint32 length (LE, includes the 6-byte header).
// Walk all chunks within [offset, end) and call cb for each.
function walkChunks(
  view: DataView,
  offset: number,
  end: number,
  cb: (id: number, dataStart: number, dataEnd: number) => void,
): void {
  while (offset + 6 <= end) {
    const id  = view.getUint16(offset, true);
    const len = view.getUint32(offset + 2, true);
    if (len < 6) break; // malformed
    const dataStart = offset + 6;
    const dataEnd   = Math.min(offset + len, end); // clamp to parent range
    cb(id, dataStart, dataEnd);
    offset += len;
  }
}

// ── main parser ───────────────────────────────────────────────────────

// .3ds axis convention: X=width, Y=depth, Z=height (Max Z-up).
// App convention for pos: pos.x=width, pos.y=height, pos.z=depth.
export function parse3ds(buffer: ArrayBuffer): ParseResult {
  const view    = new DataView(buffer);
  const fileLen = buffer.byteLength;

  if (fileLen < 6) throw new Error("File too small to be a .3ds file.");
  const rootId = view.getUint16(0, true);
  if (rootId !== 0x4D4D) {
    throw new Error(
      `Not a .3ds file (expected root chunk 0x4D4D, got 0x${rootId.toString(16).toUpperCase()}).`,
    );
  }

  const warnings: string[] = [];
  const panels: ImportedPanel[] = [];

  // Global bbox in 3ds coords (X=width, Y=depth, Z=height)
  let gMinX = Infinity, gMaxX = -Infinity;
  let gMinY = Infinity, gMaxY = -Infinity;
  let gMinZ = Infinity, gMaxZ = -Infinity;

  // MAIN3DS(0x4D4D) → EDIT3DS(0x3D3D)
  walkChunks(view, 6, fileLen, (id, dataStart, dataEnd) => {
    if (id !== 0x3D3D) return;

    // EDIT3DS → NAMED_OBJECT(0x4000)
    walkChunks(view, dataStart, dataEnd, (id, dataStart, dataEnd) => {
      if (id !== 0x4000) return;

      // Read null-terminated ASCII object name
      let nameEnd = dataStart;
      while (nameEnd < dataEnd && view.getUint8(nameEnd) !== 0) nameEnd++;
      const nameBytes = new Uint8Array(buffer, dataStart, nameEnd - dataStart);
      const name = new TextDecoder("ascii").decode(nameBytes);
      const afterName = nameEnd + 1;

      // Accumulate all vertices from TRIMESH(0x4100) → VERTEX_LIST(0x4110)
      const verts: number[] = []; // flat x,y,z triplets in mm

      walkChunks(view, afterName, dataEnd, (id, dataStart, dataEnd) => {
        if (id !== 0x4100) return; // only TRIMESH

        walkChunks(view, dataStart, dataEnd, (id, dataStart) => {
          if (id !== 0x4110) return; // only VERTEX_LIST
          const count = view.getUint16(dataStart, true);
          for (let i = 0; i < count; i++) {
            const base = dataStart + 2 + i * 12;
            // Use getFloat32 (not Float32Array) to avoid alignment errors
            verts.push(
              view.getFloat32(base,      true),
              view.getFloat32(base + 4,  true),
              view.getFloat32(base + 8,  true),
            );
          }
        });
      });

      if (verts.length === 0) {
        warnings.push(`Object "${name}": no vertices — skipped.`);
        return;
      }

      // Compute per-object bbox in 3ds space
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < verts.length; i += 3) {
        const x = verts[i], y = verts[i + 1], z = verts[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }

      // Expand global bbox
      if (minX < gMinX) gMinX = minX; if (maxX > gMaxX) gMaxX = maxX;
      if (minY < gMinY) gMinY = minY; if (maxY > gMaxY) gMaxY = maxY;
      if (minZ < gMinZ) gMinZ = minZ; if (maxZ > gMaxZ) gMaxZ = maxZ;

      // Extents per 3ds axis
      const extX = maxX - minX; // width direction
      const extY = maxY - minY; // depth direction
      const extZ = maxZ - minZ; // height direction

      // Sort to thickness (smallest), width (middle), height (largest)
      const sorted = [extX, extY, extZ].sort((a, b) => a - b);
      const thickness = sorted[0];
      const panelW    = sorted[1];
      const panelH    = sorted[2];

      // Bbox center mapped to app convention (x=width, y=height, z=depth)
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const cz = (minZ + maxZ) / 2;

      // Strip trailing [n] index for role inference; keep full name for display
      const cleanName = name.replace(/\s*\[\d+\]$/, "").trim();

      panels.push({
        partName:     name,
        width_mm:     r1(panelW),
        height_mm:    r1(panelH),
        thickness_mm: r1(thickness),
        pos: {
          x: r1(cx),  // 3ds X → app width
          y: r1(cz),  // 3ds Z → app height
          z: r1(cy),  // 3ds Y → app depth
        },
        holeCount:   0,
        holes:       [],
        materialRef: guessMaterial(cleanName, thickness),
        qty:         1,
        part_role:   inferRole(cleanName),
      });
    });
  });

  if (panels.length === 0) {
    throw new Error("No mesh objects found in this .3ds file.");
  }

  // Overall cabinet dims from global bbox:
  // width = 3ds X extent, height = 3ds Z extent, depth = 3ds Y extent
  const width_mm  = r1(gMaxX - gMinX);
  const height_mm = r1(gMaxZ - gMinZ);
  const depth_mm  = r1(gMaxY - gMinY);

  if (process.env.NODE_ENV === "development") {
    console.log("[3ds] overall bbox", { width_mm, height_mm, depth_mm, panels: panels.length });
    console.table(
      panels.map(p => ({
        name: p.partName,
        W: p.width_mm,
        H: p.height_mm,
        T: p.thickness_mm,
        role: p.part_role,
        px: p.pos.x,
        py: p.pos.y,
        pz: p.pos.z,
      })),
    );
  }

  return {
    cabinet: {
      name:      "Imported Cabinet",
      width_mm,
      height_mm,
      depth_mm,
      panels,
    },
    warnings,
  };
}
