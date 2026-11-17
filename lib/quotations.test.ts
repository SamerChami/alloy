import { describe, expect, it } from "vitest";
import {
  costSummary,
  dimsLabel,
  groupBySection,
  isDraft,
  isPastValidity,
  nextStatuses,
  priceChanged,
  sectionNames,
  todayInAmman,
} from "./quotations";

describe("status flow (mirror of trigger quotations_before_write)", () => {
  it("draft can only be sent", () => {
    expect(nextStatuses("draft")).toEqual(["sent"]);
  });
  it("sent can go back to draft or be decided", () => {
    expect(nextStatuses("sent")).toEqual(["draft", "approved", "rejected", "expired"]);
  });
  it("nothing leaves approved, rejected or expired", () => {
    expect(nextStatuses("approved")).toEqual([]);
    expect(nextStatuses("rejected")).toEqual([]);
    expect(nextStatuses("expired")).toEqual([]);
  });
  it("only a draft is editable", () => {
    expect(isDraft("draft")).toBe(true);
    expect(isDraft("sent")).toBe(false);
  });
});

describe("validity", () => {
  it("flags an open quotation after its date, not on it", () => {
    expect(isPastValidity("sent", "2026-12-18", "2026-12-18")).toBe(false);
    expect(isPastValidity("sent", "2026-12-18", "2026-12-19")).toBe(true);
    expect(isPastValidity("draft", "2026-12-18", "2027-01-01")).toBe(true);
  });
  it("never flags a decided quotation or one with no date", () => {
    expect(isPastValidity("approved", "2026-12-18", "2027-01-01")).toBe(false);
    expect(isPastValidity("sent", null, "2027-01-01")).toBe(false);
  });
});

describe("todayInAmman", () => {
  it("is the Amman calendar date, not the UTC one", () => {
    // 22:45 UTC on 17 Nov = 01:45 on 18 Nov in Amman (UTC+3)
    expect(todayInAmman(new Date("2026-11-17T22:45:00Z"))).toBe("2026-11-18");
    expect(todayInAmman(new Date("2026-11-17T20:59:00Z"))).toBe("2026-11-17");
    expect(todayInAmman(new Date("2026-11-17T21:00:00Z"))).toBe("2026-11-18");
  });
  it("has the YYYY-MM-DD shape", () => {
    expect(todayInAmman()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("dimsLabel", () => {
  it("W x H x D in whole mm", () => {
    expect(dimsLabel(800, 720, 580)).toBe("800 × 720 × 580");
    expect(dimsLabel(800.4, 719.6, 580)).toBe("800 × 720 × 580");
  });
  it("partial and empty sizes", () => {
    expect(dimsLabel(800, null, 580)).toBe("800 × – × 580");
    expect(dimsLabel(null, null, null)).toBe("");
    expect(dimsLabel(0, 0, 0)).toBe("");
  });
});

const lines = [
  { id: "c", section: "Kitchen", sort_order: 2, qty: 1, unit_price_jod: 120, unit_cost_jod: 80, list_price_jod: 120 },
  { id: "a", section: null, sort_order: 3, qty: 3, unit_price_jod: 7.25, unit_cost_jod: null, list_price_jod: null },
  { id: "b", section: " Kitchen ", sort_order: 1, qty: 2, unit_price_jod: 19.5, unit_cost_jod: 16.326, list_price_jod: 21.5 },
  { id: "d", section: "Bedroom", sort_order: 4, qty: 1, unit_price_jod: 50, unit_cost_jod: 30, list_price_jod: 50 },
  { id: "e", section: "Kitchen", sort_order: 5, qty: 1, unit_price_jod: 10, unit_cost_jod: 4, list_price_jod: 10 },
];

describe("groupBySection", () => {
  const g = groupBySection(lines);
  it("orders lines by sort_order and sections by first appearance", () => {
    expect(g.map((x) => x.section)).toEqual(["Kitchen", "", "Bedroom"]);
    expect(g[0].lines.map((l) => l.id)).toEqual(["b", "c", "e"]);
  });
  it("section subtotals add up to the quotation subtotal", () => {
    expect(g.map((x) => x.subtotal)).toEqual([169, 21.75, 50]);
    expect(g.reduce((s, x) => s + x.subtotal, 0)).toBeCloseTo(240.75, 6);
  });
  it("same sort_order falls back to id; empty input gives no groups", () => {
    const tie = groupBySection([
      { id: "z", section: null, sort_order: 1, qty: 1, unit_price_jod: 1 },
      { id: "y", section: null, sort_order: 1, qty: 1, unit_price_jod: 1 },
    ]);
    expect(tie[0].lines.map((l) => l.id)).toEqual(["y", "z"]);
    expect(groupBySection([])).toEqual([]);
  });
  it("section names for the picker", () => {
    expect(sectionNames(lines)).toEqual(["Kitchen", "Bedroom"]);
  });
});

describe("costSummary (internal)", () => {
  it("counts only lines with a known cost and reports the rest", () => {
    // known: b 2 x (19.5 | 16.326), c 1 x (120 | 80), d 1 x (50 | 30), e 1 x (10 | 4)
    expect(costSummary(lines)).toEqual({ cost: 146.652, revenue: 219, margin: 72.348, unknownLines: 1 });
  });
  it("empty", () => {
    expect(costSummary([])).toEqual({ cost: 0, revenue: 0, margin: 0, unknownLines: 0 });
  });
});

describe("priceChanged", () => {
  it("compares the charged price with the list price", () => {
    expect(priceChanged({ unit_price_jod: 19.5, list_price_jod: 21.5 })).toBe(true);
    expect(priceChanged({ unit_price_jod: 21.5, list_price_jod: 21.5 })).toBe(false);
    expect(priceChanged({ unit_price_jod: 5, list_price_jod: null })).toBe(false);
  });
});
