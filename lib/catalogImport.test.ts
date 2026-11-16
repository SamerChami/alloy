import { describe, expect, it } from "vitest";
import { carryMaterialMapping, roundedDims, type BomRowInsert, type OldLine } from "./catalogImport";
import type { V3Node } from "./sketchup/parseV3";

function row(name: string): BomRowInsert {
  return {
    line_type: "panel", panel_id: null, part_name: name, width_mm: 500, height_mm: 700,
    banding_type_id: null, banded_length_m: 0, component_id: null, qty: 1, sort_order: 0,
    part_role: "other", depth_mm: 18, pos_offset_mm: null, pos_x_mm: 0, pos_y_mm: 0,
    pos_z_mm: 0, hole_count: 0, cuts_json: null, cut_warning: null,
  };
}

describe("carryMaterialMapping", () => {
  it("copies material choices from the old line with the same name", () => {
    const old: OldLine[] = [{ part_name: "Door", panel_id: "p1", banding_type_id: "b1", banded_length_m: 2.4 }];
    const [r] = carryMaterialMapping([row("Door")], old);
    expect(r.panel_id).toBe("p1");
    expect(r.banding_type_id).toBe("b1");
    expect(r.banded_length_m).toBe(2.4);
  });
  it("leaves nulls when nothing matches", () => {
    const old: OldLine[] = [{ part_name: "Shelf", panel_id: "p1", banding_type_id: "b1", banded_length_m: 1 }];
    const [r] = carryMaterialMapping([row("Door")], old);
    expect(r.panel_id).toBeNull();
    expect(r.banding_type_id).toBeNull();
    expect(r.banded_length_m).toBe(0);
  });
  it("uses the first match when names repeat", () => {
    const old: OldLine[] = [
      { part_name: "Side", panel_id: "first", banding_type_id: null, banded_length_m: 1 },
      { part_name: "Side", panel_id: "second", banding_type_id: null, banded_length_m: 2 },
    ];
    const out = carryMaterialMapping([row("Side"), row("Side")], old);
    expect(out.map((r) => r.panel_id)).toEqual(["first", "first"]);
  });
});

describe("roundedDims", () => {
  it("rounds to whole millimetres", () => {
    const root = { size_mm: { x: 599.6, y: 320.4, z: 719.5 } } as unknown as V3Node;
    expect(roundedDims(root)).toEqual({ width_mm: 600, height_mm: 720, depth_mm: 320 });
  });
});
