"use client";

import { X, Plus } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { jod } from "@/lib/utils";
import {
  panelPricePerM2,
  panelPartCost,
  componentPartCost,
} from "@/lib/pricing";
import type {
  BomLineState,
  PanelOption,
  ComponentOption,
  BandingType,
} from "./bom_types";

let _keyCounter = 0;
export function newBomKey(): string {
  return `bk${++_keyCounter}`;
}

export function emptyPanelLine(): BomLineState {
  return {
    _key: newBomKey(),
    line_type: "panel",
    panel_id: "",
    part_name: "",
    width_mm: "",
    height_mm: "",
    banding_type_id: "",
    banded_length_m: "0",
    component_id: "",
    qty: "1",
  };
}

export function emptyComponentLine(): BomLineState {
  return {
    _key: newBomKey(),
    line_type: "component",
    panel_id: "",
    part_name: "",
    width_mm: "",
    height_mm: "",
    banding_type_id: "",
    banded_length_m: "0",
    component_id: "",
    qty: "1",
  };
}

function getLineCost(
  line: BomLineState,
  panels: PanelOption[],
  allComponents: ComponentOption[],
  bandingTypes: BandingType[],
): number {
  if (line.line_type === "panel") {
    const panel = panels.find((p) => p.id === line.panel_id);
    if (
      !panel ||
      !panel.sheet_length_mm ||
      !panel.sheet_width_mm ||
      !panel.sheet_price_jod
    )
      return 0;
    const ppm2 = panelPricePerM2(
      panel.sheet_length_mm,
      panel.sheet_width_mm,
      panel.sheet_price_jod,
    );
    const bt = bandingTypes.find((b) => b.id === line.banding_type_id);
    const { material, banding } = panelPartCost({
      widthMm: parseFloat(line.width_mm) || 0,
      heightMm: parseFloat(line.height_mm) || 0,
      qty: parseFloat(line.qty) || 0,
      pricePerM2: ppm2,
      bandedLenM: parseFloat(line.banded_length_m) || 0,
      bandingRate: bt?.price_per_m_jod ?? 0,
    });
    return material + banding;
  } else {
    const comp = allComponents.find((c) => c.id === line.component_id);
    return componentPartCost(
      comp?.unit_price_jod ?? 0,
      parseFloat(line.qty) || 0,
    );
  }
}

type Props = {
  lines: BomLineState[];
  onChange: (lines: BomLineState[]) => void;
  panels: PanelOption[];
  allComponents: ComponentOption[];
  bandingTypes: BandingType[];
};

export function BomSection({
  lines,
  onChange,
  panels,
  allComponents,
  bandingTypes,
}: Props) {
  const { t, lang } = useLang();

  function update(key: string, patch: Partial<BomLineState>) {
    onChange(lines.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  }

  function remove(key: string) {
    onChange(lines.filter((l) => l._key !== key));
  }

  const panelLines = lines.filter((l) => l.line_type === "panel");
  const compLines = lines.filter((l) => l.line_type === "component");

  const componentOptions = allComponents.filter(
    (c) => !panels.some((p) => p.id === c.id),
  );

  const pLabel = (p: PanelOption) =>
    (lang === "ar" && p.name_ar ? p.name_ar : p.name_en) +
    (p.sku ? ` (${p.sku})` : "");
  const cLabel = (c: ComponentOption) =>
    (lang === "ar" && c.name_ar ? c.name_ar : c.name_en) +
    (c.sku ? ` (${c.sku})` : "");

  return (
    <div className="border border-line rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-mist px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 border-b border-line">
        <span className="text-sm font-semibold">{t("bom")}</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-ghost text-xs py-1 px-2 flex items-center gap-1"
            onClick={() => onChange([...lines, emptyPanelLine()])}
          >
            <Plus size={12} />
            {t("addPanelPart")}
          </button>
          <button
            type="button"
            className="btn-ghost text-xs py-1 px-2 flex items-center gap-1"
            onClick={() => onChange([...lines, emptyComponentLine()])}
          >
            <Plus size={12} />
            {t("addComponentLine")}
          </button>
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="text-center text-slate text-sm py-6">{t("noBomLines")}</p>
      ) : (
        <div className="p-3 space-y-4">
          {/* Panel part lines */}
          {panelLines.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate uppercase tracking-wider">
                {t("panelMaterial")}
              </div>
              {panelLines.map((line) => {
                const cost = getLineCost(line, panels, allComponents, bandingTypes);
                return (
                  <div
                    key={line._key}
                    className="border border-line rounded-lg p-3 space-y-2 bg-white"
                  >
                    {/* Row 1: name, panel, W, H, qty, remove */}
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="flex-1 min-w-[90px]">
                        <label className="block text-xs text-slate mb-0.5">
                          {t("partName")}
                        </label>
                        <input
                          className="input text-sm"
                          value={line.part_name}
                          placeholder="Side"
                          onChange={(e) =>
                            update(line._key, { part_name: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex-[2] min-w-[150px]">
                        <label className="block text-xs text-slate mb-0.5">
                          {t("panelMaterial")}
                        </label>
                        <select
                          className="input text-sm"
                          value={line.panel_id}
                          onChange={(e) =>
                            update(line._key, { panel_id: e.target.value })
                          }
                        >
                          <option value="">—</option>
                          {panels.map((p) => (
                            <option key={p.id} value={p.id}>
                              {pLabel(p)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-20">
                        <label className="block text-xs text-slate mb-0.5">
                          W mm
                        </label>
                        <input
                          className="input text-sm"
                          type="number"
                          min="0"
                          step="1"
                          dir="ltr"
                          value={line.width_mm}
                          onChange={(e) =>
                            update(line._key, { width_mm: e.target.value })
                          }
                        />
                      </div>
                      <div className="w-20">
                        <label className="block text-xs text-slate mb-0.5">
                          H mm
                        </label>
                        <input
                          className="input text-sm"
                          type="number"
                          min="0"
                          step="1"
                          dir="ltr"
                          value={line.height_mm}
                          onChange={(e) =>
                            update(line._key, { height_mm: e.target.value })
                          }
                        />
                      </div>
                      <div className="w-16">
                        <label className="block text-xs text-slate mb-0.5">
                          {t("qty")}
                        </label>
                        <input
                          className="input text-sm"
                          type="number"
                          min="1"
                          step="1"
                          dir="ltr"
                          value={line.qty}
                          onChange={(e) =>
                            update(line._key, { qty: e.target.value })
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-ghost p-1.5 text-slate hover:text-rust self-end"
                        onClick={() => remove(line._key)}
                        aria-label={t("removeLine")}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {/* Row 2: banding + cost */}
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs text-slate mb-0.5">
                          {t("bandingType")}
                        </label>
                        <select
                          className="input text-sm"
                          value={line.banding_type_id}
                          onChange={(e) =>
                            update(line._key, {
                              banding_type_id: e.target.value,
                            })
                          }
                        >
                          <option value="">{t("noneOption")}</option>
                          {bandingTypes.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.price_per_m_jod.toFixed(3)}/m)
                            </option>
                          ))}
                        </select>
                      </div>
                      {line.banding_type_id && (
                        <div className="w-24">
                          <label className="block text-xs text-slate mb-0.5">
                            {t("bandedLength")}
                          </label>
                          <input
                            className="input text-sm"
                            type="number"
                            min="0"
                            step="0.1"
                            dir="ltr"
                            value={line.banded_length_m}
                            onChange={(e) =>
                              update(line._key, {
                                banded_length_m: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                      <div className="ms-auto text-end">
                        <div className="text-xs text-slate">{t("lineCost")}</div>
                        <div className="font-semibold text-sm" dir="ltr">
                          {jod(cost)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Component lines */}
          {compLines.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate uppercase tracking-wider">
                {t("components")}
              </div>
              {compLines.map((line) => {
                const cost = getLineCost(line, panels, allComponents, bandingTypes);
                return (
                  <div
                    key={line._key}
                    className="border border-line rounded-lg p-3 bg-white"
                  >
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="flex-[2] min-w-[180px]">
                        <label className="block text-xs text-slate mb-0.5">
                          {t("components")}
                        </label>
                        <select
                          className="input text-sm"
                          value={line.component_id}
                          onChange={(e) =>
                            update(line._key, { component_id: e.target.value })
                          }
                        >
                          <option value="">—</option>
                          {componentOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {cLabel(c)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-20">
                        <label className="block text-xs text-slate mb-0.5">
                          {t("qty")}
                        </label>
                        <input
                          className="input text-sm"
                          type="number"
                          min="1"
                          step="1"
                          dir="ltr"
                          value={line.qty}
                          onChange={(e) =>
                            update(line._key, { qty: e.target.value })
                          }
                        />
                      </div>
                      <div className="ms-auto text-end">
                        <div className="text-xs text-slate">{t("lineCost")}</div>
                        <div className="font-semibold text-sm" dir="ltr">
                          {jod(cost)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-ghost p-1.5 text-slate hover:text-rust self-end"
                        onClick={() => remove(line._key)}
                        aria-label={t("removeLine")}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
