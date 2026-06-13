"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import type { TKey } from "@/lib/i18n";
import type { Client } from "./types";

const PROJECT_TYPES = ["kitchen", "bedroom", "closet", "other"] as const;
const REFERRAL_SOURCES = [
  "friend",
  "social_media",
  "instagram",
  "facebook",
  "returning_client",
  "walk_in",
  "referral_partner",
  "website",
  "other",
] as const;

type FormState = {
  full_name: string;
  phone: string;
  email: string;
  location: string;
  project_type: string;
  referred_by: string;
  referred_note: string;
  budget_jod: string;
  prerequisites: string;
  notes: string;
  drive_folder_url: string;
};

function fromClient(c: Client | null): FormState {
  return {
    full_name: c?.full_name ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    location: c?.location ?? "",
    project_type: c?.project_type ?? "kitchen",
    referred_by: c?.referred_by ?? "walk_in",
    referred_note: c?.referred_note ?? "",
    budget_jod: c?.budget_jod != null ? String(c.budget_jod) : "",
    prerequisites: c?.prerequisites ?? "",
    notes: c?.notes ?? "",
    drive_folder_url: c?.drive_folder_url ?? "",
  };
}

export function ClientForm({
  client,
  onClose,
  onSaved,
}: {
  client: Client | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const [form, setForm] = useState<FormState>(() => fromClient(client));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof FormState) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      location: form.location.trim() || null,
      project_type: form.project_type,
      referred_by: form.referred_by,
      referred_note: form.referred_note.trim() || null,
      budget_jod: form.budget_jod !== "" ? parseFloat(form.budget_jod) : null,
      prerequisites: form.prerequisites.trim() || null,
      notes: form.notes.trim() || null,
      drive_folder_url: form.drive_folder_url.trim() || null,
    };

    if (client?.id) {
      const { error: err } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", client.id);
      if (err) { setSaving(false); setError(err.message); return; }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase
        .from("clients")
        .insert({ ...payload, created_by: user?.id });
      if (err) { setSaving(false); setError(err.message); return; }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4">
      <div className="card w-full max-w-lg my-8 shrink-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold">
            {client ? t("editClient") : t("addClient")}
          </h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label={t("cancel")}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("clientName")} *</label>
              <input className="input" required value={form.full_name} onChange={set("full_name")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("phone")} *</label>
              <input
                className="input"
                type="tel"
                required
                dir="ltr"
                value={form.phone}
                onChange={set("phone")}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("email")}</label>
              <input
                className="input"
                type="email"
                dir="ltr"
                value={form.email}
                onChange={set("email")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("location")}</label>
              <input className="input" value={form.location} onChange={set("location")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("projectType")} *</label>
              <select className="input" required value={form.project_type} onChange={set("project_type")}>
                {PROJECT_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {t((`pt_${pt}`) as TKey)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("referralSource")} *</label>
              <select className="input" required value={form.referred_by} onChange={set("referred_by")}>
                {REFERRAL_SOURCES.map((r) => (
                  <option key={r} value={r}>
                    {t((`ref_${r}`) as TKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("referredNote")}</label>
              <input className="input" value={form.referred_note} onChange={set("referred_note")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("budget")}</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.001"
                dir="ltr"
                value={form.budget_jod}
                onChange={set("budget_jod")}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t("prerequisites")}</label>
            <textarea className="input" rows={3} value={form.prerequisites} onChange={set("prerequisites")} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t("notes")}</label>
            <textarea className="input" rows={2} value={form.notes} onChange={set("notes")} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t("driveFolderUrl")}</label>
            <input
              className="input"
              type="url"
              dir="ltr"
              placeholder="https://drive.google.com/…"
              value={form.drive_folder_url}
              onChange={set("drive_folder_url")}
            />
          </div>

          {error && <p className="text-rust text-sm">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "…" : t("save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
