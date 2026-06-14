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
};
