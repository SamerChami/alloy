"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";

function whole(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function ManualLineForm({
  quotationId,
  sections,
  nextSortOrder,
  onClose,
  onAdded,
}: {
  quotationId: string;
  sections: string[];
  nextSortOrder: number;
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}) {
  const { t } = useLang();
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [section, setSection] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [d, setD] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(qty);
    const p = Number(price);
    if (!description.trim() || !Number.isFinite(q) || q <= 0 || price.trim() === "" || !Number.isFinite(p) || p < 0) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("quotation_items").insert({
      quotation_id: quotationId,
      description: description.trim(),
      code: code.trim() || null,
      section: section.trim() || null,
      qty: q,
      unit_price_jod: p,
      width_mm: whole(w),
      height_mm: whole(h),
      depth_mm: whole(d),
      notes: notes.trim() || null,
      sort_order: nextSortOrder,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    await onAdded();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4">
      <div className="card w-full max-w-lg my-8 shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold">{t("quoteAddManual")}</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label={t("cancel")}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t("quoteDescription")} *</label>
            <input className="input" required value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("code")}</label>
              <input className="input" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("quoteSection")}</label>
              <input className="input" list="manual-sections" value={section} onChange={(e) => setSection(e.target.value)} />
              <datalist id="manual-sections">
                {sections.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("qty")} *</label>
              <input
                className="input"
                type="number"
                required
                min="0.01"
                step="0.01"
                dir="ltr"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("unitPrice")} *</label>
              <input
                className="input"
                type="number"
                required
                min="0"
                step="0.001"
                dir="ltr"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {(
              [
                ["quoteWidth", w, setW],
                ["quoteHeight", h, setH],
                ["quoteDepth", d, setD],
              ] as const
            ).map(([key, val, set]) => (
              <div key={key}>
                <label className="block text-sm font-medium mb-1">{t(key)}</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  dir="ltr"
                  value={val}
                  onChange={(e) => set(e.target.value)}
                />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("notes")}</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-rust text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "…" : t("add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
