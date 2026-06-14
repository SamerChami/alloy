export type Product = {
  id: string;
  sku: string | null;
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
  // BOM pricing fields (added by db/05_bom.sql)
  labor_jod?: number;
  margin_pct?: number;
  price_overridden?: boolean;
  is_template?: boolean;
  materials_cost_jod?: number;
  components_cost_jod?: number;
  base_cost_jod?: number;
};
