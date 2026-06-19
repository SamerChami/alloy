"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Upload, AlertTriangle, ChevronLeft, CheckCircle } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { createClient } from "@/lib/supabase-browser";
import { inferRole } from "@/lib/cabinet3d";
import type { SkuPanel3D } from "@/lib/cabinet3d";

const Cabinet3D = dynamic(
  () => import("@/components/Cabinet3D").then(m => ({ default: m.Cabinet3D })),
  { ssr: false, loading: () => <div className="h-[400px] border border-line rounded-lg" /> },
);

// ── JSON schema types ─────────────────────────────────────────────────

type SkuPanel = {
  name: string;
  kind: string;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  sorted_mm: number[];
  pos_mm: { x: number; y: number; z: number };
};

type SkuItem = {
  name: string;
  item_type: string;
  overall_mm: { w: number; h: number; d: number };
  panel_count: number;
  fitting_count: number;
  panels: SkuPanel[];
  fittings: unknown[];
};

type SkuJson = {
  schema: string;
  model: string;
  units: string;
  item_count: number;
  summary: Record<string, number>;
  items: SkuItem[];
};

type CabinetRow = {
  item: SkuItem;
  selected: boolean;
};

// ── helpers ───────────────────────────────────────────────────────────

// Correct H/W/T using sorted_mm: thickness=smallest, width=middle, height=largest.
// sorted_mm is ascending [t, w, h] — use it directly instead of raw rotated extents.
function correctedDims(panel: SkuPanel) {
  const s = panel.sorted_mm;
  return { thickness: s[0], width: s[1], height: s[2] };
}

// ── component ─────────────────────────────────────────────────────────

export function SketchupImportShell() {
  const { t } = useLang();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<SkuJson | null>(null);
  const [rows, setRows] = useState<CabinetRow[]>([]);
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ cabinets: number; panels: number } | null>(null);
  const [progress, setProgress] = useState("");
  const [previewIdx, setPreviewIdx] = useState(0);

  const handleFile = useCallback(async (file: File) => {
    setParseError(null);
    setParsed(null);
    setRows([]);
    setImportResult(null);
    setImportError(null);
    setPreviewIdx(0);

    if (!file.name.toLowerCase().endsWith(".json")) {
      setParseError(t("skuInvalidFile"));
      return;
    }

    try {
      const text = await file.text();
      const json = JSON.parse(text) as SkuJson;

      if (json.schema !== "alloy.sketchup.v2" || !Array.isArray(json.items)) {
        setParseError(t("skuInvalidFile"));
        return;
      }

      const cabinets = json.items.filter((i) => i.item_type === "Cabinet");
      if (cabinets.length === 0) {
        setParseError(t("skuNoCabinets"));
        return;
      }

      setParsed(json);
      setFilename(file.name);
      setRows(cabinets.map((item) => ({ item, selected: true })));
    } catch {
      setParseError(t("skuInvalidFile"));
    }
  }, [t]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function toggleRow(idx: number) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r)));
  }

  function selectAll() {
    setRows((rs) => rs.map((r) => ({ ...r, selected: true })));
  }

  function deselectAll() {
    setRows((rs) => rs.map((r) => ({ ...r, selected: false })));
  }

  async function handleImport() {
    if (!parsed) return;
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0) return;

    setImporting(true);
    setImportError(null);
    setProgress("");

    const supabase = createClient();
    let totalPanels = 0;
    let importedCount = 0;

    for (const row of selected) {
      const { item } = row;
      setProgress(`${importedCount + 1} / ${selected.length}`);

      const { data: prod, error: e1 } = await supabase
        .from("products")
        .insert({
          name_en: item.name,
          item_kind: "product",
          subcategory: "Cabinet",
          unit: "pcs",
          unit_price_jod: 0,
          width_mm: item.overall_mm.w,
          height_mm: item.overall_mm.h,
          depth_mm: item.overall_mm.d,
          is_active: true,
          is_template: true,
          source: "sketchup_json",
          source_filename: parsed.model,
        })
        .select("id")
        .single();

      if (e1 || !prod) {
        setImporting(false);
        setImportError(e1?.message ?? "Insert failed");
        return;
      }

      if (item.panels.length > 0) {
        const bomRows = item.panels.map((panel, i) => {
          const { thickness, width, height } = correctedDims(panel);
          return {
            product_id: prod.id,
            line_type: "panel",
            panel_id: null,
            part_name: panel.name,
            width_mm: width,
            height_mm: height,
            banding_type_id: null,
            banded_length_m: 0,
            component_id: null,
            qty: 1,
            sort_order: i,
            part_role: inferRole(panel.name),
            depth_mm: thickness,
            pos_offset_mm: null,
            pos_x_mm: panel.pos_mm.x,
            pos_y_mm: panel.pos_mm.y,
            pos_z_mm: panel.pos_mm.z,
            hole_count: 0,
          };
        });

        const { error: e2 } = await supabase.from("bom_lines").insert(bomRows);
        if (e2) {
          await supabase.from("products").delete().eq("id", prod.id);
          setImporting(false);
          setImportError(e2.message);
          return;
        }

        totalPanels += item.panels.length;
      }

      importedCount++;
    }

    setImporting(false);
    setProgress("");
    setImportResult({ cabinets: importedCount, panels: totalPanels });
  }

  const selectedCount = rows.filter((r) => r.selected).length;
  const skippedTypes = parsed?.summary
    ? Object.entries(parsed.summary).filter(([type]) => type !== "Cabinet")
    : [];

  const previewItem = rows[previewIdx]?.item ?? null;

  // Build SkuPanel3D[] from raw JSON panel data — axis mapping happens inside buildBoxesFromSkuPanels.
  // We pass raw per-axis extents (NOT sorted cut-list dims) so the 3D uses true orientation.
  const skuPanels3D: SkuPanel3D[] | undefined = previewItem
    ? previewItem.panels.map(panel => ({
        part_role:    inferRole(panel.name),
        part_name:    panel.name,
        su_width_mm:  panel.width_mm,
        su_height_mm: panel.height_mm,
        su_depth_mm:  panel.depth_mm,
        pos:          panel.pos_mm,
      }))
    : undefined;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Back */}
      <button
        type="button"
        className="btn-ghost flex items-center gap-1.5 text-sm"
        onClick={() => router.push("/products")}
      >
        <ChevronLeft size={15} />
        {t("products")}
      </button>

      <h1 className="text-xl font-bold">{t("importSketchup")}</h1>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-line rounded-xl p-10 text-center cursor-pointer hover:border-brass transition-colors"
        onClick={() => fileRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <Upload size={28} className="mx-auto mb-3 text-slate" />
        <p className="text-sm font-medium">
          {filename || t("skuNoFileChosen")}
        </p>
        <p className="text-xs text-slate mt-1">{t("skuChooseFile")}</p>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {parseError && (
        <div className="border border-rust/30 bg-rust/5 rounded-lg p-4 flex gap-3">
          <AlertTriangle size={16} className="text-rust shrink-0 mt-0.5" />
          <p className="text-sm text-rust">{parseError}</p>
        </div>
      )}

      {importResult && (
        <div className="border border-sage/40 bg-sage/10 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle size={16} className="text-sage shrink-0" />
          <p className="text-sm text-sage font-medium">
            {t("skuImportSuccess")
              .replace("{cabinets}", String(importResult.cabinets))
              .replace("{panels}", String(importResult.panels))}
          </p>
          <button
            type="button"
            className="ms-auto btn-ghost text-sm"
            onClick={() => router.push("/products")}
          >
            {t("products")} →
          </button>
        </div>
      )}

      {parsed && !importResult && (
        <>
          {/* Summary header */}
          <div className="card p-4 space-y-3">
            <div>
              <div className="text-xs text-slate">{t("skuModelLabel")}</div>
              <div className="font-mono text-sm" dir="ltr">{parsed.model}</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="border border-brass/40 bg-brass/5 rounded-lg px-3 py-2">
                <div className="text-xs text-slate">{t("skuCabinetsLabel")}</div>
                <div className="text-2xl font-bold text-brass">
                  {parsed.summary.Cabinet ?? rows.length}
                </div>
              </div>
              {skippedTypes.map(([type, count]) => (
                <div key={type} className="border border-line rounded-lg px-3 py-2 opacity-60">
                  <div className="text-xs text-slate">
                    {type} ({t("skuSkippedLabel")})
                  </div>
                  <div className="text-xl font-semibold text-slate">{count}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate">
              {t("importedFrom")}: <span className="font-mono" dir="ltr">{filename}</span>
            </p>
          </div>

          {/* Cabinet table — click a row to focus 3D preview; checkbox toggles import */}
          <div className="border border-line rounded-lg overflow-hidden">
            <div className="bg-mist px-4 py-2.5 border-b border-line flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm font-semibold">
                {t("skuCabinetsLabel")} ({rows.length})
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate hidden sm:inline">
                  {t("skuClickRowToPreview")}
                </span>
                <button
                  type="button"
                  className="btn-ghost text-xs py-1 px-2"
                  onClick={selectAll}
                >
                  {t("skuSelectAll")}
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs py-1 px-2"
                  onClick={deselectAll}
                >
                  {t("skuDeselectAll")}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-slate">
                    <th className="px-3 py-2 w-8" />
                    <th className="text-start px-3 py-2 font-medium">{t("nameEn")}</th>
                    <th className="text-start px-3 py-2 font-medium">{t("overallDims")} (mm)</th>
                    <th className="text-start px-3 py-2 font-medium">{t("detectedPanels")}</th>
                    <th className="text-start px-3 py-2 font-medium">{t("skuFittings")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-line last:border-0 cursor-pointer transition-colors ${
                        idx === previewIdx
                          ? "bg-brass/10 hover:bg-brass/15"
                          : "hover:bg-mist/30"
                      } ${!row.selected ? "opacity-40" : ""}`}
                      onClick={() => setPreviewIdx(idx)}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-brass"
                          checked={row.selected}
                          onChange={() => toggleRow(idx)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-3 py-2 max-w-[240px]">
                        <span
                          className="truncate block font-mono text-xs"
                          title={row.item.name}
                        >
                          {row.item.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs" dir="ltr">
                        {Math.round(row.item.overall_mm.w)}×
                        {Math.round(row.item.overall_mm.h)}×
                        {Math.round(row.item.overall_mm.d)}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {row.item.panel_count}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate">
                        {row.item.fitting_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3D preview for focused cabinet */}
          {previewItem && (
            <>
              <p className="text-sm font-semibold">
                {t("preview3d")} —{" "}
                <span className="font-mono font-normal text-slate">{previewItem.name}</span>
              </p>
              <Cabinet3D
                cabinetWidth={previewItem.overall_mm.w}
                cabinetHeight={previewItem.overall_mm.h}
                cabinetDepth={previewItem.overall_mm.d}
                parts={[]}
                skuPanels={skuPanels3D}
              />

              {/* Panel breakdown — verify corrected T/W/H */}
              <div className="border border-line rounded-lg overflow-hidden">
                <div className="bg-mist px-4 py-2 border-b border-line">
                  <span className="text-sm font-semibold">
                    {t("skuPanelBreakdown")}
                    <span className="text-slate font-normal ms-2">
                      — {previewItem.name} ({previewItem.panels.length})
                    </span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line text-slate">
                        <th className="text-start px-3 py-2 font-medium">{t("partName")}</th>
                        <th className="text-start px-3 py-2 font-medium">{t("roleLabel")}</th>
                        <th className="text-end px-3 py-2 font-medium">T (mm)</th>
                        <th className="text-end px-3 py-2 font-medium">W (mm)</th>
                        <th className="text-end px-3 py-2 font-medium">H (mm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewItem.panels.map((panel, i) => {
                        const { thickness, width, height } = correctedDims(panel);
                        return (
                          <tr key={i} className="border-b border-line last:border-0 hover:bg-mist/20">
                            <td className="px-3 py-1.5 font-mono">{panel.name}</td>
                            <td className="px-3 py-1.5 text-slate">{inferRole(panel.name)}</td>
                            <td className="px-3 py-1.5 text-end tabular-nums">{Math.round(thickness)}</td>
                            <td className="px-3 py-1.5 text-end tabular-nums">{Math.round(width)}</td>
                            <td className="px-3 py-1.5 text-end tabular-nums">{Math.round(height)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div className="text-xs text-slate space-y-1 border-l-2 border-line ps-3">
            <p>{t("skuImportNote")}</p>
          </div>

          {importError && (
            <p className="text-sm text-rust">{importError}</p>
          )}

          {/* Import button */}
          <div className="flex items-center justify-end gap-3">
            {progress && (
              <span className="text-sm text-slate">{progress}</span>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={importing || selectedCount === 0}
              onClick={handleImport}
            >
              {importing
                ? `… ${progress}`
                : `${t("skuImportBtn")} (${selectedCount})`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
