# ALLOY — Stage 2 Setup: The App Skeleton

You now have a working Next.js app: login, role-based menu, bilingual
Arabic-RTL / English shell, and a live dashboard. This guide gets it running on
your computer, then on your laptop too, sharing the same Supabase database.

---

## Prerequisites (each machine, once)

1. **Node.js 20+** — https://nodejs.org (LTS). Verify: `node --version`
2. **Git** — https://git-scm.com . Verify: `git --version`
3. A code editor — **VS Code** recommended.

---

## A. First machine (your desktop)

### 1. Put the project on your machine
Unzip the `alloy` folder I gave you somewhere like `Documents/alloy`.

### 2. Add your Supabase keys
In the `alloy` folder, copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

Both come from Supabase → **Project Settings → API**. The anon key is safe to
use here (row-level security protects your data).

### 3. Install and run
Open a terminal in the `alloy` folder:

```bash
npm install
npm run dev
```

Open **http://localhost:3000** → you'll be sent to the login page. Sign in with
the admin email/password you created in Stage 1. You should land on the
dashboard with live counts (it reads your 5 sample products → low-stock shows 0,
the rest 0 until we add data).

Toggle **العربية / English** — the whole layout flips to RTL. 

---

## B. Sharing across desktop + laptop (Git)

Your **database is already shared** (it's in the cloud). You only need to sync
the **code**. The clean way is a private GitHub repo.

### One-time, on the desktop:
1. Create a free GitHub account if you don't have one.
2. Create a **private** repo named `alloy` (no README).
3. In the `alloy` folder terminal:

```bash
git init
git add .
git commit -m "ALLOY stage 2: app skeleton"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/alloy.git
git push -u origin main
```

> `.env.local` is in `.gitignore`, so your keys are **never** pushed to GitHub.

### One-time, on the laptop:
```bash
git clone https://github.com/YOUR-USERNAME/alloy.git
cd alloy
npm install
```
Then create `.env.local` on the laptop too (same two keys — copy them manually;
they're intentionally not in Git).

```bash
npm run dev
```

### Daily workflow (the rhythm):
- **Before you start working** on a machine: `git pull`
- **After you finish**: `git add . && git commit -m "what I changed" && git push`

Pull on the other machine and you're in sync. Same login, same data, both
machines.

---

## What's working now

- Secure login / logout (Supabase Auth)
- Route protection — signed-out users can only see `/login`
- Role-based sidebar: each role sees only their allowed sections
  - Office managers: everything
  - Factory worker: Dashboard, Products, Inventory, Tasks
  - Installation: Dashboard, Products, Tasks
- Bilingual EN / AR with full RTL flip, choice remembered
- Live dashboard counts (active projects, open quotations, unpaid invoices,
  low-stock items)
- Brand identity: graphite + brass, Inter (Latin) + Cairo (Arabic)

Every module page (Clients, Products, etc.) exists and is reachable — they show
a "coming in the next stage" placeholder. We fill them in next.

---

## Adding the rest of your team (when ready)

For each teammate, in Supabase:
1. **Authentication → Users → Add user** (email + password, Auto Confirm).
2. Copy their UID, then in **SQL Editor**:

```sql
insert into profiles (id, full_name, role)
values ('THEIR-UID', 'Their Name', 'sales_manager');
-- roles: sales_manager | design_manager | production_manager |
--        analyzing_manager | factory_worker | installation | admin
```

We'll build a proper "Team" admin screen later so you won't need SQL for this.

---

When this runs on both machines and you can log in, tell me — then we start
**Stage 3: the Clients module** (the real entry point of your workflow:
add/edit clients, referral source, budget, prerequisites, Drive folder link,
and search).
