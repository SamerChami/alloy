import { type ComponentRef, splitForPricing } from "@/lib/fittings";
import { panelsToBomRows, roundedDims } from "@/lib/catalogImport";
import { codeFromName, descriptionFromName, itemNumberFromName } from "@/lib/productCode";
import { type V3Json, type V3Node, cabinetToParts } from "@/lib/sketchup/parseV3";

/**
 * SketchUp project import into a draft quotation (Stage 20c).
 *
 * The app sends only what was DRAWN. It never sends a price, a board, a
 * banding type or a component link: the database looks those up
 * (quote_import_preview / quotation_import_items, migration
 * 20261119190000_quotation_import.sql) and decides how each item is priced:
 *   standard = the code is a catalogue model at one of its standard sizes
 *   parts    = a catalogue model at any other size, priced from its own parts
 *   unknown  = not in the catalogue: imported at 0.000 with a warning
 */

/** One drawn board panel, as the database functions read it. */
export type QuoteImportPanel = {
  line_type: "panel";
  part_name: string;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  qty: number;
  part_role: string;
  pos_x_mm: number;
  pos_y_mm: number;
  pos_z_mm: number;
  cuts_json: unknown;
  cut_warning: string | null;
};

/** One kind of drawn fitting. part_name is the fitting's CODE alone (the
 *  database links it to a component by that code); qty is pieces, or metres
 *  for a component sold by the metre. */
export type QuoteImportComponent = {
  line_type: "component";
  part_name: string;
  qty: number;
};

export type QuoteImportItem = {
  item_no: string | null;
  code: string | null;
  description: string | null;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  lines: Array<QuoteImportPanel | QuoteImportComponent>;
};

/** A row returned by the RPC quote_import_preview. */
export type QuotePreviewRow = {
  idx: number;
  item_no: string | null;
  code: string | null;
  description: string | null;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  status: "standard" | "parts" | "unknown";
  product_id: string | null;
  size_id: string | null;
  name_en: string | null;
  name_ar: string | null;
  list_price_jod: number | null;
  unit_cost_jod: number | null;
  warning: string | null;
  panel_count: number;
  component_count: number;
};

/** The database refuses a quantity that is not above zero; a channel shorter
 *  than 5 mm would round to 0.00 m. */
const MIN_QTY = 0.01;

/** One top-level drawn item -> what the database needs to price it. */
export function rootToQuoteItem(
  root: V3Node,
  components: Map<string, ComponentRef>,
): QuoteImportItem {
  const { panels, fittings } = cabinetToParts(root);
  const split = splitForPricing([...panels, ...fittings], components);

  const panelLines: QuoteImportPanel[] = panelsToBomRows(split.panels).map((r) => ({
    line_type: "panel",
    part_name: r.part_name,
    width_mm: r.width_mm,
    height_mm: r.height_mm,
    depth_mm: r.depth_mm,
    qty: r.qty,
    part_role: r.part_role,
    pos_x_mm: r.pos_x_mm,
    pos_y_mm: r.pos_y_mm,
    pos_z_mm: r.pos_z_mm,
    cuts_json: r.cuts_json,
    cut_warning: r.cut_warning,
  }));
  const componentLines: QuoteImportComponent[] = split.componentRows.map((r) => ({
    line_type: "component",
    part_name: r.part_name ?? "?",
    qty: Math.max(r.qty, MIN_QTY),
  }));

  return {
    item_no: itemNumberFromName(root.name),
    code: codeFromName(root.name),
    description: descriptionFromName(root.name),
    ...roundedDims(root),
    lines: [...panelLines, ...componentLines],
  };
}

/** Every top-level item of a project export except the room box, in file order. */
export function projectToQuoteItems(
  json: Pick<V3Json, "roots">,
  components: Map<string, ComponentRef>,
): QuoteImportItem[] {
  return json.roots
    .filter((r) => r.item_type !== "RoomBox")
    .map((r) => rootToQuoteItem(r, components));
}

/** Section name offered for an import: the SketchUp model's name, else the
 *  file name without its extension. */
export function defaultSection(model: string | null | undefined, filename: string): string {
  const m = (model ?? "").trim();
  if (m !== "" && m.toLowerCase() !== "untitled") return m;
  return filename.replace(/\.[^.]+$/, "").trim();
}

export type PreviewSummary = {
  items: number;
  standard: number;
  parts: number;
  unknown: number;
  /** Items whose price needs a look (any warning, unknown ones included). */
  warnings: number;
  /** Sum of the prices the import would write (unknown items count as 0). */
  total_jod: number;
};

export function previewSummary(rows: QuotePreviewRow[]): PreviewSummary {
  const out: PreviewSummary = { items: rows.length, standard: 0, parts: 0, unknown: 0, warnings: 0, total_jod: 0 };
  let fils = 0;
  for (const r of rows) {
    out[r.status] += 1;
    if (r.warning != null && r.warning !== "") out.warnings += 1;
    fils += Math.round(Number(r.list_price_jod ?? 0) * 1000);
  }
  out.total_jod = fils / 1000;
  return out;
}
