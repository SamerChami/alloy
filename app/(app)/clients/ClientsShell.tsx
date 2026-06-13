"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, Pencil } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { PageTitle } from "@/components/ui/blocks";
import { jod } from "@/lib/utils";
import type { TKey } from "@/lib/i18n";
import { ClientForm } from "./ClientForm";
import type { Client } from "./types";

export function ClientsShell({ initialClients }: { initialClients: Client[] }) {
  const { t } = useLang();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Client | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialClients;
    return initialClients.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.location ?? "").toLowerCase().includes(q)
    );
  }, [initialClients, search]);

  function openAdd() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEdit(c: Client) {
    setEditTarget(c);
    setFormOpen(true);
  }

  function handleSaved() {
    setFormOpen(false);
    router.refresh();
  }

  return (
    <div>
      <PageTitle titleKey="clients" />

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={16}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-slate pointer-events-none"
          />
          <input
            className="input ps-9"
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={openAdd}>
          <Plus size={16} />
          {t("addClient")}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate">
          <p>{t("noClients")}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-mist">
                  <th className="text-start px-4 py-3 font-medium">{t("clientName")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("phone")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("location")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("projectType")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("referralSource")}</th>
                  <th className="text-start px-4 py-3 font-medium">{t("budget")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-line last:border-0 hover:bg-mist/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/clients/${c.id}`}
                        className="hover:text-brass transition-colors"
                      >
                        {c.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate" dir="ltr">{c.phone}</td>
                    <td className="px-4 py-3 text-slate">{c.location ?? "—"}</td>
                    <td className="px-4 py-3">{t((`pt_${c.project_type}`) as TKey)}</td>
                    <td className="px-4 py-3">{t((`ref_${c.referred_by}`) as TKey)}</td>
                    <td className="px-4 py-3 tabular-nums" dir="ltr">
                      {c.budget_jod != null ? jod(c.budget_jod) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="btn-ghost p-2"
                        onClick={() => openEdit(c)}
                        aria-label={t("editClient")}
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formOpen && (
        <ClientForm
          client={editTarget}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
