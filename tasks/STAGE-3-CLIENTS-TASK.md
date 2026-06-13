# Stage 3 — Clients Module (task for Claude Code)

Read `CLAUDE.md` and `db/01_schema.sql` first. Build the **Clients** module to
replace the placeholder at `app/(app)/clients/page.tsx`. Follow every convention
in CLAUDE.md (i18n in both en+ar, JOD via `jod()`, existing styles, RTL-safe,
office-only access).

## Scope
The `clients` table already exists. Build full management on top of it:
columns are `full_name, phone, email, location, project_type, referred_by,
referred_note, budget_jod, prerequisites, notes, drive_folder_url, created_at`.

### 1. Clients list — `/clients`
- Server Component that fetches all clients ordered by `created_at` desc.
- Show a responsive table (card list on mobile) with: full_name, phone,
  project_type (as a colored badge), referred_by, budget (via `jod()`), and
  created date.
- A **search box** (client component) filtering by name OR phone, live as you
  type. Keep it simple: filter client-side over the fetched rows for now.
- A **"New client"** button (top-right, RTL-aware) opening the create form.
- Each row links to the client detail page `/clients/[id]`.
- Empty state: a friendly message + the New client button (see CLAUDE.md
  "errors/empty states" spirit).

### 2. Create / Edit form
- Reusable form component used by both create and edit.
- Fields: full_name (required), phone (required), email, location,
  project_type (select: kitchen/bedroom/closet/other), referred_by (select
  using the `referral_source` enum values), referred_note (text, e.g. friend's
  name), budget_jod (number, 3 decimals), prerequisites (textarea), notes
  (textarea), drive_folder_url (url — label it "Google Drive folder").
- Validate required fields client-side; show inline errors via the interface
  voice (no browser alerts).
- On save: insert/update via Supabase browser client, then route back to the
  list (or detail) and `router.refresh()`.
- Add ALL new labels to `lib/i18n.ts` (en + ar). Arabic translations should be
  natural (e.g. project_type kitchen = مطبخ, bedroom = غرفة نوم,
  closet = خزانة/دريسنغ, referred_by social_media = وسائل التواصل).

### 3. Client detail — `/clients/[id]`
- Server Component fetching the single client.
- Show all fields nicely grouped in cards. Make `drive_folder_url` a clickable
  link (opens new tab) and `phone` a `tel:` link.
- Edit and (soft) Delete buttons. For delete: confirm in-UI first; since other
  records reference clients, do a guarded delete and show a clear message if the
  DB blocks it (client has projects/quotations). Don't crash.
- Leave a placeholder section "Projects & Quotations" — we'll wire it in a
  later stage.

## Acceptance
- `npm run build` passes.
- Works in both English and Arabic with correct RTL.
- Only office roles can reach it (the page already sits behind the (app) layout;
  also hide nav for non-office, which `lib/nav.ts` already does).
- No hardcoded user-facing strings; no hardcoded currency.
- Commit with message: "Stage 3: clients module (list, create/edit, detail)".

When done, run the build, then give me a 3-line summary of what you added and
how to test it.
