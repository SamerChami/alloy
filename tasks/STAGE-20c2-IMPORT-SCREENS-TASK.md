# Stage 20c-2 — "Import from SketchUp" on a draft quotation (app half)

Model: Sonnet. Read `CLAUDE.MD` and `tasks/_PREAMBLE.md` first. Surgical edits only.
Design: Project doc `claude/08-design-20c-quotation-import.md`. Database half (20c-1) is applied to the live database.

## Step 0 — commit what is already there (no edits)
`git status` must show as new ONLY:
`supabase/migrations/20261119190000_quotation_import.sql`, `supabase/tests/20c_import_checks.sql`,
`tasks/STAGE-20c1-IMPORT-DB-TASK.md`, `tasks/STAGE-20c2-IMPORT-SCREENS-TASK.md`,
`tasks/test-exports/Quote_Project_3items.json`, `lib/quoteImport.ts`, `lib/quoteImport.test.ts`.
Anything else: stop and report.
Run `npm run lint`, `npm run typecheck`, `npm test`. All must pass (the 8 new tests in `lib/quoteImport.test.ts` included).
Commit the migration, the check file and the 20c-1 task file:
`feat(quotations): Stage 20c-1 — import database: price_lines, quoted parts, preview and import functions`
Leave the other four files for the commit at the end of this task. Do not push.

## Already written by Claude (chat) — do NOT change
- `lib/quoteImport.ts`: `projectToQuoteItems(json, components)`, `rootToQuoteItem`, `defaultSection(model, filename)`, `previewSummary(rows)`, types `QuoteImportItem`, `QuotePreviewRow`.
- Database functions (call them exactly like this):
  - `supabase.rpc("quote_import_preview", { p_items })` → rows of `QuotePreviewRow` (read-only).
  - `supabase.rpc("quotation_import_items", { p_quotation_id, p_items, p_section, p_replace_section })` → the lines written. All or nothing. Refuses when the quotation is not a draft, when the list is empty, and when `p_replace_section` is true with an empty section.
- `quotation_items.price_warning text` (new column): written by the database; the app may only set it to `null`.

## Rules (unchanged from 20b)
- Never send a price, cost, board, banding type or component id. `p_items` is exactly what `projectToQuoteItems` returns.
- After the import, reload the quotation and its lines from the database (`reload()` in `QuotationEditor`).
- Show the database's own error message when it refuses.
- Every visible text through `t(...)`; add both English and Arabic to `lib/i18n.ts`.

## A. `lib/quotations.ts`
- `QuotationItemRow`: add `price_warning: string | null;`
- `QUOTATION_ITEM_COLUMNS`: add `price_warning`.
- Fix any test fixture in `lib/quotations.test.ts` that typecheck now complains about (add `price_warning: null`). No behaviour change.

## B. New file `app/(app)/quotations/[id]/SketchUpImportDialog.tsx`
Same dialog shell as `CataloguePicker.tsx` (overlay `fixed inset-0 z-50 … bg-ink/40 p-4`, `card`, X button, `max-w-4xl`).
Props: `{ quotationId: string; sections: string[]; lines: QuotationItemRow[]; onClose: () => void; onImported: () => void | Promise<void> }`.

Flow:
1. **File**: `<input type="file" accept=".json,application/json">` with a visible label. On choose: read text, `JSON.parse`, check `isSupportedSchema(json.schema) && Array.isArray(json.roots)` (same test and same error wording as `ProjectImportShell.tsx`; reuse its i18n key). Then `loadComponentRefs(createClient())`, `items = projectToQuoteItems(json, components)`. If `items.length === 0`: message `quoteImportNoItems`. Otherwise call `quote_import_preview`. While waiting show `quoteImportReading`. Section box is pre-filled with `defaultSection(json.model, file.name)`.
2. **Preview table** (scrolls inside the dialog, `max-h-[50vh] overflow-auto`), one row per preview row, in order:
   `#` (idx) · item no. · code (`dir="ltr"`) · name (`name_ar` in Arabic when present, else `name_en`; for `unknown`: `description ?? ""`) · size (`dimsLabel`) · how priced · price (`jod(list_price_jod)`, `—` for unknown) · note.
   - How priced: `standard` → `quoteImportStandard`; `parts` → `quoteImportParts`; `unknown` → `quoteImportUnknown` in `text-rust font-medium`.
   - Note: `row.warning` as it comes from the database (English only, also in the Arabic UI: it is an internal note), in `text-rust text-xs`, `dir="ltr"`.
   - Under the table one summary line from `previewSummary`: items, standard, from parts, not in the catalogue, need a look, total (`jod`).
3. **Section**: text input with a `datalist` of `sections` (same as `CataloguePicker`). When the trimmed section equals (exactly) the section of at least one existing line, show two radio buttons: `quoteImportAddTo` (default) and `quoteImportReplace`, and under "replace" a `text-rust text-xs` line `quoteImportReplaceNote` with the number of lines that will be removed. With an empty section, no radios (replace is not offered).
4. **Buttons**: Cancel, and `quoteImportDo` (primary, disabled until a preview is on screen and while busy). On click: `quotation_import_items` with `p_section: section.trim() || null`, `p_replace_section: replace`. On error: show `error.message`, stay open. On success: `await onImported()`, then `onClose()`.
- Choosing another file resets the preview and the error.
- Keyboard: Escape closes (unless busy); focus goes to the file input on open. Every input has a label tied with `useId()`.

## C. `QuotationEditor.tsx`
- State `importOpen`. Third button in the draft button row, after "Add a typed line": `btn-ghost`, icon `Upload` (lucide), text `quoteImportSketchUp`.
- Render `<SketchUpImportDialog … lines={lines} sections={sections} onImported={reload} />` when `importOpen && draft`.

## D. `LinesTable.tsx`
- A line with `price_source === "parts"`: under the code, a small `text-xs text-slate` tag `quoteFromParts`.
- A line with `price_warning`: under the description, `text-xs text-rust` with an `AlertTriangle` icon (size 13, `aria-hidden`) and the warning text (`dir="ltr"`). In a draft, a small ghost button after it (icon `X`, size 12, `aria-label` and `title` = `quoteWarningDismiss`) that calls `onUpdate(l.id, { price_warning: null })`. Not shown when the quotation is not a draft.
- Do not change column widths, the sticky actions column or the edit form (20b-FIX3…FIX6 measurements must stay).

## E. `lib/i18n.ts` — new keys (English / Arabic)
| key | English | Arabic |
|---|---|---|
| quoteImportSketchUp | Import from SketchUp | استيراد من SketchUp |
| quoteImportTitle | Import a SketchUp project | استيراد مشروع SketchUp |
| quoteImportFile | Project export file (.json) | ملف تصدير المشروع (.json) |
| quoteImportReading | Reading the file and pricing… | جارٍ قراءة الملف والتسعير… |
| quoteImportNoItems | This file has nothing to import. | لا يوجد في هذا الملف ما يمكن استيراده. |
| quoteImportHow | Priced as | طريقة التسعير |
| quoteImportStandard | Standard size | مقاس قياسي |
| quoteImportParts | From its parts | من قطعه |
| quoteImportUnknown | Not in the catalogue | غير موجود في الكتالوج |
| quoteImportNote | Note | ملاحظة |
| quoteImportSummary | {items} items · {standard} standard · {parts} from parts · {unknown} not in the catalogue · {warnings} need a look · total {total} | {items} بند · {standard} قياسي · {parts} من القطع · {unknown} غير موجود في الكتالوج · {warnings} بحاجة لمراجعة · المجموع {total} |
| quoteImportAddTo | Add to the lines already in this section | إضافة إلى بنود هذا القسم |
| quoteImportReplace | Replace this section's lines | استبدال بنود هذا القسم |
| quoteImportReplaceNote | {n} line(s) of this section will be removed, typed lines included. | سيتم حذف {n} بند من هذا القسم، بما فيها البنود المكتوبة يدويًا. |
| quoteImportDo | Import | استيراد |
| quoteFromParts | From its parts | من قطعه |
| quoteWarningDismiss | Dismiss this note | إخفاء هذه الملاحظة |
Use the project's existing way of filling `{…}` placeholders; if there is none, do a plain `.replace("{n}", …)` in the component.

## F. Verify, then commit
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (dev server stopped first). All pass.
2. Report: files changed (short diff summary) and the four results.
3. Commit everything left:
   `feat(quotations): Stage 20c-2 — import a SketchUp project into a draft quotation`
   Do not push. Report both commit hashes.

## Not in this task
3D of a quoted line; merging identical cabinets; the deferred 20b tester notes; printing.
