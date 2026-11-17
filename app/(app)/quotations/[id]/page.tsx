import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { QUOTATION_COLUMNS, QUOTATION_ITEM_COLUMNS, type QuotationItemRow } from "@/lib/quotations";
import { QuotationEditor, type FamilyMember, type QuotationWithClient } from "./QuotationEditor";
import { QuotationNotFound } from "./QuotationNotFound";
import type { CatalogueItem, CatalogueSize } from "./CataloguePicker";

const OFFICE_ROLES = ["admin", "sales_manager", "design_manager", "production_manager", "analyzing_manager"];

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();
  if (!OFFICE_ROLES.includes(profile?.role ?? "")) redirect("/dashboard");

  const { data: quotation } = await supabase
    .from("quotations")
    .select(`${QUOTATION_COLUMNS}, client:clients(id, full_name, phone)`)
    .eq("id", id)
    .maybeSingle();
  if (!quotation) return <QuotationNotFound />;
  const q = quotation as unknown as QuotationWithClient;

  const rootId = q.root_id ?? q.id;
  const [{ data: lines }, { data: family }] = await Promise.all([
    supabase
      .from("quotation_items")
      .select(QUOTATION_ITEM_COLUMNS)
      .eq("quotation_id", id)
      .order("sort_order")
      .order("id"),
    supabase
      .from("quotations")
      .select("id, code, status, revision")
      .or(`id.eq.${rootId},root_id.eq.${rootId}`)
      .order("revision"),
  ]);

  // The catalogue is needed only while the quotation is a draft.
  let catalogue: CatalogueItem[] = [];
  let sizes: CatalogueSize[] = [];
  if (q.status === "draft") {
    const [{ data: products }, { data: sizeRows }] = await Promise.all([
      supabase
        .from("products")
        .select("id, code, name_en, name_ar, unit, unit_price_jod, width_mm, height_mm, depth_mm, item_kind, sheet_length_mm")
        .eq("is_active", true)
        .order("name_en"),
      supabase
        .from("product_sizes")
        .select("id, product_id, label, width_mm, height_mm, depth_mm, price_jod")
        .order("width_mm"),
    ]);
    // Boards (sheet_length_mm set) are not sold on a quotation.
    catalogue = ((products ?? []) as unknown as Array<CatalogueItem & { sheet_length_mm: number | null }>)
      .filter((p) => p.sheet_length_mm == null)
      .map((p) => ({
        id: p.id,
        code: p.code,
        name_en: p.name_en,
        name_ar: p.name_ar,
        unit: p.unit,
        unit_price_jod: p.unit_price_jod,
        width_mm: p.width_mm,
        height_mm: p.height_mm,
        depth_mm: p.depth_mm,
        item_kind: p.item_kind,
      }));
    sizes = (sizeRows ?? []) as CatalogueSize[];
  }

  return (
    <QuotationEditor
      key={q.id}
      quotation={q}
      lines={(lines ?? []) as unknown as QuotationItemRow[]}
      family={(family ?? []) as FamilyMember[]}
      catalogue={catalogue}
      sizes={sizes}
    />
  );
}
