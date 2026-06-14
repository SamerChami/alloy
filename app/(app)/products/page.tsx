import { createClient } from "@/lib/supabase-server";
import { ProductsShell } from "./ProductsShell";
import type { Product } from "./types";
import type { PanelOption, ComponentOption, BandingType } from "./bom_types";

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

  const [
    { data: products },
    { data: profile },
    { data: panels },
    { data: allComponents },
    { data: bandingTypes },
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, sku, name_en, name_ar, subcategory, unit, unit_price_jod, cost_jod, width_mm, height_mm, depth_mm, description, drive_url, is_active, labor_jod, margin_pct, price_overridden, is_template, materials_cost_jod, components_cost_jod, base_cost_jod"
      )
      .eq("item_kind", "product")
      .eq("is_active", true)
      .order("subcategory")
      .order("name_en"),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user?.id ?? "")
      .single(),
    // Panels = components with sheet dimensions set (available after db/05_bom.sql)
    supabase
      .from("products")
      .select("id, name_en, name_ar, sku, sheet_length_mm, sheet_width_mm, sheet_price_jod")
      .eq("item_kind", "component")
      .not("sheet_length_mm", "is", null)
      .eq("is_active", true)
      .order("name_en"),
    // All components for BOM component selector
    supabase
      .from("products")
      .select("id, name_en, name_ar, sku, unit, unit_price_jod")
      .eq("item_kind", "component")
      .eq("is_active", true)
      .order("name_en"),
    // Banding types (available after db/05_bom.sql)
    supabase
      .from("banding_types")
      .select("id, name, price_per_m_jod, is_active")
      .eq("is_active", true)
      .order("name"),
  ]);

  const isOffice = OFFICE_ROLES.includes(profile?.role ?? "");

  return (
    <ProductsShell
      initialProducts={(products ?? []) as Product[]}
      isOffice={isOffice}
      panels={(panels ?? []) as PanelOption[]}
      allComponents={(allComponents ?? []) as ComponentOption[]}
      bandingTypes={(bandingTypes ?? []) as BandingType[]}
    />
  );
}
