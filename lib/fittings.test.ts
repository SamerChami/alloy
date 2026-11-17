import { describe, expect, it } from "vitest";
import { classifyPart, componentMap, mergeOldComponentLines, partCode, partLengthMm, splitForPricing, type ComponentRef } from "./fittings";
import { importBomRows, type OldLine } from "./catalogImport";
import { isFittingByName } from "./sketchup/fittingKeywords";
import type { V3Part } from "./sketchup/parseV3";

function part(name: string, sorted: [number, number, number] = [18, 500, 700], runMm?: number): V3Part {
  return {
    name,
    size: { x: sorted[1], y: sorted[0], z: sorted[2] },
    pos: { x: 0, y: 0, z: 0 },
    sorted,
    isFitting: isFittingByName(name),
    ...(runMm != null
      ? { profile_mm: { p_axis: "width", q_axis: "depth", run_axis: "height", run_mm: runMm, loop: [] } }
      : {}),
  } as V3Part;
}

const LEG: ComponentRef = { id: "c-leg", code: "Leg_100", unit: "pcs" };
const CHANNEL: ComponentRef = { id: "c-ch", code: "AL_U_Channel", unit: "m" };
const BIN: ComponentRef = { id: "c-bin", code: "TRASH-BIN-30", unit: "pcs" };
const catalogue = componentMap([LEG, CHANNEL, BIN]);

describe("splitForPricing", () => {
  it("links fittings to components by code and adds up pieces", () => {
    const parts = [part("Left Side"), part("Leg_100"), part("leg_100"), part("LEG_100__front"), part("Leg_100")];
    const { panels, componentRows, unlinked } = splitForPricing(parts, catalogue);
    expect(panels.map((p) => p.name)).toEqual(["Left Side"]);
    expect(componentRows).toHaveLength(1);
    expect(componentRows[0]).toMatchObject({ line_type: "component", component_id: "c-leg", qty: 4, part_name: "Leg_100" });
    expect(unlinked).toEqual([]);
  });

  it("counts a component sold per metre by its length, to the centimetre", () => {
    // two channels: 564 mm run and 1136.4 mm run -> 1700.4 mm -> 1.70 m
    const parts = [part("AL_U_Channel", [10, 20, 600], 564), part("AL_U_Channel__top", [10, 20, 1200], 1136.4)];
    const { componentRows } = splitForPricing(parts, catalogue);
    expect(componentRows).toHaveLength(1);
    expect(componentRows[0]).toMatchObject({ component_id: "c-ch", qty: 1.7 });
  });

  it("uses the longest dimension when the export has no channel run", () => {
    expect(partLengthMm(part("AL_U_Channel", [10, 20, 600]))).toBe(600);
    expect(partLengthMm(part("AL_U_Channel", [10, 20, 600], 564))).toBe(564);
  });

  it("prices an accessory whose name has no fitting keyword, when its code is a component", () => {
    const { panels, componentRows } = splitForPricing([part("TRASH-BIN-30__under sink"), part("Shelf")], catalogue);
    expect(panels.map((p) => p.name)).toEqual(["Shelf"]);
    expect(componentRows[0]).toMatchObject({ component_id: "c-bin", qty: 1 });
  });

  it("saves an unknown fitting with no price and reports it", () => {
    const parts = [part("Leg_150"), part("Leg_150"), part("L_Channel_X", [10, 20, 2000], 2000)];
    const { panels, componentRows, unlinked } = splitForPricing(parts, catalogue);
    expect(panels).toEqual([]);
    expect(componentRows.map((r) => [r.part_name, r.component_id, r.qty])).toEqual([
      ["Leg_150", null, 2],
      ["L_Channel_X", null, 2],
    ]);
    expect(unlinked).toEqual([
      { code: "Leg_150", qty: 2, unit: "pcs" },
      { code: "L_Channel_X", qty: 2, unit: "m" },
    ]);
  });

  it("leaves ordinary panels alone, even with an empty catalogue", () => {
    const { panels, componentRows } = splitForPricing([part("Door"), part("Back")], new Map());
    expect(panels).toHaveLength(2);
    expect(componentRows).toEqual([]);
  });

  it("ignores the #number SketchUp adds to copied definitions", () => {
    const { componentRows, unlinked } = splitForPricing(
      [part("Leg_100#3"), part("Leg_100#4"), part("Leg_150#480")], catalogue,
    );
    expect(componentRows.map((r) => [r.part_name, r.component_id, r.qty])).toEqual([
      ["Leg_100", "c-leg", 2],
      ["Leg_150", null, 1],
    ]);
    expect(unlinked).toEqual([{ code: "Leg_150", qty: 1, unit: "pcs" }]);
  });

  it("reads real export names: code first, description (with keyword) after", () => {
    const real = componentMap([
      { id: "leg12", code: "03-09-04-0007", unit: "pcs" },
      { id: "lch", code: "03-03-01-0001", unit: "m" },
    ]);
    const { panels, componentRows, unlinked } = splitForPricing([
      part("Top_Back#91"),
      part("03-09-04-0007__Leg_12cm#480", [60, 60, 110]),
      part("03-09-04-0007__Leg_12cm#481", [60, 60, 110]),
      part("03-03-01-0001__L_Channel#123", [27, 57.5, 800], 800),
      part("03-03-01-0003__U_Channel#41", [27, 74, 800], 800),
    ], real);
    expect(panels.map((p) => p.name)).toEqual(["Top_Back#91"]);
    expect(componentRows.map((r) => [r.part_name, r.component_id, r.qty])).toEqual([
      ["03-09-04-0007", "leg12", 2],
      ["03-03-01-0001", "lch", 0.8],
      ["03-03-01-0003", null, 0.8],
    ]);
    expect(unlinked).toEqual([{ code: "03-03-01-0003", qty: 0.8, unit: "m" }]);
  });

  it("skips an item number in front of the code", () => {
    const { componentRows } = splitForPricing([part("7__Leg_100__rear")], catalogue);
    expect(componentRows[0]).toMatchObject({ component_id: "c-leg", qty: 1 });
  });
});

describe("classifyPart", () => {
  it("gives the same answer as splitForPricing, part by part", () => {
    expect(classifyPart(part("Leg_100#3"), catalogue)).toBe("linked");
    expect(classifyPart(part("TRASH-BIN-30__under sink"), catalogue)).toBe("linked");
    expect(classifyPart(part("Leg_150"), catalogue)).toBe("unlinked");
    expect(classifyPart(part("Door"), catalogue)).toBe("panel");
    expect(classifyPart(part("(unnamed)"), catalogue)).toBe("panel");
  });
  it("partCode drops the SketchUp counter and the description", () => {
    expect(partCode(part("03-09-04-0007__Leg_12cm#480"))).toBe("03-09-04-0007");
    expect(partCode(part("Leg_15cm#7"))).toBe("Leg_15cm");
  });
});

describe("mergeOldComponentLines", () => {
  it("keeps a link chosen by hand for a fitting that still matches no component", () => {
    const { componentRows } = splitForPricing([part("Leg_150")], catalogue);
    const out = mergeOldComponentLines(componentRows, [
      { line_type: "component", part_name: "leg_150", component_id: "hand-picked", qty: 4 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ component_id: "hand-picked", qty: 1 });
  });

  it("keeps hardware added by hand (no SketchUp code), after the imported lines", () => {
    const { componentRows } = splitForPricing([part("Leg_100")], catalogue);
    const out = mergeOldComponentLines(componentRows, [
      { line_type: "component", part_name: null, component_id: "hinge", qty: 4 },
      { line_type: "component", part_name: "Leg_100", component_id: "c-leg", qty: 9 }, // old import: replaced
      { line_type: "panel", part_name: "Door", component_id: null, qty: 1 },
    ]);
    expect(out.map((r) => [r.part_name, r.component_id, r.qty])).toEqual([
      ["Leg_100", "c-leg", 1],
      [null, "hinge", 4],
    ]);
  });
});

describe("importBomRows", () => {
  it("puts panels first, then component lines, numbered in order", () => {
    const old: OldLine[] = [
      { line_type: "panel", part_name: "Door", panel_id: "board-1", banding_type_id: "band-1", banded_length_m: 2.4 },
      { line_type: "component", part_name: null, panel_id: null, banding_type_id: null, banded_length_m: 0, component_id: "hinge", qty: 2 },
    ];
    const { rows, panelCount, unlinked } = importBomRows(
      [part("Leg_100"), part("Door"), part("Leg_100"), part("Leg_150")], catalogue, old,
    );
    expect(panelCount).toBe(1);
    expect(rows.map((r) => [r.line_type, r.part_name, r.component_id, r.qty, r.sort_order])).toEqual([
      ["panel", "Door", null, 1, 0],
      ["component", "Leg_100", "c-leg", 2, 1],
      ["component", "Leg_150", null, 1, 2],
      ["component", null, "hinge", 2, 3],
    ]);
    expect(rows[0]).toMatchObject({ panel_id: "board-1", banding_type_id: "band-1", banded_length_m: 2.4 });
    expect(unlinked).toEqual([{ code: "Leg_150", qty: 1, unit: "pcs" }]);
  });

  it("does not copy a board choice onto a component line with the same name", () => {
    const old: OldLine[] = [
      { line_type: "panel", part_name: "Leg_100", panel_id: "board-1", banding_type_id: null, banded_length_m: 0 },
    ];
    const { rows } = importBomRows([part("Leg_100")], catalogue, old);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ line_type: "component", panel_id: null, component_id: "c-leg" });
  });
});
