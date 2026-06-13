"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLang } from "@/components/lang-provider";

export function ClientNotFound() {
  const { t } = useLang();
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">{t("clients")}</h1>
      <div className="card p-12 text-center text-slate space-y-4">
        <p className="text-lg font-medium">{t("clientNotFound")}</p>
        <Link
          href="/clients"
          className="btn-ghost inline-flex items-center gap-2"
        >
          <ArrowLeft size={15} className="rtl:rotate-180" />
          {t("backToClients")}
        </Link>
      </div>
    </div>
  );
}
