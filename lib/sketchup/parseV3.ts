// SketchUp v3/v4 JSON schema types and helpers.
// v3/v4 export nested component trees; leaves (is_leaf:true) are the actual panels/fittings.
// v4 adds per-leaf `cuts[]` and optional `cut_warning`; top-level `total_parts` and `version`.

import type { Cut, ToolingItem } from "./types";
export type { Cut, ToolingItem };

// ── Schema validation ────────────────────────────────────────────────────────

// Accept any alloy.sketchup.vN[.M] with major version ≥ 3.
// Regex-based so minor schema bumps (v6.4, v7, …) never block import.
const SCHEMA_PATTERN = /^alloy\.sketchup\.v([3-9]|\d{2,})(\.\d+)*$/;

export type SupportedSchema = string;

/** Returns true for any alloy.sketchup.vN[.M] schema with major version ≥ 3. */
export function isSupportedSchema(s: unknown): s is SupportedSchema {
  return typeof s === "string" && SCHEMA_PATTERN.test(s);
}

// ── JSON tree types ───────────────────────────────────────────────────────────

export type V3Node = {
  name: string;
  size_mm: { x: number; y: number; z: number };
  sorted_mm: [number, number, number];
  pos_mm: { x: number; y: number; z: number };
  is_leaf: boolean;
  item_type: string;
  panel_count?: number;
  fitting_count?: number;
  children?: V3Node[];
  // v4 fields (leaves only)
  cuts?: Cut[];
  cut_warning?: string;
  // v5 fields (all nodes)
  axes?: { x: number[]; y: number[]; z: number[] };
  // v5.1 fields (leaves only)
  outline_mm?: {
    u_axis: "width" | "height" | "depth";
    v_axis: "width" | "height" | "depth";
    thickness_mm: number;
    loop: [number, number][];
  };
  // v5.3 fields (channel leaves only)
  profile_mm?: {
    p_axis:   "width" | "height" | "depth";
    q_axis:   "width" | "height" | "depth";
    run_axis: "width" | "height" | "depth";
    run_mm:   number;
    loop:     [number, number][];
  };
  // v6 fields (non-channel fitting leaves only)
  mesh_ref?: string;
  // v6.3 fields (panel leaves only)
  tooling?: ToolingItem[];
};

export type V3Json = {
  schema: SupportedSchema;
  version?: string;        // e.g. "0.4.1" (present from v0.4+)
  model: string;
  units: string;
  root_count: number;
  total_parts?: number;    // present from v0.4.1+; null/absent in older exports
  summary: Record<string, number>;
  roots: V3Node[];
  // v6: deduped fitting meshes keyed by component definition name
  meshes?: Record<string, { vertices: [number, number, number][]; triangles: [number, number, number][] }>;
};

// ── Part type (output of cabinetToParts) ─────────────────────────────────────

export type V3Part = {
  name: string;
  // raw per-axis extents in SU world coords (NOT sorted)
  size: { x: number; y: number; z: number };
  pos: { x: number; y: number; z: number };
  // ascending [thickness, width, height] for cut-list
  sorted: [number, number, number];
  isFitting: boolean;
  // v4: defined (even if empty []) when the export carried cut data.
  // undefined means the source file was v3 (no cut data at all).
  cuts?: Cut[];
  cutWarning?: string;
  // v5: local axis unit-vectors in SU world space
  axes?: { x: number[]; y: number[]; z: number[] };
  // v5.1: true 2D silhouette for L-shapes etc.
  outline_mm?: {
    u_axis: "width" | "height" | "depth";
    v_axis: "width" | "height" | "depth";
    thickness_mm: number;
    loop: [number, number][];
  };
  // v5.3: channel cross-section profile
  profile_mm?: {
    p_axis:   "width" | "height" | "depth";
    q_axis:   "width" | "height" | "depth";
    run_axis: "width" | "height" | "depth";
    run_mm:   number;
    loop:     [number, number][];
  };
  // v6: reference into the top-level meshes dict
  mesh_ref?: string;
  // v6.3: inner tooling features (bores + blind pockets) per panel leaf
  tooling?: ToolingItem[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const FITTING_KEYWORDS = [
  "p2o", "leg_", "atira", "hafele", "basket",
  "l_channel", "u_channel", "channel", "blum", "hinge", "slide",
];

export function isFittingByName(name: string): boolean {
  const n = name.toLowerCase();
  return FITTING_KEYWORDS.some((kw) => n.includes(kw));
}

/** Recursively collect all leaf nodes under a given node. */
export function collectLeaves(node: V3Node): V3Node[] {
  if (node.is_leaf) return [node];
  const out: V3Node[] = [];
  for (const child of node.children ?? []) {
    out.push(...collectLeaves(child));
  }
  return out;
}

/** Split all leaves of a root into panels and fittings. */
export function cabinetToParts(root: V3Node): { panels: V3Part[]; fittings: V3Part[] } {
  const leaves = collectLeaves(root);
  const panels: V3Part[] = [];
  const fittings: V3Part[] = [];
  for (const leaf of leaves) {
    const part: V3Part = {
      name: leaf.name,
      size: leaf.size_mm,
      pos: leaf.pos_mm,
      sorted: leaf.sorted_mm,
      isFitting: isFittingByName(leaf.name),
      // carry v4 cut data; leave undefined when absent (v3 source)
      cuts: leaf.cuts,
      cutWarning: leaf.cut_warning,
      // carry v5 orientation; leave undefined when absent (v3/v4 source)
      axes: leaf.axes,
      // carry v5.1 outline; leave undefined when absent
      outline_mm: leaf.outline_mm,
      // carry v5.3 channel profile; leave undefined when absent
      profile_mm: leaf.profile_mm,
      // carry v6 mesh reference; leave undefined when absent
      mesh_ref: leaf.mesh_ref,
      // carry v6.3 tooling; leave undefined when absent
      tooling: leaf.tooling,
    };
    if (part.isFitting) fittings.push(part);
    else panels.push(part);
  }
  return { panels, fittings };
}

/** Cut-list dims from sorted_mm: thickness=sorted[0], width=sorted[1], height=sorted[2]. */
export function cutListDims(part: V3Part): { thickness: number; width: number; height: number } {
  return { thickness: part.sorted[0], width: part.sorted[1], height: part.sorted[2] };
}

/**
 * Map a root's size_mm to app cabinet dims using the SU Z-up convention:
 *   app width  = SU X (size_mm.x)
 *   app height = SU Z (size_mm.z)  ← vertical axis in SketchUp
 *   app depth  = SU Y (size_mm.y)
 */
export function rootDims(root: V3Node): { width_mm: number; height_mm: number; depth_mm: number } {
  return {
    width_mm:  root.size_mm.x,
    height_mm: root.size_mm.z,
    depth_mm:  root.size_mm.y,
  };
}
