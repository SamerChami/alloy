// Polyboard DXF → BOM importer.
// Uses dxf-parser (client-side dynamic import to avoid SSR issues).
// Only reads INSERT, 3DFACE, CIRCLE entities — sufficient for Polyboard R2000 exports.

import type { IDxf, IBlock } from "dxf-parser";
import type { I3DfaceEntity } from "dxf-parser";
import type { ICircleEntity } from "dxf-parser";
import type { IInsertEntity } from "dxf-parser";
import type { IEntity } from "dxf-parser";
import type { PartRole } from "@/lib/cabinet3d";

// ── public types ──────────────────────────────────────────────────────

export type HoleInfo = { x: number; y: number; z: number; dia: number };

export type ImportedPanel = {
  partName: string;
  width_mm: number;
  height_mm: number;
  thickness_mm: number;
  pos: { x: number; y: number; z: number };
  holeCount: number;
  holes: HoleInfo[];
  materialRef: string;
  qty: number;
  part_role: PartRole | "";
};

export type ImportedCabinet = {
  name: string;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  panels: ImportedPanel[];
};

export type ParseResult = {
  cabinet: ImportedCabinet;
  warnings: string[];
};

// ── public entry point ────────────────────────────────────────────────

export async function parsePolyboardDxf(text: string): Promise<ParseResult> {
  // Dynamic import keeps dxf-parser out of the SSR bundle
  const { default: DxfParser } = await import("dxf-parser");
  const parser = new DxfParser();
  let dxf: IDxf;
  try {
    const result = parser.parseSync(text);
    if (!result) throw new Error("parseSync returned null");
    dxf = result;
  } catch (e) {
    throw new Error(`DXF parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return extractCabinet(dxf);
}

// ── transform helpers ─────────────────────────────────────────────────

type Pt3 = { x: number; y: number; z: number };
type Transform = { tx: number; ty: number; tz: number; angle: number; sx: number; sy: number; sz: number };

const IDENTITY: Transform = { tx: 0, ty: 0, tz: 0, angle: 0, sx: 1, sy: 1, sz: 1 };

function applyT(p: Pt3, t: Transform): Pt3 {
  const sx = p.x * t.sx;
  const sy = p.y * t.sy;
  const sz = p.z * t.sz;
  const rad = (t.angle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: sx * c - sy * s + t.tx, y: sx * s + sy * c + t.ty, z: sz + t.tz };
}

function composeT(outer: Transform, inner: Transform): Transform {
  // Compose: outer ∘ inner  (inner applied first)
  const rad = (outer.angle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const itx = inner.tx * outer.sx;
  const ity = inner.ty * outer.sy;
  return {
    tx: itx * c - ity * s + outer.tx,
    ty: itx * s + ity * c + outer.ty,
    tz: inner.tz * outer.sz + outer.tz,
    angle: outer.angle + inner.angle,
    sx: outer.sx * inner.sx,
    sy: outer.sy * inner.sy,
    sz: outer.sz * inner.sz,
  };
}

function insertTransform(ins: IInsertEntity): Transform {
  return {
    tx: ins.position?.x ?? 0,
    ty: ins.position?.y ?? 0,
    tz: ins.position?.z ?? 0,
    angle: ins.rotation ?? 0,
    sx: ins.xScale ?? 1,
    sy: ins.yScale ?? 1,
    sz: ins.zScale ?? 1,
  };
}

// ── bbox ──────────────────────────────────────────────────────────────

type BBox = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

function bbox(pts: Pt3[]): BBox | null {
  if (pts.length === 0) return null;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function r1(n: number): number { return Math.round(n * 10) / 10; }

// ── role / material inference ─────────────────────────────────────────

function inferRole(name: string): PartRole | "" {
  const n = name.toLowerCase();
  if (n.includes("left")) return "side_left";
  if (n.includes("right")) return "side_right";
  if (n.includes("side")) return "side_left";
  if (n.includes("top")) return "top";
  if (n.includes("bottom") || n.includes("base")) return "bottom";
  if (n.includes("back")) return "back";
  if (n.includes("drawer")) return "drawer_front";
  if (n.includes("door")) return "door";
  if (n.includes("divider") || n.includes("partition") || n.includes("space") || n.includes("fixed_space")) return "divider_v";
  if (n.includes("shelve") || n.includes("shelf") || n.includes("tray") || n.includes("mobile")) return "shelf";
  return "other";
}

function guessMaterial(name: string, thickness: number): string {
  const n = name.toLowerCase();
  if (n.includes("door") || n.includes("front")) return "Front 18";
  if (thickness < 12) return "8MM back";
  return "Carcass 18";
}

// ── geometry collection ───────────────────────────────────────────────

// Recursively gather 3DFACE vertices from a block, applying tx, depth-limited.
function gatherLeafFaces(
  blocks: Record<string, IBlock>,
  blockName: string,
  tx: Transform,
  depth: number,
): Pt3[] {
  if (depth > 2) return [];
  const block = blocks[blockName];
  if (!block) return [];
  const verts: Pt3[] = [];
  for (const fe of block.entities ?? []) {
    const e = fe as IEntity;
    if (e.type === "3DFACE") {
      const face = e as I3DfaceEntity;
      for (const v of face.vertices ?? []) verts.push(applyT(v, tx));
    } else if (e.type === "INSERT") {
      const ins = e as IInsertEntity;
      verts.push(...gatherLeafFaces(blocks, ins.name, composeT(tx, insertTransform(ins)), depth + 1));
    }
  }
  return verts;
}

type LeafResult = { vertices: Pt3[]; holes: HoleInfo[]; suffix: string };

// Collect leaves for one panel block in panel-LOCAL coordinates (IDENTITY base).
// A panel block with N face-sub-block INSERTs yields N leaves (one per INSERT).
// This correctly splits double-door blocks into individual leaves.
// Holes (CIRCLEs at panel level) are distributed to leaves by X-range overlap.
function collectPanelLeaves(
  blocks: Record<string, IBlock>,
  panelBlockName: string,
  warnings: string[],
): LeafResult[] {
  const panelBlock = blocks[panelBlockName];
  if (!panelBlock) {
    warnings.push(`Panel block '${panelBlockName}' not found`);
    return [];
  }

  // Collect holes from the panel block in LOCAL frame
  const panelHoles: HoleInfo[] = [];
  for (const ent of panelBlock.entities ?? []) {
    const e = ent as IEntity;
    if (e.type === "CIRCLE") {
      const circle = e as ICircleEntity;
      panelHoles.push({ ...circle.center, dia: (circle.radius ?? 0) * 2 });
    }
  }

  // Find face-sub-block INSERTs in the panel block
  const faceInserts: IInsertEntity[] = [];
  for (const ent of panelBlock.entities ?? []) {
    const e = ent as IEntity;
    if (e.type === "INSERT") faceInserts.push(e as IInsertEntity);
  }

  // Fallback: no INSERTs → use the panel block's own 3DFACEs directly
  if (faceInserts.length === 0) {
    const verts: Pt3[] = [];
    for (const ent of panelBlock.entities ?? []) {
      const e = ent as IEntity;
      if (e.type === "3DFACE") {
        const face = e as I3DfaceEntity;
        for (const v of face.vertices ?? []) verts.push(v);
      }
    }
    if (verts.length === 0) return [];
    return [{ vertices: verts, holes: panelHoles, suffix: "" }];
  }

  // Collect vertices per leaf INSERT (LOCAL frame: each INSERT's own offset is applied)
  const rawLeaves = faceInserts.map(ins => ({
    ins,
    verts: gatherLeafFaces(blocks, ins.name, insertTransform(ins), 1),
  }));

  // Drop leaves with no geometry
  const valid = rawLeaves.filter(l => l.verts.length > 0);

  // If all INSERTs yielded no faces, fall back to panel block's own 3DFACEs
  if (valid.length === 0) {
    const verts: Pt3[] = [];
    for (const ent of panelBlock.entities ?? []) {
      const e = ent as IEntity;
      if (e.type === "3DFACE") {
        const face = e as I3DfaceEntity;
        for (const v of face.vertices ?? []) verts.push(v);
      }
    }
    if (verts.length === 0) return [];
    return [{ vertices: verts, holes: panelHoles, suffix: "" }];
  }

  // Distribute holes to leaves by X-range overlap (5 mm tolerance)
  const leafBboxes = valid.map(l => bbox(l.verts));
  const leafHoles: HoleInfo[][] = valid.map(() => []);
  for (const hole of panelHoles) {
    let placed = false;
    for (let i = 0; i < valid.length; i++) {
      const bb = leafBboxes[i];
      if (bb && hole.x >= bb.minX - 5 && hole.x <= bb.maxX + 5) {
        leafHoles[i].push(hole);
        placed = true;
        break;
      }
    }
    if (!placed) leafHoles[0].push(hole);
  }

  // Suffixes: single leaf → no suffix; 2 leaves → L/R; more → numeric
  const suffixes =
    valid.length === 1
      ? [""]
      : valid.length === 2
      ? [" — L", " — R"]
      : valid.map((_, i) => ` — ${i + 1}`);

  return valid.map((l, i) => ({
    vertices: l.verts,
    holes: leafHoles[i],
    suffix: suffixes[i],
  }));
}

// ── overall dims from carcass panel sizes ─────────────────────────────

// Derive cabinet W×H×D from carcass SIZES (not from scattered DXF positions).
// height_mm = panel's largest extent; width_mm = middle extent; thickness_mm = smallest.
function deriveOverallDims(panels: ImportedPanel[]): { W: number; H: number; D: number } {
  const sides = panels.filter(p => p.part_role === "side_left" || p.part_role === "side_right");
  const tops  = panels.filter(p => p.part_role === "top" || p.part_role === "bottom");
  const shelves = panels.filter(p => p.part_role === "shelf" || p.part_role === "divider_v");

  // Most common thickness among structural panels
  const structural = [...sides, ...tops];
  const thickMap = new Map<number, number>();
  for (const p of structural) {
    const t = r1(p.thickness_mm);
    thickMap.set(t, (thickMap.get(t) ?? 0) + 1);
  }
  let thick = 18;
  let bestCount = 0;
  for (const [t, count] of thickMap) {
    if (count > bestCount) { bestCount = count; thick = t; }
  }

  // H = largest dimension of side panels (the cabinet height)
  let H = 0;
  if (sides.length > 0) {
    H = Math.max(...sides.map(p => p.height_mm));
  } else if (panels.length > 0) {
    H = Math.max(...panels.map(p => p.height_mm));
  }

  // W = largest dimension of top/bottom panels + 2×thick (adds both side thicknesses)
  let W = 0;
  if (tops.length > 0) {
    W = r1(Math.max(...tops.map(p => p.height_mm)) + 2 * thick);
  } else if (shelves.length > 0) {
    W = r1(Math.max(...shelves.map(p => p.width_mm)) + 2 * thick);
  } else if (panels.length > 0) {
    W = r1(Math.max(...panels.map(p => p.width_mm)) + 2 * thick);
  }

  // D = carcass side depth + door/front thickness + reveal
  // The door sits proud of the carcass front face, adding its thickness + a 2 mm reveal.
  const carcass_side_depth = sides.length > 0
    ? Math.max(...sides.map(p => p.width_mm))
    : shelves.length > 0
      ? Math.max(...shelves.map(p => p.width_mm))
      : 0;

  const fronts = panels.filter(p => p.part_role === "door" || p.part_role === "drawer_front");
  const front_thickness = fronts.length > 0 ? Math.max(...fronts.map(p => p.thickness_mm)) : 0;
  const reveal = front_thickness > 0 ? 2 : 0;
  const D = r1(carcass_side_depth + front_thickness + reveal);

  if (process.env.NODE_ENV === "development") {
    console.log("[depth]", { carcass: carcass_side_depth, front: front_thickness, total: D });
  }

  return { W: r1(W), H: r1(H), D };
}

// ── main extraction ───────────────────────────────────────────────────

function extractCabinet(dxf: IDxf): ParseResult {
  const warnings: string[] = [];
  const blocks = dxf.blocks ?? {};

  // --- find the main cabinet block ---
  // Strategy 1: INSERT entity in dxf.entities points to the cabinet block
  let cabinetBlockName = "";
  for (const ent of dxf.entities ?? []) {
    if ((ent as IEntity).type === "INSERT") {
      const ins = ent as IInsertEntity;
      if (ins.name && !ins.name.startsWith("*")) {
        cabinetBlockName = ins.name;
        break;
      }
    }
  }

  // Strategy 2: the block with the most INSERT children (excluding *MODEL_SPACE etc.)
  if (!cabinetBlockName) {
    let best = 0;
    for (const [name, block] of Object.entries(blocks)) {
      if (name.startsWith("*")) continue;
      const count = (block.entities ?? []).filter(e => (e as IEntity).type === "INSERT").length;
      if (count > best) { best = count; cabinetBlockName = name; }
    }
  }

  if (!cabinetBlockName || !blocks[cabinetBlockName]) {
    throw new Error("No cabinet block found in this DXF file.");
  }

  const cabinetBlock = blocks[cabinetBlockName];
  const panels: ImportedPanel[] = [];

  for (const ent of cabinetBlock.entities ?? []) {
    if ((ent as IEntity).type !== "INSERT") continue;
    const ins = ent as IInsertEntity;
    const panelBlockName = ins.name;

    if (!blocks[panelBlockName]) {
      warnings.push(`Panel block '${panelBlockName}' not found — skipped.`);
      continue;
    }

    // Cabinet INSERT transform — used only for world POSITION (the DXF is a flat
    // nesting layout, so positions cannot be used for overall cabinet dims).
    const t = composeT(IDENTITY, insertTransform(ins));

    const leaves = collectPanelLeaves(blocks, panelBlockName, warnings);
    if (leaves.length === 0) {
      warnings.push(`No geometry in '${panelBlockName}' — skipped.`);
      continue;
    }

    // Extract part name (strip cabinet prefix "CabinetName.")
    const dotIdx = panelBlockName.indexOf(".");
    const partName = dotIdx >= 0 ? panelBlockName.slice(dotIdx + 1) : panelBlockName;
    const cleanName = partName.replace(/\s*\(\d+\)$/, "").replace(/\d+$/, "").trim();

    for (const leaf of leaves) {
      if (leaf.vertices.length === 0) continue;

      const localBb = bbox(leaf.vertices)!;

      if (process.env.NODE_ENV === "development" && panelBlockName.toLowerCase().includes("door")) {
        console.log("[door dbg]", panelBlockName + leaf.suffix, "zmin", localBb.minZ, "zmax", localBb.maxZ, "nverts", leaf.vertices.length);
      }

      const extentX = localBb.maxX - localBb.minX;
      const extentY = localBb.maxY - localBb.minY;
      const extentZ = localBb.maxZ - localBb.minZ;
      const sorted = [extentX, extentY, extentZ].sort((a, b) => a - b);
      const thickness = sorted[0];
      const panelW    = sorted[1];
      const panelH    = sorted[2];

      // World position: apply cabinet INSERT transform to the local bbox centre
      const localCenter: Pt3 = {
        x: (localBb.minX + localBb.maxX) / 2,
        y: (localBb.minY + localBb.maxY) / 2,
        z: (localBb.minZ + localBb.maxZ) / 2,
      };
      const center = applyT(localCenter, t);

      const displayName = partName + leaf.suffix;

      panels.push({
        partName: displayName,
        width_mm: r1(panelW),
        height_mm: r1(panelH),
        thickness_mm: r1(thickness),
        pos: { x: r1(center.x), y: r1(center.y), z: r1(center.z) },
        holeCount: leaf.holes.length,
        holes: leaf.holes,
        materialRef: guessMaterial(cleanName, thickness),
        qty: 1,
        part_role: inferRole(cleanName),
      });
    }
  }

  // Derive overall cabinet dims from carcass PANEL SIZES (not from scattered
  // DXF positions — this DXF is a flat nesting layout, not an assembly).
  const { W, H, D } = deriveOverallDims(panels);

  if (process.env.NODE_ENV === "development") {
    console.log("[overall derived]", { W, H, D });
    console.table(
      panels.map((p) => ({
        name: p.partName,
        W: p.width_mm,
        H: p.height_mm,
        T: p.thickness_mm,
        role: p.part_role,
        holes: p.holeCount,
      })),
    );
  }

  return {
    cabinet: {
      name: cabinetBlockName,
      width_mm: W,
      height_mm: H,
      depth_mm: D,
      panels,
    },
    warnings,
  };
}
