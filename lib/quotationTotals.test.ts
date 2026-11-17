import { describe, expect, it } from "vitest";
import { lineTotal, quotationTotals } from "./quotationTotals";

// These numbers are the Stage 20a rules. The database trigger
// quotations_before_write must give the same results; see
// supabase/tests/20a_quotation_checks.sql (Q1, Q2).
//
// Worked example: 2 x 19.500 + 1 x 120.000 + 3 x 7.250.

const lines = [
  { qty: 2, unitPriceJod: 19.5 },
  { qty: 1, unitPriceJod: 120 },
  { qty: 3, unitPriceJod: 7.25 },
];

describe("quotation totals", () => {
  it("percentage discount, then tax on what is left (Q1)", () => {
    expect(quotationTotals(lines, { discountKind: "percent", discountValue: 10, taxPct: 16 })).toEqual({
      subtotal: 180.75,
      discount: 18.075,
      net: 162.675,
      tax: 26.028,
      total: 188.703,
    });
  });

  it("fixed discount (Q2)", () => {
    const t = quotationTotals(lines, { discountKind: "amount", discountValue: 20, taxPct: 16 });
    expect(t.discount).toBe(20);
    expect(t.tax).toBe(25.72);
    expect(t.total).toBe(186.47);
  });

  it("no tax, no discount", () => {
    expect(quotationTotals(lines, { discountKind: "amount", discountValue: 0, taxPct: 0 }).total).toBe(180.75);
    expect(quotationTotals(lines, { discountKind: "amount", discountValue: 0, taxPct: 16 }).total).toBe(209.67);
  });

  it("a fixed discount is never more than the subtotal (Q2)", () => {
    const t = quotationTotals(lines, { discountKind: "amount", discountValue: 500, taxPct: 16 });
    expect(t.discount).toBe(180.75);
    expect(t.total).toBe(0);
  });

  it("a percentage is held between 0 and 100", () => {
    expect(quotationTotals(lines, { discountKind: "percent", discountValue: 150, taxPct: 0 }).total).toBe(0);
    expect(quotationTotals(lines, { discountKind: "percent", discountValue: -5, taxPct: 0 }).total).toBe(180.75);
  });

  it("line totals are rounded to fils before they are added", () => {
    expect(lineTotal(0.8, 2.345)).toBe(1.876);
    expect(lineTotal(3, 0.335)).toBe(1.005);
    expect(quotationTotals([{ qty: 0.8, unitPriceJod: 2.345 }, { qty: 3, unitPriceJod: 0.335 }],
      { discountKind: "amount", discountValue: 0, taxPct: 0 }).subtotal).toBe(2.881);
  });

  it("empty or half-typed input gives zeros, not NaN", () => {
    expect(quotationTotals([], { discountKind: "percent", discountValue: 10, taxPct: 16 }).total).toBe(0);
    expect(quotationTotals([{ qty: NaN, unitPriceJod: 5 }],
      { discountKind: "amount", discountValue: NaN, taxPct: NaN }).total).toBe(0);
  });
});
