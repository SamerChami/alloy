export type Component = {
  id: string;
  sku: string | null;
  name_en: string;
  name_ar: string | null;
  subcategory: string | null;
  unit: string;
  unit_price_jod: number;
  cost_jod: number | null;
  track_stock: boolean;
  stock_qty: number;
  reorder_level: number;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  description: string | null;
  drive_url: string | null;
  is_active: boolean;
  // Panel/sheet columns (added by db/05_bom.sql, only for Materials subcategory)
  sheet_length_mm?: number | null;
  sheet_width_mm?: number | null;
  sheet_price_jod?: number | null;
};
