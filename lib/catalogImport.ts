import type { SupabaseClient } from "@supabase/supabase-js";
import { inferRole } from "@/lib/cabinet3d";
import { descriptionFromName } from "@/lib/productCode";
import { type V3Node, type V3Part, cutListDims, rootDims } from "@/lib/sketchup/parseV3";

/** A bom_lines row as sent to replace_bom_lines (product_id / size_id are set by the RPC). */
export type BomRowInsert = {
  line_type: "panel";
  panel_id: string | null;
  part_name: string;
  width_mm: number;
  height_mm: number;
  banding_type_id: string | null;
  banded_length_m: number;
  component_id: null;
  qty: number;
  sort_order: number;
  part_role: string;
  depth_mm: number;
  pos_offset_mm: null;
  pos_x_mm: number;
  pos_y_mm: number;
  pos_z_mm: number;
  hole_count: number;
  cuts_json: unknown;
  cut_warning: string | null;
};

/** The material choices of an existing base line that an update must keep. */
export type OldLine = {
  part_name: string | null;
  panel_id: string | null;
  banding_type_id: string | null;
  banded_length_m: number | null;
};

export type ImportMeta = {
  source_filename: string;
  export_version: string | null;
};

export function panelToBomRow(part: V3Part, sortOrder: number): BomRowInsert {
  const { thickness, width, height } = cutListDims(part);
  return {
    line_type: "panel",
    panel_id: null,
    part_name: part.name,
    width_mm: width,
    height_mm: height,
    banding_type_id: null,
    banded_length_m: 0,
    component_id: null,
    qty: 1,
    sort_order: sortOrder,
    part_role: inferRole(part.name),
    depth_mm: thickness,
    pos_offset_mm: null,
    pos_x_mm: part.pos.x,
    pos_y_mm: part.pos.y,
    pos_z_mm: part.pos.z,
    hole_count: 0,
    // v4: persist cut data; null when source was v3 (no cut data at all)
    cuts_json: part.cuts !== undefined ? part.cuts : null,
    cut_warning: part.cutWarning ?? null,
  };
}

export function panelsToBomRows(panels: V3Part[]): BomRowInsert[] {
  return panels.map((part, i) => panelToBomRow(part, i));
}

/** Whole-millimetre size of a root, as stored in product_sizes. */
export function roundedDims(root: V3Node): { width_mm: number; height_mm: number; depth_mm: number } {
  const d = rootDims(root);
  return {
    width_mm: Math.round(d.width_mm),
    height_mm: Math.round(d.height_mm),
    depth_mm: Math.round(d.depth_mm),
  };
}

/** Keep the material choices already made on the catalogue entry: for each new
 *  row whose part_name equals an old base line's part_name (first match),
 *  copy panel_id, banding_type_id and banded_length_m from the old line. */
export function carryMaterialMapping(rows: BomRowInsert[], oldBaseLines: OldLine[]): BomRowInsert[] {
  return rows.map((row) => {
    const old = oldBaseLines.find((o) => o.part_name === row.part_name);
    if (!old) return row;
    return {
      ...row,
      panel_id: old.panel_id,
      banding_type_id: old.banding_type_id,
      banded_length_m: old.banded_length_m ?? 0,
    };
  });
}

async function loadOldBaseLines(supabase: SupabaseClient, productId: string): Promise<OldLine[]> {
  const { data, error } = await supabase
    .from("bom_lines")
    .select("part_name, panel_id, banding_type_id, banded_length_m")
    .eq("product_id", productId)
    .is("size_id", null)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as OldLine[];
}

/** 1. Update catalogue entry: the model's reference geometry is replaced.
 *  Returns an error message, or null on success. */
export async function updateCatalogueEntry(
  supabase: SupabaseClient,
  productId: string,
  root: V3Node,
  panels: V3Part[],
  meta: ImportMeta,
): Promise<string | null> {
  try {
    const oldLines = await loadOldBaseLines(supabase, productId);
    const rows = carryMaterialMapping(panelsToBomRows(panels), oldLines);
    const dims = rootDims(root);

    const { error: e1 } = await supabase
      .from("products")
      .update({
        width_mm: dims.width_mm,
        height_mm: dims.height_mm,
        depth_mm: dims.depth_mm,
        source_filename: meta.source_filename,
        export_version: meta.export_version,
      })
      .eq("id", productId);
    if (e1) return e1.message;

    const { error: e2 } = await supabase.rpc("replace_bom_lines", {
      p_product_id: productId,
      p_lines: rows,
    });
    return e2 ? e2.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 2. Add as standard size. An existing size with the same W×H×D is reused
 *  (its price is not changed) and only its parts are replaced.
 *  Returns an error message, or null on success. */
export async function addStandardSize(
  supabase: SupabaseClient,
  productId: string,
  root: V3Node,
  panels: V3Part[],
  meta: ImportMeta,
): Promise<string | null> {
  try {
    const dims = roundedDims(root);
    const label = descriptionFromName(root.name);

    let sizeId: string;
    const { data: existing, error: e0 } = await supabase
      .from("product_sizes")
      .select("id")
      .eq("product_id", productId)
      .eq("width_mm", dims.width_mm)
      .eq("height_mm", dims.height_mm)
      .eq("depth_mm", dims.depth_mm)
      .maybeSingle();
    if (e0) return e0.message;

    if (existing) {
      sizeId = existing.id as string;
    } else {
      const { data: created, error: e1 } = await supabase
        .from("product_sizes")
        .insert({
          product_id: productId,
          label,
          ...dims,
          price_jod: 0,
          price_overridden: false,
          source_filename: meta.source_filename,
        })
        .select("id")
        .single();
      if (e1 || !created) return e1?.message ?? "Insert failed";
      sizeId = created.id as string;
    }

    const oldLines = await loadOldBaseLines(supabase, productId);
    const rows = carryMaterialMapping(panelsToBomRows(panels), oldLines);
    const { error: e2 } = await supabase.rpc("replace_bom_lines", {
      p_product_id: productId,
      p_lines: rows,
      p_size_id: sizeId,
    });
    return e2 ? e2.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
