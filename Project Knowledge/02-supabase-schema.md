# ALLOY App — Supabase Schema

> Draft from memory — review and correct any table names, column names, or relationships that have changed.

## Auth
Uses Supabase Auth built-in. All tables are protected by RLS tied to `auth.uid()`.

---

## Core Tables

### `clients`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| phone | text | |
| email | text | |
| address | text | |
| notes | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `products` (cabinet/appliance catalogue)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| code | text | unique product code |
| name | text | |
| category | text | e.g. Base, Wall, Tall, Appliance |
| description | text | |
| default_width | numeric | mm |
| default_height | numeric | mm |
| default_depth | numeric | mm |
| unit_price | numeric | computed or manual |
| created_at | timestamptz | |

---

### `components` (BOM parts/materials)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| code | text | |
| name | text | |
| type | text | panel / fitting / hardware / material |
| unit | text | m², pcs, m, etc. |
| unit_cost | numeric | |
| supplier | text | |
| notes | text | |

---

### `product_components` (BOM junction)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| product_id | uuid FK → products | |
| component_id | uuid FK → components | |
| quantity | numeric | |
| formula | text | optional formula string for parametric qty |

---

### `quotations`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| client_id | uuid FK → clients | |
| title | text | |
| status | text | draft / sent / approved / rejected |
| notes | text | |
| discount | numeric | % or fixed |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `quotation_items`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| quotation_id | uuid FK → quotations | |
| product_id | uuid FK → products | nullable (custom items) |
| label | text | display name |
| width | numeric | mm — actual dimensions for this instance |
| height | numeric | mm |
| depth | numeric | mm |
| quantity | int | |
| unit_price | numeric | snapshot at time of quote |
| notes | text | |
| sort_order | int | |

---

## RLS Policy Pattern
All tables follow the same pattern:
```sql
-- Enable RLS
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

-- Authenticated users can CRUD their own org's data
CREATE POLICY "auth_users" ON <table>
  FOR ALL USING (auth.role() = 'authenticated');
```
(Single-tenant for now — no multi-org isolation needed yet)

---

## Enums / Types (to verify)
- `quotation_status`: draft, sent, approved, rejected
- `component_type`: panel, fitting, hardware, material, other
- `product_category`: Base, Wall, Tall, Appliance, Worktop, Trim, Other
