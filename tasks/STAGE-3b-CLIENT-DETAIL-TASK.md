# Stage 3b — Client Detail Page (task for Claude Code)

Read `CLAUDE.md` first. The Clients module (list + modal create/edit) is done
and working. Now add the **client detail page** so later modules (quotations,
contracts, projects) have a place to link to. Follow all CLAUDE.md conventions
(i18n en+ar, JOD via `jod()`, existing card/button styles, RTL-safe, office-only).

## Build: `/clients/[id]`
- Server Component at `app/(app)/clients/[id]/page.tsx` that fetches the single
  client by id. If not found, show a clean "not found" state with a link back
  to `/clients` (use the interface voice, not an error dump).
- Make each row in the clients list (`ClientsShell.tsx`) link to this page —
  clicking the client's name navigates to `/clients/[id]`. Keep the existing
  Edit button working as-is (modal); don't break it.

### Layout
Group the client's info into cards using existing `.card` styling:
- **Header**: full_name large, with project_type as a colored badge, and the
  created date. Put Edit (opens the existing modal) and a Back-to-list link in
  the header, RTL-aware.
- **Contact card**: phone as a `tel:` link, email as a `mailto:` link,
  location. Force `dir="ltr"` on phone/email values so they read correctly in
  Arabic mode.
- **Project card**: project_type, referred_by (translated label),
  referred_note, budget via `jod()`.
- **Details card**: prerequisites and notes (preserve line breaks —
  `whitespace-pre-wrap`).
- **Google Drive card**: if `drive_folder_url` is set, a button/link "Open
  Drive folder" that opens in a new tab (`target="_blank" rel="noopener"`); if
  empty, a muted "No folder linked yet".
- **Placeholder card** titled "Projects & Quotations" with a muted
  "coming soon" line (key `comingSoon`) — we wire this in a later stage.

### i18n
Add any new labels (e.g. "Back to clients", "Open Drive folder",
"No folder linked yet", "Not found", card titles "Contact", "Project",
"Details") to BOTH en and ar in `lib/i18n.ts`. Reuse existing keys where they
already exist (clients, edit, etc.).

### Delete (optional but preferred)
Add a Delete action on the detail page. Confirm in-UI first (no browser alert —
a small inline confirm or a simple confirm state). On delete, if Supabase
rejects it because the client is referenced by other records, catch the error
and show a clear message like "Can't delete: this client has linked
projects or quotations." Then route back to `/clients` on success.

## Acceptance
- `npm run build` passes.
- Clicking a client name opens the detail page; Back returns to the list.
- Works in English and Arabic with correct RTL; no hardcoded user-facing
  strings; no hardcoded currency.
- Commit message: "Stage 3b: client detail page".

When done, run the build and give me a 3-line summary + how to test.
