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
  // The inner translation, after outer scale + rotate + translate:
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

// ── geometry collection ───────────────────────────────────────────────

type CollectResult = { vertices: Pt3[]; holes: HoleInfo[] };

// Strict 2-level traversal for a panel block:
//   Level 0 (panel block)  → collect CIRCLEs (drill holes) only
//   Level 1 (face sub-blocks reached via INSERTs) → collect 3DFACEs only
//
// Polyboard exports panel geometry as world-coordinate 3DFACEs inside
// face sub-blocks, but the panel block itself may also carry local-
// coordinate 3DFACEs as metadata.  Mixing both causes extents that are
// ~2× the real size.  The fix: ignore any 3DFACEs at the panel-block
// level and collect geometry only from exactly one INSERT level down.
function collectPanel(
  blocks: Record<string, IBlock>,
  panelBlockName: string,
  t: Transform,
  warnings: string[],
): CollectResult {
  const out: CollectResult = { vertices: [], holes: [] };
  const panelBlock = blocks[panelBlockName];
  if (!panelBlock) {
    warnings.push(`Panel block '${panelBlockName}' not found`);
    return out;
  }

  // Level 0: CIRCLEs only (drill-hole positions in world space)
  for (const ent of panelBlock.entities ?? []) {
    const e = ent as IEntity;
    if (e.type === "CIRCLE") {
      const circle = e as ICircleEntity;
      const center = applyT(circle.center, t);
      out.holes.push({ ...center, dia: (circle.radius ?? 0) * 2 });
    }
  }

  // Level 1: follow each INSERT one layer, collect 3DFACEs (world coords)
  let foundFaces = false;
  for (const ent of panelBlock.entities ?? []) {
    const e = ent as IEntity;
    if (e.type !== "INSERT") continue;
    const ins = e as IInsertEntity;
    const faceBlock = blocks[ins.name];
    if (!faceBlock) continue;
    const childT = composeT(t, insertTransform(ins));
    for (const fe of faceBlock.entities ?? []) {
      const faceEnt = fe as IEntity;
      if (faceEnt.type === "3DFACE") {
        const face = faceEnt as I3DfaceEntity;
        for (const v of face.vertices ?? []) {
          out.vertices.push(applyT(v, childT));
        }
        foundFaces = true;
      } else if (faceEnt.type === "CIRCLE") {
        const circle = faceEnt as ICircleEntity;
        const center = applyT(circle.center, childT);
        out.holes.push({ ...center, dia: (circle.radius ?? 0) * 2 });
      }
    }
  }

  // Fallback: if no face sub-blocks found, use 3DFACEs directly in panel block
  if (!foundFaces) {
    for (const ent of panelBlock.entities ?? []) {
      const e = ent as IEntity;
      if (e.type === "3DFACE") {
        const face = e as I3DfaceEntity;
        for (const v of face.vertices ?? []) {
          out.vertices.push(applyT(v, t));
        }
      }
    }
  }

  return out;
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
  const allVertices: Pt3[] = [];
  const panels: ImportedPanel[] = [];

  for (const ent of cabinetBlock.entities ?? []) {
    if ((ent as IEntity).type !== "INSERT") continue;
    const ins = ent as IInsertEntity;
    const panelBlockName = ins.name;

    if (!blocks[panelBlockName]) {
      warnings.push(`Panel block '${panelBlockName}' not found — skipped.`);
      continue;
    }

    const t = composeT(IDENTITY, insertTransform(ins));
    const collected = collectPanel(blocks, panelBlockName, t, warnings);

    if (collected.vertices.length === 0) {
      warnings.push(`No 3D faces in '${panelBlockName}' — skipped.`);
      continue;
    }

    allVertices.push(...collected.vertices);

    const bb = bbox(collected.vertices)!;
    const extentX = bb.maxX - bb.minX;
    const extentY = bb.maxY - bb.minY;
    const extentZ = bb.maxZ - bb.minZ;
    const sorted = [extentX, extentY, extentZ].sort((a, b) => a - b);
    const thickness = sorted[0];
    // Use the two larger extents as W and H (larger = H)
    const panelW = sorted[1];
    const panelH = sorted[2];

    const center: Pt3 = {
      x: (bb.minX + bb.maxX) / 2,
      y: (bb.minY + bb.maxY) / 2,
      z: (bb.minZ + bb.maxZ) / 2,
    };

    // Extract part name (strip cabinet prefix "CabinetName.")
    const dotIdx = panelBlockName.indexOf(".");
    const partName = dotIdx >= 0 ? panelBlockName.slice(dotIdx + 1) : panelBlockName;
    // Strip trailing face-block suffix like "1" or " (1)" — Polyboard face blocks have these
    const cleanName = partName.replace(/\s*\(\d+\)$/, "").replace(/\d+$/, "").trim();
    const displayName = partName; // keep numbering for display

    panels.push({
      partName: displayName,
      width_mm: r1(panelW),
      height_mm: r1(panelH),
      thickness_mm: r1(thickness),
      pos: { x: r1(center.x), y: r1(center.y), z: r1(center.z) },
      holeCount: collected.holes.length,
      holes: collected.holes,
      materialRef: guessMaterial(cleanName, thickness),
      qty: 1,
      part_role: inferRole(cleanName),
    });
  }

  // Overall cabinet bounding box from all geometry
  const cb = bbox(allVertices);
  const cabinetW = cb ? r1(cb.maxX - cb.minX) : 0;
  const cabinetH = cb ? r1(cb.maxY - cb.minY) : 0;
  const cabinetD = cb ? r1(cb.maxZ - cb.minZ) : 0;

  // Sort dims so largest = height
  const [dSmall, dMid, dLarge] = [cabinetW, cabinetH, cabinetD].sort((a, b) => a - b);

  if (process.env.NODE_ENV === "development") {
    console.log(
      `[polyboardImport] ${cabinetBlockName}: W=${dMid} H=${dLarge} D=${dSmall} (${panels.length} panels)`,
    );
  }

  return {
    cabinet: {
      name: cabinetBlockName,
      width_mm: dMid,
      height_mm: dLarge,
      depth_mm: dSmall,
      panels,
    },
    warnings,
  };
}
