"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Upload, AlertTriangle, ChevronLeft, CheckCircle } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { createClient } from "@/lib/supabase-browser";
import { PART_ROLES } from "@/lib/cabinet3d";
import type { PartRole } from "@/lib/cabinet3d";
import type { PanelOption } from "../bom_types";
import type { TKey } from "@/lib/i18n";
import type { ImportedPanel, ParseResult } from "@/lib/dxf/polyboardImport";
import type { RawPanel3D } from "@/lib/cabinet3d";

const Cabinet3D = dynamic(
  () => import("@/components/Cabinet3D").then(m => ({ default: m.Cabinet3D })),
  { ssr: false, loading: () => <div className="h-[360px] border border-line rounded-lg" /> },
);

// ── row state ─────────────────────────────────────────────────────────

type RowState = ImportedPanel & {
  _key: string;
  panel_id: string;   // chosen PanelOption id
  editedRole: PartRole | "";
};

function rowKey(i: number) { return `r${i}`; }

function toBomLineState(rows: RowState[], cabinetDepth: number) {
  return rows.map(r => ({
    _key: r._key,
    line_type: "panel" as const,
    panel_id: r.panel_id,
    part_name: r.partName,
    width_mm: String(r.width_mm),
    height_mm: String(r.height_mm),
    banding_type_id: "",
    banded_length_m: "0",
    component_id: "",
    qty: String(r.qty),
    part_role: r.editedRole || r.part_role,
    depth_mm: String(r.thickness_mm),
    pos_offset_mm: String(r.pos.z),
    pos_x_mm: String(r.pos.x),
    pos_y_mm: String(r.pos.y),
    pos_z_mm: String(r.pos.z),
  }));
}

// ── props ─────────────────────────────────────────────────────────────

type Props = { panels: PanelOption[] };

export function ImportShell({ panels }: Props) {
  const { t, lang } = useLang();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [filename, setFilename] = useState("");
  const [fileSource, setFileSource] = useState<"dxf" | "3ds">("3ds");

  // Editable cabinet-level state
  const [cabinetName, setCabinetName] = useState("");
  const [cabinetW, setCabinetW] = useState("");
  const [cabinetH, setCabinetH] = useState("");
  const [cabinetD, setCabinetD] = useState("");

  // Per-row editable state
  const [rows, setRows] = useState<RowState[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ── file pick ──────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    const lname = file.name.toLowerCase();
    const is3ds = lname.endsWith(".3ds");
    const isDxf = lname.endsWith(".dxf");
    if (!is3ds && !isDxf) {
      setParseError("Please choose a .3ds or .dxf file.");
      return;
    }
    setParsing(true);
    setParseError(null);
    setResult(null);
    setSaved(false);
    setFileSource(is3ds ? "3ds" : "dxf");

    try {
      let res: ParseResult;
      if (is3ds) {
        const buf = await file.arrayBuffer();
        const { parse3ds } = await import("@/lib/3ds/threeDsImport");
        res = parse3ds(buf);
      } else {
        const text = await file.text();
        const { parsePolyboardDxf } = await import("@/lib/dxf/polyboardImport");
        res = await parsePolyboardDxf(text);
      }

      setResult(res);
      setFilename(file.name);
      setCabinetName(res.cabinet.name);
      setCabinetW(String(res.cabinet.width_mm));
      setCabinetH(String(res.cabinet.height_mm));
      setCabinetD(String(res.cabinet.depth_mm));

      // Build per-row state
      const autoMap = (mat: string): string => {
        if (!mat) return "";
        const lower = mat.toLowerCase();
        const match = panels.find(p =>
          p.name_en.toLowerCase().includes(lower.split(" ")[0]) ||
          lower.includes(p.name_en.toLowerCase().split(" ")[0])
        );
        return match?.id ?? "";
      };

      setRows(
        res.cabinet.panels.map((p, i) => ({
          ...p,
          _key: rowKey(i),
          panel_id: autoMap(p.materialRef ?? ""),
          editedRole: p.part_role,
        })),
      );
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }, [panels]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows(rs => rs.map(r => r._key === key ? { ...r, ...patch } : r));
  }

  // ── save ───────────────────────────────────────────────────────────

  async function handleCreate() {
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();

    const W = parseFloat(cabinetW) || 0;
    const H = parseFloat(cabinetH) || 0;
    const D = parseFloat(cabinetD) || 0;

    // Insert product
    const { data: prod, error: e1 } = await supabase
      .from("products")
      .insert({
        name_en: cabinetName.trim() || "Imported Cabinet",
        item_kind: "product",
        subcategory: "Cabinet",
        unit: "pcs",
        unit_price_jod: 0,
        width_mm: W || null,
        height_mm: H || null,
        depth_mm: D || null,
        is_active: true,
        is_template: true,
        source: fileSource === "3ds" ? "polyboard_3ds" : "polyboard_dxf",
        source_filename: filename,
      })
      .select("id")
      .single();

    if (e1 || !prod) {
      setSaving(false);
      setSaveError(e1?.message ?? "Insert failed");
      return;
    }

    // Insert BOM lines
    const bomRows = rows.map((r, i) => ({
      product_id: prod.id,
      line_type: "panel",
      panel_id: r.panel_id || null,
      part_name: r.partName,
      width_mm: r.width_mm || null,
      height_mm: r.height_mm || null,
      banding_type_id: null,
      banded_length_m: 0,
      component_id: null,
      qty: r.qty,
      sort_order: i,
      part_role: (r.editedRole || r.part_role) || null,
      depth_mm: r.thickness_mm || null,
      pos_offset_mm: r.pos.z || null,
      pos_x_mm: r.pos.x || null,
      pos_y_mm: r.pos.y || null,
      pos_z_mm: r.pos.z || null,
      hole_count: r.holeCount,
      holes_json: r.holes.length > 0 ? r.holes : null,
    }));

    const { error: e2 } = await supabase.from("bom_lines").insert(bomRows);
    if (e2) {
      // Clean up the product we just created
      await supabase.from("products").delete().eq("id", prod.id);
      setSaving(false);
      setSaveError(e2.message);
      return;
    }

    setSaving(false);
    setSaved(true);
  }

  // ── panel label helpers ────────────────────────────────────────────

  const pLabel = (p: PanelOption) =>
    (lang === "ar" && p.name_ar ? p.name_ar : p.name_en) +
    (p.sku ? ` (${p.sku})` : "");

  // ── render ─────────────────────────────────────────────────────────

  const bomForPreview = result
    ? toBomLineState(rows, parseFloat(cabinetD) || 0)
    : [];

  // For .3ds imports, derive real-position panels from rows (with editedRole applied)
  const rawPanels3D: RawPanel3D[] | undefined = fileSource === "3ds" && result
    ? rows.map(r => ({
        part_role:    r.editedRole || r.part_role,
        width_mm:     r.width_mm,
        height_mm:    r.height_mm,
        thickness_mm: r.thickness_mm,
        pos:          r.pos,
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

      <h1 className="text-xl font-bold">{t("importDxf")}</h1>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-line rounded-xl p-10 text-center cursor-pointer hover:border-brass transition-colors"
        onClick={() => fileRef.current?.click()}
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
      >
        <Upload size={28} className="mx-auto mb-3 text-slate" />
        <p className="text-sm font-medium">
          {parsing ? "Parsing…" : filename || t("noFileChosen")}
        </p>
        <p className="text-xs text-slate mt-1">{t("chooseDxf")}</p>
        <input
          ref={fileRef}
          type="file"
          accept=".3ds,.dxf"
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

      {saved && (
        <div className="border border-sage/40 bg-sage/10 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle size={16} className="text-sage shrink-0" />
          <p className="text-sm text-sage font-medium">{t("importSuccess")}</p>
          <button
            type="button"
            className="ms-auto btn-ghost text-sm"
            onClick={() => router.push("/products")}
          >
            {t("products")} →
          </button>
        </div>
      )}

      {result && !saved && (
        <>
          {/* Parser warnings */}
          {result.warnings.length > 0 && (
            <div className="border border-line rounded-lg p-4 space-y-1">
              <p className="text-xs font-semibold text-slate uppercase tracking-wider mb-2">
                {t("parserWarnings")}
              </p>
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-slate flex gap-2">
                  <AlertTriangle size={12} className="text-brass shrink-0 mt-0.5" />
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* Cabinet dims */}
          <div className="card p-4 space-y-3">
            <p className="text-sm font-semibold">{t("cabinetName")}</p>
            <input
              className="input"
              value={cabinetName}
              onChange={e => setCabinetName(e.target.value)}
            />
            <p className="text-sm font-semibold">{t("overallDims")} (mm)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate mb-0.5">W</label>
                <input className="input" type="number" dir="ltr" value={cabinetW} onChange={e => setCabinetW(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-slate mb-0.5">H</label>
                <input className="input" type="number" dir="ltr" value={cabinetH} onChange={e => setCabinetH(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-slate mb-0.5">D</label>
                <input className="input" type="number" dir="ltr" value={cabinetD} onChange={e => setCabinetD(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-slate">{t("importedFrom")}: <span className="font-mono" dir="ltr">{filename}</span></p>
          </div>

          {/* 3D preview */}
          <Cabinet3D
            cabinetWidth={parseFloat(cabinetW) || 0}
            cabinetHeight={parseFloat(cabinetH) || 0}
            cabinetDepth={parseFloat(cabinetD) || 0}
            parts={bomForPreview}
            rawPanels={rawPanels3D}
          />

          {/* Panels table */}
          <div className="border border-line rounded-lg overflow-hidden">
            <div className="bg-mist px-4 py-2.5 border-b border-line">
              <span className="text-sm font-semibold">{t("detectedPanels")} ({rows.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-slate">
                    <th className="text-start px-3 py-2 font-medium">{t("partName")}</th>
                    <th className="text-start px-3 py-2 font-medium">{t("roleLabel")}</th>
                    <th className="text-start px-3 py-2 font-medium">W×H×T mm</th>
                    <th className="text-start px-3 py-2 font-medium">{t("qty")}</th>
                    <th className="text-start px-3 py-2 font-medium">{t("holes")}</th>
                    <th className="text-start px-3 py-2 font-medium">{t("mapMaterial")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row._key} className="border-b border-line last:border-0 hover:bg-mist/30">
                      <td className="px-3 py-2 max-w-[160px]">
                        <span className="truncate block" title={row.partName}>{row.partName}</span>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="input text-xs py-1"
                          value={row.editedRole}
                          onChange={e => updateRow(row._key, { editedRole: e.target.value as PartRole | "" })}
                        >
                          <option value="">{t("noneOption")}</option>
                          {PART_ROLES.map(r => (
                            <option key={r} value={r}>{t((`partRole_${r}`) as TKey)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs" dir="ltr">
                        {row.width_mm}×{row.height_mm}×{row.thickness_mm}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          className="input text-xs py-1 w-14 text-center"
                          type="number"
                          min="1"
                          dir="ltr"
                          value={row.qty}
                          onChange={e => updateRow(row._key, { qty: parseFloat(e.target.value) || 1 })}
                        />
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-xs">
                        {row.holeCount}
                      </td>
                      <td className="px-3 py-2 min-w-[180px]">
                        <select
                          className="input text-xs py-1"
                          value={row.panel_id}
                          onChange={e => updateRow(row._key, { panel_id: e.target.value })}
                        >
                          <option value="">— {t("noneOption")} —</option>
                          {panels.map(p => (
                            <option key={p.id} value={p.id}>{pLabel(p)}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div className="text-xs text-slate space-y-1 border-l-2 border-line ps-3">
            <p>{t("importNote")}</p>
            <p>{t("importHint")}</p>
          </div>

          {saveError && (
            <p className="text-sm text-rust">{saveError}</p>
          )}

          {/* Create product */}
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={handleCreate}
            >
              {saving ? "…" : t("createProduct")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
