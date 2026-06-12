import { createClient } from "@/lib/supabase-server";
import { FileText, Receipt, Boxes, FolderKanban } from "lucide-react";
import { DashboardStats } from "./stats";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Run counts in parallel. head:true returns count without rows.
  const [projects, quotes, invoices, lowStock] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true })
      .not("stage", "in", "(completed,cancelled)"),
    supabase.from("quotations").select("id", { count: "exact", head: true })
      .in("status", ["draft", "sent"]),
    supabase.from("invoices").select("id", { count: "exact", head: true })
      .in("status", ["issued", "partial", "overdue"]),
    supabase.from("low_stock_products").select("id", { count: "exact", head: true }),
  ]);

  const stats = {
    activeProjects: projects.count ?? 0,
    openQuotations: quotes.count ?? 0,
    unpaidInvoices: invoices.count ?? 0,
    lowStock: lowStock.count ?? 0,
  };

  return <DashboardStats stats={stats} />;
}
