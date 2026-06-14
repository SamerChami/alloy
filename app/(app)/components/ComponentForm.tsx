"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import { componentSubcategories } from "@/lib/catalog";
import type { TKey } from "@/lib/i18n";
import type { Component } from "./types";

const UNITS = ["pcs", "sheet", "m", "m2", "set", "kg", "roll", "other"] as const;

type FormState = {
  sku: string;
  name_en: string;
  name_ar: string;
  subcategory: string;
  unit: string;
  unit_price_jod: string;
  cost_jod: string;
  track_stock: boolean;
  stock_qty: string;
  reorder_level: string;
  width_mm: string;
  height_mm: string;
  depth_mm: string;
  description: string;
  drive_url: string;
  is_active: boolean;
};

function fromComponent(c: Component | null): FormState {
  return {
    sku: c?.sku ?? "",
    name_en: c?.name_en ?? "",
    name_ar: c?.name_ar ?? "",
    subcategory: c?.subcategory ?? componentSubcategories[0].value,
    unit: c?.unit ?? "pcs",
    unit_price_jod: c?.unit_price_jod != null ? String(c.unit_price_jod) : "",
    cost_jod: c?.cost_jod != null ? String(c.cost_jod) : "",
    track_stock: c?.track_stock ?? true,
    stock_qty: c?.stock_qty != null ? String(c.stock_qty) : "0",
    reorder_level: c?.reorder_level != null ? String(c.reorder_level) : "0",
    width_mm: c?.width_mm != null ? String(c.width_mm) : "",
    height_mm: c?.height_mm != null ? String(c.height_mm) : "",
    depth_mm: c?.depth_mm != null ? String(c.depth_mm) : "",
    description: c?.description ?? "",
    drive_url: c?.drive_url ?? "",
    is_active: c?.is_active ?? true,
  };
}

export function ComponentForm({
  component,
  onClose,
  onSaved,
}: {
  component: Component | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, lang } = useLang();
  const [form, setForm] = useState<FormState>(() => fromComponent(component));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function set(key: keyof FormState) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const payload = {
      sku: form.sku.trim() || null,
      name_en: form.name_en.trim(),
      name_ar: form.name_ar.trim() || null,
      subcategory: form.subcategory,
      unit: form.unit,
      unit_price_jod: parseFloat(form.unit_price_jod) || 0,
      cost_jod: form.cost_jod !== "" ? parseFloat(form.cost_jod) : null,
      track_stock: form.track_stock,
      stock_qty: form.track_stock ? (parseFloat(form.stock_qty) || 0) : 0,
      reorder_level: form.track_stock ? (parseFloat(form.reorder_level) || 0) : 0,
      width_mm: form.width_mm !== "" ? parseFloat(form.width_mm) : null,
      height_mm: form.height_mm !== "" ? parseFloat(form.height_mm) : null,
      depth_mm: form.depth_mm !== "" ? parseFloat(form.depth_mm) : null,
      description: form.description.trim() || null,
      drive_url: form.drive_url.trim() || null,
      is_active: form.is_active,
    };

    if (component?.id) {
      const { error: err } = await supabase
        .from("products")
        .update(payload)
        .eq("id", component.id);
      if (err) { setSaving(false); setError(err.message); return; }
    } else {
      const { error: err } = await supabase
        .from("products")
        .insert({ ...payload, item_kind: "component" });
      if (err) { setSaving(false); setError(err.message); return; }
    }

    setSaving(false);
    onSaved();
  }

  async function handleDeactivate() {
    if (!component?.id) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", component.id);
    if (err) { setSaving(false); setError(err.message); return; }
    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    if (!component?.id) return;
    setDeleting(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("products")
      .delete()
      .eq("id", component.id);
    if (err) {
      setDeleting(false);
      setConfirmDelete(false);
      setError(t("cantDeleteComponent"));
      return;
    }
    setDeleting(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4">
      <div className="card w-full max-w-2xl my-8 shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold">
            {component ? t("editComponent") : t("addComponent")}
          </h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label={t("cancel")}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("nameEn")} *</label>
              <input className="input" required value={form.name_en} onChange={set("name_en")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("nameAr")}</label>
              <input className="input" dir="rtl" value={form.name_ar} onChange={set("name_ar")} />
            </div>
          </div>

          {/* SKU / Subcategory / Unit */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("sku")}</label>
              <input className="input" dir="ltr" value={form.sku} onChange={set("sku")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("subcategory")} *</label>
              <select className="input" required value={form.subcategory} onChange={set("subcategory")}>
                {componentSubcategories.map((s) => (
                  <option key={s.value} value={s.value}>
                    {lang === "ar" ? s.ar : s.en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("unit")} *</label>
              <select className="input" required value={form.unit} onChange={set("unit")}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t((`unit_${u}`) as TKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("unitPrice")} *</label>
              <input
                className="input" type="number" min="0" step="0.001" dir="ltr"
                required value={form.unit_price_jod} onChange={set("unit_price_jod")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("cost")}</label>
              <input
                className="input" type="number" min="0" step="0.001" dir="ltr"
                value={form.cost_jod} onChange={set("cost_jod")}
              />
            </div>
          </div>

          {/* Stock */}
          <div className="border border-line rounded-lg p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox" className="w-4 h-4 accent-brass"
                checked={form.track_stock}
                onChange={(e) => setForm((prev) => ({ ...prev, track_stock: e.target.checked }))}
              />
              <span className="text-sm font-medium">{t("trackStock")}</span>
            </label>
            {form.track_stock && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t("inStock")}</label>
                  <input
                    className="input" type="number" min="0" step="0.01" dir="ltr"
                    value={form.stock_qty} onChange={set("stock_qty")}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t("reorderLevel")}</label>
                  <input
                    className="input" type="number" min="0" step="0.01" dir="ltr"
                    value={form.reorder_level} onChange={set("reorder_level")}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Dimensions */}
          <div>
            <label className="block text-sm font-medium mb-1">{t("dimensions")} (mm)</label>
            <div className="grid grid-cols-3 gap-3">
              <input className="input" type="number" min="0" step="0.01" dir="ltr" placeholder="W" value={form.width_mm} onChange={set("width_mm")} />
              <input className="input" type="number" min="0" step="0.01" dir="ltr" placeholder="H" value={form.height_mm} onChange={set("height_mm")} />
              <input className="input" type="number" min="0" step="0.01" dir="ltr" placeholder="D" value={form.depth_mm} onChange={set("depth_mm")} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">{t("notes")}</label>
            <textarea className="input" rows={2} value={form.description} onChange={set("description")} />
          </div>

          {/* Drive link */}
          <div>
            <label className="block text-sm font-medium mb-1">{t("driveLink")}</label>
            <input
              className="input" type="url" dir="ltr"
              placeholder="https://drive.google.com/…"
              value={form.drive_url} onChange={set("drive_url")}
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox" className="w-4 h-4 accent-brass"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
            />
            <span className="text-sm font-medium">{t("active")}</span>
          </label>

          {error && <p className="text-rust text-sm">{error}</p>}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 pt-2">
            {component && (
              <div className="flex items-center gap-2">
                {!confirmDelete ? (
                  <>
                    <button
                      type="button" className="btn-ghost text-slate text-sm"
                      onClick={handleDeactivate} disabled={saving || !component.is_active}
                    >
                      {t("deactivate")}
                    </button>
                    <button
                      type="button" className="btn-ghost text-rust text-sm"
                      onClick={() => setConfirmDelete(true)} disabled={saving}
                    >
                      {t("delete")}
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-rust">{t("confirmDelete")}?</span>
                    <button
                      type="button" className="btn-ghost text-rust text-sm"
                      onClick={handleDelete} disabled={deleting}
                    >
                      {deleting ? t("deleting") : t("delete")}
                    </button>
                    <button
                      type="button" className="btn-ghost text-sm"
                      onClick={() => setConfirmDelete(false)}
                    >
                      {t("cancel")}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 ms-auto">
              <button type="button" className="btn-ghost" onClick={onClose}>{t("cancel")}</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "…" : t("save")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
