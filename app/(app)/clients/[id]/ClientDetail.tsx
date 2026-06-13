"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import { jod } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import { ClientForm } from "../ClientForm";
import type { Client } from "../types";

const BADGE: Record<string, string> = {
  kitchen: "bg-brass/10 text-brassdk border border-brass/20",
  bedroom: "bg-sage/10 text-sage border border-sage/20",
  closet: "bg-slate/10 text-slate border border-slate/20",
  other: "bg-line text-slate border border-line",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-slate uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}

function InfoRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate mb-0.5">{label}</dt>
      <dd className="text-sm font-medium" dir={ltr ? "ltr" : undefined}>{value}</dd>
    </div>
  );
}

export function ClientDetail({ client }: { client: Client }) {
  const { t } = useLang();
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleEdited() {
    setFormOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const supabase = createClient();
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      setDeleting(false);
      setDeleteError(
        error.code === "23503" ? t("cantDelete") : error.message
      );
      return;
    }
    router.push("/clients");
  }

  const badgeClass =
    BADGE[client.project_type] ?? "bg-line text-slate border border-line";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink transition-colors"
        >
          <ArrowLeft size={15} className="rtl:rotate-180" />
          {t("backToClients")}
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold">{client.full_name}</h1>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeClass}`}
              >
                {t((`pt_${client.project_type}`) as TKey)}
              </span>
            </div>
            <p className="text-slate text-sm mt-1">
              {t("addedOn")}: {formatDate(client.created_at)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setFormOpen(true)}
              className="btn-ghost flex items-center gap-2 text-sm"
            >
              <Pencil size={15} />
              {t("editClient")}
            </button>
            <button
              onClick={() => { setDeleteConfirm(true); setDeleteError(null); }}
              className="btn-ghost flex items-center gap-2 text-sm text-rust"
            >
              <Trash2 size={15} />
              {t("delete")}
            </button>
          </div>
        </div>

        {deleteConfirm && (
          <div className="mt-4 p-4 rounded-xl border border-rust/30 bg-rust/5 flex flex-wrap items-center gap-4">
            <p className="text-sm flex-1">{t("deleteConfirmMsg")}</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-rust text-mist px-4 py-2 rounded-lg text-sm font-medium hover:bg-rust/90 disabled:opacity-50 transition"
              >
                {deleting ? t("deleting") : t("confirmDelete")}
              </button>
              <button
                onClick={() => { setDeleteConfirm(false); setDeleteError(null); }}
                className="btn-ghost text-sm"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        {deleteError && (
          <p className="mt-3 text-rust text-sm">{deleteError}</p>
        )}
      </div>

      {/* Row 1: Contact + Project Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact */}
        <div className="card p-5">
          <SectionTitle>{t("contact")}</SectionTitle>
          <div className="space-y-3">
            <a
              href={`tel:${client.phone}`}
              dir="ltr"
              className="flex items-center gap-2 text-sm hover:text-brass transition-colors"
            >
              <Phone size={15} className="shrink-0 text-slate" />
              {client.phone}
            </a>
            {client.email && (
              <a
                href={`mailto:${client.email}`}
                dir="ltr"
                className="flex items-center gap-2 text-sm hover:text-brass transition-colors"
              >
                <Mail size={15} className="shrink-0 text-slate" />
                {client.email}
              </a>
            )}
            {client.location && (
              <div className="flex items-center gap-2 text-sm text-slate">
                <MapPin size={15} className="shrink-0" />
                {client.location}
              </div>
            )}
          </div>
        </div>

        {/* Project Info */}
        <div className="card p-5">
          <SectionTitle>{t("projectInfo")}</SectionTitle>
          <dl className="space-y-3">
            <InfoRow
              label={t("projectType")}
              value={t((`pt_${client.project_type}`) as TKey)}
            />
            <InfoRow
              label={t("referralSource")}
              value={t((`ref_${client.referred_by}`) as TKey)}
            />
            {client.referred_note && (
              <InfoRow label={t("referredNote")} value={client.referred_note} />
            )}
            <InfoRow
              label={t("budget")}
              value={client.budget_jod != null ? jod(client.budget_jod) : "—"}
              ltr
            />
          </dl>
        </div>
      </div>

      {/* Details — full width, only if content exists */}
      {(client.prerequisites || client.notes) && (
        <div className="card p-5 space-y-4">
          <SectionTitle>{t("details")}</SectionTitle>
          {client.prerequisites && (
            <div>
              <p className="text-xs text-slate mb-1 font-medium">{t("prerequisites")}</p>
              <p className="text-sm whitespace-pre-wrap">{client.prerequisites}</p>
            </div>
          )}
          {client.notes && (
            <div>
              <p className="text-xs text-slate mb-1 font-medium">{t("notes")}</p>
              <p className="text-sm whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Row 2: Drive Folder + Projects & Quotations placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Drive Folder */}
        <div className="card p-5">
          <SectionTitle>{t("driveFolder")}</SectionTitle>
          {client.drive_folder_url ? (
            <a
              href={client.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost inline-flex items-center gap-2 text-sm"
            >
              <ExternalLink size={15} />
              {t("openDriveFolder")}
            </a>
          ) : (
            <p className="text-sm text-slate">{t("noFolderLinked")}</p>
          )}
        </div>

        {/* Projects & Quotations placeholder */}
        <div className="card p-5">
          <SectionTitle>{t("projectsQuotations")}</SectionTitle>
          <p className="text-sm text-slate">{t("comingSoon")}</p>
        </div>
      </div>

      {formOpen && (
        <ClientForm
          client={client}
          onClose={() => setFormOpen(false)}
          onSaved={handleEdited}
        />
      )}
    </div>
  );
}
