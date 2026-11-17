/**
 * The ONE list of name keywords that mark a SketchUp part as a fitting
 * (leg, channel, accessory...) rather than a board panel.
 *
 * The SketchUp extension is the source of truth: this list must stay identical
 * to FITTING_KEYS in extension/alloy_export/main.rb, because the extension
 * decides from it how a part is exported (mesh / channel profile instead of a
 * panel outline). lib/sketchup/fittingKeywords.test.ts fails if the two drift.
 *
 * To add a keyword: change main.rb (with a version bump) AND this list.
 * Matching is a case-insensitive "name contains keyword".
 */
export const FITTING_KEYWORDS = [
  "p2o", "leg_", "atira", "hafele", "basket",
  "l_channel", "u_channel", "channel", "blum", "hinge", "slide", "cutlery",
] as const;

export function isFittingByName(name: string | null | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  return FITTING_KEYWORDS.some((kw) => n.includes(kw));
}
