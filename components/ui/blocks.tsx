"use client";

import { useLang } from "@/components/lang-provider";
import type { TKey } from "@/lib/i18n";
import type { LucideIcon } from "lucide-react";

export function PageTitle({ titleKey }: { titleKey: TKey }) {
  const { t } = useLang();
  return <h1 className="text-2xl font-semibold mb-6">{t(titleKey)}</h1>;
}

export function StatCard({
  labelKey,
  value,
  icon: Icon,
  accent,
}: {
  labelKey: TKey;
  value: string | number;
  icon: LucideIcon;
  accent?: "brass" | "sage" | "rust";
}) {
  const { t } = useLang();
  const color =
    accent === "sage" ? "text-sage" : accent === "rust" ? "text-rust" : "text-brass";
  return (
    <div className="card p-5 flex items-start justify-between">
      <div>
        <div className="text-slate text-sm">{t(labelKey)}</div>
        <div className="text-3xl font-semibold mt-2">{value}</div>
      </div>
      <Icon className={color} size={26} />
    </div>
  );
}

export function Placeholder({ titleKey }: { titleKey: TKey }) {
  const { t } = useLang();
  return (
    <div>
      <PageTitle titleKey={titleKey} />
      <div className="card p-12 text-center text-slate">
        <p className="text-lg">{t(titleKey)}</p>
        <p className="mt-2 text-sm">{t("comingSoon")}</p>
      </div>
    </div>
  );
}
