"use client";

import { useLang } from "@/components/lang-provider";
import type { TKey } from "@/lib/i18n";
import type { QuoteStatus } from "@/lib/quotations";

const STYLE: Record<QuoteStatus, string> = {
  draft: "bg-line text-slate",
  sent: "bg-brass/10 text-brassdk",
  approved: "bg-sage/10 text-sage",
  rejected: "bg-rust/10 text-rust",
  expired: "bg-slate/10 text-slate",
};

export function StatusBadge({ status }: { status: QuoteStatus }) {
  const { t } = useLang();
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STYLE[status] ?? STYLE.draft}`}>
      {t(`quoteStatus_${status}` as TKey)}
    </span>
  );
}
