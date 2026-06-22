"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Upload, AlertTriangle, ChevronLeft, CheckCircle, Info } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { createClient } from "@/lib/supabase-browser";
import { inferRole } from "@/lib/cabinet3d";
import type { SkuPanel3D } from "@/lib/cabinet3d";
import {
  type V3Json,
  type V3Part,
  cabinetToParts,
  cutListDims,
  rootDims,
  isSupportedSchema,
} from "@/lib/sketchup/parseV3";

const Cabinet3D = dynamic(
  () => import("@/components/Cabinet3D").then((m) => ({ default: m.Cabinet3D })),
  { ssr: false, loading: () => <div className="h-[400px] border border-line rounded-lg" /> },
);

export function SingleImportShell() {
  const { t } = useLang();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parseError, setParseError]   = useState<string | null>(null);
  const [parsed, setParsed]           = useState<V3Json | null>(null);
  const [panels, setPanels]           = useState<V3Part[]>([]);
  const [fittings, setFittings]       = useState<V3Part[]>([]);
  const [cabinetName, setCabinetName] = useState("");
  const [multipleNote, setMultipleNote] = useState(false);
  const [filename, setFilename]       = useState("");
  const [importing, setImporting]     = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ name: string; panels: number } | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setParseError(null);
      setParsed(null);
      setPanels([]);
      setFittings([]);
      setImportResult(null);
      setImportError(null);
      setMultipleNote(false);

      if (!file.name.toLowerCase().endsWith(".json")) {
        setParseError(t("skuInvalidFileV3"));
        return;
      }

      try {
        const text = await file.text();
        const json = JSON.parse(text) as V3Json;

        if (!isSupportedSchema(json.schema) || !Array.isArray(json.roots) || json.roots.length === 0) {
          setParseError(t("skuInvalidFileV3"));
          return;
        }

        if (json.roots.length > 1) setMultipleNote(true);

        const root = json.roots[0];
        const { panels: ps, fittings: fs } = cabinetToParts(root);

        setParsed(json);
        setFilename(file.name);
        setCabinetName(root.name);
        setPanels(ps);
        setFittings(fs);
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

  async function handleCreate() {
    if (!parsed) return;
    setImporting(true);
    setImportError(null);

    const root = parsed.roots[0];
    const dims = rootDims(root);
    const supabase = createClient();

    const { data: prod, error: e1 } = await supabase
      .from("products")
      .insert({
        name_en: cabinetName.trim() || root.name,
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
        export_version: parsed.version ?? null,
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
          // v4: persist cut data; null when source was v3 (no cut data at all)
          cuts_json: part.cuts !== undefined ? part.cuts : null,
          cut_warning: part.cutWarning ?? null,
        };
      });

      const { error: e2 } = await supabase.from("bom_lines").insert(bomRows);
      if (e2) {
        await supabase.from("products").delete().eq("id", prod.id);
        setImporting(false);
        setImportError(e2.message);
        return;
      }
    }

    setImporting(false);
    setImportResult({ name: cabinetName.trim() || root.name, panels: panels.length });
  }

  // Build SkuPanel3D for ALL leaves (panels + fittings) for accurate 3D
  const allLeaves: SkuPanel3D[] = [...panels, ...fittings].map((part) => ({
    part_role: inferRole(part.name),
    part_name: part.name,
    su_width_mm:  part.size.x,
    su_height_mm: part.size.y,
    su_depth_mm:  part.size.z,
    pos: part.pos,
    cuts: part.cuts,
    axes: part.axes,
    outline_mm: part.outline_mm,
    profile_mm: part.profile_mm,
    mesh_ref: part.mesh_ref,
  }));

  const dims = parsed ? rootDims(parsed.roots[0]) : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <button
        type="button"
        className="btn-ghost flex items-center gap-1.5 text-sm"
        onClick={() => router.push("/products")}
      >
        <ChevronLeft size={15} />
        {t("products")}
      </button>

      <h1 className="text-xl font-bold">{t("skuImportSingle")}</h1>

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
            {t("skuImportSingleSuccess")
              .replace("{name}", importResult.name)
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
          {multipleNote && (
            <div className="border border-brass/40 bg-brass/5 rounded-lg p-3 flex gap-2">
              <Info size={15} className="text-brass shrink-0 mt-0.5" />
              <p className="text-sm text-brass">{t("skuMultipleRootsNote")}</p>
            </div>
          )}

          {/* Cabinet name + dims */}
          <div className="card p-4 space-y-4">
            <div>
              <label className="block text-xs text-slate mb-1">{t("cabinetName")}</label>
              <input
                className="input w-full font-mono"
                value={cabinetName}
                onChange={(e) => setCabinetName(e.target.value)}
                dir="ltr"
              />
            </div>
            {dims && (
              <div>
                <div className="text-xs text-slate mb-1">{t("overallDims")} (mm)</div>
                <div className="font-mono text-sm tabular-nums" dir="ltr">
                  {Math.round(dims.width_mm)} × {Math.round(dims.height_mm)} × {Math.round(dims.depth_mm)}
                  <span className="text-slate ms-2 text-xs">W × H × D</span>
                </div>
              </div>
            )}
            <div className="flex gap-4 text-sm">
              <span>
                <span className="text-slate text-xs me-1">{t("detectedPanels")}:</span>
                <strong>{panels.length}</strong>
              </span>
              <span>
                <span className="text-slate text-xs me-1">{t("skuFittings")}:</span>
                <strong className="text-slate">{fittings.length}</strong>
              </span>
            </div>
            <p className="text-xs text-slate">
              {t("importedFrom")}: <span className="font-mono" dir="ltr">{filename}</span>
            </p>
          </div>

          {/* 3D preview */}
          {allLeaves.length > 0 && dims && (
            <>
              <p className="text-sm font-semibold">
                {t("preview3d")} —{" "}
                <span className="font-mono font-normal text-slate">{cabinetName}</span>
              </p>
              <Cabinet3D
                cabinetWidth={dims.width_mm}
                cabinetHeight={dims.height_mm}
                cabinetDepth={dims.depth_mm}
                parts={[]}
                skuPanels={allLeaves}
                meshes={parsed.meshes}
              />
            </>
          )}

          {/* Parts table — all leaves with role, type, and cut-list T/W/H */}
          <div className="border border-line rounded-lg overflow-hidden">
            <div className="bg-mist px-4 py-2.5 border-b border-line">
              <span className="text-sm font-semibold">
                {t("skuPartsTable")}
                <span className="text-slate font-normal ms-2">
                  ({panels.length + fittings.length})
                </span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-slate">
                    <th className="text-start px-3 py-2 font-medium">{t("partName")}</th>
                    <th className="text-start px-3 py-2 font-medium">{t("roleLabel")}</th>
                    <th className="text-start px-3 py-2 font-medium">{t("skuPartType")}</th>
                    <th className="text-end px-3 py-2 font-medium">T (mm)</th>
                    <th className="text-end px-3 py-2 font-medium">W (mm)</th>
                    <th className="text-end px-3 py-2 font-medium">H (mm)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...panels, ...fittings].map((part, i) => {
                    const { thickness, width, height } = cutListDims(part);
                    return (
                      <tr
                        key={i}
                        className={`border-b border-line last:border-0 hover:bg-mist/20 ${
                          part.isFitting ? "opacity-60" : ""
                        }`}
                      >
                        <td className="px-3 py-1.5 font-mono">{part.name}</td>
                        <td className="px-3 py-1.5 text-slate">{inferRole(part.name)}</td>
                        <td className="px-3 py-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              part.isFitting
                                ? "bg-mist text-slate"
                                : "bg-brass/10 text-brass"
                            }`}
                          >
                            {part.isFitting ? t("skuFittingTag") : t("skuPanelTag")}
                          </span>
                        </td>
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

          {/* Notes */}
          <div className="text-xs text-slate space-y-1 border-l-2 border-line ps-3">
            <p>{t("skuImportNote")}</p>
          </div>

          {importError && <p className="text-sm text-rust">{importError}</p>}

          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              disabled={importing || panels.length + fittings.length === 0}
              onClick={handleCreate}
            >
              {importing ? "…" : t("createProduct")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
