# ALLOY App — Ruby Export Extension (alloy_export.rbz)

## Overview
- **File:** `alloy_export.rbz`
- **Current version:** v0.2
- **Platform:** SketchUp Pro (desktop) — NOT SketchUp Web
- **Purpose:** Export the active SketchUp model to `alloy.sketchup.v2` JSON for import into the ALLOY management app

---

## What It Does

1. Traverses all top-level groups and component instances in the active model
2. Classifies each item by type: `Cabinet | Appliance | Worktop | Trim | Other | RoomBox`
3. For each Cabinet, extracts:
   - Name (used for product matching)
   - Bounding box dimensions (width, height, depth in mm)
   - World position (x, y, z in SketchUp Z-up coordinates)
   - Child panels (faces with material/thickness info)
   - Child fittings (named sub-groups representing hardware)
   - Dynamic Component attributes (finish, color, etc.) if present
4. Writes output JSON to a user-selected file path

---

## Classification Logic
```ruby
def classify(entity)
  name = entity.name.downcase
  return "RoomBox"   if name.include?("room") || name.include?("wall")
  return "Appliance" if name.match?(/oven|fridge|hob|sink|dishwasher/)
  return "Worktop"   if name.include?("worktop") || name.include?("wt")
  return "Trim"      if name.match?(/cornice|pelmet|filler|rail/)
  return "Cabinet"   if name.match?(/^[BWTPC]\d+/)
  "Other"
end
```

---

## Panel Extraction
Panels are child flat faces (or groups representing panels) inside a cabinet group.
For each panel the extension captures:
- Material name
- Thickness (shortest bounding box dimension)
- Width and height (other two dimensions)

---

## Known Limitations (v0.2)
- Does not handle nested component instances deeper than 2 levels
- Dynamic Component attribute reading is best-effort (not all DC attributes guaranteed)
- RoomBox detection relies on naming convention — unnamed room geometry is classified as "Other"
- No export of cut list or edge banding data yet (planned for v0.3)

---

## SketchUp MCP Note
The Trimble SketchUp MCP integration **only works with SketchUp Web**, not SketchUp Pro desktop.
The Ruby extension is the correct path for Pro desktop automation.

---

## File Output
```
<user-selected-path>/export_<model_name>_<timestamp>.json
```
Schema version string in output: `"schema": "alloy.sketchup.v2"`
