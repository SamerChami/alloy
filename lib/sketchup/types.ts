/** A single inner tooling feature (bore or blind pocket). Produced by alloy_export v0.6.3+. */
export type ToolingItem = {
  shape: "circle" | "polygon";
  through: boolean;
  depth_mm: number;
  diameter_mm?: number;          // present when shape === "circle"
  cu_mm?: number;                // circle center on panel-local u axis (mm from min corner)
  cv_mm?: number;                // circle center on panel-local v axis (mm from min corner)
  loop?: [number, number][];     // polygon fallback (panel-local u/v mm)
  face: "inner" | "outer" | "both" | "front" | "back";
  open_normal?: [number, number, number]; // v0.6.7: floor-face normal in panel-local axes [x,y,z]
};

/** A single machining cut detected on a panel face. Produced by alloy_export v0.4+. */
export type Cut = {
  type: "dado" | "groove" | "rabbet" | "through";
  depth_mm: number;
  width_mm: number;    // across the channel
  length_mm: number;   // along the channel
  runs_along: "width" | "height" | "depth";
  face: "inner" | "outer" | "both" | "front" | "back";
  open_normal?: [number, number, number]; // v0.6.7: floor-face normal in panel-local axes [x,y,z]
  // absolute panel-local coordinates (origin at panel min corner)
  u_min_mm: number;
  u_max_mm: number;
  v_min_mm: number;
  v_max_mm: number;
};
