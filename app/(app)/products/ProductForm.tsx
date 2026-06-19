"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import { jod } from "@/lib/utils";
import { productSubcategories } from "@/lib/catalog";
import {
  panelPricePerM2,
  panelPartCost,
  componentPartCost,
  rollup,
} from "@/lib/pricing";
import type { TKey } from "@/lib/i18n";
import dynamic from "next/dynamic";
import { BomSection, newBomKey, emptyPanelLine, emptyComponentLine } from "./BomSection";
import type { BomLineState, PanelOption, ComponentOption, BandingType, Cut } from "./bom_types";
import type { Product } from "./types";
import type { RawPanel3D } from "@/lib/cabinet3d";

const Cabinet3D = dynamic(
  () => import("@/components/Cabinet3D").then(m => ({ default: m.Cabinet3D })),
  { ssr: false, loading: () => <div className="h-[400px] border border-line rounded-lg" /> },
);

const UNITS = ["pcs", "sheet", "m", "m2", "set", "kg", "roll", "other"] as const;

type FormState = {
  sku: string;
  name_en: string;
  name_ar: string;
  subcategory: string;
  unit: string;
  unit_price_jod: string;
  cost_jod: string;
  width_mm: string;
  height_mm: string;
  depth_mm: string;
  description: string;
  drive_url: string;
  is_active: boolean;
  labor_jod: string;
  margin_pct: string;
  price_overridden: boolean;
  is_template: boolean;
};

function fromProduct(p: Product | null): FormState {
  return {
    sku: p?.sku ?? "",
    name_en: p?.name_en ?? "",
    name_ar: p?.name_ar ?? "",
    subcategory: p?.subcategory ?? productSubcategories[0].value,
    unit: p?.unit ?? "pcs",
    unit_price_jod: p?.unit_price_jod != null ? String(p.unit_price_jod) : "",
    cost_jod: p?.cost_jod != null ? String(p.cost_jod) : "",
    width_mm: p?.width_mm != null ? String(p.width_mm) : "",
    height_mm: p?.height_mm != null ? String(p.height_mm) : "",
    depth_mm: p?.depth_mm != null ? String(p.depth_mm) : "",
    description: p?.description ?? "",
    drive_url: p?.drive_url ?? "",
    is_active: p?.is_active ?? true,
    labor_jod: p?.labor_jod != null ? String(p.labor_jod) : "0",
    margin_pct: p?.margin_pct != null ? String(p.margin_pct) : "0",
    price_overridden: p?.price_overridden ?? false,
    is_template: p?.is_template ?? true,
  };
}

function dbLineToBomState(row: Record<string, unknown>): BomLineState {
  return {
    _key: newBomKey(),
    id: row.id as string,
    line_type: row.line_type as "panel" | "component",
    panel_id: (row.panel_id as string | null) ?? "",
    part_name: (row.part_name as string | null) ?? "",
    width_mm: row.width_mm != null ? String(row.width_mm) : "",
    height_mm: row.height_mm != null ? String(row.height_mm) : "",
    banding_type_id: (row.banding_type_id as string | null) ?? "",
    banded_length_m: row.banded_length_m != null ? String(row.banded_length_m) : "0",
    component_id: (row.component_id as string | null) ?? "",
    qty: row.qty != null ? String(row.qty) : "1",
    part_role: (row.part_role as string | null) ?? "",
    depth_mm: row.depth_mm != null ? String(row.depth_mm) : "",
    pos_offset_mm: row.pos_offset_mm != null ? String(row.pos_offset_mm) : "",
    pos_x_mm: row.pos_x_mm != null ? String(row.pos_x_mm) : "",
    pos_y_mm: row.pos_y_mm != null ? String(row.pos_y_mm) : "",
    pos_z_mm: row.pos_z_mm != null ? String(row.pos_z_mm) : "",
    // v4 cut data: parse jsonb back to typed array; undefined when column is null (v3 source)
    cuts: row.cuts_json != null ? (row.cuts_json as Cut[]) : undefined,
    cutWarning: (row.cut_warning as string | null) ?? undefined,
  };
}

function bomStateToInsert(line: BomLineState, productId: string, idx: number) {
  return {
    product_id: productId,
    line_type: line.line_type,
    panel_id: line.panel_id || null,
    part_name: line.part_name.trim() || null,
    width_mm: line.width_mm !== "" ? parseFloat(line.width_mm) : null,
    height_mm: line.height_mm !== "" ? parseFloat(line.height_mm) : null,
    banding_type_id: line.banding_type_id || null,
    banded_length_m: parseFloat(line.banded_length_m) || 0,
    component_id: line.component_id || null,
    qty: parseFloat(line.qty) || 1,
    sort_order: idx,
    part_role: line.part_role || null,
    depth_mm: line.depth_mm !== "" ? parseFloat(line.depth_mm) : null,
    pos_offset_mm: line.pos_offset_mm !== "" ? parseFloat(line.pos_offset_mm) : null,
    pos_x_mm: line.pos_x_mm !== "" && line.pos_x_mm != null ? parseFloat(line.pos_x_mm) : null,
    pos_y_mm: line.pos_y_mm !== "" && line.pos_y_mm != null ? parseFloat(line.pos_y_mm) : null,
    pos_z_mm: line.pos_z_mm !== "" && line.pos_z_mm != null ? parseFloat(line.pos_z_mm) : null,
  };
}

export function ProductForm({
  product,
  panels,
  allComponents,
  bandingTypes,
  onClose,
  onSaved,
}: {
  product: Product | null;
  panels: PanelOption[];
  allComponents: ComponentOption[];
  bandingTypes: BandingType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, lang } = useLang();
  const [form, setForm] = useState<FormState>(() => fromProduct(product));
  const [bomLines, setBomLines] = useState<BomLineState[]>([]);
  const [loadingBom, setLoadingBom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load BOM lines for existing product
  useEffect(() => {
    if (!product?.id) { setBomLines([]); return; }
    setLoadingBom(true);
    const supabase = createClient();
    supabase
      .from("bom_lines")
      .select("*")
      .eq("product_id", product.id)
      .order("sort_order")
      .then(({ data }) => {
        const lines = (data ?? []).map(dbLineToBomState);
        setBomLines(lines);
        setLoadingBom(false);
        // debug: report how many cuts were loaded (remove after 8b ships)
        const cutsTotal = lines.reduce((n, l) => n + (l.cuts?.length ?? 0), 0);
        const panelsWithCuts = lines.filter((l) => (l.cuts?.length ?? 0) > 0).length;
        if (cutsTotal > 0) {
          console.debug(`[cuts] ${cutsTotal} cuts across ${panelsWithCuts} panels`);
        }
      });
  }, [product?.id]);

  // Compute rollup live from BOM lines + labor + margin
  const rollupResult = useMemo(() => {
    const panelCosts = bomLines
      .filter((l) => l.line_type === "panel")
      .map((l) => {
        const panel = panels.find((p) => p.id === l.panel_id);
        if (!panel?.sheet_length_mm || !panel?.sheet_width_mm || !panel?.sheet_price_jod)
          return { material: 0, banding: 0 };
        const ppm2 = panelPricePerM2(
          panel.sheet_length_mm,
          panel.sheet_width_mm,
          panel.sheet_price_jod,
        );
        const bt = bandingTypes.find((b) => b.id === l.banding_type_id);
        return panelPartCost({
          widthMm: parseFloat(l.width_mm) || 0,
          heightMm: parseFloat(l.height_mm) || 0,
          qty: parseFloat(l.qty) || 0,
          pricePerM2: ppm2,
          bandedLenM: parseFloat(l.banded_length_m) || 0,
          bandingRate: bt?.price_per_m_jod ?? 0,
        });
      });

    const componentCosts = bomLines
      .filter((l) => l.line_type === "component")
      .map((l) => {
        const comp = allComponents.find((c) => c.id === l.component_id);
        return componentPartCost(comp?.unit_price_jod ?? 0, parseFloat(l.qty) || 0);
      });

    return rollup(panelCosts, componentCosts, {
      laborJod: parseFloat(form.labor_jod) || 0,
      marginPct: parseFloat(form.margin_pct) || 0,
    });
  }, [bomLines, panels, allComponents, bandingTypes, form.labor_jod, form.margin_pct]);

  // Build real-position panel array when BOM lines have saved 3D positions
  const rawPanels3D = useMemo<RawPanel3D[] | undefined>(() => {
    const positioned = bomLines.filter(
      l => l.line_type === "panel" &&
        l.pos_x_mm !== "" && l.pos_x_mm != null &&
        l.pos_y_mm !== "" && l.pos_y_mm != null &&
        l.pos_z_mm !== "" && l.pos_z_mm != null,
    );
    if (positioned.length === 0) return undefined;
    return positioned.map(l => ({
      part_role: l.part_role || "other",
      width_mm:     parseFloat(l.width_mm)  || 0,
      height_mm:    parseFloat(l.height_mm) || 0,
      thickness_mm: parseFloat(l.depth_mm)  || 18,
      pos: {
        x: parseFloat(l.pos_x_mm!),
        y: parseFloat(l.pos_y_mm!),
        z: parseFloat(l.pos_z_mm!),
      },
    }));
  }, [bomLines]);

  // Auto-fill unit price from rollup when not overridden and BOM has loaded
  useEffect(() => {
    if (!form.price_overridden && !loadingBom) {
      setForm((prev) => ({
        ...prev,
        unit_price_jod: String(rollupResult.calcPrice),
      }));
    }
  }, [rollupResult.calcPrice, form.price_overridden, loadingBom]);

  function set(key: keyof FormState) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function buildPayload(pricingOverride?: number) {
    const finalPrice =
      form.price_overridden
        ? (parseFloat(form.unit_price_jod) || 0)
        : (pricingOverride ?? rollupResult.calcPrice);
    return {
      sku: form.sku.trim() || null,
      name_en: form.name_en.trim(),
      name_ar: form.name_ar.trim() || null,
      subcategory: form.subcategory,
      unit: form.unit,
      unit_price_jod: finalPrice,
      cost_jod: form.cost_jod !== "" ? parseFloat(form.cost_jod) : null,
      width_mm: form.width_mm !== "" ? parseFloat(form.width_mm) : null,
      height_mm: form.height_mm !== "" ? parseFloat(form.height_mm) : null,
      depth_mm: form.depth_mm !== "" ? parseFloat(form.depth_mm) : null,
      description: form.description.trim() || null,
      drive_url: form.drive_url.trim() || null,
      is_active: form.is_active,
      labor_jod: parseFloat(form.labor_jod) || 0,
      margin_pct: parseFloat(form.margin_pct) || 0,
      price_overridden: form.price_overridden,
      is_template: form.is_template,
      materials_cost_jod: rollupResult.materials,
      components_cost_jod: rollupResult.components,
      base_cost_jod: rollupResult.base,
    };
  }

  async function saveBomLines(productId: string) {
    const supabase = createClient();
    await supabase.from("bom_lines").delete().eq("product_id", productId);
    if (bomLines.length > 0) {
      const { error: err } = await supabase
        .from("bom_lines")
        .insert(bomLines.map((l, i) => bomStateToInsert(l, productId, i)));
      if (err) return err.message;
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const supabase = createClient();

    if (product?.id) {
      const { error: err } = await supabase
        .from("products")
        .update(buildPayload())
        .eq("id", product.id);
      if (err) { setSaving(false); setError(err.message); return; }
      const bomErr = await saveBomLines(product.id);
      if (bomErr) { setSaving(false); setError(bomErr); return; }
    } else {
      const { data: inserted, error: err } = await supabase
        .from("products")
        .insert({ ...buildPayload(), item_kind: "product" })
        .select("id")
        .single();
      if (err || !inserted) { setSaving(false); setError(err?.message ?? "Insert failed"); return; }
      const bomErr = await saveBomLines(inserted.id);
      if (bomErr) { setSaving(false); setError(bomErr); return; }
    }

    setSaving(false);
    onSaved();
  }

  async function handleDeactivate() {
    if (!product?.id) return;
    setSaving(true);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", product.id);
    if (err) { setSaving(false); setError(err.message); return; }
    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    if (!product?.id) return;
    setDeleting(true);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id);
    if (err) {
      setDeleting(false);
      setConfirmDelete(false);
      setError(t("cantDeleteProduct"));
      return;
    }
    setDeleting(false);
    onSaved();
  }

  async function handleDuplicate() {
    if (!product?.id) return;
    setDuplicating(true);
    setError(null);
    const supabase = createClient();

    const { data: newProd, error: err1 } = await supabase
      .from("products")
      .insert({
        ...buildPayload(),
        name_en: form.name_en.trim() + " (copy)",
        sku: null,
        item_kind: "product",
        is_template: true,
      })
      .select("id")
      .single();

    if (err1 || !newProd) {
      setDuplicating(false);
      setError(err1?.message ?? "Duplicate failed");
      return;
    }

    const bomErr = await saveBomLines(newProd.id);
    if (bomErr) { setDuplicating(false); setError(bomErr); return; }

    setDuplicating(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4">
      <div className="card w-full max-w-4xl my-8 shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold">
            {product ? t("editProduct") : t("addProduct")}
          </h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label={t("cancel")}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* ── Basic info ── */}
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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("sku")}</label>
              <input className="input" dir="ltr" value={form.sku} onChange={set("sku")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("subcategory")} *</label>
              <select className="input" required value={form.subcategory} onChange={set("subcategory")}>
                {productSubcategories.map((s) => (
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
                  <option key={u} value={u}>{t((`unit_${u}`) as TKey)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── BOM section ── */}
          {loadingBom ? (
            <div className="border border-line rounded-lg p-6 text-center text-slate text-sm">
              {t("duplicating").replace("…", "")}{" "}…
            </div>
          ) : (
            <BomSection
              lines={bomLines}
              onChange={setBomLines}
              panels={panels}
              allComponents={allComponents}
              bandingTypes={bandingTypes}
            />
          )}

          {/* ── 3D preview ── */}
          {bomLines.some(l => l.line_type === "panel") && (
            <Cabinet3D
              cabinetWidth={parseFloat(form.width_mm)  || 0}
              cabinetHeight={parseFloat(form.height_mm) || 0}
              cabinetDepth={parseFloat(form.depth_mm)  || 0}
              parts={bomLines}
              rawPanels={rawPanels3D}
            />
          )}

          {/* ── Pricing rollup ── */}
          <div className="border border-line rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate">{t("materialsCostJod")}</div>
                <div className="font-medium" dir="ltr">{jod(rollupResult.materials)}</div>
              </div>
              <div>
                <div className="text-xs text-slate">{t("componentsCostJod")}</div>
                <div className="font-medium" dir="ltr">{jod(rollupResult.components)}</div>
              </div>
              <div>
                <div className="text-xs text-slate">{t("baseCost")}</div>
                <div className="font-semibold" dir="ltr">{jod(rollupResult.base)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t("laborJod")}</label>
                <input
                  className="input" type="number" min="0" step="0.001" dir="ltr"
                  value={form.labor_jod} onChange={set("labor_jod")}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t("marginPct")}</label>
                <input
                  className="input" type="number" min="0" step="0.01" dir="ltr"
                  value={form.margin_pct} onChange={set("margin_pct")}
                />
              </div>
            </div>

            <div className="border-t border-line pt-3 flex items-end gap-4 flex-wrap">
              <div className="flex-1">
                <div className="text-xs text-slate mb-0.5">{t("calculatedPrice")}</div>
                <div className="text-2xl font-bold text-brass" dir="ltr">
                  {jod(rollupResult.calcPrice)}
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">{t("unitPrice")}</label>
                <div className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    type="number" min="0" step="0.001" dir="ltr"
                    required
                    disabled={!form.price_overridden}
                    value={form.unit_price_jod}
                    onChange={set("unit_price_jod")}
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-brass"
                      checked={form.price_overridden}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          price_overridden: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-sm">{t("overridePrice")}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* ── Other fields ── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("cost")}</label>
              <input
                className="input" type="number" min="0" step="0.001" dir="ltr"
                value={form.cost_jod} onChange={set("cost_jod")}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t("dimensions")} (mm)</label>
            <div className="grid grid-cols-3 gap-3">
              <input className="input" type="number" min="0" step="0.01" dir="ltr" placeholder="W" value={form.width_mm} onChange={set("width_mm")} />
              <input className="input" type="number" min="0" step="0.01" dir="ltr" placeholder="H" value={form.height_mm} onChange={set("height_mm")} />
              <input className="input" type="number" min="0" step="0.01" dir="ltr" placeholder="D" value={form.depth_mm} onChange={set("depth_mm")} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t("notes")}</label>
            <textarea className="input" rows={2} value={form.description} onChange={set("description")} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t("driveLink")}</label>
            <input
              className="input" type="url" dir="ltr"
              placeholder="https://drive.google.com/…"
              value={form.drive_url} onChange={set("drive_url")}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox" className="w-4 h-4 accent-brass"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              <span className="text-sm font-medium">{t("active")}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox" className="w-4 h-4 accent-brass"
                checked={form.is_template}
                onChange={(e) => setForm((p) => ({ ...p, is_template: e.target.checked }))}
              />
              <span className="text-sm font-medium">{t("isTemplate")}</span>
            </label>
          </div>

          {error && <p className="text-rust text-sm">{error}</p>}

          {/* ── Footer ── */}
          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <div className="flex items-center gap-2">
              {product && (
                <>
                  {/* Duplicate */}
                  <button
                    type="button"
                    className="btn-ghost text-sm flex items-center gap-1.5"
                    onClick={handleDuplicate}
                    disabled={duplicating || saving}
                  >
                    <Copy size={14} />
                    {duplicating ? t("duplicating") : t("duplicate")}
                  </button>

                  {/* Deactivate / Delete */}
                  {!confirmDelete ? (
                    <>
                      <button
                        type="button" className="btn-ghost text-slate text-sm"
                        onClick={handleDeactivate} disabled={saving || !product.is_active}
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
                </>
              )}
            </div>

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
