import { describe, expect, it } from "vitest";
import {
  ceilToStep,
  componentPartCost,
  panelPartCost,
  panelPricePerM2,
  rollup,
} from "./pricing";

// These numbers are the Stage 18c rules (waste, markup incl. labor, round up
// to a step). The database function price_bom must give the same results;
// see supabase/tests/18c_pricing_checks.sql.
//
// Worked example: sheet 2440 x 1220 mm at 22.500 JOD; two sides 720 x 580 mm,
// 1.44 m banding each at 0.350 JOD/m; two hinges at 1.750; labor 5; markup 30 %.

describe("pricing rules", () => {
  const ppm2 = panelPricePerM2(2440, 1220, 22.5);

  it("sheet price per m2 is not rounded early", () => {
    expect(ppm2).toBeCloseTo(7.558452, 6);
    expect(panelPricePerM2(0, 1220, 22.5)).toBe(0);
  });

  it("panel material includes the waste allowance", () => {
    const c = panelPartCost({
      widthMm: 720, heightMm: 580, qty: 2, pricePerM2: ppm2,
      bandedLenM: 1.44, bandingRate: 0.35, wastePct: 8,
    });
    expect(c.material).toBeCloseTo(6.817845, 6);
    expect(c.banding).toBeCloseTo(1.008, 6);
    const noWaste = panelPartCost({
      widthMm: 720, heightMm: 580, qty: 2, pricePerM2: ppm2,
      bandedLenM: 1.44, bandingRate: 0.35, wastePct: 0,
    });
    expect(noWaste.material).toBeCloseTo(6.312819, 6);
  });

  it("component cost is unit price x qty", () => {
    expect(componentPartCost(1.75, 2)).toBeCloseTo(3.5, 6);
  });

  it("rollup: markup applies to labor and the price rounds UP to 0.5", () => {
    const panel = panelPartCost({
      widthMm: 720, heightMm: 580, qty: 2, pricePerM2: ppm2,
      bandedLenM: 1.44, bandingRate: 0.35, wastePct: 8,
    });
    const r = rollup([panel], [componentPartCost(1.75, 2)], {
      laborJod: 5, marginPct: 30, roundingStepJod: 0.5,
    });
    expect(r.materials).toBeCloseTo(7.826, 3);
    expect(r.components).toBeCloseTo(3.5, 3);
    expect(r.base).toBeCloseTo(11.326, 3);
    // (11.326 + 5) x 1.30 = 21.2238 -> 21.5
    expect(r.calcPrice).toBe(21.5);
  });

  it("rollup without a rounding step keeps 3 decimals", () => {
    const r = rollup([{ material: 7.826, banding: 0 }], [3.5], {
      laborJod: 5, marginPct: 30, roundingStepJod: 0,
    });
    expect(r.calcPrice).toBeCloseTo(21.224, 3);
  });

  it("ceilToStep rounds up, leaves exact multiples alone, ignores float noise", () => {
    expect(ceilToStep(86.437, 0.5)).toBe(86.5);
    expect(ceilToStep(86.5, 0.5)).toBe(86.5);
    expect(ceilToStep(86.51, 0.5)).toBe(87);
    expect(ceilToStep(21, 0.5)).toBe(21);
    expect(ceilToStep(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(ceilToStep(0, 0.5)).toBe(0);
    expect(ceilToStep(86.437, 1)).toBe(87);
  });
});
