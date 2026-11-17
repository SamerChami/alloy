"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import type { ClientOption } from "./QuotationsShell";

export function NewQuotationForm({
  clients,
  presetClientId,
  onClose,
}: {
  clients: ClientOption[];
  presetClientId: string | null;
  onClose: () => void;
}) {
  const { t } = useLang();
  const router = useRouter();
  const [clientId, setClientId] = useState(
    presetClientId && clients.some((c) => c.id === presetClientId) ? presetClientId : "",
  );
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const supabase = createClient();
    // Number, tax and validity come from the database.
    const { data, error: err } = await supabase
      .from("quotations")
      .insert({ client_id: clientId, title: title.trim() || null })
      .select("id")
      .single();
    if (err || !data) {
      setSaving(false);
      setError(err?.message ?? "");
      return;
    }
    router.push("/quotations/" + data.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4">
      <div className="card w-full max-w-lg my-8 shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold">{t("newQuotation")}</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label={t("cancel")}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t("quoteClient")} *</label>
            <select className="input" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="" />
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} — {c.phone}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("quoteTitle")}</label>
            <input
              className="input"
              placeholder={t("quoteTitleHint")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {error && <p className="text-rust text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={saving || !clientId}>
              {saving ? "…" : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
