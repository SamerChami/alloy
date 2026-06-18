// SketchUp v3 JSON schema types and helpers.
// v3 exports nested component trees; leaves (is_leaf:true) are the actual panels/fittings.

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
};

export type V3Json = {
  schema: "alloy.sketchup.v3";
  model: string;
  units: string;
  root_count: number;
  summary: Record<string, number>;
  roots: V3Node[];
};

export type V3Part = {
  name: string;
  // raw per-axis extents in SU world coords (NOT sorted)
  size: { x: number; y: number; z: number };
  pos: { x: number; y: number; z: number };
  // ascending [thickness, width, height] for cut-list
  sorted: [number, number, number];
  isFitting: boolean;
};

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
