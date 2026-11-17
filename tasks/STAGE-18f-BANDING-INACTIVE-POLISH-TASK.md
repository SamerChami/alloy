# Stage 18f — Banding types screen, deactivated items, import polish

**Model:** Sonnet. App only: no migration, no extension change.
**Phase:** 1 (Catalogue truth) leftovers. Requires 18e (done, 22b9d4d).

Three small things in one stage:
A. an office screen to manage edge-banding types and their price per metre;
B. a way to see deactivated products / components and reactivate them;
C. four UX fixes the tester found on 18e.

## Already written and tested (do NOT rewrite; read first)
- `lib/fittings.ts`: new `partCode(part)` and
  `classifyPart(part, components): "panel" | "linked" | "unlinked"`.
- `lib/catalogImport.ts`: `updateCatalogueEntry` and `addStandardSize` now
  return **`ImportOutcome = { error: string | null; panelLines: number;
  componentLines: number }`** instead of `string | null`.

The build is RED until C.1 updates the two callers. That is expected.

Rules for all of this stage:
- Every visible string through `t()`, added to BOTH `en` and `ar` in `lib/i18n.ts`.
- Money with `jod()`. Logical CSS only (RTL must still work).
- Database facts you need: `banding_types (id, name, price_per_m_jod, is_active)`
  — unique index `idx_banding_types_name` on `name`; only office roles can read
  or write it; changing `price_per_m_jod` re-prices every model that uses it
  (database trigger — do nothing in app code). Banding types are referenced by
  parts lists, so they are never deleted, only deactivated.

---

## Step 1 — Claude Code (Sonnet)

### A. Banding types screen (Components page, office only)
A.1 `app/(app)/components/page.tsx`: also load ALL banding types
(`.from("banding_types").select("id, name, price_per_m_jod, is_active").order("name")`,
active and inactive) and pass them to `ComponentsShell` as `bandingTypes`.

A.2 New client component `app/(app)/components/BandingTypesCard.tsx`, built
like `app/(app)/products/PricingSettingsCard.tsx` (a `btn-ghost` toggle button
with an icon, opening a `card`). Props: `bandingTypes: BandingType[]`
(type from `app/(app)/products/bom_types.ts`).
- Toggle label `t("bandingTypes")`.
- Inside: one row per banding type — Name (text input), Price per metre
  (number input, `min="0" step="0.001" dir="ltr"`), an Active checkbox, and a
  Save button for that row (enabled only when the row differs from what was
  loaded). Inactive rows are shown dimmed (`opacity-60`).
- Below the rows: an "Add" row (name + price, Add button; name required,
  price defaults to 0).
- Save / Add write with the browser Supabase client
  (`update(...).eq("id", id)` / `insert({ name, price_per_m_jod })`), then
  `router.refresh()`. Trim the name; refuse an empty name.
- On an error whose message includes `idx_banding_types_name`, show
  `t("bandingNameExists")` next to that row; otherwise the raw message.
- Help line under the list: `t("bandingTypesHelp")`.
- No delete button anywhere.

A.3 `ComponentsShell.tsx`: render `<BandingTypesCard … />` under the page
title, above the toolbar (same place the pricing card has on Products).

A.4 Products page must know inactive banding types too, or a part that still
uses one shows a wrong preview cost:
- `app/(app)/products/page.tsx` (office path only): remove
  `.eq("is_active", true)` from the `banding_types` query.
- `app/(app)/products/BomSection.tsx`, the banding `<select>` of a panel line:
  list only types that are active OR are the one selected on that line; label
  an inactive one `name (t("inactive"))`. Cost preview code is unchanged.

i18n:
- `bandingTypes`: `Edge banding types` / `أنواع شريط الحواف`
- `pricePerMetre`: `Price per metre` / `السعر للمتر`
- `bandingNameExists`: `A banding type with this name already exists.` / `يوجد نوع شريط حواف بهذا الاسم.`
- `bandingTypesHelp`: `Changing a price re-prices every model that uses it. A type that is no longer used is deactivated, not deleted.` / `تغيير السعر يعيد تسعير كل موديل يستخدمه. النوع غير المستخدم يُلغى تفعيله ولا يُحذف.`
- `inactive`: `inactive` / `غير مفعّل`
- reuse existing keys for Name, Active, Save, Add where they exist; add only
  what is missing.

### B. Deactivated products and components
Same pattern on both pages, driven by the URL so it survives a refresh:
`/products?inactive=1` and `/components?inactive=1`.

B.1 `app/(app)/products/page.tsx` and `app/(app)/components/page.tsx`:
accept `searchParams` (Next 15: `searchParams: Promise<{ inactive?: string }>`,
`await` it). `const showInactive = (await searchParams).inactive === "1";`
- Office path: the main list query uses `.eq("is_active", !showInactive)`
  instead of `.eq("is_active", true)`. The other queries (panels, components
  for dropdowns, banding types, settings) are unchanged.
- Products non-office path: ignore the parameter (always active only).
- Pass `showInactive` to the shell.

B.2 `ProductsShell.tsx` and `ComponentsShell.tsx`:
- In the toolbar (office only), a `btn-ghost` button that switches between the
  two lists with `router.push`: label `t("showDeactivated")` when showing
  active, `t("showActive")` when showing deactivated.
- When `showInactive`: a small note above the table `t("deactivatedListNote")`;
  the "Add …" and import buttons are hidden; each row gets a
  `t("reactivate")` button (`btn-ghost`, next to the edit pencil) that runs
  `supabase.from("products").update({ is_active: true }).eq("id", id)` then
  `router.refresh()`. Show an error text if it fails.
- The empty state on the deactivated list says `t("noDeactivated")` and has
  no Add button.
- Editing a deactivated item with the pencil keeps working as today.

i18n:
- `showDeactivated`: `Show deactivated` / `عرض غير المفعّلة`
- `showActive`: `Back to active` / `العودة إلى المفعّلة`
- `reactivate`: `Reactivate` / `إعادة التفعيل`
- `deactivatedListNote`: `Deactivated items. They are hidden from lists and dropdowns until reactivated.` / `عناصر غير مفعّلة. تبقى مخفية من القوائم والاختيارات حتى إعادة تفعيلها.`
- `noDeactivated`: `Nothing is deactivated.` / `لا توجد عناصر غير مفعّلة.`

### C. Import and form polish
C.1 Callers of the new `ImportOutcome` (both import shells):
- `SingleImportShell.tsx` `handleExisting`: `const out = await fn(...)`;
  `if (out.error) { setImportError(out.error); return; }`; the success
  message becomes
  `t(action === "update" ? "importUpdatedOk" : "importSizeAddedOk") + " " + t("importSavedCounts").replace("{panels}", String(out.panelLines)).replace("{components}", String(out.componentLines))`.
- `ProjectImportShell.tsx` `handleImport`: same error handling
  (`if (out.error) …`); `totalPanels += out.panelLines`.
- i18n `importSavedCounts`: `Saved {panels} panels and {components} component lines.` / `تم حفظ {panels} لوحاً و{components} بند مكوّنات.`

C.2 `SingleImportShell.tsx`, the "not linked" warning: replace the single red
paragraph with a bordered box, same look as the parse-error box on that page
(`border border-rust/30 bg-rust/5 rounded-lg p-4`, `AlertTriangle` icon):
- title line: `t("fittingsNotLinkedTitle")`;
- a `<ul>` with ONE `<li>` per unlinked item, `dir="ltr"`, font-mono code:
  `code × qty unit`;
- last line, `text-xs`: `t("fittingsNotLinkedHow")`.
Remove the old `fittingsNotLinked` key from both languages.
- `fittingsNotLinkedTitle`: `Not linked to a component — these will be saved with no price:` / `غير مرتبطة بمكوّن — ستُحفظ بدون سعر:`
- `fittingsNotLinkedHow`: `To price one: open Components, give the right component this exact Code, then import again.` / `لتسعير أحدها: افتح المكوّنات، أعطِ المكوّن المناسب هذا الرمز بالضبط، ثم أعد الاستيراد.`

C.3 `SingleImportShell.tsx`, parts table "Type" tag: decide it with
`classifyPart(part, components)` (import from `@/lib/fittings`) instead of
`part.isFitting`:
- `"panel"` → existing Panel tag;
- `"linked"` → existing Fitting tag (grey);
- `"unlinked"` → Fitting tag in rust (`bg-rust/10 text-rust`) with the text
  `t("skuFittingTag")` + ` — ` + `t("notLinkedShort")`.
Row dimming (`opacity-60`) applies to `"linked"` and `"unlinked"`.

C.4 Code field errors and hint, in BOTH `ComponentForm.tsx` and
`ProductForm.tsx`:
- When a save fails with `products_code_unique`, show `t("codeExists")`
  directly UNDER the Code input (`text-rust text-xs mt-1`) and give that input
  a rust border (`border-rust`); do not also show it in the general error
  line at the bottom. Clear it when the Code input changes.
- `ComponentForm.tsx` only: show `t("componentCodeHint")` as visible helper
  text under the Code input (`text-xs text-slate mt-1`) when there is no
  error (keep the `title` too).

### Then
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — all must
pass (stop the dev server before the build). Report the diff summary and
anything in this file that did not match the code. Do NOT commit.

## Step 2 — in-app test (tester agent, script written by Claude chat)
Samer: clean restart (`.next` removed, `npm run dev`), signed in in the
Claude desktop browser pane, then tell Claude chat to run the test.

## Step 3 — Claude Code: commit
Only after the test report is accepted.
```
git add -A
git commit -m "feat(catalogue): Stage 18f — banding types screen, deactivated items list, import polish"
git push
```

## Out of scope (stay out)
- Any database change. Deleting banding types.
- "Set all boards to…" in the parts list (the model's default board covers it).
- The saved-product 3D preview (Phase 2).
