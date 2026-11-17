# Stage 18e — Fittings are saved and priced on import

**Model:** Sonnet (app wiring from exact instructions). No migration, no
database change, no extension change.
**Phase:** 1 (Catalogue truth) leftover. Requires 18d (done, 3b58567).

## Decisions this implements (Samer, 17 Nov 2026)
1. A drawn fitting finds its price **by code**: the code part of its SketchUp
   name (same `[item number__]CODE[__description]` rule as cabinets) equals
   the **Code** of an item on the Components page, compared case-insensitively.
2. **Channels are priced per metre** from their length in the model. General
   rule: a component whose unit is `m` is counted in metres (to the
   centimetre); every other unit is counted in pieces.
3. Today only **legs, channels and some accessories** (trash bin, vegetable
   drawers…) are drawn in SketchUp. Hinges, cams, dowels, screws are NOT
   drawn; they are added by hand in the parts list. (Later: an "Import from
   Polyboard" section will bring them from Polyboard's PDF report. Not this
   stage.)

## What was wrong
- On import, fittings were shown and counted but **never saved**, so they
  added nothing to the price.
- An accessory whose name has no fitting keyword was saved as a **board
  panel**.
- Re-importing a model ("Update catalogue entry") **deleted component lines
  added by hand** (the hinges).
- Three different fitting keyword lists (extension, parser, viewer).

## Already written and tested (do NOT rewrite; read them first)
- `lib/sketchup/fittingKeywords.ts` — the ONE keyword list +
  `isFittingByName`. Identical to `FITTING_KEYS` in
  `extension/alloy_export/main.rb`; `fittingKeywords.test.ts` fails if they
  drift.
- `lib/sketchup/parseV3.ts` — now imports that list (gains `cutlery`).
- `lib/cabinet3d.ts` — the inline `_isFitting` list replaced by
  `isFittingByName(p.part_name)`. Only difference: `leg_` instead of `leg`,
  i.e. the viewer now agrees with the extension about what it exported as a
  fitting. `isUprightCylinderFitting` and `fittingColor` are shape / colour
  helpers and are deliberately NOT touched.
- `lib/fittings.ts` — `ComponentRef`, `componentMap`, `splitForPricing`,
  `mergeOldComponentLines`, `ComponentBomRow`. Tests: `lib/fittings.test.ts`.
- `lib/catalogImport.ts` — `BomRowInsert` is now `PanelBomRow |
  ComponentBomRow`; new `importBomRows(parts, components, oldBaseLines?)`;
  **`updateCatalogueEntry` and `addStandardSize` have a NEW signature**:

      (supabase, productId, root, parts, components, meta)

  `parts` = ALL leaves of the cabinet (panels AND fittings), `components` =
  `Map<string, ComponentRef>` from `componentMap(...)`.

The build is RED until Step 1.3 / 1.4 update the two callers. That is expected.

How a drawn part is priced (`splitForPricing`):
1. its code matches a component → component line, linked, priced;
2. else its name contains a fitting keyword → component line with NO
   component (price 0), reported as "not linked";
3. else → board panel, as before.
Lines are grouped: 4 legs with the same code = one line, qty 4; two channels
of one code = one line with the total metres.

---

## Step 1 — Claude Code (Sonnet): app changes
Surgical edits. Add every new visible string to BOTH `en` and `ar` in
`lib/i18n.ts`.

### 1.1 Components get a Code
- `app/(app)/components/types.ts`: add `code: string | null;` to `Component`
  (after `sku`).
- `app/(app)/components/page.tsx`: add `code` to the selected columns.
- `app/(app)/components/ComponentForm.tsx`:
  - `FormState` + `fromComponent`: `code` (string, `c?.code ?? ""`).
  - payload: `code: form.code.trim() || null`.
  - a Code input next to the SKU input, written exactly like the one in
    `ProductForm.tsx` (`className="input font-mono" dir="ltr"`), with
    `title={t("componentCodeHint")}`.
  - on save, when the error message includes `products_code_unique`, show
    `t("codeExists")` instead of the raw message (same as `ProductForm.tsx`).
- `app/(app)/components/ComponentsShell.tsx`: a Code column between Name and
  SKU, written exactly like the Code cell/header in `ProductsShell.tsx`; add
  `(c.code ?? "")` to the search filter.
- i18n `componentCodeHint`:
  - en: `The code written in the SketchUp part name. A drawn part with this code is priced from this component.`
  - ar: `الرمز المكتوب في اسم القطعة في SketchUp. القطعة المرسومة بهذا الرمز تُسعَّر من هذا المكوّن.`

### 1.2 One helper to load the components for matching
Add to `lib/catalogImport.ts` (bottom):

    /** Catalogue components that have a code, for linking drawn fittings.
     *  Boards (items with a sheet size) are left out: a board is never a fitting. */
    export async function loadComponentRefs(
      supabase: SupabaseClient,
    ): Promise<Map<string, ComponentRef>> {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, unit")
        .eq("item_kind", "component")
        .eq("is_active", true)
        .not("code", "is", null)
        .is("sheet_length_mm", null);
      if (error) throw new Error(error.message);
      return componentMap((data ?? []) as ComponentRef[]);
    }

(import `componentMap` from `@/lib/fittings` in the existing import block.)

### 1.3 `app/(app)/products/import-sketchup-single/SingleImportShell.tsx`
- In `handleFile`, the existing-codes query must only look at cabinets: add
  `.eq("item_kind", "product")` to the `products` `select("id, code")` query.
- In `handleFile`, also `await loadComponentRefs(createClient())` and keep it
  in state: `const [components, setComponents] = useState<Map<string, ComponentRef>>(new Map());`
- Derive once per render, after `panels` / `fittings` are known:

      const priced = useMemo(
        () => importBomRows([...panels, ...fittings], components),
        [panels, fittings, components],
      );

  (`priced.rows`, `priced.panelCount`, `priced.unlinked`.)
- `handleExisting`: call the new signature
  `fn(createClient(), existingId, root, [...panels, ...fittings], components, meta)`.
- `handleCreate`: replace the `if (panels.length > 0) { … panelsToBomRows(panels) … }`
  block's condition and payload with `priced.rows` (`if (priced.rows.length > 0)`,
  `p_lines: priced.rows`). Keep the delete-on-error rollback as is.
- Summary block (where `detectedPanels` and `skuFittings` are shown):
  - panels count = `priced.panelCount`;
  - fittings: `{t("skuFittings")}: <strong>{priced.rows.length - priced.panelCount}</strong>`
    (number of component LINES);
  - when `priced.unlinked.length > 0`, below it, a `text-xs text-rust`
    paragraph: `t("fittingsNotLinked")` followed by the list
    `code × qty unit` joined with `, ` (unit through `t("unit_m")` /
    `t("unit_pcs")`, in a `dir="ltr"` span).
- In the parts table, the tag for a row stays as it is (Panel / Fitting by
  `part.isFitting`). Do not change the 3D preview props.
- `importResult.panels` → `priced.panelCount`.
- Leave the Import button's `disabled` rule as it is.

### 1.4 `app/(app)/products/import-sketchup-project/ProjectImportShell.tsx`
- Existing-codes query: add `.eq("item_kind", "product")`.
- In `handleFile`: `const components = await loadComponentRefs(createClient());`
  keep it in state as in 1.3, and when building each row compute

      const { panels, fittings } = cabinetToParts(root);
      const priced = importBomRows([...panels, ...fittings], components);

  Row fields: `panelCount: priced.panelCount`,
  `fittingCount: priced.rows.length - priced.panelCount`, and a NEW field
  `unlinkedCount: priced.unlinked.length` (add to `CabinetRow`).
- `handleImport`, per row: `const { panels, fittings } = cabinetToParts(root);`
  `const parts = [...panels, ...fittings];`
  - update / add_size: new signature `fn(supabase, row.productId, root, parts, components, meta)`;
    `totalPanels += row.panelCount`.
  - create: `const { rows: bomRows } = importBomRows(parts, components);`
    then `if (bomRows.length > 0)` → `p_lines: bomRows`; `totalPanels += row.panelCount`.
- Fittings cell in the table: `{row.fittingCount}` and, when
  `row.unlinkedCount > 0`, after it
  `<span className="text-rust text-xs ms-1">({row.unlinkedCount} {t("notLinkedShort")})</span>`.

### 1.5 `app/(app)/products/BomSection.tsx` — component lines
- Under the component `<select>` of a component line, when
  `line.part_name` is not empty, show
  `<div className="text-xs text-slate mt-0.5" dir="ltr">{t("fromSketchup")}: {line.part_name}</div>`;
  and when `line.component_id` is empty AND `line.part_name` is not empty,
  make that div `text-rust` and append ` — {t("notLinkedShort")}`.
- Qty input of a component line: `min="0"` and `step="any"` (metres have
  decimals). Nothing else.
- Check `ProductForm.tsx`'s save path parses `qty` with `parseFloat` (not
  `parseInt`) for component lines; fix only if it truncates.

### 1.6 i18n (en / ar)
- `fittingsNotLinked`: `Not linked to a component (saved with no price). Give a component this code, then re-import:` / `غير مرتبطة بمكوّن (تُحفظ بدون سعر). أعطِ أحد المكوّنات هذا الرمز ثم أعد الاستيراد:`
- `notLinkedShort`: `not linked` / `غير مرتبط`
- `fromSketchup`: `From SketchUp` / `من SketchUp`
- Replace the text of `skuImportNote`:
  - en: `Fittings and accessories are saved as component lines. A drawn part is priced when its code matches a component's Code; channels are counted in metres. Panels start unmapped (JD 0) — assign materials in the BOM to price each cabinet.`
  - ar: `تُحفظ قطع التركيب والإكسسوارات كبنود مكوّنات. تُسعَّر القطعة المرسومة عندما يطابق رمزها رمز أحد المكوّنات، وتُحسب القنوات بالمتر. تبدأ الألواح بدون مادة (0 د.أ) — اختر المواد في قائمة المواد لتسعير كل خزانة.`

### 1.7 `CLAUDE.md`
In the Database section, after the sentence about `lib/pricing.ts`, add:

    Fittings: lib/sketchup/fittingKeywords.ts is the only fitting keyword list
    (kept identical to FITTING_KEYS in the SketchUp extension by a test). On
    import a drawn part is linked to a component by code (lib/fittings.ts);
    never add a second keyword list.

### Then
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — all must
pass (stop the dev server before the build). Report the diff summary and
anything in this file that did not match the code. Do NOT commit.

## Step 2 — Samer: verify in the app
Clean restart (`.next` removed, `npm run dev`, Ctrl+Shift+R).

Prepare: pick one cabinet export that has legs and a channel. On the
Components page, open (or add) the leg and the channel:
- give each the **Code** that is written in its SketchUp name (the part
  before any `__`);
- the channel's **unit must be `m`** with its price per metre; the leg `pcs`.

a. **3D unchanged.** Import (single) that export: the 3D preview looks
   exactly as before this stage (legs upright, channel profile right).
b. **Counts.** The summary shows the panels count and the fittings as lines.
   Anything "not linked" is listed in red with its code: that is the exact
   text to type as a component's Code.
c. **Create** the product (use a test code). Open it on the Products page:
   - Components section has one line per fitting: legs with the right count,
     the channel with its total length in metres, each showing
     "From SketchUp: CODE";
   - the calculated price is higher than panels-only by
     legs × leg price + metres × channel price (then markup and rounding).
d. **Hand-added hardware survives.** In that product add a component line by
   hand (e.g. a hinge, qty 4) and save. Re-import the same file → **Update
   catalogue entry**. Open the product: the hinge line (qty 4) is still
   there, board choices are kept, fitting lines are not doubled.
e. **Add as standard size** from the same file: the new size gets a
   calculated price that includes the fittings and the hand-added hinge line.
f. **Project import** of a multi-cabinet file: the Fittings column shows the
   line count and "(n not linked)" where it applies; import two cabinets and
   spot-check one as in (c).
g. Components page: Code column shows, search by code works, saving a
   duplicate code shows the "already exists" message.

Delete the test product(s) afterwards (or deactivate).

## Step 3 — Claude Code: commit
Only after Samer confirms Step 2.
```
git add -A
git commit -m "feat(catalogue): Stage 18e — fittings saved and priced on import, linked by code; one fitting keyword list"
git push
```

## Out of scope (stay out)
- Import from Polyboard (PDF report with hardware + cutting list): a later
  stage of its own.
- Any change to the SketchUp extension or its keyword list.
- Saving fitting positions / meshes for the saved-product 3D preview
  (Phase 2: v6 persistence).
- The DXF / 3DS importer.

## Report back
Diff summary, the four check results, what Samer saw for (a)–(g), and
anything that behaved differently from this file.
