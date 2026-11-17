"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { PageTitle } from "@/components/ui/blocks";
import { jod } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import { isPastValidity, type QuoteStatus } from "@/lib/quotations";
import { NewQuotationForm } from "./NewQuotationForm";
import { StatusBadge } from "./StatusBadge";

export type ClientOption = { id: string; full_name: string; phone: string };

export type QuotationListRow = {
  id: string;
  code: string;
  title: string | null;
  status: QuoteStatus;
  issue_date: string;
  valid_until: string | null;
  total_jod: number;
  revision: number;
  client: { id: string; full_name: string } | null;
};

const FILTERS: Array<QuoteStatus | "all"> = ["all", "draft", "sent", "approved", "rejected", "expired"];

export function QuotationsShell({
  quotations,
  clients,
  presetClientId,
}: {
  quotations: QuotationListRow[];
  clients: ClientOption[];
  presetClientId: string | null;
}) {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "all">("all");
  const [formOpen, setFormOpen] = useState(presetClientId != null);
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotations.filter((x) => {
      if (status !== "all" && x.status !== status) return false;
      if (!q) return true;
      return (
        x.code.toLowerCase().includes(q) ||
        (x.client?.full_name ?? "").toLowerCase().includes(q) ||
        (x.title ?? "").toLowerCase().includes(q)
      );
    });
  }, [quotations, search, status]);

  return (
    <div>
      <PageTitle titleKey="quotations" />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[12rem] max-w-sm">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate pointer-events-none" />
          <input
            className="input ps-9"
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setFormOpen(true)}>
          <Plus size={16} />
          {t("newQuotation")}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatus(f)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              status === f ? "bg-ink text-mist border-ink" : "border-line text-slate hover:bg-mist"
            }`}
          >
            {f === "all" ? t("quoteStatusAll") : t(`quoteStatus_${f}` as TKey)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate">
          <p>{t("noQuotations")}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-mist">
                  <th className="text-start px-4 py-3 font-medium">{t("quoteNumber")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("quoteClient")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("quoteTitle")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("quoteDate")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("quoteValidUntil")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("quoteStatus")}</th>
                  <th className="text-end px-4 py-3 font-medium">{t("quoteTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.id} className="border-b border-line last:border-0 hover:bg-mist/50 transition-colors">
                    <td className="px-4 py-3 font-medium" dir="ltr">
                      <Link href={`/quotations/${x.id}`} className="hover:text-brass transition-colors">
                        {x.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {x.client ? (
                        <Link href={`/clients/${x.client.id}`} className="hover:text-brass transition-colors">
                          {x.client.full_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate">{x.title ?? "—"}</td>
                    <td className="px-4 py-3 text-slate" dir="ltr">{x.issue_date}</td>
                    <td className="px-4 py-3 text-slate">
                      <span dir="ltr">{x.valid_until ?? "—"}</span>
                      {isPastValidity(x.status, x.valid_until, today) && (
                        <div className="text-rust text-xs">{t("quotePastValidity")}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={x.status} />
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums" dir="ltr">{jod(x.total_jod)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formOpen && (
        <NewQuotationForm clients={clients} presetClientId={presetClientId} onClose={() => setFormOpen(false)} />
      )}
    </div>
  );
}
