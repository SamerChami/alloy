# Stage 20c-1 — SketchUp project import into a draft quotation: database half

Design: Project doc `claude/08-design-20c-quotation-import.md`. Written by Claude (chat), 19 Nov 2026.

## Files (already in the repo, not committed)
- `supabase/migrations/20261119190000_quotation_import.sql`
- `supabase/tests/20c_import_checks.sql` (blocks I0–I11)

## What the migration does
- `price_lines(product, lines)`: the ONE pricing formula. `price_bom` is now a thin wrapper around it (same name, arguments, result).
- `quotation_item_parts`: the parts a quoted cabinet was priced from (kept per line; job orders will read them). Written only by the import and by a revision; never edited; deleted only with their line.
- `quotation_items.price_warning`: why a price needs a look (database writes it; the app may only clear it).
- `quote_import_preview(items)`: read-only, what the import would write.
- `quotation_import_items(quotation, items, section, replace_section)`: one line per drawn item, all or nothing, draft only.
- `revise_quotation` also copies warnings and parts. `quotation_items_guard` protects `price_warning`.
- Rule: standard size to the mm → that size's price; known model at another size → priced from its own drawn parts (board and banding from the model's part of the same name, `#NN` counter ignored; default board otherwise; banded length scaled by perimeter; fittings linked by code; hand-added hardware copied); anything else → line at 0.000 with a warning.

## Already done
- Trial run on a local PostgreSQL 16 copy built from the ten earlier migrations: applies cleanly; I0–I11 and the Stage 20a checks Q1–Q9 all give the wanted results.
- `price_bom` before and after the migration: identical to the fils on 45 random priced sets (and 141 in the review).
- Independent Opus review (separate agent, attacks tried as an API user). It found 3 defects and 2 risks, all fixed and covered by block I11: negative / zero part sizes and quantities are refused; items that are not objects or have no size are refused; "replace" needs a named section; a drawn panel that is not in the model is priced on the default board AND gets a warning; a deactivated component is not linked through an old hand-made link; a revision holds its source still while copying.
- Review found no way for a non-office user to see a price and no way for an API user to forge one.

## Step 1 — Samer, when nobody is working in the app
1. Supabase SQL editor: run block **I0** of `supabase/tests/20c_import_checks.sql`. Keep the red RESULT line.
2. In the repo folder: `npx supabase db push --remote` (applies `20261119190000_quotation_import.sql` only).
3. SQL editor: run **I0 again** (it is now "I1"). The line must be identical to step 1, letter for letter.
4. Run **I2 … I11**, one block at a time. Each must print exactly its "Wanted" line.
5. Send the RESULT lines to Claude (chat). If anything differs: stop, change nothing.

## Step 2 — Claude Code (Sonnet), after Step 1 is confirmed
Read `CLAUDE.MD`. Do not edit any file.
1. `git status` must show only: the migration, the check file and this task file as new. Anything else: stop and report.
2. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (dev server stopped). All must pass.
3. Commit: `feat(quotations): Stage 20c-1 — import database: price_lines, quoted parts, preview and import functions`. Do not push.
4. Report the commit hash.

## Accepted as they are
- A known model at a non-standard size never uses the model's typed price (design rule 2).
- Banded length on a non-standard size is an approximation by perimeter (D6).
- An unknown item is stored as a typed line at 0.000 with a warning; once the warning is cleared it looks like any typed line.
- Anyone with direct SQL access (not the app) can still switch on the line-writer setting (true since 20a).
- The app's "used in quotations — deactivate it instead" message should also appear when a board, component or banding type is used only in quoted parts (to do in 20c-2).
