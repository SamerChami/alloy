"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Plus, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import type { TKey } from "@/lib/i18n";
import {
  QUOTATION_COLUMNS,
  QUOTATION_ITEM_COLUMNS,
  isDraft,
  isPastValidity,
  nextStatuses,
  sectionNames,
  todayInAmman,
  type QuoteStatus,
  type QuotationItemRow,
  type QuotationRow,
} from "@/lib/quotations";
import { StatusBadge } from "../StatusBadge";
import { CataloguePicker, type CatalogueItem, type CatalogueSize } from "./CataloguePicker";
import { LinesTable } from "./LinesTable";
import { ManualLineForm } from "./ManualLineForm";
import { SketchUpImportDialog } from "./SketchUpImportDialog";
import { TotalsCard } from "./TotalsCard";

export type QuotationWithClient = QuotationRow & {
  client: { id: string; full_name: string; phone: string } | null;
};
export type FamilyMember = { id: string; code: string; status: QuoteStatus; revision: number };

type Patch = Record<string, string | number | null>;
type Pending = QuoteStatus | "delete" | null;

export function QuotationEditor({
  quotation: initialQuotation,
  lines: initialLines,
  family,
  catalogue,
  sizes,
}: {
  quotation: QuotationWithClient;
  lines: QuotationItemRow[];
  family: FamilyMember[];
  catalogue: CatalogueItem[];
  sizes: CatalogueSize[];
}) {
  const { t } = useLang();
  const router = useRouter();
  const [quotation, setQuotation] = useState(initialQuotation);
  const [lines, setLines] = useState(initialLines);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = createClient();

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const draft = isDraft(quotation.status);
  const today = todayInAmman();

  /** Read the quotation and its lines again: what the database says is what we show. */
  async function reload() {
    const [{ data: q }, { data: l }] = await Promise.all([
      supabase.from("quotations").select(QUOTATION_COLUMNS).eq("id", quotation.id).maybeSingle(),
      supabase
        .from("quotation_items")
        .select(QUOTATION_ITEM_COLUMNS)
        .eq("quotation_id", quotation.id)
        .order("sort_order")
        .order("id"),
    ]);
    if (q) setQuotation((prev) => ({ ...prev, ...(q as unknown as QuotationRow) }));
    if (l) setLines(l as unknown as QuotationItemRow[]);
  }

  /** Every write: run it, show the database's message if it refuses, then reload. */
  async function write(op: () => PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const { error: err } = await op();
    if (err) setError(err.message);
    await reload();
    setBusy(false);
    if (!err) {
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    }
    return !err;
  }

  const updateQuotation = (patch: Patch) =>
    write(() => supabase.from("quotations").update(patch).eq("id", quotation.id));
  const updateLine = (id: string, patch: Patch) =>
    write(() => supabase.from("quotation_items").update(patch).eq("id", id));
  const removeLine = (id: string) => write(() => supabase.from("quotation_items").delete().eq("id", id));

  async function changeStatus(status: QuoteStatus) {
    setPending(null);
    const ok = await updateQuotation({ status });
    if (ok) router.refresh();
  }

  async function deleteDraft() {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("quotations").delete().eq("id", quotation.id);
    if (err) {
      setError(err.message);
      setPending(null);
      setBusy(false);
      return;
    }
    router.push("/quotations");
  }

  async function newRevision() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("revise_quotation", { p_quotation_id: quotation.id });
    if (err || !data) {
      setError(err?.message ?? "");
      setBusy(false);
      return;
    }
    router.push("/quotations/" + data);
  }

  const allowed = nextStatuses(quotation.status);
  const sections = sectionNames(lines);
  const nextSort = lines.reduce((m, l) => Math.max(m, l.sort_order), 0) + 1;
  const validityPassed = isPastValidity(quotation.status, quotation.valid_until, today);
  const editableMeta = draft || quotation.status === "sent";

  return (
    <div className="space-y-6">
      {/* A. Header */}
      <div>
        <Link
          href="/quotations"
          className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink transition-colors"
        >
          <ArrowLeft size={15} className="rtl:rotate-180" />
          {t("backToQuotations")}
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold" dir="ltr">{quotation.code}</h1>
              <StatusBadge status={quotation.status} />
              {saved && (
                <span className="inline-flex items-center gap-1 text-sage text-xs">
                  <Check size={13} />
                  {t("quoteSaved")}
                </span>
              )}
              {quotation.client && (
                <Link href={`/clients/${quotation.client.id}`} className="text-sm text-slate hover:text-brass transition-colors">
                  {quotation.client.full_name}
                </Link>
              )}
            </div>
            {family.length > 1 && (
              <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-slate">
                <span>{t("quoteRevisions")}:</span>
                {family.map((f) => (
                  <span key={f.id} className="inline-flex items-center gap-1">
                    <Link
                      href={`/quotations/${f.id}`}
                      dir="ltr"
                      className={f.id === quotation.id ? "font-bold text-ink" : "hover:text-brass"}
                    >
                      {f.code}
                    </Link>
                    <StatusBadge status={f.status} />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* B. Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {draft && (
              <>
                <button
                  className="btn-primary text-sm"
                  disabled={busy || lines.length === 0}
                  onClick={() => changeStatus("sent")}
                >
                  {t("quoteMarkSent")}
                </button>
                <button
                  className="btn-ghost flex items-center gap-2 text-sm text-rust"
                  disabled={busy}
                  onClick={() => setPending("delete")}
                >
                  <Trash2 size={15} />
                  {t("quoteDelete")}
                </button>
              </>
            )}
            {quotation.status === "sent" && (
              <>
                {allowed.includes("draft") && (
                  <button className="btn-ghost text-sm" disabled={busy} onClick={() => changeStatus("draft")}>
                    {t("quoteBackToDraft")}
                  </button>
                )}
                {allowed.includes("approved") && (
                  <button className="btn-primary text-sm" disabled={busy} onClick={() => setPending("approved")}>
                    {t("quoteMarkApproved")}
                  </button>
                )}
                {allowed.includes("rejected") && (
                  <button className="btn-ghost text-sm" disabled={busy} onClick={() => setPending("rejected")}>
                    {t("quoteMarkRejected")}
                  </button>
                )}
                {allowed.includes("expired") && (
                  <button className="btn-ghost text-sm" disabled={busy} onClick={() => setPending("expired")}>
                    {t("quoteMarkExpired")}
                  </button>
                )}
              </>
            )}
            <button className="btn-ghost flex items-center gap-2 text-sm" disabled={busy} onClick={newRevision}>
              <Copy size={15} />
              {t("quoteNewRevision")}
            </button>
          </div>
        </div>

        {draft && lines.length === 0 && <p className="mt-2 text-xs text-slate">{t("quoteNoLines")}</p>}

        {pending && (
          <div className="mt-4 p-4 rounded-xl border border-rust/30 bg-rust/5 flex flex-wrap items-center gap-4">
            <p className="text-sm flex-1">
              {pending === "delete" ? t("quoteDeleteConfirm") : t("quoteFinalConfirm")}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                disabled={busy}
                onClick={() => (pending === "delete" ? deleteDraft() : changeStatus(pending))}
                className="bg-rust text-mist px-4 py-2 rounded-lg text-sm font-medium hover:bg-rust/90 disabled:opacity-50 transition"
              >
                {pending === "delete" ? t("confirmDelete") : t(`quoteStatus_${pending}` as TKey)}
              </button>
              <button onClick={() => setPending(null)} className="btn-ghost text-sm">
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-rust text-sm">{error}</p>}
      </div>

      {/* C. Details */}
      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <DetailField
          label={t("quoteTitle")}
          value={quotation.title ?? ""}
          editable={draft}
          onSave={(v) => updateQuotation({ title: v.trim() || null })}
        />
        <DetailField
          label={t("quoteDate")}
          type="date"
          value={quotation.issue_date}
          editable={draft}
          required
          onSave={(v) => updateQuotation({ issue_date: v })}
        />
        <DetailField
          label={t("quoteValidUntil")}
          type="date"
          value={quotation.valid_until ?? ""}
          editable={editableMeta}
          hint={validityPassed ? t("quotePastValidity") : undefined}
          onSave={(v) => updateQuotation({ valid_until: v || null })}
        />
        <DetailField
          label={t("notes")}
          multiline
          value={quotation.notes ?? ""}
          editable={editableMeta}
          onSave={(v) => updateQuotation({ notes: v.trim() || null })}
        />
      </div>

      {/* D. Lines */}
      <div className="card p-5">
        <h2 className="text-xs font-semibold text-slate uppercase tracking-wider mb-3">{t("quoteLines")}</h2>
        {lines.length === 0 ? (
          <p className="text-sm text-slate">{t("quoteNoLinesYet")}</p>
        ) : (
          <LinesTable lines={lines} draft={draft} busy={busy} onUpdate={updateLine} onRemove={removeLine} />
        )}
        {draft && (
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="btn-primary flex items-center gap-2 text-sm" onClick={() => setPickerOpen(true)}>
              <Plus size={15} />
              {t("quoteAddFromCatalogue")}
            </button>
            <button className="btn-ghost flex items-center gap-2 text-sm" onClick={() => setManualOpen(true)}>
              <Plus size={15} />
              {t("quoteAddManual")}
            </button>
            <button className="btn-ghost flex items-center gap-2 text-sm" onClick={() => setImportOpen(true)}>
              <Upload size={15} />
              {t("quoteImportSketchUp")}
            </button>
          </div>
        )}
      </div>

      {/* E. Totals */}
      <TotalsCard quotation={quotation} lines={lines} draft={draft} busy={busy} onUpdate={updateQuotation} />

      {pickerOpen && draft && (
        <CataloguePicker
          quotationId={quotation.id}
          catalogue={catalogue}
          sizes={sizes}
          sections={sections}
          onClose={() => setPickerOpen(false)}
          onAdded={reload}
        />
      )}
      {importOpen && draft && (
        <SketchUpImportDialog
          quotationId={quotation.id}
          sections={sections}
          lines={lines}
          onClose={() => setImportOpen(false)}
          onImported={reload}
        />
      )}
      {manualOpen && draft && (
        <ManualLineForm
          quotationId={quotation.id}
          sections={sections}
          nextSortOrder={nextSort}
          onClose={() => setManualOpen(false)}
          onAdded={reload}
        />
      )}
    </div>
  );
}

/** One details field: an input saved on blur when editable, plain text otherwise. */
function DetailField({
  label,
  value,
  editable,
  onSave,
  type = "text",
  multiline,
  required,
  hint,
}: {
  label: string;
  value: string;
  editable: boolean;
  onSave: (v: string) => Promise<boolean>;
  type?: "text" | "date";
  multiline?: boolean;
  required?: boolean;
  hint?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value;

  async function commit() {
    const v = text;
    setText(null);
    if (v === null || v === value) return;
    if (required && v.trim() === "") return;
    await onSave(v);
  }

  return (
    <div className={multiline ? "md:col-span-2" : undefined}>
      <label className="block text-xs text-slate mb-1">{label}</label>
      {editable ? (
        multiline ? (
          <textarea className="input" rows={2} value={shown} onChange={(e) => setText(e.target.value)} onBlur={commit} />
        ) : (
          <input
            className="input"
            type={type}
            dir={type === "date" ? "ltr" : undefined}
            value={shown}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
          />
        )
      ) : (
        <p className="text-sm font-medium whitespace-pre-wrap" dir={type === "date" ? "ltr" : undefined}>
          {value || "—"}
        </p>
      )}
      {hint && <p className="text-rust text-xs mt-1">{hint}</p>}
    </div>
  );
}
