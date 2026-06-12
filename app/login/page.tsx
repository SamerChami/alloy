"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { useLang } from "@/components/lang-provider";

export default function LoginPage() {
  const { t, lang, toggle } = useLang();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(t("loginError"));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-ink text-mist p-12">
        <div>
          <div className="text-3xl font-bold tracking-[0.3em]">ALLOY</div>
          <div className="text-brass mt-1 tracking-wide">{t("tagline")}</div>
        </div>
        <div className="text-slate text-sm leading-relaxed max-w-sm">
          <div className="h-px w-16 bg-brass mb-6" />
          {lang === "ar"
            ? "نظام إدارة متكامل للعملاء والتصميم والإنتاج والتركيب."
            : "One system for clients, design, production and installation."}
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <button onClick={toggle} className="btn-ghost text-sm mb-8">
            {t("language")}
          </button>
          <h1 className="text-2xl font-semibold mb-1">{t("welcome")}</h1>
          <p className="text-slate mb-8 lg:hidden">{t("tagline")}</p>

          <label className="block text-sm mb-1 mt-4">{t("email")}</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            autoComplete="email"
          />

          <label className="block text-sm mb-1 mt-4">{t("password")}</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            autoComplete="current-password"
          />

          {error && <p className="text-rust text-sm mt-4">{error}</p>}

          <button
            onClick={onSubmit}
            disabled={loading || !email || !password}
            className="btn-primary w-full mt-8"
          >
            {loading ? t("signingIn") : t("signIn")}
          </button>
        </div>
      </div>
    </div>
  );
}
