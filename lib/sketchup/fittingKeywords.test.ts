import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { FITTING_KEYWORDS, isFittingByName } from "./fittingKeywords";

describe("fitting keyword list", () => {
  it("is identical to FITTING_KEYS in the SketchUp extension", () => {
    const rb = readFileSync(
      fileURLToPath(new URL("../../extension/alloy_export/main.rb", import.meta.url)),
      "utf8",
    );
    const m = rb.match(/FITTING_KEYS\s*=\s*%w\[([^\]]*)\]/);
    expect(m, "FITTING_KEYS = %w[...] not found in main.rb").not.toBeNull();
    const rubyKeys = m![1].trim().split(/\s+/);
    expect([...FITTING_KEYWORDS]).toEqual(rubyKeys);
  });

  it("matches case-insensitively anywhere in the name", () => {
    expect(isFittingByName("Leg_100")).toBe(true);
    expect(isFittingByName("AL_U_Channel__top")).toBe(true);
    expect(isFittingByName("Cutlery tray")).toBe(true);
  });

  it("does not treat ordinary panels as fittings", () => {
    expect(isFittingByName("Left Side")).toBe(false);
    expect(isFittingByName("Ledge")).toBe(false);   // "leg" alone is not a keyword
    expect(isFittingByName("")).toBe(false);
    expect(isFittingByName(null)).toBe(false);
  });
});
