# alloy_export.rb — registration stub for the ALLOY Export extension
# Place alongside the alloy_export/ folder in SketchUp's Plugins directory.

require "sketchup.rb"
require "extensions.rb"

module Alloy
  module Export
    EXT = SketchupExtension.new("ALLOY Export", "alloy_export/main")
    EXT.version     = "0.4.1"
    EXT.creator     = "ALLOY"
    EXT.description = "Export cabinet components to JSON for the ALLOY app."
    Sketchup.register_extension(EXT, true)
  end
end
