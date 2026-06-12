"use client";

import Link from "next/link";
import { FolderKanban, FileText, Receipt, Boxes, UserPlus, FilePlus } from "lucide-react";
import { PageTitle, StatCard } from "@/components/ui/blocks";
import { useLang } from "@/components/lang-provider";

export function DashboardStats({
  stats,
}: {
  stats: {
    activeProjects: number;
    openQuotations: number;
    unpaidInvoices: number;
    lowStock: number;
  };
}) {
  const { t } = useLang();
  return (
    <div>
      <PageTitle titleKey="overview" />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard labelKey="activeProjects" value={stats.activeProjects} icon={FolderKanban} />
        <StatCard labelKey="openQuotations" value={stats.openQuotations} icon={FileText} />
        <StatCard labelKey="unpaidInvoices" value={stats.unpaidInvoices} icon={Receipt} accent="rust" />
        <StatCard labelKey="lowStock" value={stats.lowStock} icon={Boxes} accent="rust" />
      </div>

      <h2 className="text-lg font-medium mt-10 mb-4">{t("quickActions")}</h2>
      <div className="flex flex-wrap gap-3">
        <Link href="/clients" className="card px-5 py-4 flex items-center gap-3 hover:border-brass transition">
          <UserPlus className="text-brass" size={20} />
          <span>{t("newClient")}</span>
        </Link>
        <Link href="/quotations" className="card px-5 py-4 flex items-center gap-3 hover:border-brass transition">
          <FilePlus className="text-brass" size={20} />
          <span>{t("newQuotation")}</span>
        </Link>
      </div>
    </div>
  );
}
