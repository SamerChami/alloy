export type Product = {
  id: string;
  sku: string | null;
  code: string | null;
  name_en: string;
  name_ar: string | null;
  subcategory: string | null;
  unit: string;
  unit_price_jod: number;
  cost_jod: number | null;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  description: string | null;
  drive_url: string | null;
  is_active: boolean;
  /** How the product was made, e.g. "sketchup_json" (office path only). */
  source?: string | null;
  // BOM pricing fields (added by db/05_bom.sql)
  labor_jod?: number;
  margin_pct?: number;
  price_overridden?: boolean;
  is_template?: boolean;
  materials_cost_jod?: number;
  components_cost_jod?: number;
  base_cost_jod?: number;
  default_panel_id?: string | null;
  calc_price_jod?: number | null;
};

/** What factory / installation users receive (view `products_basic`,
 *  Stage 18d): no price, cost, labor or markup fields exist on it. */
export type ProductBasic = Pick<
  Product,
  | "id" | "sku" | "code" | "name_en" | "name_ar" | "subcategory" | "unit"
  | "width_mm" | "height_mm" | "depth_mm" | "description" | "drive_url"
  | "is_active"
>;
