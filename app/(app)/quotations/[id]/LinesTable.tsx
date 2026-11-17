"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { jod } from "@/lib/utils";
import {
  dimsLabel,
  groupBySection,
  priceChanged,
  sectionNames,
  type QuotationItemRow,
} from "@/lib/quotations";

type Typed = { qty?: string; price?: string };

type Edit = {
  id: string;
  description: string;
  section: string;
  notes: string;
  code: string;
  w: string;
  h: string;
  d: string;
};

function whole(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function LinesTable({
  lines,
  draft,
  busy,
  onUpdate,
  onRemove,
}: {
  lines: QuotationItemRow[];
  draft: boolean;
  busy: boolean;
  /** One update of the named columns on one line; the database does the rest. */
  onUpdate: (id: string, patch: Record<string, string | number | null>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const { t, lang } = useLang();
  const [typed, setTyped] = useState<Record<string, Typed>>({});
  const [edit, setEdit] = useState<Edit | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const groups = groupBySection(lines);
  const names = sectionNames(lines);
  let running = 0;

  function setTypedField(id: string, field: keyof Typed, value: string | undefined) {
    setTyped((prev) => {
      const next = { ...prev, [id]: { ...prev[id], [field]: value } };
      if (next[id].qty === undefined && next[id].price === undefined) delete next[id];
      return next;
    });
  }

  async function commit(l: QuotationItemRow, field: "qty" | "price") {
    const raw = typed[l.id]?.[field];
    setTypedField(l.id, field, undefined);
    if (raw === undefined || raw.trim() === "") return;
    const n = Number(raw);
    const saved = field === "qty" ? Number(l.qty) : Number(l.unit_price_jod);
    const valid = Number.isFinite(n) && (field === "qty" ? n > 0 : n >= 0);
    if (!valid || n === saved) return;
    await onUpdate(l.id, field === "qty" ? { qty: n } : { unit_price_jod: n });
  }

  function startEdit(l: QuotationItemRow) {
    setEdit({
      id: l.id,
      description: l.description,
      section: l.section ?? "",
      notes: l.notes ?? "",
      code: l.code ?? "",
      w: l.width_mm != null ? String(l.width_mm) : "",
      h: l.height_mm != null ? String(l.height_mm) : "",
      d: l.depth_mm != null ? String(l.depth_mm) : "",
    });
  }

  async function saveEdit(l: QuotationItemRow) {
    if (!edit || !edit.description.trim()) return;
    const patch: Record<string, string | number | null> = {
      description: edit.description.trim(),
      section: edit.section.trim() || null,
      notes: edit.notes.trim() || null,
    };
    if (l.price_source === "manual") {
      patch.code = edit.code.trim() || null;
      patch.width_mm = whole(edit.w);
      patch.height_mm = whole(edit.h);
      patch.depth_mm = whole(edit.d);
    }
    if (await onUpdate(l.id, patch)) setEdit(null);
  }

  const th = "text-start px-3 py-2 font-medium whitespace-nowrap";

  return (
    <div className="overflow-x-auto">
      <datalist id="line-sections">
        {names.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-line bg-mist">
            <th className={th}>#</th>
            <th className={th}>{t("code")}</th>
            <th className={th}>{t("quoteDescription")}</th>
            <th className={th}>{t("quoteSizeShort")}</th>
            <th className={th}>{t("qty")}</th>
            <th className={th}>{t("unitPrice")}</th>
            <th className={`${th} text-end`}>{t("quoteLineTotal")}</th>
            {draft && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.section || "__none"}>
              <tr className="bg-mist/60">
                <td colSpan={draft ? 8 : 7} className="px-3 py-2 text-xs font-semibold text-slate uppercase tracking-wider">
                  {g.section || t("quoteNoSection")}
                </td>
              </tr>
              {g.lines.map((l) => {
                running += 1;
                const editing = draft && edit?.id === l.id;
                const manual = l.price_source === "manual";
                const desc = lang === "ar" && l.description_ar ? l.description_ar : l.description;
                const qtyText = typed[l.id]?.qty ?? String(Number(l.qty));
                const priceText = typed[l.id]?.price ?? String(Number(l.unit_price_jod));
                return (
                  <tr key={l.id} className="border-b border-line align-top">
                    <td className="px-3 py-2 text-slate tabular-nums" dir="ltr">{running}</td>
                    <td className="px-3 py-2 whitespace-nowrap" dir="ltr">
                      {editing && manual ? (
                        <input
                          className="input w-32 min-w-[8rem]"
                          dir="ltr"
                          value={edit.code}
                          onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                        />
                      ) : (
                        l.code ?? ""
                      )}
                    </td>
                    <td className={`px-3 py-2 ${editing ? "min-w-[20rem]" : "min-w-[14rem]"}`}>
                      {editing ? (
                        <div className="space-y-2">
                          <input
                            className="input"
                            value={edit.description}
                            onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                          />
                          <input
                            className="input"
                            list="line-sections"
                            placeholder={t("quoteSectionHint")}
                            value={edit.section}
                            onChange={(e) => setEdit({ ...edit, section: e.target.value })}
                          />
                          <input
                            className="input"
                            placeholder={t("notes")}
                            value={edit.notes}
                            onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                          />
                        </div>
                      ) : (
                        <>
                          <div>{desc}</div>
                          {(l.item_no || l.notes) && (
                            <div className="text-xs text-slate">
                              {l.item_no && <span dir="ltr">{l.item_no}</span>}
                              {l.item_no && l.notes && " · "}
                              {l.notes}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate whitespace-nowrap" dir="ltr">
                      {editing && manual ? (
                        <div className="flex gap-1">
                          {(
                            [
                              ["w", edit.w],
                              ["h", edit.h],
                              ["d", edit.d],
                            ] as const
                          ).map(([k, v]) => (
                            <input
                              key={k}
                              className="input w-20 min-w-[5rem] px-2"
                              type="number"
                              min="0"
                              step="1"
                              dir="ltr"
                              value={v}
                              onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                            />
                          ))}
                        </div>
                      ) : (
                        dimsLabel(l.width_mm, l.height_mm, l.depth_mm)
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap" dir="ltr">
                      {draft ? (
                        <input
                          className="input w-24 min-w-[6rem] px-2 tabular-nums"
                          type="number"
                          min="0.01"
                          step="0.01"
                          dir="ltr"
                          disabled={busy}
                          value={qtyText}
                          onChange={(e) => setTypedField(l.id, "qty", e.target.value)}
                          onBlur={() => commit(l, "qty")}
                        />
                      ) : (
                        Number(l.qty)
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap" dir="ltr">
                      {draft ? (
                        <input
                          className="input w-32 min-w-[8rem] px-2 tabular-nums"
                          type="number"
                          min="0"
                          step="0.001"
                          dir="ltr"
                          disabled={busy}
                          value={priceText}
                          onChange={(e) => setTypedField(l.id, "price", e.target.value)}
                          onBlur={() => commit(l, "price")}
                        />
                      ) : (
                        jod(l.unit_price_jod)
                      )}
                      {!manual && priceChanged(l) && (
                        <div className="text-xs text-slate">
                          {t("quoteListPrice")}: {jod(l.list_price_jod)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums whitespace-nowrap" dir="ltr">
                      {jod(l.line_total_jod)}
                    </td>
                    {draft && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        {editing ? (
                          <div className="flex gap-1">
                            <button className="btn-ghost p-2" disabled={busy} onClick={() => saveEdit(l)} aria-label={t("save")}>
                              <Check size={15} />
                            </button>
                            <button className="btn-ghost p-2" onClick={() => setEdit(null)} aria-label={t("cancel")}>
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button className="btn-ghost p-2" onClick={() => startEdit(l)} aria-label={t("quoteEditLine")} title={t("quoteEditLine")}>
                              <Pencil size={15} />
                            </button>
                            {confirmId === l.id ? (
                              <div className="flex items-center gap-1 text-rust text-xs">
                                <span>{t("quoteRemoveConfirm")}</span>
                                <button
                                  className="btn-ghost p-2 text-rust"
                                  disabled={busy}
                                  onClick={async () => {
                                    await onRemove(l.id);
                                    setConfirmId(null);
                                  }}
                                  aria-label={t("removeLine")}
                                >
                                  <Check size={15} />
                                </button>
                                <button className="btn-ghost p-2" onClick={() => setConfirmId(null)} aria-label={t("cancel")}>
                                  <X size={15} />
                                </button>
                              </div>
                            ) : (
                              <button
                                className="btn-ghost p-2 text-rust"
                                disabled={busy}
                                onClick={() => setConfirmId(l.id)}
                                aria-label={t("removeLine")}
                                title={t("removeLine")}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr className="border-b border-line">
                <td colSpan={6} className="px-3 py-2 text-end text-xs text-slate">
                  {t("quoteSectionTotal")}
                </td>
                <td className="px-3 py-2 text-end tabular-nums font-medium whitespace-nowrap" dir="ltr">
                  {jod(g.subtotal)}
                </td>
                {draft && <td />}
              </tr>
            </GroupRows>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A keyed fragment so each section's rows stay together. */
function GroupRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
