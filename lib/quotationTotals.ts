/**
 * Quotation totals preview.
 *
 * THE DATABASE IS THE SOURCE OF TRUTH: trigger `quotations_before_write` in
 * supabase/migrations/20261118090000_quotations.sql stores subtotal, discount,
 * tax and total, and overwrites anything the app sends in those columns. This
 * file mirrors the same rules so the screen can show the totals while the user
 * is still typing. If you change a rule, change BOTH.
 *
 * Rules:
 *   line total = qty x unit price                      (rounded to fils)
 *   subtotal   = sum of line totals
 *   discount   = percent: subtotal x value / 100       (rounded to fils)
 *                amount:  value, never more than the subtotal
 *   tax        = (subtotal - discount) x tax % / 100   (rounded to fils)
 *   total      = subtotal - discount + tax
 * Line prices are BEFORE tax.
 */

export type DiscountKind = "amount" | "percent";

export type QuotationLineInput = { qty: number; unitPriceJod: number };

export type QuotationTotals = {
  subtotal: number;
  discount: number;
  /** subtotal - discount */
  net: number;
  tax: number;
  total: number;
};

/** Round to 3 decimals (fils), tolerant of floating-point noise. */
function r3(n: number): number {
  return Math.round(n * 1000 + Math.sign(n) * 1e-6) / 1000 + 0;
}

function num(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

export function lineTotal(qty: number, unitPriceJod: number): number {
  return r3(num(qty) * num(unitPriceJod));
}

export function quotationTotals(
  lines: QuotationLineInput[],
  opts: { discountKind: DiscountKind; discountValue: number; taxPct: number },
): QuotationTotals {
  const subtotal = r3(lines.reduce((s, l) => s + lineTotal(l.qty, l.unitPriceJod), 0));
  const value = Math.max(0, num(opts.discountValue));
  const discount =
    opts.discountKind === "percent"
      ? r3((subtotal * Math.min(value, 100)) / 100)
      : r3(Math.min(value, subtotal));
  const net = r3(subtotal - discount);
  const tax = r3((net * Math.max(0, num(opts.taxPct))) / 100);
  return { subtotal, discount, net, tax, total: r3(net + tax) };
}
