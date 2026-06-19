"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Upload, AlertTriangle, ChevronLeft, CheckCircle } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { createClient } from "@/lib/supabase-browser";
import { inferRole } from "@/lib/cabinet3d";
import type { SkuPanel3D } from "@/lib/cabinet3d";
import {
  type V3Json,
  type V3Node,
  cabinetToParts,
  cutListDims,
  rootDims,
} from "@/lib/sketchup/parseV3";

const Cabinet3D = dynamic(
  () => import("@/components/Cabinet3D").then((m) => ({ default: m.Cabinet3D })),
  { ssr: false, loading: () => <div className="h-[400px] border border-line rounded-lg" /> },
);

type CabinetRow = {
  root: V3Node;
  selected: boolean;
};

export function ProjectImportShell() {
  const { t } = useLang();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parseError, setParseError]   = useState<string | null>(null);
  const [parsed, setParsed]           = useState<V3Json | null>(null);
  const [rows, setRows]               = useState<CabinetRow[]>([]);
  const [filename, setFilename]       = useState("");
  const [previewIdx, setPreviewIdx]   = useState(0);
  const [importing, setImporting]     = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [progress, setProgress]       = useState("");
  const [importResult, setImportResult] = useState<{ cabinets: number; panels: number } | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setParseError(null);
      setParsed(null);
      setRows([]);
      setImportResult(null);
      setImportError(null);
      setPreviewIdx(0);

      if (!file.name.toLowerCase().endsWith(".json")) {
        setParseError(t("skuInvalidFileV3"));
        return;
      }

      try {
        const text = await file.text();
        const json = JSON.parse(text) as V3Json;

        if (json.schema !== "alloy.sketchup.v3" || !Array.isArray(json.roots)) {
          setParseError(t("skuInvalidFileV3"));
          return;
        }

        const cabinets = json.roots.filter((r) => r.item_type === "Cabinet");
        if (cabinets.length === 0) {
          setParseError(t("skuNoCabinets"));
          return;
        }

        setParsed(json);
        setFilename(file.name);
        setRows(cabinets.map((root) => ({ root, selected: true })));
      } catch {
        setParseError(t("skuInvalidFileV3"));
      }
    },
    [t],
  );

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
      const { root } = row;
      setProgress(`${importedCount + 1} / ${selected.length}`);

      const dims = rootDims(root);
      const { panels } = cabinetToParts(root);

      const { data: prod, error: e1 } = await supabase
        .from("products")
        .insert({
          name_en: root.name,
          item_kind: "product",
          subcategory: "Cabinet",
          unit: "pcs",
          unit_price_jod: 0,
          width_mm: dims.width_mm,
          height_mm: dims.height_mm,
          depth_mm: dims.depth_mm,
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

      if (panels.length > 0) {
        const bomRows = panels.map((part, i) => {
          const { thickness, width, height } = cutListDims(part);
          return {
            product_id: prod.id,
            line_type: "panel",
            panel_id: null,
            part_name: part.name,
            width_mm: width,
            height_mm: height,
            banding_type_id: null,
            banded_length_m: 0,
            component_id: null,
            qty: 1,
            sort_order: i,
            part_role: inferRole(part.name),
            depth_mm: thickness,
            pos_offset_mm: null,
            pos_x_mm: part.pos.x,
            pos_y_mm: part.pos.y,
            pos_z_mm: part.pos.z,
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

        totalPanels += panels.length;
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

  // Build skuPanels for the focused row (panels + fittings both rendered)
  const previewRoot = rows[previewIdx]?.root ?? null;
  const previewPanels3D: SkuPanel3D[] | undefined = previewRoot
    ? (() => {
        const { panels, fittings } = cabinetToParts(previewRoot);
        return [...panels, ...fittings].map((part) => ({
          part_role: inferRole(part.name),
          part_name: part.name,
          su_width_mm:  part.size.x,
          su_height_mm: part.size.y,
          su_depth_mm:  part.size.z,
          pos: part.pos,
        }));
      })()
    : undefined;

  const previewDims = previewRoot ? rootDims(previewRoot) : null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <button
        type="button"
        className="btn-ghost flex items-center gap-1.5 text-sm"
        onClick={() => router.push("/products")}
      >
        <ChevronLeft size={15} />
        {t("products")}
      </button>

      <h1 className="text-xl font-bold">{t("skuImportProject")}</h1>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-line rounded-xl p-10 text-center cursor-pointer hover:border-brass transition-colors"
        onClick={() => fileRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <Upload size={28} className="mx-auto mb-3 text-slate" />
        <p className="text-sm font-medium">{filename || t("skuNoFileChosen")}</p>
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

          {/* Cabinet table */}
          <div className="border border-line rounded-lg overflow-hidden">
            <div className="bg-mist px-4 py-2.5 border-b border-line flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm font-semibold">
                {t("skuCabinetsLabel")} ({rows.length})
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate hidden sm:inline">
                  {t("skuClickRowToPreview")}
                </span>
                <button type="button" className="btn-ghost text-xs py-1 px-2" onClick={selectAll}>
                  {t("skuSelectAll")}
                </button>
                <button type="button" className="btn-ghost text-xs py-1 px-2" onClick={deselectAll}>
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
                  {rows.map((row, idx) => {
                    const d = rootDims(row.root);
                    return (
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
                            title={row.root.name}
                          >
                            {row.root.name}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-xs" dir="ltr">
                          {Math.round(d.width_mm)}×
                          {Math.round(d.height_mm)}×
                          {Math.round(d.depth_mm)}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {row.root.panel_count ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-slate">
                          {row.root.fitting_count ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3D preview for focused row */}
          {previewRoot && previewPanels3D && previewPanels3D.length > 0 && previewDims && (
            <>
              <p className="text-sm font-semibold">
                {t("preview3d")} —{" "}
                <span className="font-mono font-normal text-slate">{previewRoot.name}</span>
              </p>
              <Cabinet3D
                cabinetWidth={previewDims.width_mm}
                cabinetHeight={previewDims.height_mm}
                cabinetDepth={previewDims.depth_mm}
                parts={[]}
                skuPanels={previewPanels3D}
              />
            </>
          )}

          {/* Notes */}
          <div className="text-xs text-slate space-y-1 border-l-2 border-line ps-3">
            <p>{t("skuImportNote")}</p>
          </div>

          {importError && <p className="text-sm text-rust">{importError}</p>}

          <div className="flex items-center justify-end gap-3">
            {progress && <span className="text-sm text-slate">{progress}</span>}
            <button
              type="button"
              className="btn-primary"
              disabled={importing || selectedCount === 0}
              onClick={handleImport}
            >
              {importing
                ? `… ${progress}`
                : t("skuImportProjectBtn").replace("{n}", String(selectedCount))}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
