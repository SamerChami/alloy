# Stage 20b — Quotations built by hand: the screens

**Model:** Sonnet (Step 1). Tester agent on Sonnet (Step 2).
**Phase:** 3 (Sales spine). Requires 20a applied and committed (Q0–Q9 passed
on the live database, 18 Nov 2026).

No migration, no SQL. App code only. Not a money stage: every amount shown
after a save comes from the database.

## What the user gets
- `/quotations`: the list, search, status filter, "New quotation".
- `/quotations/[id]`: one quotation. In a draft: add lines from the catalogue
  or typed by hand, edit qty / price / text, sections, discount, tax,
  validity, notes, print choice; send it. When sent: back to draft, approved,
  rejected, expired. Any status: new revision.
- Client page: the client's quotations and a "New quotation" button.

## The rules you must not break (the database enforces them; the screen follows)
1. **Never compute or send** `subtotal_jod`, `discount_jod`, `tax_jod`,
   `total_jod`, `line_total_jod`, `code`, `revision`, `root_id`, `sent_at`,
   `decided_at`, `price_source`, `list_price_jod`, `product_id`, `size_id`.
   Do not include them in any insert or update payload.
2. **A catalogue line is added only through the database function**
   `supabase.rpc("quotation_add_product", { p_quotation_id, p_product_id,
   p_size_id, p_qty, p_section })`. Never copy a catalogue price in app code.
3. **After every write, read the quotation and its lines again** and show
   what the database returned. `lib/quotationTotals.ts` is used ONLY for the
   live preview while the user is typing in the discount / tax / qty / price
   boxes, before the save.
4. Only a draft is editable. For any other status render plain text, no
   inputs, no add/remove buttons. Use `isDraft` / `nextStatuses` from
   `lib/quotations.ts` to decide what to show.
5. Office roles only. Non-office users are redirected to `/dashboard` before
   any query runs (same pattern as `app/(app)/components/page.tsx`).
6. All CLAUDE.md conventions: every visible string through `t()`, both
   languages, RTL-safe logical classes, `jod()` for money, `dir="ltr"` on
   numbers / codes / dates, existing `.card .btn-primary .btn-ghost .input`.
   No browser `alert` / `confirm`; errors inline in `text-rust`.

## Already written (do not rewrite, do not edit)
- `lib/quotations.ts` (+ `lib/quotations.test.ts`, 15 tests): types
  `QuotationRow`, `QuotationItemRow`, `QuoteStatus`, `PriceDisplay`; column
  lists `QUOTATION_COLUMNS`, `QUOTATION_ITEM_COLUMNS`; helpers `nextStatuses`,
  `isDraft`, `isPastValidity`, `dimsLabel`, `groupBySection`, `sectionNames`,
  `costSummary`, `priceChanged`.
- `lib/quotationTotals.ts`: `quotationTotals`, `lineTotal` (preview only).

Read both files in full first, plus `app/(app)/clients/ClientsShell.tsx`,
`ClientForm.tsx`, `[id]/ClientDetail.tsx`, `[id]/page.tsx` and
`app/(app)/components/page.tsx` for the patterns to copy.

---

## Step 1 — Claude Code (Sonnet): build

### 1.1 New files
    app/(app)/quotations/page.tsx                 (replace the placeholder)
    app/(app)/quotations/QuotationsShell.tsx
    app/(app)/quotations/NewQuotationForm.tsx
    app/(app)/quotations/StatusBadge.tsx
    app/(app)/quotations/[id]/page.tsx
    app/(app)/quotations/[id]/QuotationEditor.tsx
    app/(app)/quotations/[id]/CataloguePicker.tsx
    app/(app)/quotations/[id]/ManualLineForm.tsx
    app/(app)/quotations/[id]/QuotationNotFound.tsx

Keep `QuotationEditor.tsx` under about 450 lines; if it grows past that,
move the totals card into `TotalsCard.tsx` and the lines table into
`LinesTable.tsx` in the same folder.

### 1.2 `quotations/page.tsx` (server)
- Profile first; not office → `redirect("/dashboard")`.
- Read `searchParams` (`Promise<{ client?: string }>`).
- Two queries in parallel:

      supabase.from("quotations")
        .select("id, code, title, status, issue_date, valid_until, total_jod, revision, client:clients(id, full_name)")
        .order("created_at", { ascending: false })

      supabase.from("clients").select("id, full_name, phone").order("full_name")

- Render `<QuotationsShell quotations clients presetClientId={client ?? null} />`.

### 1.3 `QuotationsShell.tsx` (client)
- `PageTitle titleKey="quotations"`.
- Search box (code, client name, title; case-insensitive) and status pills:
  All, Draft, Sent, Approved, Rejected, Expired (`quoteStatus_<status>` keys).
- "New quotation" button (`newQuotation`) opens `NewQuotationForm`. If
  `presetClientId` is set, open the form on first render with that client
  chosen.
- Table columns: number (link to `/quotations/<id>`, `dir="ltr"`), client
  (link to `/clients/<id>`), title, date (`issue_date`), valid until, status
  (`StatusBadge`), total (`jod`, `tabular-nums`, `dir="ltr"`).
- When `isPastValidity(status, valid_until, today)` show `quotePastValidity`
  in `text-rust text-xs` under the valid-until date. `today` =
  `new Date().toISOString().slice(0, 10)`.
- Empty state: `noQuotations`.

### 1.4 `StatusBadge.tsx`
Small pill, text `t("quoteStatus_" + status)`. Classes:
draft `bg-line text-slate`, sent `bg-brass/10 text-brassdk`,
approved `bg-sage/10 text-sage`, rejected `bg-rust/10 text-rust`,
expired `bg-slate/10 text-slate`. All with
`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium`.

### 1.5 `NewQuotationForm.tsx` (modal, same shell as `ClientForm`)
- Fields: client (`<select className="input">`, required, options
  "full_name — phone"), title (optional, placeholder `quoteTitleHint`).
- Save:

      const { data, error } = await supabase.from("quotations")
        .insert({ client_id, title: title.trim() || null })
        .select("id").single();

  Nothing else in the payload (number, tax, validity come from the database).
  On success `router.push("/quotations/" + data.id)`.

### 1.6 `[id]/page.tsx` (server)
- Profile first; not office → redirect.
- Load the quotation (`QUOTATION_COLUMNS` + `, client:clients(id, full_name, phone)`)
  by id; none → `<QuotationNotFound />` (copy `ClientNotFound`, link back to
  `/quotations`).
- Load its lines: `QUOTATION_ITEM_COLUMNS`, `.eq("quotation_id", id)`,
  `.order("sort_order").order("id")`.
- Load the family for the revisions strip:

      const rootId = quotation.root_id ?? quotation.id;
      supabase.from("quotations").select("id, code, status, revision")
        .or(`id.eq.${rootId},root_id.eq.${rootId}`).order("revision")

- **Only when the status is draft**, load the catalogue (two queries):

      // models and components in one query; split by item_kind in the picker
      supabase.from("products")
        .select("id, code, name_en, name_ar, unit, unit_price_jod, width_mm, height_mm, depth_mm, item_kind")
        .eq("is_active", true).order("name_en")

      supabase.from("product_sizes")
        .select("id, product_id, label, width_mm, height_mm, depth_mm, price_jod")
        .order("width_mm")

  Boards (components with `sheet_length_mm` set) are not sold on a
  quotation: add `sheet_length_mm` to the select and drop those rows before
  passing the list down.
- Render `<QuotationEditor quotation lines family catalogue sizes />`.

### 1.7 `QuotationEditor.tsx` (client)
State: `quotation`, `lines` (initialised from props), `error`, `busy`.

`reload()`: re-select the quotation and its lines with the browser client
(same columns as the page) and set both. Call it after EVERY successful
write. After a status change or a delete also `router.refresh()`.

Every write follows the same shape:

    setBusy(true); setError(null);
    const { error } = await <write>;
    if (error) { setError(error.message); setBusy(false); await reload(); return; }
    await reload(); setBusy(false);

(The database's own messages are written for the user, e.g. "Quotation
QUO-2026-0003 is sent and its lines cannot be changed…". Show them as they
are.)

Layout, top to bottom:

**A. Header.** Back link to `/quotations` (`backToQuotations`, same arrow
pattern as ClientDetail). Number (`dir="ltr"`, `text-2xl font-semibold`),
`StatusBadge`, client name as a link to `/clients/<id>`. Under it the
revisions strip when `family.length > 1`: one small link per member (its
number), the current one in bold, each with its `StatusBadge`.

**B. Action buttons** (right side of the header, wrap on small screens):
- draft: `quoteMarkSent` (primary; disabled with hint `quoteNoLines` when
  there are no lines), `quoteDelete` (ghost, `text-rust`, two-step inline
  confirm like ClientDetail; on success `router.push("/quotations")`).
- sent: `quoteBackToDraft` (ghost), `quoteMarkApproved` (primary),
  `quoteMarkRejected` (ghost), `quoteMarkExpired` (ghost). Approved /
  rejected / expired are final: two-step inline confirm with
  `quoteFinalConfirm`.
- every status: `quoteNewRevision` (ghost):

      const { data, error } = await supabase.rpc("revise_quotation", { p_quotation_id: quotation.id });
      // data is the new quotation's id -> router.push("/quotations/" + data)

- Status change: `supabase.from("quotations").update({ status }).eq("id", id)`.
  Only offer what `nextStatuses(quotation.status)` returns.

**C. Details card** (draft: inputs saved on blur, each as its own one-field
update; otherwise plain text): title, issue date (`type="date"`), valid until
(`type="date"`, with the `quotePastValidity` hint when it applies), notes
(textarea). Valid until, notes and the print choice stay editable when the
quotation is sent (the database allows exactly those).

**D. Lines card.**
- `groupBySection(lines)`; for each group a header row with the section name
  (`quoteNoSection` for the empty one) and the section subtotal at the end
  of the group (`quoteSectionTotal`).
- Columns: # (running number over the whole quotation), code (`dir="ltr"`),
  description, size, qty, unit price, total, remove.
  - description: `description`; in Arabic UI show `description_ar` when it
    is not empty. Under it, muted `text-xs`: `item_no` if any, and `notes`.
  - size: `dimsLabel(width_mm, height_mm, depth_mm)`, `dir="ltr"`.
  - A catalogue line (`price_source` not `manual`) whose price was changed
    (`priceChanged(line)`) shows under the price, muted `text-xs`:
    `quoteListPrice`: `jod(list_price_jod)`.
- Draft only:
  - qty (`type="number" min="0.01" step="0.01"`) and unit price
    (`min="0" step="0.001"`) are inputs. Keep the typed text in local state
    per line; on blur, if the number is valid and different, update that one
    field. An invalid or empty value is put back to the saved one.
  - description and section are editable through a small pencil button that
    turns the row's text cells into inputs with Save / Cancel (description,
    section with a `<datalist>` of `sectionNames(lines)`, notes; plus code
    and W / H / D only when `price_source === "manual"`).
  - remove: trash icon, deletes the line at once (no confirm; a draft).
  - Two buttons under the table: `quoteAddFromCatalogue` (opens
    `CataloguePicker`) and `quoteAddManual` (opens `ManualLineForm`).
- No lines: `quoteNoLinesYet`.

**E. Totals card** (narrow, aligned to the end of the row).
- Rows: subtotal; discount; tax; total (bold).
- Draft: discount = a `<select>` (`quoteDiscountPercent` / `quoteDiscountAmount`)
  + a number input; tax % = a number input (0–100). While the user types,
  show the preview from `quotationTotals(lines, {discountKind, discountValue,
  taxPct})` with a small muted `quotePreview` tag; on blur save
  `{ discount_kind, discount_value }` or `{ tax_pct }` and `reload()`. When
  nothing is being typed, show the saved `subtotal_jod`, `discount_jod`,
  `tax_jod`, `total_jod` from the quotation row and no tag.
- Print choice: `<select>` saved to `price_display` (`quotePriceDisplay`;
  options `quoteDisplay_lines`, `quoteDisplay_sections`, `quoteDisplay_total`)
  with the hint `quotePriceDisplayHint`. Editable in every status.
- **Internal box** under the totals, `bg-mist rounded-lg p-3 text-xs`, title
  `quoteInternal`: from `costSummary(lines)` show cost, margin
  (`jod`), and when `unknownLines > 0` the line `quoteCostUnknown` with the
  count. This box never goes on the printed quotation (Stage 20d).

### 1.8 `CataloguePicker.tsx` (modal)
- Props: `quotationId`, `catalogue`, `sizes`, `sections`, `onClose`, `onAdded`.
- Search box (code or name, both languages). Two tabs or two headed lists:
  `products` (item_kind `product`) and `components`. Show at most 50 matches.
  Each row: code (`dir="ltr"`), name, catalogue size (`dimsLabel`), price.
- Choosing a row shows the add panel: 
  - size `<select>`: first option `quoteAsInCatalogue` + size + price, then
    one option per standard size of that model
    (`label` if any, `dimsLabel`, `jod(price_jod)`). Components have no sizes:
    hide the select.
  - qty (default 1, `min="0.01" step="0.01"`), section (input with
    `<datalist>` of `sections`).
  - Add:

        const { error } = await supabase.rpc("quotation_add_product", {
          p_quotation_id: quotationId,
          p_product_id: chosen.id,
          p_size_id: sizeId || null,
          p_qty: qty,
          p_section: section.trim() || null,
        });

    On success call `onAdded()` (the editor reloads) and KEEP the picker
    open with the search text and section kept, so several cabinets can be
    added in a row. Show `quoteAdded` for 2 seconds.
- A model whose price is 0 shows `quotePriceZero` in `text-rust text-xs`
  next to the price (it can still be added; the price is then typed on the
  line).

### 1.9 `ManualLineForm.tsx` (modal)
- Fields: description (required), code (optional), section (datalist), qty
  (default 1), unit price (required, ≥ 0), W / H / D mm (optional, whole
  numbers), notes.
- Insert:

      supabase.from("quotation_items").insert({
        quotation_id, description, code: code || null, section: section || null,
        qty, unit_price_jod, width_mm, height_mm, depth_mm, notes: notes || null,
        sort_order: (max sort_order of the current lines) + 1,
      })

  Nothing else in the payload.

### 1.10 Client page
- `clients/[id]/page.tsx`: second query

      supabase.from("quotations")
        .select("id, code, title, status, issue_date, total_jod")
        .eq("client_id", id).order("created_at", { ascending: false })

  passed as `quotations` to `ClientDetail`.
- `ClientDetail.tsx`, the card that now shows `comingSoon` under
  `projectsQuotations`: change its title to `t("quotations")`, list the
  client's quotations (number as link, title, date, `StatusBadge`, total) or
  `noQuotations`, and put a `newQuotation` link button
  (`/quotations?client=<id>`) in the card. Make this card span both columns
  (move it out of the two-column grid, below the Drive folder card).
  Surgical edit; touch nothing else in the file.

### 1.11 Dashboard
`dashboard/stats.tsx`: the "New quotation" quick action keeps pointing to
`/quotations`. No change.

### 1.12 i18n — add to BOTH `en` and `ar` in `lib/i18n.ts`
| key | en | ar |
|---|---|---|
| noQuotations | No quotations yet. | لا توجد عروض أسعار بعد. |
| backToQuotations | Back to quotations | العودة إلى عروض الأسعار |
| quoteNotFound | Quotation not found. | عرض السعر غير موجود. |
| quoteNumber | Number | الرقم |
| quoteClient | Client | العميل |
| quoteTitle | Title | العنوان |
| quoteTitleHint | e.g. Kitchen and laundry | مثال: مطبخ وغرفة غسيل |
| quoteDate | Date | التاريخ |
| quoteValidUntil | Valid until | صالح حتى |
| quotePastValidity | Validity date has passed | انتهت مدة الصلاحية |
| quoteStatus | Status | الحالة |
| quoteStatusAll | All | الكل |
| quoteStatus_draft | Draft | مسودة |
| quoteStatus_sent | Sent | مُرسل |
| quoteStatus_approved | Approved | موافق عليه |
| quoteStatus_rejected | Rejected | مرفوض |
| quoteStatus_expired | Expired | منتهي |
| quoteTotal | Total | الإجمالي |
| quoteSubtotal | Subtotal | المجموع |
| quoteDiscount | Discount | الخصم |
| quoteDiscountPercent | % | % |
| quoteDiscountAmount | JD | دينار |
| quoteTax | Sales tax % | ضريبة المبيعات % |
| quoteTaxAmount | Sales tax | ضريبة المبيعات |
| quotePreview | not saved yet | لم يُحفظ بعد |
| quoteMarkSent | Mark as sent | تحديد كمُرسل |
| quoteBackToDraft | Back to draft | إعادة إلى مسودة |
| quoteMarkApproved | Approved by client | وافق العميل |
| quoteMarkRejected | Rejected | رُفض |
| quoteMarkExpired | Expired | انتهى |
| quoteFinalConfirm | This is final and cannot be undone. To change the quotation afterwards, make a revision. Continue? | هذا الإجراء نهائي ولا يمكن التراجع عنه. لتعديل العرض لاحقاً أنشئ نسخة معدّلة. متابعة؟ |
| quoteNewRevision | New revision | نسخة معدّلة |
| quoteRevisions | Revisions | النسخ |
| quoteDelete | Delete draft | حذف المسودة |
| quoteDeleteConfirm | Delete this draft and its lines? | حذف هذه المسودة وبنودها؟ |
| quoteNoLines | Add at least one line before sending. | أضف بنداً واحداً على الأقل قبل الإرسال. |
| quoteNoLinesYet | No lines yet. Add from the catalogue or type a line. | لا توجد بنود بعد. أضف من الكتالوج أو اكتب بنداً. |
| quoteLines | Lines | البنود |
| quoteDescription | Description | الوصف |
| quoteSize | Size (W × H × D mm) | المقاس (عرض × ارتفاع × عمق ملم) |
| quoteLineTotal | Total | الإجمالي |
| quoteSection | Section | القسم |
| quoteNoSection | General | عام |
| quoteSectionTotal | Section total | إجمالي القسم |
| quoteListPrice | List price | سعر الكتالوج |
| quoteAddFromCatalogue | Add from catalogue | إضافة من الكتالوج |
| quoteAddManual | Add a typed line | إضافة بند يدوي |
| quoteAsInCatalogue | As in catalogue | كما في الكتالوج |
| quoteAdded | Added | تمت الإضافة |
| quotePriceZero | No price in the catalogue | لا يوجد سعر في الكتالوج |
| quotePriceDisplay | Prices on the printed quotation | الأسعار في العرض المطبوع |
| quoteDisplay_lines | Price on every line | سعر لكل بند |
| quoteDisplay_sections | One price per section | سعر لكل قسم |
| quoteDisplay_total | One total only | إجمالي واحد فقط |
| quotePriceDisplayHint | Printing comes in a later stage; the choice is saved now. | الطباعة في مرحلة لاحقة؛ يُحفظ الاختيار الآن. |
| quoteInternal | Internal — not printed | داخلي — لا يُطبع |
| quoteCost | Cost | التكلفة |
| quoteMargin | Margin | الهامش |
| quoteCostUnknown | Lines with no cost recorded: | بنود بلا تكلفة مسجّلة: |
| quoteWidth | W | عرض |
| quoteHeight | H | ارتفاع |
| quoteDepth | D | عمق |

Reuse existing keys where they exist: `quotations`, `newQuotation`, `search`,
`save`, `cancel`, `delete`, `confirmDelete`, `notes`, `qty`, `unitPrice`,
`code`, `add`, `removeLine`, `products`, `components`.

### 1.13 Verify and commit
Stop the dev server first.

    npm run lint
    npm run typecheck
    npm test
    npm run build

All four must pass (`lib/quotations.test.ts` adds 15 tests). Then check
yourself against the "rules you must not break": search the new files for
`subtotal_jod`, `total_jod`, `list_price_jod`, `price_source`, `product_id`
inside any `.insert(` / `.update(` payload — there must be none.

Commit message:
`feat(quotations): Stage 20b — quotation list, editor, catalogue picker, status flow, revisions, client page panel`

Include `lib/quotations.ts`, `lib/quotations.test.ts` and this task file.
Do NOT push yet: Step 2 comes first. Report a 5-line summary and the file
sizes of the new components.

---

## Step 2 — Tester agent (Sonnet) in the built-in browser
Samer starts a clean dev server and is signed in as admin at
`http://localhost:3000`. This is the LIVE database: follow the clean-up
rules exactly.

**Do NOT click "Approved by client", "Rejected" or "Expired" on anything.**
Those are final, cannot be deleted afterwards, and are already proven by the
database checks (Q4). Test only draft → sent → back to draft.

Script (report each numbered check as PASS / FAIL with what you saw):

1. `/quotations` opens with the title, an empty state or a list, and no
   console errors. In Arabic the page is right-to-left and no English label
   is left.
2. Clients → add client `TEST 20b client`, phone `0790000020`. Open it. The
   Quotations card shows the empty text and a "New quotation" button.
3. Click it. The form opens with `TEST 20b client` already chosen. Title
   `TEST kitchen`. Save. You land on the quotation: number `QUO-2026-nnnn`,
   status Draft, valid until = today + 30 days, tax 16, total 0.000 JD.
   "Mark as sent" is disabled.
4. Add a typed line three times:
   `TEST base unit`, qty 2, price 19.5, section `Kitchen`;
   `TEST tall unit`, qty 1, price 120, section `Kitchen`;
   `TEST handle`, qty 3, price 7.25, no section.
   Wanted: Kitchen section total 159.000, General 21.750, subtotal 180.750,
   tax 28.920, total 209.670.
5. Discount: choose %, type 10. While typing, the "not saved yet" tag shows;
   after leaving the box: discount 18.075, tax 26.028, total 188.703 and the
   tag is gone.
6. Discount: choose JD, type 20 → discount 20.000, tax 25.720, total 186.470.
   Type 500 → discount is held at 180.750, total 0.000. Set it back to 0.
7. Tax: type 0 → total 180.750. Back to 16 → 209.670.
8. Change qty of `TEST base unit` to 3 → line total 58.500, subtotal 200.250,
   total 232.290. Back to 2.
9. Add from catalogue: search `DR2`. Choose `DR2-K3`, "As in catalogue",
   qty 1, section `Kitchen`, Add. Wanted: a line with code `DR2-K3`, the
   price shown for DR2-K3 on the Products page, and the picker still open.
   Then add its standard size 800 × 880 × 580: the line shows that size and
   the price shown for that size on the product's Standard sizes list.
10. On the DR2-K3 catalogue line change the unit price to 15. Wanted: line
    total 15.000 and "List price: <the catalogue price>" under it.
11. Internal box: cost and margin are shown, and "Lines with no cost
    recorded: 3" (the three typed lines) or more.
12. Remove both DR2-K3 lines. Totals return to step 7's 209.670.
13. Mark as sent. Wanted: status Sent; no inputs on lines, no add or remove
    buttons, discount and tax are plain text; valid until, notes and the
    print choice can still be changed and stay after a page reload.
14. Back to draft. Inputs return.
15. New revision. Wanted: you land on `…-R2`, Draft, same three lines, total
    209.670; a revisions strip with both numbers; the original is unchanged.
16. List page: both rows show; search `R2` finds one; the Draft pill shows
    both; the Sent pill shows none.
17. Sign-off look in Arabic on the quotation page: right-to-left, numbers
    and codes left-to-right, no clipped buttons at 1280 px and at 900 px
    width.
18. UX review: anything confusing, slow, misaligned or missing a
    confirmation. List it; do not fix.

**Clean-up (in this order, and confirm each):**
a. Open `…-R2` → Delete draft → confirm.
b. Open the original → Delete draft → confirm.
c. Clients → `TEST 20b client` → Delete.
The quotations list and the client list must be as they were before the
test. If any step refuses, STOP and report exactly what it said.

Note for Samer: quotation numbers used by a test are not given out again, so
the first real quotation will not be `0001`. Say so if you want the counter
reset before real use.

## Step 3 — Samer
Your own look at the quotation page in both languages, then tell Claude
(chat) the tester's report. Push after that.

## Out of scope (next stages)
- 20c: SketchUp project import into a draft quotation.
- 20d: bilingual print / PDF with the three price-display choices.
- Projects screens; linking a quotation to a project.
- Re-ordering lines by drag; duplicate line; per-line discount.
