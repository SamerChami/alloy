# Stage 18a — Product Code (`products.code`)

**Model:** Sonnet.
**Phase:** 1 (Catalogue truth). Requires Phase 0 (done).

## Decisions this implements (Samer, 16 Nov 2026)
- Code = text before the first `/` of the SketchUp name. Case-insensitive.
- ONE catalogue entry per code. A code is a cabinet model, not a size; the
  same code is drawn at many sizes and re-priced per job (Phase 3).
- Some models also have fixed standard sizes with list prices. That is
  Stage 18b (a `product_sizes` table). NOT in this stage.
- "Update the existing catalogue entry from a new export" is also 18b. In this
  stage an import of a code that already exists is simply not allowed.

Already written (do not rewrite):
- `supabase/migrations/20261116150000_products_code.sql`
- `lib/productCode.ts` (`codeFromName`, `codeKey`) and `lib/productCode.test.ts`

---

## Step 1 — Samer: apply the migration

    npx supabase db push --remote --dry-run

Must list exactly one migration: `20261116150000_products_code.sql`.

    npx supabase db push --remote

Then in the SQL editor:

    select name_en, code, source from products where item_kind = 'product' order by created_at;

Paste the result in the chat (it shows what the back-fill did).

## Step 2 — Claude Code: app changes

Read first: `lib/productCode.ts`, `app/(app)/products/types.ts`, `page.tsx`,
`ProductForm.tsx`, `ProductsShell.tsx`, and both import shells
(`import-sketchup-single/SingleImportShell.tsx`,
`import-sketchup-project/ProjectImportShell.tsx`).

### 2a. Type + query
- `app/(app)/products/types.ts`: add `code: string | null;` to `Product`,
  directly after `sku`.
- `app/(app)/products/page.tsx`: add `code` to the products `select(...)`
  column list, directly after `sku`. Do not change the panels/components
  selects.

### 2b. i18n — add to BOTH `en` and `ar` in `lib/i18n.ts`
| key | en | ar |
|---|---|---|
| `code` | `Code` | `الرمز` |
| `codeHint` | `Text before the first / in the SketchUp name` | `النص قبل أول / في اسم SketchUp` |
| `codeExists` | `A product with this code already exists in the catalogue.` | `يوجد منتج بهذا الرمز في الكتالوج.` |
| `codeInCatalogue` | `In catalogue` | `موجود في الكتالوج` |
| `codeDuplicateInFile` | `Duplicate in file` | `مكرر في الملف` |
| `codeMissing` | `No code` | `بدون رمز` |

If a key with one of these names already exists, STOP and report.

### 2c. `ProductForm.tsx`
- `FormState`: add `code: string;`. `fromProduct`: `code: p?.code ?? "",`.
- `buildPayload`: add `code: form.code.trim() || null,` directly after `sku`.
- UI: in the `grid grid-cols-3` row that holds SKU / Subcategory / Unit,
  change the class to `grid grid-cols-4` and add, BEFORE the SKU field:

  ```tsx
  <div>
    <label className="block text-sm font-medium mb-1">{t("code")}</label>
    <input className="input font-mono" dir="ltr" value={form.code} onChange={set("code")} title={t("codeHint")} />
  </div>
  ```
- `handleDuplicate`: in the insert object add `code: null,` next to
  `sku: null,` (a copy must not reuse the code).
- Friendly error: add a small helper inside the component

  ```ts
  function friendly(msg: string): string {
    return msg.includes("products_code_unique") ? t("codeExists") : msg;
  }
  ```
  and wrap the three places in `handleSubmit` / `handleDuplicate` where a
  products insert/update error message is passed to `setError(...)`:
  `setError(friendly(err.message))` etc. Do not touch the BOM error paths.

### 2d. `ProductsShell.tsx`
- Table header: add `<th className="text-start px-4 py-3 font-medium">{t("code")}</th>`
  directly BEFORE the SKU header.
- Row: add, directly before the SKU cell, a cell with the same classes as the
  SKU cell plus `font-mono`, showing `{p.code ?? "—"}`.
- Search filter: add `|| (p.code ?? "").toLowerCase().includes(q)`.
- If any row uses `colSpan` for a group header or empty state, increase it
  by 1 so the table stays aligned.

### 2e. `SingleImportShell.tsx`
- Import `codeFromName`, `codeKey` from `@/lib/productCode`.
- New state: `const [existingCodes, setExistingCodes] = useState<Set<string>>(new Set());`
- In `handleFile`, after the file parses successfully, load the catalogue's
  codes once:

  ```ts
  const { data: codeRows } = await createClient()
    .from("products").select("code").not("code", "is", null);
  setExistingCodes(new Set((codeRows ?? []).map((r) => codeKey(r.code as string))));
  ```
- Derived values (plain consts in the component body):
  `const code = parsed ? codeFromName(parsed.roots[0].name) : null;`
  `const codeTaken = code != null && existingCodes.has(codeKey(code));`
  The code ALWAYS comes from the SketchUp root name, never from the editable
  "cabinet name" input.
- UI: in the card under the cabinet-name input, add a read-only line:
  label `t("code")`, value in `font-mono` showing `code ?? t("codeMissing")`.
  When `codeTaken`, show `t("codeExists")` in `text-rust` under it.
- `handleCreate`: add `code,` to the products insert object. If the insert
  error message contains `products_code_unique`, show `t("codeExists")`.
- Create button: add `|| codeTaken` to its `disabled` condition.
- A file with no code (`code == null`) may still be imported (code stays null).

### 2f. `ProjectImportShell.tsx`
- Import `codeFromName`, `codeKey`.
- `CabinetRow` becomes:

  ```ts
  type CabinetRow = {
    root: V3Node;
    selected: boolean;
    code: string | null;
    status: "new" | "in_catalogue" | "duplicate_in_file";
  };
  ```
- In `handleFile`, after filtering `cabinets`, load existing codes (same query
  as 2e) and build rows in file order:
  - `code = codeFromName(root.name)`
  - `in_catalogue` if `code` is in the existing set;
  - else `duplicate_in_file` if an EARLIER row in this file has the same
    `codeKey` (the first occurrence stays `new`);
  - else `new` (a row with `code == null` is always `new`).
  - `selected = status === "new"`.
- `toggleRow` and the select-all handler must never select a row whose status
  is not `new`. The row checkbox is `disabled` for those rows.
- Table: add a `{t("code")}` column directly after the name column
  (`font-mono text-xs`, shows `row.code ?? "—"`). For non-new rows show a
  small tag next to the code: `t("codeInCatalogue")` or
  `t("codeDuplicateInFile")` (`text-xs text-slate`).
- `handleImport`: add `code: row.code,` to the products insert object.

### DO NOT
- Do not touch `Cabinet3D.tsx`, `lib/cabinet3d.ts`, `lib/sketchup/parseV3.ts`,
  `lib/pricing.ts`, the DXF/3DS importer, or the extension.
- Do not create a `product_sizes` table or any "update existing" flow.
- Do not run any `supabase db` command.

## Verification (must pass before commit)
1. `npm run lint`, `npm run typecheck`, `npm test` (10 tests: 5 pricing +
   5 product code), `npm run build` all pass.
2. Samer, in the app after a clean restart:
   a. Products list shows a Code column; the back-filled product(s) from
      Step 1 show their code.
   b. Single import of the `mesh_diag` export: the page shows code
      `mesh_diag` and the Create button is enabled. Create it. The new
      product appears in the list with code `mesh_diag`.
   c. Single import of the SAME export again: the page shows the "already
      exists" message and the Create button is disabled.
   d. Add product by hand, type code `MESH_DIAG` (capitals), save: the form
      shows the "already exists" message and nothing is saved.
   e. Project import of an export with several cabinets: rows whose code is
      already in the catalogue, or repeated in the file, are tagged, unticked
      and cannot be ticked; the rest import and get their codes.
   f. Duplicate a product: the copy has an empty code.

## Commit
```
git add -A
git commit -m "feat(catalogue): Stage 18a — products.code join key, set on import, one entry per code"
git push
```
