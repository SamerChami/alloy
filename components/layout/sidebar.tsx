"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Languages } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";
import { navForRole, type Role } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar({ role, name }: { role: Role; name: string }) {
  const { t, toggle } = useLang();
  const pathname = usePathname();
  const router = useRouter();
  const items = navForRole(role);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 shrink-0 bg-ink text-mist flex flex-col min-h-screen">
      <div className="p-6 border-b border-white/10">
        <div className="text-xl font-bold tracking-[0.25em]">ALLOY</div>
        <div className="text-brass text-xs mt-1">{t("tagline")}</div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                active ? "bg-brass text-ink font-medium" : "text-mist/80 hover:bg-white/10"
              )}
            >
              <Icon size={18} />
              <span>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-1">
        <div className="px-3 py-2 text-xs text-mist/60">
          <div className="text-mist/90 font-medium">{name}</div>
          <div>{t(`role_${role}` as any)}</div>
        </div>
        <button onClick={toggle} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-mist/80 hover:bg-white/10 transition">
          <Languages size={18} /> <span>{t("language")}</span>
        </button>
        <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-mist/80 hover:bg-white/10 transition">
          <LogOut size={18} /> <span>{t("signOut")}</span>
        </button>
      </div>
    </aside>
  );
}
