import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { ComponentsShell } from "./ComponentsShell";
import type { Component } from "./types";
import type { BandingType } from "../products/bom_types";

const OFFICE_ROLES = [
  "admin",
  "sales_manager",
  "design_manager",
  "production_manager",
  "analyzing_manager",
];

export default async function ComponentsPage({
  searchParams,
}: {
  searchParams: Promise<{ inactive?: string }>;
}) {
  const showInactive = (await searchParams).inactive === "1";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Profile first: money is office-only (Stage 18d), so non-office users are
  // sent away before any query on `products` runs.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();

  if (!OFFICE_ROLES.includes(profile?.role ?? "")) redirect("/dashboard");

  const [{ data: components }, { data: bandingTypes }] = await Promise.all([
    supabase
    .from("products")
    .select(
      "id, sku, code, name_en, name_ar, subcategory, unit, unit_price_jod, cost_jod, track_stock, stock_qty, reorder_level, width_mm, height_mm, depth_mm, description, drive_url, is_active"
    )
    .eq("item_kind", "component")
    .eq("is_active", !showInactive)
    .order("subcategory")
    .order("name_en"),
    supabase
      .from("banding_types")
      .select("id, name, price_per_m_jod, is_active")
      .order("name"),
  ]);

  return (
    <ComponentsShell
      initialComponents={(components ?? []) as Component[]}
      isOffice={true}
      showInactive={showInactive}
      bandingTypes={(bandingTypes ?? []) as BandingType[]}
    />
  );
}
