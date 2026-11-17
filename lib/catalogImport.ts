import type { SupabaseClient } from "@supabase/supabase-js";
import { inferRole } from "@/lib/cabinet3d";
import { descriptionFromName } from "@/lib/productCode";
import { type V3Node, type V3Part, cutListDims, rootDims } from "@/lib/sketchup/parseV3";
import {
  type ComponentBomRow, type ComponentRef, type PricedSplit,
  componentMap, mergeOldComponentLines, splitForPricing,
} from "@/lib/fittings";

/** A board-panel bom_lines row as sent to replace_bom_lines (product_id / size_id are set by the RPC). */
export type PanelBomRow = {
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

/** Any bom_lines row sent to replace_bom_lines: a board panel or a component (fitting). */
export type BomRowInsert = PanelBomRow | ComponentBomRow;

/** An existing base line: the choices made on it that an update must keep.
 *  line_type / component_id / qty are absent only in old test data (= a panel line). */
export type OldLine = {
  line_type?: string;
  part_name: string | null;
  panel_id: string | null;
  banding_type_id: string | null;
  banded_length_m: number | null;
  component_id?: string | null;
  qty?: number | null;
};

export type ImportMeta = {
  source_filename: string;
  export_version: string | null;
};

export function panelToBomRow(part: V3Part, sortOrder: number): PanelBomRow {
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

export function panelsToBomRows(panels: V3Part[]): PanelBomRow[] {
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
 *  PANEL row whose part_name equals an old base PANEL line's part_name (first
 *  match), copy panel_id, banding_type_id and banded_length_m from the old line.
 *  Component rows pass through untouched. */
export function carryMaterialMapping<R extends BomRowInsert>(rows: R[], oldBaseLines: OldLine[]): R[] {
  const oldPanels = oldBaseLines.filter((o) => (o.line_type ?? "panel") === "panel");
  return rows.map((row) => {
    if (row.line_type !== "panel") return row;
    const old = oldPanels.find((o) => o.part_name === row.part_name);
    if (!old) return row;
    return {
      ...row,
      panel_id: old.panel_id,
      banding_type_id: old.banding_type_id,
      banded_length_m: old.banded_length_m ?? 0,
    };
  });
}

/**
 * Everything one imported cabinet saves as its parts list:
 * board panels first, then one component line per fitting / accessory.
 *  - `parts`: every leaf of the cabinet (panels + fittings from cabinetToParts);
 *  - `components`: catalogue components by code (see componentMap in lib/fittings.ts);
 *  - `oldBaseLines`: the model's current base lines when it is already in the
 *    catalogue (keeps board choices, hand-made links and hand-added hardware).
 */
export function importBomRows(
  parts: V3Part[],
  components: Map<string, ComponentRef>,
  oldBaseLines: OldLine[] = [],
): { rows: BomRowInsert[]; panelCount: number; unlinked: PricedSplit["unlinked"] } {
  const split = splitForPricing(parts, components);
  const panelRows = carryMaterialMapping(panelsToBomRows(split.panels), oldBaseLines);
  const oldComponentLines = oldBaseLines.map((o) => ({
    line_type: o.line_type ?? "panel",
    part_name: o.part_name,
    component_id: o.component_id ?? null,
    qty: o.qty ?? null,
  }));
  const componentRows = mergeOldComponentLines(split.componentRows, oldComponentLines)
    .map((r, i) => ({ ...r, sort_order: panelRows.length + i }));
  return {
    rows: [...panelRows, ...componentRows],
    panelCount: panelRows.length,
    unlinked: split.unlinked,
  };
}

async function loadOldBaseLines(supabase: SupabaseClient, productId: string): Promise<OldLine[]> {
  const { data, error } = await supabase
    .from("bom_lines")
    .select("line_type, part_name, panel_id, banding_type_id, banded_length_m, component_id, qty")
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
  parts: V3Part[],
  components: Map<string, ComponentRef>,
  meta: ImportMeta,
): Promise<string | null> {
  try {
    const oldLines = await loadOldBaseLines(supabase, productId);
    const { rows } = importBomRows(parts, components, oldLines);
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
  parts: V3Part[],
  components: Map<string, ComponentRef>,
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
    const { rows } = importBomRows(parts, components, oldLines);
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

/** Catalogue components that have a code, for linking drawn fittings.
 *  Boards (items with a sheet size) are left out: a board is never a fitting. */
export async function loadComponentRefs(
  supabase: SupabaseClient,
): Promise<Map<string, ComponentRef>> {
  const { data, error } = await supabase
    .from("products")
    .select("id, code, unit")
    .eq("item_kind", "component")
    .eq("is_active", true)
    .not("code", "is", null)
    .is("sheet_length_mm", null);
  if (error) throw new Error(error.message);
  return componentMap((data ?? []) as ComponentRef[]);
}
