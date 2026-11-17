/**
 * Quotation screens: shared types and small rules (Stage 20b).
 *
 * THE DATABASE IS THE SOURCE OF TRUTH for money, status flow and the draft
 * lock (supabase/migrations/20261118090000_quotations.sql). The helpers here
 * only decide what the screen offers and how lines are grouped; the database
 * refuses anything that is not allowed, whatever the screen does.
 */
import { lineTotal } from "./quotationTotals";

export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "expired";
export type PriceDisplay = "lines" | "sections" | "total";
export type PriceSource = "standard" | "catalogue" | "parts" | "manual";

export type QuotationRow = {
  id: string;
  code: string;
  client_id: string;
  project_id: string | null;
  title: string | null;
  status: QuoteStatus;
  issue_date: string;
  valid_until: string | null;
  discount_kind: "amount" | "percent";
  discount_value: number;
  discount_jod: number;
  tax_pct: number;
  subtotal_jod: number;
  tax_jod: number;
  total_jod: number;
  price_display: PriceDisplay;
  notes: string | null;
  root_id: string | null;
  revision: number;
  sent_at: string | null;
  decided_at: string | null;
  created_at: string;
};

export type QuotationItemRow = {
  id: string;
  quotation_id: string;
  product_id: string | null;
  size_id: string | null;
  section: string | null;
  item_no: string | null;
  code: string | null;
  description: string;
  description_ar: string | null;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  qty: number;
  unit_price_jod: number;
  line_total_jod: number;
  list_price_jod: number | null;
  unit_cost_jod: number | null;
  price_source: PriceSource;
  notes: string | null;
  sort_order: number;
};

/** Column lists for `.select(...)`, kept next to the types they fill. */
export const QUOTATION_COLUMNS =
  "id, code, client_id, project_id, title, status, issue_date, valid_until, discount_kind, discount_value, discount_jod, tax_pct, subtotal_jod, tax_jod, total_jod, price_display, notes, root_id, revision, sent_at, decided_at, created_at";
export const QUOTATION_ITEM_COLUMNS =
  "id, quotation_id, product_id, size_id, section, item_no, code, description, description_ar, width_mm, height_mm, depth_mm, qty, unit_price_jod, line_total_jod, list_price_jod, unit_cost_jod, price_source, notes, sort_order";

/** Same flow as trigger quotations_before_write. */
const FLOW: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent"],
  sent: ["draft", "approved", "rejected", "expired"],
  approved: [],
  rejected: [],
  expired: [],
};

export function nextStatuses(status: QuoteStatus): QuoteStatus[] {
  return FLOW[status] ?? [];
}

/** Only a draft can be edited or deleted. */
export function isDraft(status: QuoteStatus): boolean {
  return status === "draft";
}

/**
 * Today's date in Amman as YYYY-MM-DD. ALLOY works on the Amman calendar;
 * `new Date().toISOString()` is the UTC date, which is still yesterday between
 * midnight and 03:00 in Amman (20b tester finding). The database dates new
 * quotations the same way (migration 20261118100000).
 */
export function todayInAmman(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Amman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * A draft or sent quotation whose validity date has passed. `today` and
 * `validUntil` are YYYY-MM-DD strings (they compare correctly as text).
 */
export function isPastValidity(status: QuoteStatus, validUntil: string | null, today: string): boolean {
  if (!validUntil) return false;
  if (status !== "draft" && status !== "sent") return false;
  return validUntil.slice(0, 10) < today.slice(0, 10);
}

/** "800 × 720 × 580" (W × H × D, mm) or "" when no size is known. */
export function dimsLabel(
  w: number | null | undefined,
  h: number | null | undefined,
  d: number | null | undefined,
): string {
  const parts = [w, h, d].map((n) => (n != null && Number(n) > 0 ? String(Math.round(Number(n))) : null));
  if (parts.every((p) => p === null)) return "";
  return parts.map((p) => p ?? "–").join(" × ");
}

export type SectionGroup<T> = {
  /** "" = lines with no section. */
  section: string;
  lines: T[];
  subtotal: number;
};

/**
 * Lines in display order (sort_order, then id), grouped by section in the
 * order each section first appears. Lines with no section form one group.
 */
export function groupBySection<
  T extends { id: string; section: string | null; sort_order: number; qty: number; unit_price_jod: number },
>(lines: T[]): SectionGroup<T>[] {
  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const groups: SectionGroup<T>[] = [];
  const byName = new Map<string, SectionGroup<T>>();
  for (const l of sorted) {
    const name = (l.section ?? "").trim();
    let g = byName.get(name);
    if (!g) {
      g = { section: name, lines: [], subtotal: 0 };
      byName.set(name, g);
      groups.push(g);
    }
    g.lines.push(l);
    g.subtotal = Math.round((g.subtotal + lineTotal(Number(l.qty), Number(l.unit_price_jod))) * 1000) / 1000;
  }
  return groups;
}

/** Section names already used, in first-appearance order, without the empty one. */
export function sectionNames(lines: Array<{ section: string | null }>): string[] {
  const seen: string[] = [];
  for (const l of lines) {
    const name = (l.section ?? "").trim();
    if (name && !seen.includes(name)) seen.push(name);
  }
  return seen;
}

export type CostSummary = {
  /** Sum of qty x cost over the lines whose cost is known. */
  cost: number;
  /** Sum of qty x price over those same lines. */
  revenue: number;
  /** revenue - cost (before the quotation discount and before tax). */
  margin: number;
  /** Lines with no cost recorded: left out of all three numbers above. */
  unknownLines: number;
};

/** Internal view only: never printed, never shown to non-office users. */
export function costSummary(
  lines: Array<{ qty: number; unit_price_jod: number; unit_cost_jod: number | null }>,
): CostSummary {
  let cost = 0;
  let revenue = 0;
  let unknownLines = 0;
  for (const l of lines) {
    if (l.unit_cost_jod == null) {
      unknownLines += 1;
      continue;
    }
    cost += lineTotal(Number(l.qty), Number(l.unit_cost_jod));
    revenue += lineTotal(Number(l.qty), Number(l.unit_price_jod));
  }
  const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;
  return { cost: r3(cost), revenue: r3(revenue), margin: r3(revenue - cost), unknownLines };
}

/** True when a catalogue line is charged at something other than its list price. */
export function priceChanged(l: { unit_price_jod: number; list_price_jod: number | null }): boolean {
  return l.list_price_jod != null && Math.abs(Number(l.unit_price_jod) - Number(l.list_price_jod)) > 0.0005;
}
