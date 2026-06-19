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

import type { Cut } from "@/lib/sketchup/types";
export type { Cut };

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
  // 3D preview fields
  part_role: string;
  depth_mm: string;
  pos_offset_mm: string;
  // Real assembled world-centre positions (from .3ds import, saved via 08_bom_pos.sql)
  pos_x_mm?: string;
  pos_y_mm?: string;
  pos_z_mm?: string;
  // v4 cut data (undefined = not yet ingested / v3 source; [] = ingested, 0 cuts)
  cuts?: Cut[];
  cutWarning?: string;
};
