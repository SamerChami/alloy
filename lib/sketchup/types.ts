/** A single machining cut detected on a panel face. Produced by alloy_export v0.4+. */
export type Cut = {
  type: "dado" | "groove" | "rabbet" | "through";
  depth_mm: number;
  width_mm: number;    // across the channel
  length_mm: number;   // along the channel
  runs_along: "width" | "height" | "depth";
  face: "front" | "back" | "both";
  // absolute panel-local coordinates (origin at panel min corner)
  u_min_mm: number;
  u_max_mm: number;
  v_min_mm: number;
  v_max_mm: number;
};
