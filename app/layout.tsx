import type { Metadata } from "next";
import { Inter, Cairo } from "next/font/google";
import { LangProvider } from "@/components/lang-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const cairo = Cairo({ subsets: ["arabic"], variable: "--font-cairo" });

export const metadata: Metadata = {
  title: "ALLOY — Kitchens & Bedrooms",
  description: "ALLOY management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <body className={`${inter.variable} ${cairo.variable} font-sans`}>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
