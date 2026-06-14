import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { ImportShell } from "./ImportShell";
import type { PanelOption } from "../bom_types";

const OFFICE_ROLES = [
  "admin",
  "sales_manager",
  "design_manager",
  "production_manager",
  "analyzing_manager",
];

export default async function ImportPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();

  if (!OFFICE_ROLES.includes(profile?.role ?? "")) {
    redirect("/products");
  }

  const { data: panels } = await supabase
    .from("products")
    .select("id, name_en, name_ar, sku, sheet_length_mm, sheet_width_mm, sheet_price_jod")
    .eq("item_kind", "component")
    .not("sheet_length_mm", "is", null)
    .eq("is_active", true)
    .order("name_en");

  return <ImportShell panels={(panels ?? []) as PanelOption[]} />;
}
