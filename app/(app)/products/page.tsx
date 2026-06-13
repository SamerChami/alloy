import { createClient } from "@/lib/supabase-server";
import { ProductsShell } from "./ProductsShell";
import type { Product } from "./types";

const OFFICE_ROLES = [
  "admin",
  "sales_manager",
  "design_manager",
  "production_manager",
  "analyzing_manager",
];

export default async function ProductsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: products }, { data: profile }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, sku, name_en, name_ar, category, unit, unit_price_jod, cost_jod, width_mm, height_mm, depth_mm, description, drive_url, is_active"
      )
      .eq("is_active", true)
      .order("category")
      .order("name_en"),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user?.id ?? "")
      .single(),
  ]);

  const isOffice = OFFICE_ROLES.includes(profile?.role ?? "");

  return (
    <ProductsShell
      initialProducts={(products ?? []) as Product[]}
      isOffice={isOffice}
    />
  );
}
