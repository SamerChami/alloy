export type BandingType = {
  id: string;
  name: string;
  price_per_m_jod: number;
  is_active: boolean;
};

export type PanelOption = {
  id: string;
  name_en: string;
  name_ar: string | null;
  sku: string | null;
  sheet_length_mm: number | null;
  sheet_width_mm: number | null;
  sheet_price_jod: number | null;
};

export type ComponentOption = {
  id: string;
  name_en: string;
  name_ar: string | null;
  sku: string | null;
  unit: string;
  unit_price_jod: number;
};

export type BomLineState = {
  _key: string;
  id?: string;
  line_type: "panel" | "component";
  panel_id: string;
  part_name: string;
  width_mm: string;
  height_mm: string;
  banding_type_id: string;
  banded_length_m: string;
  component_id: string;
  qty: string;
};
