"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import { jod } from "@/lib/utils";

type SizeRow = {
  id: string;
  label: string | null;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
  calc_price_jod: number | null;
  price_jod: number;
  price_overridden: boolean;
  parts: number;
};

type Draft = { label: string; price: string };

/** Inputs live inside the product <form>: Enter must not submit it. */
function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.blur();
  }
}

export function StandardSizes({ productId }: { productId: string }) {
  const { t } = useLang();
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState({ label: "", w: "", h: "", d: "", price: "" });

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("product_sizes")
      .select("id, label, width_mm, height_mm, depth_mm, calc_price_jod, price_jod, price_overridden")
      .eq("product_id", productId)
      .order("width_mm")
      .order("height_mm")
      .order("depth_mm");
    if (err) { setError(err.message); setLoading(false); return; }

    const { data: lines } = await supabase
      .from("bom_lines")
      .select("size_id")
      .eq("product_id", productId)
      .not("size_id", "is", null);
    const counts = new Map<string, number>();
    for (const l of lines ?? []) {
      const k = l.size_id as string;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    const rows = (data ?? []).map((r) => ({
      id: r.id as string,
      label: (r.label as string | null) ?? null,
      width_mm: Number(r.width_mm),
      height_mm: Number(r.height_mm),
      depth_mm: Number(r.depth_mm),
      calc_price_jod: r.calc_price_jod != null ? Number(r.calc_price_jod) : null,
      price_jod: Number(r.price_jod),
      price_overridden: Boolean(r.price_overridden),
      parts: counts.get(r.id as string) ?? 0,
    }));
    setSizes(rows);
    setDrafts(
      Object.fromEntries(
        rows.map((r) => [r.id, { label: r.label ?? "", price: String(r.price_jod) }]),
      ),
    );
    setLoading(false);
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function saveRow(row: SizeRow) {
    const d = drafts[row.id];
    if (!d) return;
    const price = parseFloat(d.price);
    const label = d.label.trim() || null;
    if (Number.isNaN(price) || price < 0) {
      setDraft(row.id, { price: String(row.price_jod) });
      return;
    }
    if (label === row.label && price === row.price_jod) return;
    setError(null);
    const { error: err } = await createClient()
      .from("product_sizes")
      .update({ label, price_jod: price, price_overridden: true })
      .eq("id", row.id);
    if (err) { setError(err.message); return; }
    await load();
  }

  async function resetToCalculated(id: string) {
    setError(null);
    const { error: err } = await createClient()
      .from("product_sizes")
      .update({ price_overridden: false })
      .eq("id", id);
    if (err) { setError(err.message); return; }
    await load();
  }

  async function handleAdd() {
    const w = Math.round(parseFloat(add.w));
    const h = Math.round(parseFloat(add.h));
    const dp = Math.round(parseFloat(add.d));
    const typed = add.price.trim() !== "";
    const price = parseFloat(add.price) || 0;
    if (!(w > 0 && h > 0 && dp > 0) || price < 0) return;
    setAdding(true);
    setError(null);
    const { error: err } = await createClient().from("product_sizes").insert({
      product_id: productId,
      label: add.label.trim() || null,
      width_mm: w,
      height_mm: h,
      depth_mm: dp,
      price_jod: price,
      price_overridden: typed,
    });
    setAdding(false);
    if (err) {
      setError(err.code === "23505" || err.message.includes("product_sizes_unique_dims")
        ? t("sizeExists")
        : err.message);
      return;
    }
    setAdd({ label: "", w: "", h: "", d: "", price: "" });
    await load();
  }

  async function handleDelete(id: string) {
    setError(null);
    const { error: err } = await createClient().from("product_sizes").delete().eq("id", id);
    setConfirmId(null);
    if (err) { setError(err.message); return; }
    await load();
  }

  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="bg-mist px-4 py-2.5 border-b border-line">
        <span className="text-sm font-semibold">{t("standardSizes")}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-slate">
              <th className="text-start px-3 py-2 font-medium">{t("sizeLabel")}</th>
              <th className="text-start px-3 py-2 font-medium">W</th>
              <th className="text-start px-3 py-2 font-medium">H</th>
              <th className="text-start px-3 py-2 font-medium">D (mm)</th>
              <th className="text-start px-3 py-2 font-medium">{t("sizeParts")}</th>
              <th className="text-start px-3 py-2 font-medium">{t("sizeCalculated")}</th>
              <th className="text-start px-3 py-2 font-medium">{t("unitPrice")}</th>
              <th className="px-3 py-2 w-24" />
            </tr>
          </thead>
          <tbody>
            {!loading && sizes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-xs text-slate">{t("sizeNone")}</td>
              </tr>
            )}
            {sizes.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-3 py-1.5">
                  <input
                    className="input"
                    value={drafts[row.id]?.label ?? ""}
                    onChange={(e) => setDraft(row.id, { label: e.target.value })}
                    onBlur={() => saveRow(row)}
                    onKeyDown={blurOnEnter}
                  />
                </td>
                <td className="px-3 py-1.5 tabular-nums" dir="ltr">{row.width_mm}</td>
                <td className="px-3 py-1.5 tabular-nums" dir="ltr">{row.height_mm}</td>
                <td className="px-3 py-1.5 tabular-nums" dir="ltr">{row.depth_mm}</td>
                <td className="px-3 py-1.5 tabular-nums">{row.parts}</td>
                <td className="px-3 py-1.5 tabular-nums text-slate" dir="ltr">
                  {row.calc_price_jod != null ? jod(row.calc_price_jod) : "—"}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1">
                    <input
                      className={`input w-32 ${row.price_overridden ? "" : "text-slate"}`}
                      type="number" min="0" step="0.001" dir="ltr"
                      title={row.price_overridden ? undefined : t("priceIsCalculated")}
                      value={drafts[row.id]?.price ?? ""}
                      onChange={(e) => setDraft(row.id, { price: e.target.value })}
                      onBlur={() => saveRow(row)}
                      onKeyDown={blurOnEnter}
                    />
                    {row.price_overridden && row.calc_price_jod != null && (
                      <button
                        type="button"
                        className="btn-ghost text-xs whitespace-nowrap"
                        onClick={() => resetToCalculated(row.id)}
                      >
                        {t("useCalculated")}
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  {confirmId === row.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button" className="btn-ghost text-rust text-xs"
                        onClick={() => handleDelete(row.id)}
                      >
                        {t("delete")}
                      </button>
                      <button
                        type="button" className="btn-ghost text-xs"
                        onClick={() => setConfirmId(null)}
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button" className="btn-ghost text-rust p-1.5"
                      aria-label={t("delete")}
                      onClick={() => setConfirmId(row.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {/* Add size */}
            <tr className="bg-mist/30">
              <td className="px-3 py-1.5">
                <input
                  className="input" placeholder={t("sizeLabel")}
                  value={add.label}
                  onChange={(e) => setAdd((a) => ({ ...a, label: e.target.value }))}
                  onKeyDown={blurOnEnter}
                />
              </td>
              {(["w", "h", "d"] as const).map((k) => (
                <td key={k} className="px-3 py-1.5">
                  <input
                    className="input w-20" type="number" min="1" step="1" dir="ltr"
                    placeholder={k.toUpperCase()}
                    value={add[k]}
                    onChange={(e) => setAdd((a) => ({ ...a, [k]: e.target.value }))}
                    onKeyDown={blurOnEnter}
                  />
                </td>
              ))}
              <td />
              <td />
              <td className="px-3 py-1.5">
                <input
                  className="input w-32" type="number" min="0" step="0.001" dir="ltr"
                  placeholder="0.000"
                  value={add.price}
                  onChange={(e) => setAdd((a) => ({ ...a, price: e.target.value }))}
                  onKeyDown={blurOnEnter}
                />
              </td>
              <td className="px-3 py-1.5">
                <button
                  type="button"
                  className="btn-ghost text-sm flex items-center gap-1"
                  disabled={adding || !add.w || !add.h || !add.d}
                  onClick={handleAdd}
                >
                  <Plus size={14} />
                  {t("sizeAdd")}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {error && <p className="text-rust text-sm px-4 py-2">{error}</p>}
    </div>
  );
}
