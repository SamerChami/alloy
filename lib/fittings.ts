import { codeFromName, codeKey } from "@/lib/productCode";
import type { V3Part } from "@/lib/sketchup/parseV3";

/**
 * Pricing of fittings on SketchUp import (Stage 18e).
 *
 * Decisions (Samer, 17 Nov 2026):
 * - A drawn part is linked to a catalogue component BY CODE: the code part of
 *   its SketchUp name (same naming rule as cabinets, see lib/productCode.ts)
 *   equals the component's Code, compared case-insensitively.
 * - Channels are priced PER METRE from their length in the model. In general:
 *   a component whose unit is "m" is counted in metres, anything else in pieces.
 * - Only legs, channels and some accessories are drawn. Hinges, cams, screws
 *   etc. are not drawn; they are added by hand (later: Polyboard import).
 */

/** A catalogue component that has a code (boards are not passed in). */
export type ComponentRef = { id: string; code: string; unit: string };

/** A bom_lines row of line_type "component", as sent to replace_bom_lines. */
export type ComponentBomRow = {
  line_type: "component";
  panel_id: null;
  /** The code as written in SketchUp; null for a line added by hand in the app. */
  part_name: string | null;
  width_mm: null;
  height_mm: null;
  banding_type_id: null;
  banded_length_m: number;
  component_id: string | null;
  qty: number;
  sort_order: number;
  part_role: null;
  depth_mm: null;
  pos_offset_mm: null;
  pos_x_mm: null;
  pos_y_mm: null;
  pos_z_mm: null;
  hole_count: number;
  cuts_json: null;
  cut_warning: null;
};

export type PricedSplit = {
  /** Parts that stay board panels. */
  panels: V3Part[];
  /** One row per distinct component / code, quantities added up. */
  componentRows: ComponentBomRow[];
  /** Codes of drawn fittings that matched no component (saved with no price). */
  unlinked: { code: string; qty: number; unit: "m" | "pcs" }[];
};

export function componentMap(components: ComponentRef[]): Map<string, ComponentRef> {
  const map = new Map<string, ComponentRef>();
  for (const c of components) {
    const key = codeKey(c.code);
    if (key !== "" && !map.has(key)) map.set(key, c);
  }
  return map;
}

/** Length of a part in millimetres: the channel run when the export has it,
 *  otherwise the part's longest dimension. */
export function partLengthMm(part: V3Part): number {
  return part.profile_mm?.run_mm ?? Math.max(...part.sorted);
}

function componentRow(
  partName: string | null, componentId: string | null, qty: number, sortOrder: number,
): ComponentBomRow {
  return {
    line_type: "component", panel_id: null, part_name: partName,
    width_mm: null, height_mm: null, banding_type_id: null, banded_length_m: 0,
    component_id: componentId, qty, sort_order: sortOrder, part_role: null,
    depth_mm: null, pos_offset_mm: null, pos_x_mm: null, pos_y_mm: null, pos_z_mm: null,
    hole_count: 0, cuts_json: null, cut_warning: null,
  };
}

/**
 * Decide, for every drawn part of one cabinet, how it is priced:
 *  1. its code matches a component  -> component line, linked (priced);
 *  2. else its name marks a fitting -> component line, NOT linked (price 0,
 *     reported in `unlinked` so the user can link it or add the component);
 *  3. else                          -> board panel.
 * Rule 1 also catches accessories whose names carry no fitting keyword
 * (a trash bin, a vegetable drawer): give the component that code.
 *
 * `parts` is every leaf of the cabinet (panels and fittings together, as
 * returned by cabinetToParts). Rows come back with sort_order 0; the caller
 * numbers them after the panel rows (see importBomRows in lib/catalogImport.ts).
 */
export function splitForPricing(
  parts: V3Part[],
  components: Map<string, ComponentRef>,
): PricedSplit {
  const panels: V3Part[] = [];
  type Group = { code: string; comp: ComponentRef | null; byLength: boolean; pieces: number; mm: number };
  const groups = new Map<string, Group>();

  for (const part of parts) {
    // SketchUp adds "#12" to a definition name when it is copied / made unique
    // ("Leg_100#3"). That counter is never part of the code.
    const code = (codeFromName(part.name) ?? "").replace(/#\d+$/, "").trim();
    const comp = code !== "" ? (components.get(codeKey(code)) ?? null) : null;
    if (!comp && !part.isFitting) {
      panels.push(part);
      continue;
    }
    const byLength = comp
      ? comp.unit === "m"
      : part.profile_mm != null || part.name.toLowerCase().includes("channel");
    const label = code !== "" ? code : "?";
    const key = comp ? `id:${comp.id}` : `code:${codeKey(label)}:${byLength ? "m" : "pcs"}`;
    const g = groups.get(key) ?? { code: label, comp, byLength, pieces: 0, mm: 0 };
    g.pieces += 1;
    g.mm += partLengthMm(part);
    groups.set(key, g);
  }

  const componentRows: ComponentBomRow[] = [];
  const unlinked: PricedSplit["unlinked"] = [];
  for (const g of groups.values()) {
    // bom_lines.qty is numeric(10,2): metres are kept to the centimetre.
    const qty = g.byLength ? Math.round(g.mm / 10) / 100 : g.pieces;
    componentRows.push(componentRow(g.code, g.comp?.id ?? null, qty, 0));
    if (!g.comp) unlinked.push({ code: g.code, qty, unit: g.byLength ? "m" : "pcs" });
  }
  return { panels, componentRows, unlinked };
}

/** The component lines of an existing parts list that an import must respect. */
export type OldComponentLine = {
  line_type: string;
  part_name: string | null;
  component_id: string | null;
  qty: number | null;
};

/**
 * Re-importing a cabinet must not lose work done by hand in the app:
 *  - a drawn fitting that still matches no component keeps the link chosen by
 *    hand earlier (old line with the same SketchUp code);
 *  - component lines added by hand (hinges, cams, screws: not drawn, so they
 *    have no SketchUp code) are kept as they are, after the imported ones.
 */
export function mergeOldComponentLines(
  imported: ComponentBomRow[],
  oldLines: OldComponentLine[],
): ComponentBomRow[] {
  const oldComp = oldLines.filter((o) => o.line_type === "component");
  const out = imported.map((row) => {
    if (row.component_id != null || row.part_name == null) return row;
    const key = codeKey(row.part_name);
    const old = oldComp.find(
      (o) => o.component_id != null && o.part_name != null && codeKey(o.part_name) === key,
    );
    return old ? { ...row, component_id: old.component_id } : row;
  });
  for (const o of oldComp) {
    const byHand = o.part_name == null || o.part_name.trim() === "";
    if (byHand && o.component_id != null) {
      out.push(componentRow(null, o.component_id, Number(o.qty ?? 1), 0));
    }
  }
  return out;
}
