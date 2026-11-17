"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import type { BandingType } from "../products/bom_types";

function BandingRow({
  bt,
  onSaved,
}: {
  bt: BandingType;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState(bt.name);
  const [price, setPrice] = useState(String(bt.price_per_m_jod));
  const [active, setActive] = useState(bt.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = parseFloat(price);
  const dirty =
    name !== bt.name || priceNum !== Number(bt.price_per_m_jod) || active !== bt.is_active;

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || Number.isNaN(priceNum) || priceNum < 0) return;
    setSaving(true);
    setError(null);
    const { error: err } = await createClient()
      .from("banding_types")
      .update({ name: trimmed, price_per_m_jod: priceNum, is_active: active })
      .eq("id", bt.id);
    setSaving(false);
    if (err) {
      setError(err.message.includes("idx_banding_types_name") ? t("bandingNameExists") : err.message);
      return;
    }
    onSaved();
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${bt.is_active ? "" : "opacity-60"}`}>
      <input
        className="input flex-1 min-w-[160px]"
        value={name}
        aria-label={t("name")}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="input w-32"
        type="number" min="0" step="0.001" dir="ltr"
        value={price}
        aria-label={t("pricePerMetre")}
        onChange={(e) => setPrice(e.target.value)}
      />
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        {t("active")}
      </label>
      <button
        type="button"
        className="btn-primary"
        disabled={!dirty || saving || !name.trim()}
        onClick={handleSave}
      >
        {t("save")}
      </button>
      {error && <p className="text-rust text-xs w-full">{error}</p>}
    </div>
  );
}

export function BandingTypesCard({ bandingTypes }: { bandingTypes: BandingType[] }) {
  const { t } = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("0");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleAdd() {
    const trimmed = newName.trim();
    const price = parseFloat(newPrice);
    if (!trimmed || Number.isNaN(price) || price < 0) return;
    setAdding(true);
    setAddError(null);
    const { error } = await createClient()
      .from("banding_types")
      .insert({ name: trimmed, price_per_m_jod: price });
    setAdding(false);
    if (error) {
      setAddError(error.message.includes("idx_banding_types_name") ? t("bandingNameExists") : error.message);
      return;
    }
    setNewName("");
    setNewPrice("0");
    router.refresh();
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        className="btn-ghost flex items-center gap-2"
        onClick={() => setOpen((o) => !o)}
      >
        <Layers size={16} />
        {t("bandingTypes")}
      </button>
      {open && (
        <div className="card p-4 mt-2 space-y-3 max-w-2xl">
          {/* key forces a fresh row state after a refresh brings new values */}
          {bandingTypes.map((bt) => (
            <BandingRow
              key={`${bt.id}:${bt.name}:${bt.price_per_m_jod}:${bt.is_active}`}
              bt={bt}
              onSaved={() => router.refresh()}
            />
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-line">
            <input
              className="input flex-1 min-w-[160px]"
              placeholder={t("name")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="input w-32"
              type="number" min="0" step="0.001" dir="ltr"
              aria-label={t("pricePerMetre")}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={adding || !newName.trim()}
              onClick={handleAdd}
            >
              {t("add")}
            </button>
            {addError && <p className="text-rust text-xs w-full">{addError}</p>}
          </div>
          <p className="text-xs text-slate">{t("bandingTypesHelp")}</p>
        </div>
      )}
    </div>
  );
}
