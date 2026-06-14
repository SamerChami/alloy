import { createClient } from "@/lib/supabase-server";
import { ComponentsShell } from "./ComponentsShell";
import type { Component } from "./types";

const OFFICE_ROLES = [
  "admin",
  "sales_manager",
  "design_manager",
  "production_manager",
  "analyzing_manager",
];

export default async function ComponentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: components }, { data: profile }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, sku, name_en, name_ar, subcategory, unit, unit_price_jod, cost_jod, track_stock, stock_qty, reorder_level, width_mm, height_mm, depth_mm, description, drive_url, is_active"
      )
      .eq("item_kind", "component")
      .eq("is_active", true)
      .order("subcategory")
      .order("name_en"),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user?.id ?? "")
      .single(),
  ]);

  const isOffice = OFFICE_ROLES.includes(profile?.role ?? "");

  return (
    <ComponentsShell
      initialComponents={(components ?? []) as Component[]}
      isOffice={isOffice}
    />
  );
}
