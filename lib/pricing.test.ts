import { describe, it, expect } from "vitest";
import {
  panelPricePerM2,
  panelPartCost,
  componentPartCost,
  rollup,
} from "@/lib/pricing";

// Pins current behaviour. Rounding fix is tracked for Phase 1.
describe("pricing", () => {
  it("panelPricePerM2 for a full sheet", () => {
    expect(panelPricePerM2(2440, 1220, 22.5)).toBeCloseTo(7.558, 3);
  });

  it("panelPricePerM2 returns 0 for zero-area sheet", () => {
    expect(panelPricePerM2(0, 1220, 22.5)).toBeCloseTo(0, 3);
  });

  it("panelPartCost splits material and banding", () => {
    const r = panelPartCost({
      widthMm: 720,
      heightMm: 580,
      qty: 2,
      pricePerM2: 7.558,
      bandedLenM: 1.44,
      bandingRate: 0.35,
    });
    expect(r.material).toBeCloseTo(6.312, 3);
    expect(r.banding).toBeCloseTo(1.008, 3);
  });

  it("componentPartCost multiplies unit price by qty", () => {
    expect(componentPartCost(1.75, 2)).toBeCloseTo(3.5, 3);
  });

  it("rollup totals materials, components, base and price", () => {
    const r = rollup([{ material: 6.312, banding: 1.008 }], [3.5], {
      laborJod: 5,
      marginPct: 30,
    });
    expect(r.materials).toBeCloseTo(7.32, 3);
    expect(r.components).toBeCloseTo(3.5, 3);
    expect(r.base).toBeCloseTo(10.82, 3);
    expect(r.calcPrice).toBeCloseTo(20.566, 3);
  });
});
