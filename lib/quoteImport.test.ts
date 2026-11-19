import { describe, expect, it } from "vitest";
import { componentMap } from "@/lib/fittings";
import type { V3Node } from "@/lib/sketchup/parseV3";
import {
  type QuotePreviewRow, defaultSection, previewSummary, projectToQuoteItems, rootToQuoteItem,
} from "@/lib/quoteImport";

function leaf(name: string, sorted: [number, number, number], extra: Partial<V3Node> = {}): V3Node {
  return {
    name, size_mm: { x: sorted[2], y: sorted[1], z: sorted[0] }, sorted_mm: sorted,
    pos_mm: { x: 1, y: 2, z: 3 }, is_leaf: true, item_type: "Part", ...extra,
  };
}
function root(name: string, size: { x: number; y: number; z: number }, children: V3Node[], itemType = "Cabinet"): V3Node {
  return { name, size_mm: size, sorted_mm: [0, 0, 0], pos_mm: { x: 0, y: 0, z: 0 }, is_leaf: false, item_type: itemType, children };
}

const components = componentMap([
  { id: "leg-id", code: "03-09-04-0007", unit: "pcs" },
  { id: "ch-id", code: "03-03-01-0001", unit: "m" },
]);

const cabinet = root("156__B-2D-K3__90", { x: 899.6, y: 580.2, z: 880 }, [
  leaf("Left_Side#114", [18, 580, 880], { cuts: [] }),
  leaf("Right_Side#114", [18, 580, 880]),
  leaf("03-09-04-0007__Leg_12cm#480", [60, 60, 120]),
  leaf("03-09-04-0007__Leg_12cm#481", [60, 60, 120]),
  leaf("03-03-01-0001__L_Channel#123", [20, 30, 864]),
  leaf("Mystery_Hinge#2", [10, 20, 30]),
]);

describe("rootToQuoteItem", () => {
  const item = rootToQuoteItem(cabinet, components);

  it("splits the name into item number, code and description", () => {
    expect(item.item_no).toBe("156");
    expect(item.code).toBe("B-2D-K3");
    expect(item.description).toBe("90");
  });

  it("sends the size in whole millimetres (width X, height Z, depth Y)", () => {
    expect([item.width_mm, item.height_mm, item.depth_mm]).toEqual([900, 880, 580]);
  });

  it("sends panels with their drawn name and cut-list size, and nothing about money", () => {
    const panels = item.lines.filter((l) => l.line_type === "panel");
    expect(panels).toHaveLength(2);
    expect(panels[0]).toMatchObject({
      part_name: "Left_Side#114", width_mm: 580, height_mm: 880, depth_mm: 18, qty: 1,
      pos_x_mm: 1, pos_y_mm: 2, pos_z_mm: 3, cuts_json: [],
    });
    for (const l of item.lines) {
      expect(Object.keys(l)).not.toContain("panel_id");
      expect(Object.keys(l)).not.toContain("banding_type_id");
      expect(Object.keys(l)).not.toContain("component_id");
      expect(Object.keys(l).some((k) => k.includes("price") || k.includes("cost"))).toBe(false);
    }
  });

  it("groups fittings by code: pieces, metres for a component sold by the metre", () => {
    const comps = item.lines.filter((l) => l.line_type === "component");
    expect(comps).toEqual([
      { line_type: "component", part_name: "03-09-04-0007", qty: 2 },
      { line_type: "component", part_name: "03-03-01-0001", qty: 0.86 },
      { line_type: "component", part_name: "Mystery_Hinge", qty: 1 },
    ]);
  });

  it("never sends a quantity of zero", () => {
    const tiny = root("X__1", { x: 10, y: 10, z: 10 }, [leaf("03-03-01-0001__L_Channel#1", [1, 1, 2])]);
    expect(rootToQuoteItem(tiny, components).lines[0]).toMatchObject({ qty: 0.01 });
  });
});

describe("projectToQuoteItems", () => {
  it("keeps every top-level item except the room box, in file order", () => {
    const room = root("Room", { x: 4000, y: 3000, z: 2700 }, [], "RoomBox");
    const other = root("Coffee_Corner", { x: 600, y: 600, z: 2100 }, [leaf("Top", [18, 600, 600])], "Other");
    const items = projectToQuoteItems({ roots: [room, cabinet, other] }, components);
    expect(items.map((i) => i.code)).toEqual(["B-2D-K3", "Coffee_Corner"]);
    expect(items[1].item_no).toBeNull();
  });
});

describe("defaultSection", () => {
  it("uses the model name, else the file name without its extension", () => {
    expect(defaultSection(" Kitchen ", "x.json")).toBe("Kitchen");
    expect(defaultSection("", "Villa 12 - Kitchen.json")).toBe("Villa 12 - Kitchen");
    expect(defaultSection("Untitled", "room.json")).toBe("room");
  });
});

describe("previewSummary", () => {
  it("counts each kind and adds the prices in fils", () => {
    const row = (status: QuotePreviewRow["status"], price: number | null, warning: string | null) =>
      ({ status, list_price_jod: price, warning }) as QuotePreviewRow;
    expect(previewSummary([
      row("standard", 40, null), row("parts", 53.5, "1 panel(s) have no board price"),
      row("parts", 0.1, null), row("parts", 0.2, null), row("unknown", null, "Not in the catalogue: type a price"),
    ])).toEqual({ items: 5, standard: 1, parts: 3, unknown: 1, warnings: 2, total_jod: 93.8 });
  });
});
