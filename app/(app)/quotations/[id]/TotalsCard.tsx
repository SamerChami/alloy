"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/components/lang-provider";
import { jod } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import { costSummary, type PriceDisplay, type QuotationItemRow, type QuotationRow } from "@/lib/quotations";
import { quotationTotals } from "@/lib/quotationTotals";

const DISPLAYS: PriceDisplay[] = ["lines", "sections", "total"];

export function TotalsCard({
  quotation,
  lines,
  draft,
  busy,
  onUpdate,
}: {
  quotation: QuotationRow;
  lines: QuotationItemRow[];
  draft: boolean;
  busy: boolean;
  /** One update of the named columns on the quotation. */
  onUpdate: (patch: Record<string, string | number | null>) => Promise<boolean>;
}) {
  const { t } = useLang();
  const [kind, setKind] = useState(quotation.discount_kind);
  const [value, setValue] = useState(String(Number(quotation.discount_value)));
  const [tax, setTax] = useState(String(Number(quotation.tax_pct)));
  // True from the first keystroke until the save has finished.
  const [dirty, setDirty] = useState(false);

  // Follow the saved values (after a reload) while nothing is being typed.
  useEffect(() => {
    if (dirty) return;
    setKind(quotation.discount_kind);
    setValue(String(Number(quotation.discount_value)));
    setTax(String(Number(quotation.tax_pct)));
  }, [dirty, quotation.discount_kind, quotation.discount_value, quotation.tax_pct]);

  async function saveDiscount(nextKind = kind) {
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n) || n < 0) {
      setDirty(false);
      setKind(quotation.discount_kind);
      setValue(String(Number(quotation.discount_value)));
      return;
    }
    if (nextKind !== quotation.discount_kind || n !== Number(quotation.discount_value)) {
      await onUpdate({ discount_kind: nextKind, discount_value: n });
    }
    setDirty(false);
  }

  async function saveTax() {
    const n = Number(tax);
    if (tax.trim() === "" || !Number.isFinite(n) || n < 0 || n > 100) {
      setDirty(false);
      setTax(String(Number(quotation.tax_pct)));
      return;
    }
    if (n !== Number(quotation.tax_pct)) await onUpdate({ tax_pct: n });
    setDirty(false);
  }

  // Preview only while typing; otherwise the numbers are the database's.
  const shown =
    draft && dirty
      ? quotationTotals(
          lines.map((l) => ({ qty: Number(l.qty), unitPriceJod: Number(l.unit_price_jod) })),
          { discountKind: kind, discountValue: Number(value), taxPct: Number(tax) },
        )
      : {
          subtotal: Number(quotation.subtotal_jod),
          discount: Number(quotation.discount_jod),
          tax: Number(quotation.tax_jod),
          total: Number(quotation.total_jod),
        };
  const cost = costSummary(lines);
  const noCost = cost.revenue === 0 && cost.cost === 0;
  const marginPct = cost.revenue > 0 ? ((cost.margin / cost.revenue) * 100).toFixed(1) : null;

  return (
    <div className="card p-5 w-full max-w-sm ms-auto space-y-3">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate">{t("quoteSubtotal")}</dt>
          <dd className="tabular-nums" dir="ltr">{jod(shown.subtotal)}</dd>
        </div>

        {draft && (
        <div className="flex justify-between items-center gap-3">
          <dt className="text-slate">{t("quoteDiscount")}</dt>
          <dd className="flex items-center gap-2">
            {(
              <>
                <select
                  className="input w-20 py-1"
                  disabled={busy}
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as "amount" | "percent";
                    setKind(k);
                    setDirty(true);
                    void saveDiscount(k);
                  }}
                >
                  <option value="percent">{t("quoteDiscountPercent")}</option>
                  <option value="amount">{t("quoteDiscountAmount")}</option>
                </select>
                <input
                  className="input w-24 py-1"
                  type="number"
                  min="0"
                  step="0.001"
                  dir="ltr"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setDirty(true);
                  }}
                  onBlur={() => saveDiscount()}
                />
              </>
            )}
          </dd>
        </div>
        )}
        {(draft || shown.discount !== 0) && (
          <div className="flex justify-between gap-3">
            <dt className="text-slate">
              {t("quoteDiscount")}
              {!draft && quotation.discount_kind === "percent" && (
                <span dir="ltr"> ({Number(quotation.discount_value)} %)</span>
              )}
            </dt>
            <dd className="tabular-nums" dir="ltr">− {jod(shown.discount)}</dd>
          </div>
        )}
        {draft &&
          !dirty &&
          quotation.discount_kind === "amount" &&
          Number(quotation.discount_value) > Number(quotation.subtotal_jod) && (
            <p className="text-rust text-xs">{t("quoteDiscountCapped")}</p>
          )}

        <div className="flex justify-between items-center gap-3">
          <dt className="text-slate">{t("quoteTax")}</dt>
          <dd>
            {draft ? (
              <input
                className="input w-24 py-1"
                type="number"
                min="0"
                max="100"
                step="0.01"
                dir="ltr"
                value={tax}
                onChange={(e) => {
                  setTax(e.target.value);
                  setDirty(true);
                }}
                onBlur={saveTax}
              />
            ) : (
              <span dir="ltr">{Number(quotation.tax_pct)} %</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate">{t("quoteTaxAmount")}</dt>
          <dd className="tabular-nums" dir="ltr">{jod(shown.tax)}</dd>
        </div>

        <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
          <dt>{t("quoteTotal")}</dt>
          <dd className="tabular-nums" dir="ltr">{jod(shown.total)}</dd>
        </div>
        {draft && dirty && <p className="text-xs text-slate text-end">{t("quotePreview")}</p>}
      </dl>

      <div>
        <label className="block text-sm font-medium mb-1">{t("quotePriceDisplay")}</label>
        <select
          className="input"
          disabled={busy}
          value={quotation.price_display}
          onChange={(e) => onUpdate({ price_display: e.target.value })}
        >
          {DISPLAYS.map((d) => (
            <option key={d} value={d}>
              {t(`quoteDisplay_${d}` as TKey)}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-mist rounded-lg p-3 text-xs space-y-1">
        <p className="font-semibold">{t("quoteInternal")}</p>
        <div className="flex justify-between">
          <span>{t("quoteCost")}</span>
          <span className="tabular-nums" dir="ltr">{noCost ? "—" : jod(cost.cost)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t("quoteMargin")}</span>
          <span className={`tabular-nums ${!noCost && cost.margin < 0 ? "text-rust" : ""}`} dir="ltr">
            {noCost ? "—" : jod(cost.margin)}
            {!noCost && marginPct !== null && ` (${marginPct} %)`}
          </span>
        </div>
        {cost.unknownLines > 0 && (
          <p className="text-slate">
            {t("quoteCostUnknown")} <span dir="ltr">{cost.unknownLines}</span>
          </p>
        )}
      </div>
    </div>
  );
}
