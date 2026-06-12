# ALLOY — Stage 1 Setup: Database Foundation

This stage gives you a complete, production-ready database. ~10 minutes.
You'll create a free Supabase project, run three SQL files, and create your
first admin user.

---

## 1. Create the Supabase project (free)

1. Go to https://supabase.com → sign up (use your Google Workspace account).
2. **New project** → name it `alloy`, pick region **Frankfurt (eu-central-1)**
   (closest to Jordan, lowest latency).
3. Set a strong **database password** — save it in your password manager.
4. Wait ~2 minutes for it to provision.

Keep these handy from **Project Settings → API**:
- **Project URL** (e.g. `https://xxxx.supabase.co`)
- **anon public key**
- **service_role key** (secret — never put in frontend code)

---

## 2. Run the schema

In the Supabase dashboard, open **SQL Editor → New query**, then run each file
**in order**, one at a time (paste contents, press **Run**):

1. `db/01_schema.sql`   — tables, types, triggers
2. `db/02_rls.sql`      — security policies (the roles/permissions)
3. `db/03_seed.sql`     — code generators + sample products

Each should finish with "Success. No rows returned." If one errors, stop and
send me the error — don't run the next file.

---

## 3. Create your first user (admin = you)

1. **Authentication → Users → Add user → Create new user.**
   - Email: your email
   - Password: choose one
   - ✅ Auto Confirm User
2. Copy the new user's **UID**.
3. Back in **SQL Editor**, run (replace the UID and your name):

```sql
insert into profiles (id, full_name, role)
values ('PASTE-UID-HERE', 'Samer Chami', 'admin');
```

Now you exist as an admin. We'll add the rest of the team from inside the app later.

---

## 4. Quick sanity check

Run this — you should see the 5 sample products:

```sql
select sku, name_en, category, unit_price_jod, stock_qty from products;
```

And confirm security is on (every row should say `rowsecurity = true`):

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;
```

---

## What you now have

- **Clients** with referral source, budget, prerequisites, Drive folder link
- **Products** (cabinets/panels/materials/accessories) priced per unit, with
  live stock tracking + reorder levels and low-stock view
- **Suppliers**
- **Projects** mapped to your 11-stage workflow (lead → installation)
- **Quotations** + line items with auto-calculated subtotal/tax(16%)/total
- **Contracts**
- **Invoices** + items + **payments**, auto status (draft→partial→paid→overdue)
- **Tasks** assignable across the team
- **Stock movements** audit trail that auto-updates product stock
- Auto codes: `ALY-2026-0001`, `QUO-2026-0001`, `INV-…`, `CON-…`
- **Row-level security** enforcing your three tiers:
  - **Office** (admin + 4 managers): full access
  - **Factory worker**: reads projects/products, records stock
  - **Installation**: sees and updates only their own tasks

When this is done and the sanity checks pass, tell me and we move to **Stage 2:
the Next.js app skeleton** (login, role-based menu, Arabic/English shell).
```
