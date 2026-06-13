export type ProductCategory =
  | "cabinet"
  | "panel"
  | "material"
  | "accessory"
  | "fitting"
  | "appliance"
  | "other";

export type Product = {
  id: string;
  sku: string | null;
  name_en: string;
  name_ar: string | null;
  category: ProductCategory;
  unit: string;
  unit_price_jod: number;
  cost_jod: number | null;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  description: string | null;
  drive_url: string | null;
  is_active: boolean;
};
