import type { SupabaseClient } from "@supabase/supabase-js";
import { inferRole, type SkuPanel3D } from "@/lib/cabinet3d";
import type { V3Json, V3Node, V3Part } from "@/lib/sketchup/parseV3";

/**
 * Saved 3D geometry of a catalogue model (Stage 19a).
 *
 * The import preview draws from the export file. To make a saved product draw
 * the SAME picture, the same drawing data is stored with it (tables
 * product_geometry + geometry_meshes) and BOTH previews go through
 * leavesToSkuPanels below. Never build SkuPanel3D anywhere else.
 *
 * Geometry is the model as imported. Editing the parts list by hand does not
 * change it; re-importing does.
 */

/** One drawn part (panel or fitting) as stored in product_geometry.leaves. */
export type GeometryLeaf = {
  name: string;
  /** Per-axis extents in SketchUp world axes (NOT sorted). */
  size_mm: { x: number; y: number; z: number };
  /** Centre in SketchUp world space (Z up), as exported. */
  pos_mm: { x: number; y: number; z: number };
  axes?: V3Node["axes"];
  outline_mm?: V3Node["outline_mm"];
  profile_mm?: V3Node["profile_mm"];
  mesh_ref?: string;
  cuts?: V3Node["cuts"];
  tooling?: V3Node["tooling"];
};

export type MeshDict = NonNullable<V3Json["meshes"]>;

export type StoredGeometry = { skuPanels: SkuPanel3D[]; meshes: MeshDict };

/** What gets stored for a cabinet: every leaf, panels and fittings alike. */
export function partsToLeaves(parts: V3Part[]): GeometryLeaf[] {
  return parts.map((part) => {
    const leaf: GeometryLeaf = { name: part.name, size_mm: part.size, pos_mm: part.pos };
    if (part.axes !== undefined) leaf.axes = part.axes;
    if (part.outline_mm !== undefined) leaf.outline_mm = part.outline_mm;
    if (part.profile_mm !== undefined) leaf.profile_mm = part.profile_mm;
    if (part.mesh_ref !== undefined) leaf.mesh_ref = part.mesh_ref;
    if (part.cuts !== undefined) leaf.cuts = part.cuts;
    if (part.tooling !== undefined) leaf.tooling = part.tooling;
    return leaf;
  });
}

/** The ONE mapping from stored / exported leaves to what Cabinet3D draws. */
export function leavesToSkuPanels(leaves: GeometryLeaf[]): SkuPanel3D[] {
  return leaves.map((leaf) => ({
    part_role: inferRole(leaf.name),
    part_name: leaf.name,
    su_width_mm: leaf.size_mm.x,
    su_height_mm: leaf.size_mm.y,
    su_depth_mm: leaf.size_mm.z,
    pos: leaf.pos_mm,
    cuts: leaf.cuts,
    axes: leaf.axes,
    outline_mm: leaf.outline_mm,
    profile_mm: leaf.profile_mm,
    mesh_ref: leaf.mesh_ref,
    tooling_mm: leaf.tooling,
  }));
}

/** Import preview: parts straight from the export file. */
export function partsToSkuPanels(parts: V3Part[]): SkuPanel3D[] {
  return leavesToSkuPanels(partsToLeaves(parts));
}

/** Only the meshes these leaves refer to (a project file holds the meshes of
 *  every cabinet in it; one cabinet must not upload them all). */
export function meshesForLeaves(leaves: GeometryLeaf[], meshes: MeshDict | undefined): MeshDict {
  const out: MeshDict = {};
  if (!meshes) return out;
  for (const leaf of leaves) {
    const ref = leaf.mesh_ref;
    if (ref && meshes[ref] && !out[ref]) out[ref] = meshes[ref];
  }
  return out;
}

/**
 * A name for a mesh that depends on nothing but its exact stored data.
 *
 * The export's own mesh_ref is NOT used as the database key: up to extension
 * v0.6.12 its hash ignores which way each triangle faces, so a part and a copy
 * of it with reversed faces share a ref although their triangles differ
 * (19a review). Stored meshes are shared by every model and never replaced, so
 * the key must identify the data exactly. Same vertices and triangles, in the
 * same order -> same key; anything else -> a different key.
 */
export async function meshContentRef(mesh: MeshDict[string]): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This browser cannot fingerprint 3D meshes (no Web Crypto).");
  const bytes = new TextEncoder().encode(JSON.stringify([mesh.vertices, mesh.triangles]));
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  let hex = "";
  for (let i = 0; i < 16; i++) hex += digest[i].toString(16).padStart(2, "0");
  return `mesh_${hex}`;
}

/**
 * Re-key a cabinet's meshes by their content and point its leaves at the new
 * keys. Only meshes a leaf refers to are kept. A leaf whose mesh is missing
 * from the dict keeps its ref, so the database refuses the save instead of
 * storing a part with no mesh.
 */
export async function contentAddress(
  leaves: GeometryLeaf[],
  meshes: MeshDict | undefined,
): Promise<{ leaves: GeometryLeaf[]; meshes: MeshDict }> {
  const used = meshesForLeaves(leaves, meshes);
  const newRef = new Map<string, string>();
  const out: MeshDict = {};
  for (const [ref, mesh] of Object.entries(used)) {
    const key = await meshContentRef(mesh);
    newRef.set(ref, key);
    out[key] = mesh;
  }
  return {
    leaves: leaves.map((leaf) =>
      leaf.mesh_ref && newRef.has(leaf.mesh_ref)
        ? { ...leaf, mesh_ref: newRef.get(leaf.mesh_ref) }
        : leaf,
    ),
    meshes: out,
  };
}

export type GeometryMeta = {
  source_filename: string;
  export_version: string | null;
  export_schema?: string | null;
};

/** Store a cabinet's geometry (sizeId null = the model itself).
 *  Returns an error message, or null on success. */
export async function saveProductGeometry(
  supabase: SupabaseClient,
  productId: string,
  sizeId: string | null,
  parts: V3Part[],
  meshes: MeshDict | undefined,
  meta: GeometryMeta,
): Promise<string | null> {
  try {
    const keyed = await contentAddress(partsToLeaves(parts), meshes);
    const { error } = await supabase.rpc("save_product_geometry", {
      p_product_id: productId,
      p_size_id: sizeId,
      p_leaves: keyed.leaves,
      p_meshes: keyed.meshes,
      p_meta: {
        source_filename: meta.source_filename,
        export_version: meta.export_version,
        export_schema: meta.export_schema ?? null,
      },
    });
    return error ? error.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Load a saved cabinet's geometry, ready for Cabinet3D.
 *  Null when nothing is stored (never imported since Stage 19a, or made by hand). */
export async function loadProductGeometry(
  supabase: SupabaseClient,
  productId: string,
  sizeId: string | null = null,
): Promise<StoredGeometry | null> {
  const { data, error } = await supabase.rpc("get_product_geometry", {
    p_product_id: productId,
    p_size_id: sizeId,
  });
  if (error || !data) return null;
  const stored = data as { leaves?: GeometryLeaf[]; meshes?: MeshDict };
  if (!Array.isArray(stored.leaves) || stored.leaves.length === 0) return null;
  return { skuPanels: leavesToSkuPanels(stored.leaves), meshes: stored.meshes ?? {} };
}
