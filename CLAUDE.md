# ALLOY — Project Context for Claude Code

ALLOY is a kitchens & bedrooms company in Amman, Jordan (showroom on Mecca
Street + a fully automated furniture factory). This is the internal web app to
manage the whole business: clients, design, quotations, contracts, invoices,
suppliers, inventory, production workflow, and tasks — with users and
role-based permissions.

The owner (Samer) is hands-on and technical but is NOT a full-time developer.
Explain decisions briefly, keep the code clean and conventional, and prefer
clarity over cleverness. When you finish a change, ALWAYS run `npm run build`
and fix any errors before telling him it's done.

## Stack
- Next.js 15 (App Router) + TypeScript
- Tailwind CSS (config in `tailwind.config.ts`)
- Supabase (Postgres + Auth + RLS) — client wiring in `lib/supabase-*.ts`
- lucide-react icons
- Bilingual: English + Arabic (RTL). NO heavy i18n lib.

## Key conventions (follow these exactly)
- **Money**: all amounts are JOD, stored `numeric(12,3)` (3 decimals = fils).
  Format with `jod()` from `lib/utils.ts`. Never hardcode currency strings.
- **i18n**: every user-facing string goes through `t("key")` from
  `useLang()` (`components/lang-provider.tsx`). Add new keys to BOTH `en` and
  `ar` objects in `lib/i18n.ts`. Never hardcode visible English/Arabic text in
  components.
- **RTL**: layout must work in both directions. Use logical CSS (gap, flex,
  `ms-`/`me-` if needed) — avoid hardcoded left/right.
- **Auth/roles**: roles are `admin, sales_manager, design_manager,
  production_manager, analyzing_manager, factory_worker, installation`.
  "Office" = admin + the 4 managers. RLS is already enforced in the database;
  still respect role visibility in the UI (see `lib/nav.ts`).
- **Data access**: server components use `lib/supabase-server.ts`; client
  components use `lib/supabase-browser.ts`. Prefer Server Components for reads;
  use a small client component for interactive bits (forms, search).
- **Styling**: use the existing classes in `app/globals.css`
  (`.card .btn-primary .btn-ghost .input`) and brand colors from Tailwind
  config (`ink, brass, mist, sage, rust, line, slate`). Keep it consistent
  with the login + dashboard already built.
- **Codes**: projects/quotations/invoices/contracts get auto codes from the DB
  (`ALY-/QUO-/INV-/CON-2026-0001`). Don't generate codes in app code.

## Database
Schema lives in `db/01_schema.sql` (+ `02_rls.sql`, `03_seed.sql`). Read it
before touching data. Main tables: profiles, clients, suppliers, products,
projects, quotations(+items), contracts, invoices(+items, payments), tasks,
stock_movements. Totals/stock/codes are maintained by DB triggers — don't
recompute them in app code.

## Workflow stages (the projects.stage enum, in order)
lead → design → client_review → production_prep → analyzing → panel_saw →
edge_banding → cnc_drilling → assembly → packaging → delivery → installation →
completed (or cancelled).

## Verifying work
- `npm run dev` to run locally (http://localhost:3000).
- `npm run build` MUST pass before any change is considered done.
- `.env.local` holds Supabase keys (gitignored). Never commit secrets.

## Git
Two machines (desktop + laptop) share this repo on GitHub. Make focused
commits with clear messages. Don't commit `.env.local`, `node_modules`, or
`.next`.
