import { describe, expect, it } from "vitest";
import { codeFromName, codeKey, itemNumberFromName } from "./productCode";

describe("codeFromName", () => {
  it("takes the text before the first double underscore", () => {
    expect(codeFromName("WQC2.K3__80*80")).toBe("WQC2.K3");
    expect(codeFromName("W-2D-K3__97_R")).toBe("W-2D-K3");
    expect(codeFromName("BDR.K3__120__left door")).toBe("BDR.K3");
  });
  it("skips a leading item number", () => {
    expect(codeFromName("156__B-2D-K3__90")).toBe("B-2D-K3");
    expect(codeFromName("13__W-2D-K1__80 x 46")).toBe("W-2D-K1");
    expect(codeFromName("3__WH-1RD-K1")).toBe("WH-1RD-K1");
  });
  it("does not treat a lone number, or a code that merely starts with digits, as an item number", () => {
    expect(codeFromName("156")).toBe("156");
    expect(codeFromName("2D-K3__90")).toBe("2D-K3");
  });
  it("keeps single underscores inside the code", () => {
    expect(codeFromName("Coffee_Corner")).toBe("Coffee_Corner");
    expect(codeFromName("Coffee_Corner__oak")).toBe("Coffee_Corner");
  });
  it("uses the whole name when there is no separator", () => {
    expect(codeFromName("mesh_diag")).toBe("mesh_diag");
    expect(codeFromName("WQC2.K3.80*80")).toBe("WQC2.K3.80*80");
  });
  it("still stops at a slash (old naming rule)", () => {
    expect(codeFromName("BDR.K3.120/left/x")).toBe("BDR.K3.120");
    expect(codeFromName("BDR.K3/120__x")).toBe("BDR.K3");
  });
  it("trims spaces", () => {
    expect(codeFromName("  W-2D-K3 __ 45L")).toBe("W-2D-K3");
    expect(codeFromName(" 156 __ B-2D-K3 __ 90")).toBe("B-2D-K3");
  });
  it("returns null for empty, blank, or separator-first names", () => {
    expect(codeFromName("")).toBeNull();
    expect(codeFromName("   ")).toBeNull();
    expect(codeFromName("__80*80")).toBeNull();
    expect(codeFromName("156__")).toBeNull();
    expect(codeFromName("/abc")).toBeNull();
    expect(codeFromName(null)).toBeNull();
  });
});

describe("itemNumberFromName", () => {
  it("returns the leading number when a code follows it", () => {
    expect(itemNumberFromName("156__B-2D-K3__90")).toBe("156");
    expect(itemNumberFromName("WQC2.K3__80*80")).toBeNull();
    expect(itemNumberFromName("156")).toBeNull();
  });
});

describe("codeKey", () => {
  it("compares case-insensitively", () => {
    expect(codeKey("BDR.K3")).toBe(codeKey(" bdr.k3 "));
  });
});
