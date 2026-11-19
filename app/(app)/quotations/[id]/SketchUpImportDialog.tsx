"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import { jod } from "@/lib/utils";
import { dimsLabel, type QuotationItemRow } from "@/lib/quotations";
import { loadComponentRefs } from "@/lib/catalogImport";
import { isSupportedSchema, type V3Json } from "@/lib/sketchup/parseV3";
import {
  defaultSection,
  previewSummary,
  projectToQuoteItems,
  type QuoteImportItem,
  type QuotePreviewRow,
} from "@/lib/quoteImport";

export function SketchUpImportDialog({
  quotationId,
  sections,
  lines,
  onClose,
  onImported,
}: {
  quotationId: string;
  sections: string[];
  lines: QuotationItemRow[];
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const { t, lang } = useLang();
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<QuoteImportItem[]>([]);
  const [rows, setRows] = useState<QuotePreviewRow[] | null>(null);
  const [section, setSection] = useState("");
  const [replace, setReplace] = useState(false);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fileRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setRows(null);
    setItems([]);
    setError(null);
    setReplace(false);
    if (!file) return;
    setReading(true);
    try {
      const json = JSON.parse(await file.text()) as V3Json;
      if (!isSupportedSchema(json.schema) || !Array.isArray(json.roots)) {
        setError(t("skuInvalidFileV3"));
        return;
      }
      const supabase = createClient();
      const components = await loadComponentRefs(supabase);
      const list = projectToQuoteItems(json, components);
      if (list.length === 0) {
        setError(t("quoteImportNoItems"));
        return;
      }
      const { data, error: err } = await supabase.rpc("quote_import_preview", { p_items: list });
      if (err) {
        setError(err.message);
        return;
      }
      setItems(list);
      setRows((data ?? []) as QuotePreviewRow[]);
      setSection(defaultSection(json.model, file.name));
    } catch {
      setError(t("skuInvalidFileV3"));
    } finally {
      setReading(false);
    }
  }

  const trimmed = section.trim();
  const sectionLines = trimmed === "" ? 0 : lines.filter((l) => l.section === trimmed).length;
  const canReplace = sectionLines > 0;
  const doReplace = canReplace && replace;

  async function doImport() {
    if (busy || !rows) return;
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().rpc("quotation_import_items", {
      p_quotation_id: quotationId,
      p_items: items,
      p_section: trimmed || null,
      p_replace_section: doReplace,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    await onImported();
    setBusy(false);
    onClose();
  }

  const summary = rows ? previewSummary(rows) : null;
  const th = "text-start px-2 py-2 font-medium whitespace-nowrap";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4">
      <div className="card w-full max-w-4xl my-8 shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold">{t("quoteImportTitle")}</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} disabled={busy} aria-label={t("cancel")}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label htmlFor={`${uid}-file`} className="block text-sm font-medium mb-1">
              {t("quoteImportFile")}
            </label>
            <input
              id={`${uid}-file`}
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="input"
              disabled={busy}
              onChange={onFile}
            />
          </div>

          {reading && <p className="text-sm text-slate">{t("quoteImportReading")}</p>}

          {rows && summary && (
            <>
              <div className="border border-line rounded-lg max-h-[50vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-mist">
                      <th className={th}>#</th>
                      <th className={th}>{t("quoteItemNo")}</th>
                      <th className={th}>{t("code")}</th>
                      <th className={th}>{t("quoteDescription")}</th>
                      <th className={th}>{t("quoteSizeShort")}</th>
                      <th className={th}>{t("quoteImportHow")}</th>
                      <th className={`${th} text-end`}>{t("unitPrice")}</th>
                      <th className={th}>{t("quoteImportNote")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const name =
                        r.status === "unknown"
                          ? (r.description ?? "")
                          : lang === "ar" && r.name_ar
                            ? r.name_ar
                            : (r.name_en ?? "");
                      return (
                        <tr key={r.idx} className="border-b border-line align-top">
                          <td className="px-2 py-2 text-slate tabular-nums" dir="ltr">{r.idx}</td>
                          <td className="px-2 py-2 whitespace-nowrap" dir="ltr">{r.item_no ?? ""}</td>
                          <td className="px-2 py-2 whitespace-nowrap" dir="ltr">{r.code ?? ""}</td>
                          <td className="px-2 py-2 min-w-[10rem]">{name}</td>
                          <td className="px-2 py-2 text-slate whitespace-nowrap" dir="ltr">
                            {dimsLabel(r.width_mm, r.height_mm, r.depth_mm)}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {r.status === "standard" && t("quoteImportStandard")}
                            {r.status === "parts" && t("quoteImportParts")}
                            {r.status === "unknown" && (
                              <span className="text-rust font-medium">{t("quoteImportUnknown")}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-end tabular-nums whitespace-nowrap" dir="ltr">
                            {r.status === "unknown" ? "—" : jod(r.list_price_jod)}
                          </td>
                          <td className="px-2 py-2">
                            {r.warning && (
                              <span className="text-rust text-xs" dir="ltr">{r.warning}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-slate">
                {t("quoteImportSummary")
                  .replace("{items}", String(summary.items))
                  .replace("{standard}", String(summary.standard))
                  .replace("{parts}", String(summary.parts))
                  .replace("{unknown}", String(summary.unknown))
                  .replace("{warnings}", String(summary.warnings))
                  .replace("{total}", jod(summary.total_jod))}
              </p>

              <div>
                <label htmlFor={`${uid}-section`} className="block text-sm font-medium mb-1">
                  {t("quoteSection")}
                </label>
                <input
                  id={`${uid}-section`}
                  className="input"
                  list={`${uid}-sections`}
                  placeholder={t("quoteSectionHint")}
                  value={section}
                  disabled={busy}
                  onChange={(e) => setSection(e.target.value)}
                />
                <datalist id={`${uid}-sections`}>
                  {sections.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              {canReplace && (
                <div className="space-y-1" role="radiogroup">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`${uid}-mode`}
                      checked={!replace}
                      disabled={busy}
                      onChange={() => setReplace(false)}
                    />
                    {t("quoteImportAddTo")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`${uid}-mode`}
                      checked={replace}
                      disabled={busy}
                      onChange={() => setReplace(true)}
                    />
                    {t("quoteImportReplace")}
                  </label>
                  {replace && (
                    <p className="text-rust text-xs">
                      {t("quoteImportReplaceNote").replace("{n}", String(sectionLines))}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {error && <p className="text-rust text-sm">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="button" className="btn-primary" disabled={!rows || busy} onClick={doImport}>
              {busy ? "…" : t("quoteImportDo")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
