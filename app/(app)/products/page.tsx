import { createClient } from "@/lib/supabase-server";
import { ProductsShell } from "./ProductsShell";
import type { Product, ProductBasic } from "./types";
import { DEFAULT_PRICING_SETTINGS, type PricingSettings } from "@/lib/pricing";
import type { PanelOption, ComponentOption, BandingType } from "./bom_types";

const OFFICE_ROLES = [
  "admin",
  "sales_manager",
  "design_manager",
  "production_manager",
  "analyzing_manager",
];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ inactive?: string }>;
}) {
  const showInactive = (await searchParams).inactive === "1";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();

  const isOffice = OFFICE_ROLES.includes(profile?.role ?? "");

  // Not office (factory / installation): read the price-free view only.
  // No query on products, banding_types or pricing_settings on this path.
  if (!isOffice) {
    const { data: basic } = await supabase
      .from("products_basic")
      .select(
        "id, sku, code, name_en, name_ar, subcategory, unit, width_mm, height_mm, depth_mm, description, drive_url, is_active"
      )
      .eq("item_kind", "product")
      .eq("is_active", true)
      .order("subcategory")
      .order("name_en");

    return (
      <ProductsShell
        initialProducts={(basic ?? []) as ProductBasic[]}
        isOffice={false}
        showInactive={false}
        panels={[]}
        allComponents={[]}
        bandingTypes={[]}
        pricingSettings={DEFAULT_PRICING_SETTINGS}
      />
    );
  }

  const [
    { data: products },
    { data: panels },
    { data: allComponents },
    { data: bandingTypes },
    { data: settingsRow },
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, sku, code, default_panel_id, calc_price_jod, name_en, name_ar, subcategory, unit, unit_price_jod, cost_jod, width_mm, height_mm, depth_mm, description, drive_url, is_active, labor_jod, margin_pct, price_overridden, is_template, materials_cost_jod, components_cost_jod, base_cost_jod"
      )
      .eq("item_kind", "product")
      .eq("is_active", !showInactive)
      .order("subcategory")
      .order("name_en"),
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
      .order("name"),
    supabase.from("pricing_settings").select("waste_pct, rounding_step_jod").single(),
  ]);

  const pricingSettings: PricingSettings = settingsRow
    ? {
        wastePct: Number(settingsRow.waste_pct),
        roundingStepJod: Number(settingsRow.rounding_step_jod),
      }
    : DEFAULT_PRICING_SETTINGS;

  return (
    <ProductsShell
      initialProducts={(products ?? []) as Product[]}
      isOffice={true}
      showInactive={showInactive}
      panels={(panels ?? []) as PanelOption[]}
      allComponents={(allComponents ?? []) as ComponentOption[]}
      bandingTypes={(bandingTypes ?? []) as BandingType[]}
      pricingSettings={pricingSettings}
    />
  );
}
