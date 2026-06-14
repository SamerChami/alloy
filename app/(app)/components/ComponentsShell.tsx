"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Pencil, ExternalLink } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { PageTitle } from "@/components/ui/blocks";
import { jod } from "@/lib/utils";
import { componentSubcategories, type SubcategoryConfig } from "@/lib/catalog";
import type { TKey } from "@/lib/i18n";
import { ComponentForm } from "./ComponentForm";
import type { Component } from "./types";

const OTHER: SubcategoryConfig = { value: "Other", en: "Other", ar: "أخرى" };
const ALL_GROUPS = [...componentSubcategories, OTHER];

function ComponentRow({
  c,
  isOffice,
  onEdit,
}: {
  c: Component;
  isOffice: boolean;
  onEdit: (c: Component) => void;
}) {
  const { t } = useLang();
  const isLow = c.track_stock && c.stock_qty <= c.reorder_level;

  return (
    <tr className="border-b border-line last:border-0 hover:bg-mist/50 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium">{c.name_en}</div>
        {c.name_ar && (
          <div className="text-slate text-xs" dir="rtl">
            {c.name_ar}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-slate tabular-nums text-sm" dir="ltr">
        {c.sku ?? "—"}
      </td>
      <td className="px-4 py-3 text-slate text-sm">
        {t((`unit_${c.unit}`) as TKey)}
      </td>
      <td className="px-4 py-3 tabular-nums font-medium text-sm" dir="ltr">
        {jod(c.unit_price_jod)}
      </td>
      <td className="px-4 py-3 text-sm">
        {c.track_stock ? (
          <span className="flex items-center gap-2 flex-wrap">
            <span className="tabular-nums" dir="ltr">{c.stock_qty}</span>
            {isLow && (
              <span className="bg-rust/10 text-rust text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                {t("lowStockBadge")}
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-slate tabular-nums text-sm" dir="ltr">
        {c.track_stock ? c.reorder_level : "—"}
      </td>
      <td className="px-4 py-3">
        {c.drive_url && (
          <a
            href={c.drive_url}
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
            onClick={() => onEdit(c)}
            aria-label={t("editComponent")}
          >
            <Pencil size={15} />
          </button>
        </td>
      )}
    </tr>
  );
}

function ComponentTable({
  components,
  isOffice,
  onEdit,
}: {
  components: Component[];
  isOffice: boolean;
  onEdit: (c: Component) => void;
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
              <th className="text-start px-4 py-3 font-medium">{t("inStock")}</th>
              <th className="text-start px-4 py-3 font-medium">{t("reorderLevel")}</th>
              <th className="px-4 py-3" />
              {isOffice && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {components.map((c) => (
              <ComponentRow key={c.id} c={c} isOffice={isOffice} onEdit={onEdit} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ComponentsShell({
  initialComponents,
  isOffice,
}: {
  initialComponents: Component[];
  isOffice: boolean;
}) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Component | null>(null);

  const subLabel = (sub: SubcategoryConfig) => lang === "ar" ? sub.ar : sub.en;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = initialComponents;
    if (subcategoryFilter) list = list.filter((c) => c.subcategory === subcategoryFilter);
    if (q) {
      list = list.filter(
        (c) =>
          c.name_en.toLowerCase().includes(q) ||
          (c.name_ar ?? "").toLowerCase().includes(q) ||
          (c.sku ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [initialComponents, search, subcategoryFilter]);

  const isFiltering = search.trim() !== "" || subcategoryFilter !== null;

  const grouped = useMemo(() => {
    if (isFiltering) return null;
    const map = new Map<string, Component[]>();
    for (const sub of ALL_GROUPS) map.set(sub.value, []);
    const knownValues = new Set(componentSubcategories.map((s) => s.value));
    for (const c of filtered) {
      const key = knownValues.has(c.subcategory ?? "") ? c.subcategory! : "Other";
      map.get(key)?.push(c);
    }
    return map;
  }, [filtered, isFiltering]);

  function openAdd() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEdit(c: Component) {
    setEditTarget(c);
    setFormOpen(true);
  }

  function handleSaved() {
    setFormOpen(false);
    router.refresh();
  }

  return (
    <div>
      <PageTitle titleKey="components" />

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
            {t("addComponent")}
          </button>
        )}
      </div>

      {/* Subcategory filter pills */}
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
        {componentSubcategories.map((sub) => (
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
          <p>{t("noComponents")}</p>
          {isOffice && (
            <button
              className="btn-primary mt-4 mx-auto flex items-center gap-2"
              onClick={openAdd}
            >
              <Plus size={16} />
              {t("addComponent")}
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
                <ComponentTable components={items} isOffice={isOffice} onEdit={openEdit} />
              </div>
            );
          })}
        </div>
      ) : (
        <ComponentTable components={filtered} isOffice={isOffice} onEdit={openEdit} />
      )}

      {formOpen && (
        <ComponentForm
          component={editTarget}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
