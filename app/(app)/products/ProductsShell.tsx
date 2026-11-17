"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Pencil, ExternalLink, FileUp, Box } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import { PageTitle } from "@/components/ui/blocks";
import { jod } from "@/lib/utils";
import { productSubcategories, type SubcategoryConfig } from "@/lib/catalog";
import type { TKey } from "@/lib/i18n";
import type { PricingSettings } from "@/lib/pricing";
import { ProductForm } from "./ProductForm";
import { PricingSettingsCard } from "./PricingSettingsCard";
import type { Product, ProductBasic } from "./types";
import type { PanelOption, ComponentOption, BandingType } from "./bom_types";

type ListProduct = Product | ProductBasic;

const OTHER: SubcategoryConfig = { value: "Other", en: "Other", ar: "أخرى" };
const ALL_GROUPS = [...productSubcategories, OTHER];

function dims(p: ListProduct): string | null {
  if (!p.width_mm && !p.height_mm && !p.depth_mm) return null;
  return (
    [p.width_mm, p.height_mm, p.depth_mm].map((v) => v ?? "—").join("×") + " mm"
  );
}

function ProductRow({
  p,
  isOffice,
  showInactive,
  onEdit,
}: {
  p: ListProduct;
  isOffice: boolean;
  showInactive: boolean;
  onEdit: (p: ListProduct) => void;
}) {
  const { t } = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReactivate() {
    setBusy(true);
    setError(null);
    const { error: err } = await createClient()
      .from("products")
      .update({ is_active: true })
      .eq("id", p.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    router.refresh();
  }
  const d = dims(p);
  return (
    <tr className="border-b border-line last:border-0 hover:bg-mist/50 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium">{p.name_en}</div>
        {p.name_ar && (
          <div className="text-slate text-xs" dir="rtl">
            {p.name_ar}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-slate tabular-nums text-sm font-mono" dir="ltr">
        {p.code ?? "—"}
      </td>
      <td className="px-4 py-3 text-slate tabular-nums text-sm" dir="ltr">
        {p.sku ?? "—"}
      </td>
      <td className="px-4 py-3 text-slate text-sm">
        {t((`unit_${p.unit}`) as TKey)}
      </td>
      {isOffice && (
        <td className="px-4 py-3 tabular-nums font-medium text-sm" dir="ltr">
          {jod((p as Product).unit_price_jod)}
        </td>
      )}
      <td className="px-4 py-3 text-slate text-sm tabular-nums" dir="ltr">
        {d ?? "—"}
      </td>
      <td className="px-4 py-3">
        {p.drive_url && (
          <a
            href={p.drive_url}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost p-2 inline-flex"
            aria-label={t("driveLink")}
          >
            <ExternalLink size={14} />
          </a>
        )}
      </td>
      {isOffice && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
          <button
            className="btn-ghost p-2"
            onClick={() => onEdit(p)}
            aria-label={t("editProduct")}
          >
            <Pencil size={15} />
          </button>
          {showInactive && (
            <button
              className="btn-ghost text-xs"
              disabled={busy}
              onClick={handleReactivate}
            >
              {t("reactivate")}
            </button>
          )}
          {error && <p className="text-rust text-xs">{error}</p>}
          </div>
        </td>
      )}
    </tr>
  );
}

function ProductTable({
  products,
  isOffice,
  showInactive,
  onEdit,
}: {
  products: ListProduct[];
  isOffice: boolean;
  showInactive: boolean;
  onEdit: (p: ListProduct) => void;
}) {
  const { t } = useLang();
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-mist">
              <th className="text-start px-4 py-3 font-medium">{t("nameEn")}</th>
              <th className="text-start px-4 py-3 font-medium">{t("code")}</th>
              <th className="text-start px-4 py-3 font-medium">{t("sku")}</th>
              <th className="text-start px-4 py-3 font-medium">{t("unit")}</th>
              {isOffice && (
                <th className="text-start px-4 py-3 font-medium">{t("unitPrice")}</th>
              )}
              <th className="text-start px-4 py-3 font-medium">{t("dimensions")}</th>
              <th className="px-4 py-3" />
              {isOffice && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <ProductRow key={p.id} p={p} isOffice={isOffice} showInactive={showInactive} onEdit={onEdit} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProductsShell({
  initialProducts,
  isOffice,
  showInactive,
  panels,
  allComponents,
  bandingTypes,
  pricingSettings,
}: {
  initialProducts: ListProduct[];
  isOffice: boolean;
  showInactive: boolean;
  panels: PanelOption[];
  allComponents: ComponentOption[];
  bandingTypes: BandingType[];
  pricingSettings: PricingSettings;
}) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);

  const subLabel = (sub: SubcategoryConfig) =>
    lang === "ar" ? sub.ar : sub.en;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = initialProducts;
    if (subcategoryFilter)
      list = list.filter((p) => p.subcategory === subcategoryFilter);
    if (q) {
      list = list.filter(
        (p) =>
          p.name_en.toLowerCase().includes(q) ||
          (p.name_ar ?? "").toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.code ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [initialProducts, search, subcategoryFilter]);

  const isFiltering = search.trim() !== "" || subcategoryFilter !== null;

  const grouped = useMemo(() => {
    if (isFiltering) return null;
    const map = new Map<string, ListProduct[]>();
    for (const sub of ALL_GROUPS) map.set(sub.value, []);
    const known = new Set(productSubcategories.map((s) => s.value));
    for (const p of filtered) {
      const key = known.has(p.subcategory ?? "") ? p.subcategory! : "Other";
      map.get(key)?.push(p);
    }
    return map;
  }, [filtered, isFiltering]);

  function openAdd() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEdit(p: ListProduct) {
    // Safe: the edit button is office-only, and office rows are full Product rows.
    setEditTarget(p as Product);
    setFormOpen(true);
  }

  function handleSaved() {
    setFormOpen(false);
    router.refresh();
  }

  return (
    <div>
      <PageTitle titleKey="products" />

      {isOffice && <PricingSettingsCard settings={pricingSettings} />}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={16}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-slate pointer-events-none"
          />
          <input
            className="input ps-9"
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isOffice && (
          <button
            className="btn-ghost"
            onClick={() => router.push(showInactive ? "/products" : "/products?inactive=1")}
          >
            {t(showInactive ? "showActive" : "showDeactivated")}
          </button>
        )}
        {isOffice && !showInactive && (
          <>
            <button
              className="btn-ghost flex items-center gap-2"
              onClick={() => router.push("/products/import")}
            >
              <FileUp size={16} />
              {t("importDxf")}
            </button>
            <button
              className="btn-ghost flex items-center gap-2"
              onClick={() => router.push("/products/import-sketchup-single")}
            >
              <Box size={16} />
              {t("skuImportSingle")}
            </button>
            <button
              className="btn-ghost flex items-center gap-2"
              onClick={() => router.push("/products/import-sketchup-project")}
            >
              <Box size={16} />
              {t("skuImportProject")}
            </button>
            <button
              className="btn-primary flex items-center gap-2"
              onClick={openAdd}
            >
              <Plus size={16} />
              {t("addProduct")}
            </button>
          </>
        )}
      </div>

      {showInactive && (
        <p className="text-sm text-slate mb-4">{t("deactivatedListNote")}</p>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            subcategoryFilter === null
              ? "bg-brass text-white border-brass"
              : "border-line text-slate hover:border-brass hover:text-brass"
          }`}
          onClick={() => setSubcategoryFilter(null)}
        >
          {t("all")}
        </button>
        {productSubcategories.map((sub) => (
          <button
            key={sub.value}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              subcategoryFilter === sub.value
                ? "bg-brass text-white border-brass"
                : "border-line text-slate hover:border-brass hover:text-brass"
            }`}
            onClick={() => setSubcategoryFilter(sub.value)}
          >
            {subLabel(sub)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate">
          <p>{t(showInactive ? "noDeactivated" : "noProducts")}</p>
          {isOffice && !showInactive && (
            <button
              className="btn-primary mt-4 mx-auto flex items-center gap-2"
              onClick={openAdd}
            >
              <Plus size={16} />
              {t("addProduct")}
            </button>
          )}
        </div>
      ) : grouped ? (
        <div className="space-y-8">
          {ALL_GROUPS.map((sub) => {
            const items = grouped.get(sub.value) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={sub.value}>
                <h3 className="text-xs font-semibold text-slate uppercase tracking-wider mb-3">
                  {subLabel(sub)}
                </h3>
                <ProductTable
                  products={items}
                  isOffice={isOffice}
                  showInactive={showInactive}
                  onEdit={openEdit}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <ProductTable products={filtered} isOffice={isOffice} showInactive={showInactive} onEdit={openEdit} />
      )}

      {formOpen && (
        <ProductForm
          product={editTarget}
          panels={panels}
          allComponents={allComponents}
          bandingTypes={bandingTypes}
          pricingSettings={pricingSettings}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
