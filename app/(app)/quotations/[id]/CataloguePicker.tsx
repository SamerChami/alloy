"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import { jod } from "@/lib/utils";
import { dimsLabel } from "@/lib/quotations";

export type CatalogueItem = {
  id: string;
  code: string | null;
  name_en: string;
  name_ar: string | null;
  unit: string | null;
  unit_price_jod: number | null;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  item_kind: "product" | "component";
};

export type CatalogueSize = {
  id: string;
  product_id: string;
  label: string | null;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  price_jod: number | null;
};

const MAX_ROWS = 50;

export function CataloguePicker({
  quotationId,
  catalogue,
  sizes,
  sections,
  onClose,
  onAdded,
}: {
  quotationId: string;
  catalogue: CatalogueItem[];
  sizes: CatalogueSize[];
  sections: string[];
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}) {
  const { t, lang } = useLang();
  const [kind, setKind] = useState<"product" | "component">("product");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<CatalogueItem | null>(null);
  const [sizeId, setSizeId] = useState("");
  const [qty, setQty] = useState("1");
  const [section, setSection] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogue
      .filter((p) => p.item_kind === kind)
      .filter(
        (p) =>
          !q ||
          (p.code ?? "").toLowerCase().includes(q) ||
          p.name_en.toLowerCase().includes(q) ||
          (p.name_ar ?? "").toLowerCase().includes(q),
      )
      .slice(0, MAX_ROWS);
  }, [catalogue, kind, search]);

  const chosenSizes = chosen ? sizes.filter((s) => s.product_id === chosen.id) : [];
  const nameOf = (p: CatalogueItem) => (lang === "ar" && p.name_ar ? p.name_ar : p.name_en);

  function choose(p: CatalogueItem) {
    setChosen(p);
    setSizeId("");
    setError(null);
  }

  async function add() {
    if (busy) return;
    if (!chosen) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // The price always comes from the database function, never from here.
    const { error: err } = await supabase.rpc("quotation_add_product", {
      p_quotation_id: quotationId,
      p_product_id: chosen.id,
      p_size_id: sizeId || null,
      p_qty: n,
      p_section: section.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    await onAdded();
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4">
      <div className="card w-full max-w-2xl my-8 shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold">{t("quoteAddFromCatalogue")}</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label={t("cancel")}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="input flex-1 min-w-[12rem]"
              placeholder={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex gap-2">
              {(["product", "component"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    kind === k ? "bg-ink text-mist border-ink" : "border-line text-slate hover:bg-mist"
                  }`}
                >
                  {k === "product" ? t("products") : t("components")}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-line rounded-lg max-h-96 overflow-y-auto divide-y divide-line">
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => choose(p)}
                className={`w-full text-start px-3 py-2 text-sm flex items-center gap-3 hover:bg-mist/60 ${
                  chosen?.id === p.id ? "bg-mist" : ""
                }`}
              >
                <span className="w-36 shrink-0 font-medium truncate" title={p.code ?? ""} dir="ltr">{p.code ?? ""}</span>
                <span className="flex-1 min-w-0 truncate" title={nameOf(p)}>{nameOf(p)}</span>
                <span className="text-xs text-slate shrink-0" dir="ltr">
                  {dimsLabel(p.width_mm, p.height_mm, p.depth_mm)}
                </span>
                <span className="text-end tabular-nums shrink-0" dir="ltr">
                  {jod(p.unit_price_jod)}
                  {Number(p.unit_price_jod ?? 0) === 0 && (
                    <span className="block text-rust text-xs">{t("quotePriceZero")}</span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {chosen && (
            <fieldset disabled={busy} className="contents">
            <div className="rounded-lg bg-mist p-4 space-y-3">
              <p className="text-sm font-medium">
                <span dir="ltr">{chosen.code}</span> — {nameOf(chosen)}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {chosen.item_kind === "product" && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium mb-1">{t("quoteSize")}</label>
                    <select className="input" value={sizeId} onChange={(e) => setSizeId(e.target.value)}>
                      <option value="">
                        {t("quoteAsInCatalogue")} — {dimsLabel(chosen.width_mm, chosen.height_mm, chosen.depth_mm)}{" "}
                        — {jod(chosen.unit_price_jod)}
                      </option>
                      {chosenSizes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label ? `${s.label} — ` : ""}
                          {dimsLabel(s.width_mm, s.height_mm, s.depth_mm)} — {jod(s.price_jod)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">{t("qty")}</label>
                  <input
                    className="input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    dir="ltr"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("quoteSection")}</label>
                  <input
                    className="input"
                    list="picker-sections"
                    placeholder={t("quoteSectionHint")}
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                  />
                  <datalist id="picker-sections">
                    {sections.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>
              {error && <p className="text-rust text-sm">{error}</p>}
              <div className="flex items-center justify-end gap-3">
                {added && <span className="text-sage text-sm">{t("quoteAdded")}</span>}
                <button type="button" className="btn-primary" disabled={busy} onClick={add}>
                  {busy ? "…" : t("add")}
                </button>
              </div>
            </div>
            </fieldset>
          )}
        </div>
      </div>
    </div>
  );
}
