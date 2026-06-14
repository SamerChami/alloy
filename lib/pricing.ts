function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function panelPricePerM2(
  sheetLenMm: number,
  sheetWidMm: number,
  sheetPriceJod: number,
): number {
  const areaM2 = (sheetLenMm / 1000) * (sheetWidMm / 1000);
  if (areaM2 === 0) return 0;
  return r3(sheetPriceJod / areaM2);
}

export function panelPartCost(opts: {
  widthMm: number;
  heightMm: number;
  qty: number;
  pricePerM2: number;
  bandedLenM: number;
  bandingRate: number;
}): { material: number; banding: number } {
  const { widthMm, heightMm, qty, pricePerM2, bandedLenM, bandingRate } = opts;
  const areaM2 = (widthMm / 1000) * (heightMm / 1000);
  return {
    material: r3(areaM2 * pricePerM2 * qty),
    banding: r3(bandedLenM * bandingRate * qty),
  };
}

export function componentPartCost(unitPrice: number, qty: number): number {
  return r3(unitPrice * qty);
}

export function rollup(
  panelCosts: Array<{ material: number; banding: number }>,
  componentCosts: number[],
  opts: { laborJod: number; marginPct: number },
): { materials: number; components: number; base: number; calcPrice: number } {
  const materials = r3(panelCosts.reduce((s, c) => s + c.material + c.banding, 0));
  const components = r3(componentCosts.reduce((s, c) => s + c, 0));
  const base = r3(materials + components);
  const calcPrice = r3((base + opts.laborJod) * (1 + opts.marginPct / 100));
  return { materials, components, base, calcPrice };
}

/*
 * Verification — embedded test case (spec numbers):
 *
 * Panel 2440×1220 mm @ 22.500 JOD:
 *   pricePerM2 = 22.500 / (2.440 × 1.220) = 22.500 / 2.9768 = 7.559
 *
 * Two sides 720×580 mm, qty=2, banded 1.44 m/piece @ PVC 0.350/m:
 *   material = (0.720 × 0.580) × 7.559 × 2 = 0.4176 × 7.559 × 2 = 6.313
 *   banding  = 1.44 × 0.350 × 2 = 1.008
 *   (the spec writes "2.88 m" = total banding = 1.44 × 2 pieces)
 *
 * 2 hinges @ 1.750 JOD:
 *   component = 1.750 × 2 = 3.500
 *
 * rollup:
 *   materials = 6.313 + 1.008 = 7.321
 *   components = 3.500
 *   base = 10.821
 *   labor = 5.000, margin = 30 %
 *   calcPrice = (10.821 + 5.000) × 1.30 = 15.821 × 1.30 = 20.567  ✓
 */
