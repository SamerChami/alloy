"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { dict, type Lang, type TKey } from "@/lib/i18n";

type Ctx = { lang: Lang; t: (k: TKey) => string; toggle: () => void };
const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  // Load saved preference on mount
  useEffect(() => {
    const saved = (typeof document !== "undefined"
      ? document.cookie.match(/(?:^|; )alloy_lang=(ar|en)/)?.[1]
      : null) as Lang | null;
    if (saved) setLang(saved);
  }, []);

  // Apply dir + lang to <html> and persist
  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
    document.cookie = `alloy_lang=${lang}; path=/; max-age=31536000`;
  }, [lang]);

  const t = (k: TKey) => dict[lang][k] ?? dict.en[k] ?? k;
  const toggle = () => setLang((l) => (l === "en" ? "ar" : "en"));

  return (
    <LangContext.Provider value={{ lang, t, toggle }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
