/**
 * How ALLOY names things in SketchUp (parts separated by a double underscore):
 *
 *   [item number__]CODE[__size or description]
 *
 *   "WQC2.K3__80*80"        -> code "WQC2.K3"
 *   "156__B-2D-K3__90"      -> code "B-2D-K3"   (156 is the item number)
 *   "13__W-2D-K1__80 x 46"  -> code "W-2D-K1"
 *   "Coffee_Corner"         -> code "Coffee_Corner" (no separator: whole name)
 *
 * Rules:
 * - Only "__" separates; single underscores belong to the code.
 * - A first part made only of digits is an item number, not the code,
 *   when another part follows it. (A code is never purely a number.)
 * - A "/" also ends the name (the earlier naming rule, kept for old exports).
 * One code is one cabinet MODEL in the catalogue; the same code can be drawn
 * at many sizes. Codes are compared case-insensitively (see codeKey).
 */
function nameParts(name: string | null | undefined): string[] {
  const s = name ?? "";
  const slash = s.indexOf("/");
  return (slash >= 0 ? s.slice(0, slash) : s).split("__").map((p) => p.trim());
}

function hasItemNumber(parts: string[]): boolean {
  return parts.length > 1 && /^\d+$/.test(parts[0]);
}

export function codeFromName(name: string | null | undefined): string | null {
  const parts = nameParts(name);
  const code = hasItemNumber(parts) ? parts[1] : parts[0];
  return code === "" ? null : code;
}

/** The leading item number ("156" in "156__B-2D-K3__90"), or null. */
export function itemNumberFromName(name: string | null | undefined): string | null {
  const parts = nameParts(name);
  return hasItemNumber(parts) ? parts[0] : null;
}

/**
 * Whatever follows the code ("90" in "156__B-2D-K3__90", "80 x 46" in
 * "13__W-2D-K1__80 x 46"): a size or a description. Null when there is none.
 */
export function descriptionFromName(name: string | null | undefined): string | null {
  const parts = nameParts(name);
  const rest = parts.slice(hasItemNumber(parts) ? 2 : 1).filter((p) => p !== "");
  return rest.length > 0 ? rest.join(" ") : null;
}

/** Normalised form used for comparing codes. */
export function codeKey(code: string): string {
  return code.trim().toLowerCase();
}
