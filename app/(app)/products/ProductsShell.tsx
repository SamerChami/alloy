"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Pencil, ExternalLink } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { PageTitle } from "@/components/ui/blocks";
import { jod } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import { ProductForm } from "./ProductForm";
import type { Product, ProductCategory } from "./types";

const CATEGORIES: ProductCategory[] = [
  "cabinet",
  "panel",
  "material",
  "accessory",
  "fitting",
  "appliance",
  "other",
];

function dims(p: Product): string | null {
  if (!p.width_mm && !p.height_mm && !p.depth_mm) return null;
  return (
    [p.width_mm, p.height_mm, p.depth_mm].map((v) => v ?? "—").join("×") + " mm"
  );
}

function ProductRow({
  p,
  isOffice,
  onEdit,
}: {
  p: Product;
  isOffice: boolean;
  onEdit: (p: Product) => void;
}) {
  const { t } = useLang();
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
      <td className="px-4 py-3 text-slate tabular-nums text-sm" dir="ltr">
        {p.sku ?? "—"}
      </td>
      <td className="px-4 py-3 text-slate text-sm">
        {t((`unit_${p.unit}`) as TKey)}
      </td>
      <td className="px-4 py-3 tabular-nums font-medium text-sm" dir="ltr">
        {jod(p.unit_price_jod)}
      </td>
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
          <button
            className="btn-ghost p-2"
            onClick={() => onEdit(p)}
            aria-label={t("editProduct")}
          >
            <Pencil size={15} />
          </button>
        </td>
      )}
    </tr>
  );
}

function ProductTable({
  products,
  isOffice,
  onEdit,
}: {
  products: Product[];
  isOffice: boolean;
  onEdit: (p: Product) => void;
}) {
  const { t } = useLang();
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-mist">
              <th className="text-start px-4 py-3 font-medium">{t("nameEn")}</th>
              <th className="text-start px-4 py-3 font-medium">{t("sku")}</th>
              <th className="text-start px-4 py-3 font-medium">{t("unit")}</th>
              <th className="text-start px-4 py-3 font-medium">{t("unitPrice")}</th>
              <th className="text-start px-4 py-3 font-medium">{t("dimensions")}</th>
              <th className="px-4 py-3" />
              {isOffice && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <ProductRow key={p.id} p={p} isOffice={isOffice} onEdit={onEdit} />
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
}: {
  initialProducts: Product[];
  isOffice: boolean;
}) {
  const { t } = useLang();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = initialProducts;
    if (categoryFilter) list = list.filter((p) => p.category === categoryFilter);
    if (q) {
      list = list.filter(
        (p) =>
          p.name_en.toLowerCase().includes(q) ||
          (p.name_ar ?? "").toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [initialProducts, search, categoryFilter]);

  const isFiltering = search.trim() !== "" || categoryFilter !== null;

  const grouped = useMemo(() => {
    if (isFiltering) return null;
    const map = new Map<ProductCategory, Product[]>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const p of filtered) map.get(p.category)?.push(p);
    return map;
  }, [filtered, isFiltering]);

  function openAdd() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEdit(p: Product) {
    setEditTarget(p);
    setFormOpen(true);
  }

  function handleSaved() {
    setFormOpen(false);
    router.refresh();
  }

  return (
    <div>
      <PageTitle titleKey="products" />

      {/* Toolbar */}
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
            className="btn-primary flex items-center gap-2"
            onClick={openAdd}
          >
            <Plus size={16} />
            {t("addProduct")}
          </button>
        )}
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            categoryFilter === null
              ? "bg-brass text-white border-brass"
              : "border-line text-slate hover:border-brass hover:text-brass"
          }`}
          onClick={() => setCategoryFilter(null)}
        >
          {t("all")}
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              categoryFilter === cat
                ? "bg-brass text-white border-brass"
                : "border-line text-slate hover:border-brass hover:text-brass"
            }`}
            onClick={() => setCategoryFilter(cat)}
          >
            {t((`cat_${cat}`) as TKey)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate">
          <p>{t("noProducts")}</p>
          {isOffice && (
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
          {CATEGORIES.map((cat) => {
            const items = grouped.get(cat) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-slate uppercase tracking-wider mb-3">
                  {t((`cat_${cat}`) as TKey)}
                </h3>
                <ProductTable
                  products={items}
                  isOffice={isOffice}
                  onEdit={openEdit}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <ProductTable products={filtered} isOffice={isOffice} onEdit={openEdit} />
      )}

      {formOpen && (
        <ProductForm
          product={editTarget}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
