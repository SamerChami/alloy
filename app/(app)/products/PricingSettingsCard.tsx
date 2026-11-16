"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import type { PricingSettings } from "@/lib/pricing";

export function PricingSettingsCard({ settings }: { settings: PricingSettings }) {
  const { t } = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [waste, setWaste] = useState(String(settings.wastePct));
  const [step, setStep] = useState(String(settings.roundingStepJod));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const w = parseFloat(waste);
    const s = parseFloat(step);
    if (Number.isNaN(w) || w < 0 || w > 100 || Number.isNaN(s) || s < 0) return;
    setSaving(true);
    setError(null);
    // pricing_settings is a single-row table; the id is always true, so this targets the one row.
    const { error: err } = await createClient()
      .from("pricing_settings")
      .update({ waste_pct: w, rounding_step_jod: s })
      .eq("id", true);
    setSaving(false);
    if (err) { setError(err.message); return; }
    router.refresh();
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        className="btn-ghost flex items-center gap-2"
        onClick={() => setOpen((o) => !o)}
      >
        <Settings size={16} />
        {t("pricingSettings")}
      </button>
      {open && (
        <div className="card p-4 mt-2 space-y-3 max-w-xl">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("wastePct")}</label>
              <input
                className="input" type="number" min="0" max="100" step="0.5" dir="ltr"
                value={waste} onChange={(e) => setWaste(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("roundingStep")}</label>
              <input
                className="input" type="number" min="0" step="0.5" dir="ltr"
                value={step} onChange={(e) => setStep(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-slate">{t("pricingSettingsHelp")}</p>
          {error && <p className="text-rust text-sm">{error}</p>}
          <button
            type="button" className="btn-primary" disabled={saving} onClick={handleSave}
          >
            {t("save")}
          </button>
        </div>
      )}
    </div>
  );
}
