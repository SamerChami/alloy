/**
 * Pricing preview for the product form.
 *
 * THE DATABASE IS THE SOURCE OF TRUTH: `price_bom` / `reprice_product` in
 * supabase/migrations/20261117090000_pricing_engine.sql store the real costs
 * and prices on save. This file mirrors the same rules so the form can show a
 * live preview while the user edits. If you change a rule, change BOTH.
 *
 * Rules:
 *   panel material = area(m2) x sheet price per m2 x qty x (1 + waste%)
 *   banding        = banded length (m) x rate x qty
 *   component      = unit price x qty
 *   price          = (materials + components + labor) x (1 + markup%)
 *                    rounded UP to the rounding step (e.g. 0.5 JOD)
 * Amounts are summed unrounded; only totals are rounded to 3 decimals (fils).
 */

export type PricingSettings = {
  /** Sheet waste allowance in percent (e.g. 8). */
  wastePct: number;
  /** Final price is rounded up to a multiple of this (JOD). 0 = no step. */
  roundingStepJod: number;
};

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  wastePct: 8,
  roundingStepJod: 0.5,
};

function r3(n: number): number {
  return Math.round(n * 1000) / 1000 + 0;
}

/** Round up to a multiple of `step`; tolerant of floating-point noise. */
export function ceilToStep(value: number, step: number): number {
  if (!(step > 0)) return r3(value);
  const units = Math.round((value / step) * 1e8) / 1e8;
  return r3(Math.ceil(units) * step);
}

/** Sheet price per square metre (not rounded). */
export function panelPricePerM2(
  sheetLenMm: number,
  sheetWidMm: number,
  sheetPriceJod: number,
): number {
  const areaM2 = (sheetLenMm / 1000) * (sheetWidMm / 1000);
  if (areaM2 === 0) return 0;
  return sheetPriceJod / areaM2;
}

/** Cost of one panel line (not rounded; round when displaying). */
export function panelPartCost(opts: {
  widthMm: number;
  heightMm: number;
  qty: number;
  pricePerM2: number;
  bandedLenM: number;
  bandingRate: number;
  /** Sheet waste allowance in percent. Omitted = 0. */
  wastePct?: number;
}): { material: number; banding: number } {
  const { widthMm, heightMm, qty, pricePerM2, bandedLenM, bandingRate, wastePct = 0 } = opts;
  const areaM2 = (widthMm / 1000) * (heightMm / 1000);
  return {
    material: areaM2 * pricePerM2 * qty * (1 + wastePct / 100),
    banding: bandedLenM * bandingRate * qty,
  };
}

/** Cost of one component line (not rounded). */
export function componentPartCost(unitPrice: number, qty: number): number {
  return unitPrice * qty;
}

export function rollup(
  panelCosts: Array<{ material: number; banding: number }>,
  componentCosts: number[],
  opts: { laborJod: number; marginPct: number; roundingStepJod?: number },
): { materials: number; components: number; base: number; calcPrice: number } {
  const materials = r3(panelCosts.reduce((s, c) => s + c.material + c.banding, 0));
  const components = r3(componentCosts.reduce((s, c) => s + c, 0));
  const base = r3(materials + components);
  const raw = (base + opts.laborJod) * (1 + opts.marginPct / 100);
  return { materials, components, base, calcPrice: ceilToStep(raw, opts.roundingStepJod ?? 0) };
}
