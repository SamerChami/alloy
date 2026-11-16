SET local check_function_bodies = off;

CREATE TABLE "public"."banding_types" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"            text                     NOT NULL,
  "price_per_m_jod" numeric(12,3)            NOT NULL DEFAULT 0,
  "is_active"       boolean                  NOT NULL DEFAULT true,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "banding_types_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."banding_types"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."bom_lines" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "product_id"      uuid                     NOT NULL,
  "line_type"       text                     NOT NULL,
  "panel_id"        uuid,
  "part_name"       text,
  "width_mm"        numeric(10,2),
  "height_mm"       numeric(10,2),
  "banding_type_id" uuid,
  "banded_length_m" numeric(10,3)            DEFAULT 0,
  "component_id"    uuid,
  "qty"             numeric(10,2)            NOT NULL DEFAULT 1,
  "sort_order"      integer                  NOT NULL DEFAULT 0,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "part_role"       text,
  "depth_mm"        numeric(10,2),
  "pos_offset_mm"   numeric(10,2),
  "hole_count"      integer                  NOT NULL DEFAULT 0,
  "holes_json"      jsonb,
  "pos_x_mm"        numeric(10,2),
  "pos_y_mm"        numeric(10,2),
  "pos_z_mm"        numeric(10,2),
  "cuts_json"       jsonb,
  "cut_warning"     text,
  CONSTRAINT "bom_lines_line_type_check" CHECK ((line_type = ANY (ARRAY['panel'::text, 'component'::text]))),
  CONSTRAINT "bom_lines_part_role_check"
    CHECK
    ((part_role = ANY (ARRAY['side_left'::text, 'side_right'::text, 'top'::text, 'bottom'::text, 'back'::text, 'shelf'::text, 'divider_v'::text, 'door'::text, 'drawer_front'::text,
    'other'::text]))),
  CONSTRAINT "bom_lines_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."bom_lines"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."clients" (
  "id"        uuid NOT NULL DEFAULT gen_random_uuid(),
  "full_name" text NOT NULL,
  "phone"     text NOT NULL,
  "email"     text,
  "location"  text,
  CONSTRAINT "clients_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."clients"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."code_counters" (
  "prefix" text    NOT NULL,
  "year"   integer NOT NULL,
  "n"      integer NOT NULL DEFAULT 0,
  CONSTRAINT "code_counters_pkey" PRIMARY KEY (prefix)
);

ALTER TABLE "public"."code_counters"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."contracts" (
  "id"           uuid NOT NULL DEFAULT gen_random_uuid(),
  "code"         text,
  "client_id"    uuid NOT NULL,
  "project_id"   uuid,
  "quotation_id" uuid,
  CONSTRAINT "contracts_code_key" UNIQUE (code),
  CONSTRAINT "contracts_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."contracts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."invoice_items" (
  "id"             uuid          NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id"     uuid          NOT NULL,
  "product_id"     uuid,
  "description"    text          NOT NULL,
  "qty"            numeric(12,2) NOT NULL DEFAULT 1,
  "unit_price_jod" numeric(12,3) NOT NULL DEFAULT 0,
  "line_total_jod" numeric(12,3) GENERATED ALWAYS AS ((qty * unit_price_jod)) STORED,
  "sort_order"     integer       NOT NULL DEFAULT 0,
  CONSTRAINT "invoice_items_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."invoice_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."invoices" (
  "id"          uuid NOT NULL DEFAULT gen_random_uuid(),
  "code"        text,
  "client_id"   uuid NOT NULL,
  "project_id"  uuid,
  "contract_id" uuid,
  CONSTRAINT "invoices_code_key" UNIQUE (code),
  CONSTRAINT "invoices_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."invoices"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."payments" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id" uuid                     NOT NULL,
  "amount_jod" numeric(12,3)            NOT NULL,
  "paid_at"    date                     NOT NULL DEFAULT CURRENT_DATE,
  "method"     text,
  "reference"  text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "payments_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."payments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."products" (
  "id"      uuid NOT NULL DEFAULT gen_random_uuid(),
  "sku"     text,
  "name_en" text NOT NULL,
  "name_ar" text,
  CONSTRAINT "products_pkey" PRIMARY KEY (id),
  CONSTRAINT "products_sku_key" UNIQUE (sku)
);

ALTER TABLE "public"."products"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"        uuid NOT NULL,
  "full_name" text NOT NULL,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."projects" (
  "id"        uuid NOT NULL DEFAULT gen_random_uuid(),
  "code"      text,
  "client_id" uuid NOT NULL,
  "title"     text,
  CONSTRAINT "projects_code_key" UNIQUE (code),
  CONSTRAINT "projects_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."projects"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."quotation_items" (
  "id"             uuid          NOT NULL DEFAULT gen_random_uuid(),
  "quotation_id"   uuid          NOT NULL,
  "product_id"     uuid,
  "description"    text          NOT NULL,
  "qty"            numeric(12,2) NOT NULL DEFAULT 1,
  "unit_price_jod" numeric(12,3) NOT NULL DEFAULT 0,
  "line_total_jod" numeric(12,3) GENERATED ALWAYS AS ((qty * unit_price_jod)) STORED,
  "sort_order"     integer       NOT NULL DEFAULT 0,
  CONSTRAINT "quotation_items_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."quotation_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."quotations" (
  "id"         uuid NOT NULL DEFAULT gen_random_uuid(),
  "code"       text,
  "client_id"  uuid NOT NULL,
  "project_id" uuid,
  CONSTRAINT "quotations_code_key" UNIQUE (code),
  CONSTRAINT "quotations_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."quotations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."stock_movements" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "product_id" uuid                     NOT NULL,
  "delta_qty"  numeric(12,2)            NOT NULL,
  "reason"     text,
  "ref"        text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."stock_movements"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."suppliers" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"         text                     NOT NULL,
  "contact_name" text,
  "phone"        text,
  "email"        text,
  "address"      text,
  "notes"        text,
  "is_active"    boolean                  NOT NULL DEFAULT true,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "suppliers_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."suppliers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tasks" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"       text                     NOT NULL,
  "description" text,
  "project_id"  uuid,
  "assigned_to" uuid,
  "due_date"    date,
  "is_done"     boolean                  NOT NULL DEFAULT false,
  "created_by"  uuid,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tasks_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."tasks"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."contract_status" AS ENUM (
  'draft',
  'sent',
  'signed',
  'cancelled'
);

ALTER TABLE "public"."contracts"
  ADD COLUMN "status" public.contract_status NOT NULL DEFAULT 'draft'::public.contract_status;

ALTER TABLE "public"."contracts"
  ADD COLUMN "contract_value_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."contracts"
  ADD COLUMN "signed_date" date;

ALTER TABLE "public"."contracts"
  ADD COLUMN "drive_url" text;

ALTER TABLE "public"."contracts"
  ADD COLUMN "terms" text;

ALTER TABLE "public"."contracts"
  ADD COLUMN "created_by" uuid;

ALTER TABLE "public"."contracts"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."contracts"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE TYPE "public"."invoice_status" AS ENUM (
  'draft',
  'issued',
  'partial',
  'paid',
  'overdue',
  'void'
);

ALTER TABLE "public"."invoices"
  ADD COLUMN "status" public.invoice_status NOT NULL DEFAULT 'draft'::public.invoice_status;

ALTER TABLE "public"."invoices"
  ADD COLUMN "issue_date" date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE "public"."invoices"
  ADD COLUMN "due_date" date;

ALTER TABLE "public"."invoices"
  ADD COLUMN "discount_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."invoices"
  ADD COLUMN "tax_pct" numeric(5,2) NOT NULL DEFAULT 16;

ALTER TABLE "public"."invoices"
  ADD COLUMN "subtotal_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."invoices"
  ADD COLUMN "tax_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."invoices"
  ADD COLUMN "total_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."invoices"
  ADD COLUMN "paid_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."invoices"
  ADD COLUMN "notes" text;

ALTER TABLE "public"."invoices"
  ADD COLUMN "created_by" uuid;

ALTER TABLE "public"."invoices"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."invoices"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE TYPE "public"."item_kind" AS ENUM (
  'product',
  'component'
);

CREATE TYPE "public"."product_category" AS ENUM (
  'cabinet',
  'panel',
  'material',
  'accessory',
  'fitting',
  'appliance',
  'other'
);

ALTER TABLE "public"."products"
  ADD COLUMN "category" public.product_category NOT NULL DEFAULT 'cabinet'::public.product_category;

ALTER TABLE "public"."products"
  ADD COLUMN "unit" text NOT NULL DEFAULT 'pcs'::text;

ALTER TABLE "public"."products"
  ADD COLUMN "unit_price_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."products"
  ADD COLUMN "cost_jod" numeric(12,3) DEFAULT 0;

ALTER TABLE "public"."products"
  ADD COLUMN "supplier_id" uuid;

ALTER TABLE "public"."products"
  ADD COLUMN "track_stock" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."products"
  ADD COLUMN "stock_qty" numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "public"."products"
  ADD COLUMN "reorder_level" numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "public"."products"
  ADD COLUMN "width_mm" numeric(10,2);

ALTER TABLE "public"."products"
  ADD COLUMN "height_mm" numeric(10,2);

ALTER TABLE "public"."products"
  ADD COLUMN "depth_mm" numeric(10,2);

ALTER TABLE "public"."products"
  ADD COLUMN "description" text;

ALTER TABLE "public"."products"
  ADD COLUMN "drive_url" text;

ALTER TABLE "public"."products"
  ADD COLUMN "is_active" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."products"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."products"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."products"
  ADD COLUMN "item_kind" public.item_kind NOT NULL DEFAULT 'component'::public.item_kind;

ALTER TABLE "public"."products"
  ADD COLUMN "subcategory" text;

ALTER TABLE "public"."products"
  ADD COLUMN "sheet_length_mm" numeric(10,2);

ALTER TABLE "public"."products"
  ADD COLUMN "sheet_width_mm" numeric(10,2);

ALTER TABLE "public"."products"
  ADD COLUMN "sheet_price_jod" numeric(12,3);

ALTER TABLE "public"."products"
  ADD COLUMN "labor_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."products"
  ADD COLUMN "margin_pct" numeric(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "public"."products"
  ADD COLUMN "price_overridden" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."products"
  ADD COLUMN "is_template" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."products"
  ADD COLUMN "materials_cost_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."products"
  ADD COLUMN "components_cost_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."products"
  ADD COLUMN "base_cost_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."products"
  ADD COLUMN "source" text;

ALTER TABLE "public"."products"
  ADD COLUMN "source_filename" text;

ALTER TABLE "public"."products"
  ADD COLUMN "export_version" text;

CREATE TYPE "public"."project_stage" AS ENUM (
  'lead',
  'design',
  'client_review',
  'production_prep',
  'analyzing',
  'panel_saw',
  'edge_banding',
  'cnc_drilling',
  'assembly',
  'packaging',
  'delivery',
  'installation',
  'completed',
  'cancelled'
);

CREATE TYPE "public"."project_type" AS ENUM (
  'kitchen',
  'bedroom',
  'closet',
  'other'
);

ALTER TABLE "public"."clients"
  ADD COLUMN "project_type" public.project_type NOT NULL DEFAULT 'kitchen'::public.project_type;

ALTER TABLE "public"."projects"
  ADD COLUMN "project_type" public.project_type NOT NULL DEFAULT 'kitchen'::public.project_type;

ALTER TABLE "public"."projects"
  ADD COLUMN "stage" public.project_stage NOT NULL DEFAULT 'lead'::public.project_stage;

ALTER TABLE "public"."projects"
  ADD COLUMN "design_manager_id" uuid;

ALTER TABLE "public"."projects"
  ADD COLUMN "production_manager_id" uuid;

ALTER TABLE "public"."projects"
  ADD COLUMN "analyzing_manager_id" uuid;

ALTER TABLE "public"."projects"
  ADD COLUMN "installation_team" text;

ALTER TABLE "public"."projects"
  ADD COLUMN "sketchup_file_url" text;

ALTER TABLE "public"."projects"
  ADD COLUMN "notes" text;

ALTER TABLE "public"."projects"
  ADD COLUMN "created_by" uuid;

ALTER TABLE "public"."projects"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."projects"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE TYPE "public"."quote_status" AS ENUM (
  'draft',
  'sent',
  'approved',
  'rejected',
  'expired'
);

ALTER TABLE "public"."quotations"
  ADD COLUMN "status" public.quote_status NOT NULL DEFAULT 'draft'::public.quote_status;

ALTER TABLE "public"."quotations"
  ADD COLUMN "issue_date" date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE "public"."quotations"
  ADD COLUMN "valid_until" date;

ALTER TABLE "public"."quotations"
  ADD COLUMN "discount_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."quotations"
  ADD COLUMN "tax_pct" numeric(5,2) NOT NULL DEFAULT 16;

ALTER TABLE "public"."quotations"
  ADD COLUMN "notes" text;

ALTER TABLE "public"."quotations"
  ADD COLUMN "subtotal_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."quotations"
  ADD COLUMN "tax_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."quotations"
  ADD COLUMN "total_jod" numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "public"."quotations"
  ADD COLUMN "created_by" uuid;

ALTER TABLE "public"."quotations"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."quotations"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE TYPE "public"."referral_source" AS ENUM (
  'friend',
  'social_media',
  'instagram',
  'facebook',
  'returning_client',
  'walk_in',
  'referral_partner',
  'website',
  'other'
);

ALTER TABLE "public"."clients"
  ADD COLUMN "referred_by" public.referral_source NOT NULL DEFAULT 'walk_in'::public.referral_source;

ALTER TABLE "public"."clients"
  ADD COLUMN "referred_note" text;

ALTER TABLE "public"."clients"
  ADD COLUMN "budget_jod" numeric(12,3);

ALTER TABLE "public"."clients"
  ADD COLUMN "prerequisites" text;

ALTER TABLE "public"."clients"
  ADD COLUMN "notes" text;

ALTER TABLE "public"."clients"
  ADD COLUMN "drive_folder_url" text;

ALTER TABLE "public"."clients"
  ADD COLUMN "created_by" uuid;

ALTER TABLE "public"."clients"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."clients"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE TYPE "public"."user_role" AS ENUM (
  'admin',
  'sales_manager',
  'design_manager',
  'production_manager',
  'analyzing_manager',
  'factory_worker',
  'installation'
);

ALTER TABLE "public"."profiles"
  ADD COLUMN "role" public.user_role NOT NULL DEFAULT 'sales_manager'::public.user_role;

ALTER TABLE "public"."profiles"
  ADD COLUMN "phone" text;

ALTER TABLE "public"."profiles"
  ADD COLUMN "is_active" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."profiles"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."profiles"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  update products set stock_qty = stock_qty + new.delta_qty where id = new.product_id;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.assign_code()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  if new.code is null then
    new.code := next_code(tg_argv[0]);
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.current_role_of (
  uid uuid
)
  RETURNS public.user_role
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select role from profiles where id = uid;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.is_office()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select coalesce((select role in
    ('admin','sales_manager','design_manager','production_manager','analyzing_manager')
    from profiles where id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.next_code (
  p_prefix text
)
  RETURNS text
  LANGUAGE plpgsql
  AS $function$
declare y int := extract(year from now())::int; cur int;
begin
  insert into code_counters(prefix, year, n) values (p_prefix, y, 1)
  on conflict (prefix) do update
    set n = case when code_counters.year = y then code_counters.n + 1 else 1 end,
        year = y
  returning n into cur;
  return p_prefix || '-' || y || '-' || lpad(cur::text, 4, '0');
end $function$;

CREATE OR REPLACE FUNCTION public.recompute_invoice_paid()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare
  iid uuid := coalesce(new.invoice_id, old.invoice_id);
  p numeric(12,3); tot numeric(12,3); due date;
begin
  select coalesce(sum(amount_jod),0) into p from payments where invoice_id = iid;
  select total_jod, due_date into tot, due from invoices where id = iid;
  update invoices
     set paid_jod = p,
         status = case
           when p >= tot and tot > 0 then 'paid'::invoice_status
           when p > 0 then 'partial'::invoice_status
           when due is not null and due < current_date then 'overdue'::invoice_status
           else status
         end
   where id = iid;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.recompute_invoice_totals()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare
  iid uuid := coalesce(new.invoice_id, old.invoice_id);
  sub numeric(12,3); disc numeric(12,3); tpct numeric(5,2);
begin
  select coalesce(sum(line_total_jod),0) into sub from invoice_items where invoice_id = iid;
  select discount_jod, tax_pct into disc, tpct from invoices where id = iid;
  update invoices
     set subtotal_jod = sub,
         tax_jod = round((sub - coalesce(disc,0)) * coalesce(tpct,0) / 100, 3),
         total_jod = round((sub - coalesce(disc,0)) * (1 + coalesce(tpct,0)/100), 3)
   where id = iid;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.recompute_quotation_totals()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare
  qid uuid := coalesce(new.quotation_id, old.quotation_id);
  sub numeric(12,3);
  disc numeric(12,3);
  tpct numeric(5,2);
begin
  select coalesce(sum(line_total_jod),0) into sub from quotation_items where quotation_id = qid;
  select discount_jod, tax_pct into disc, tpct from quotations where id = qid;
  update quotations
     set subtotal_jod = sub,
         tax_jod = round((sub - coalesce(disc,0)) * coalesce(tpct,0) / 100, 3),
         total_jod = round((sub - coalesce(disc,0)) * (1 + coalesce(tpct,0)/100), 3)
   where id = qid;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at = now();
  return new;
end $function$;

ALTER TABLE "public"."bom_lines"
  ADD CONSTRAINT "bom_lines_banding_type_id_fkey" FOREIGN KEY (banding_type_id) REFERENCES public.banding_types(id);

ALTER TABLE "public"."contracts"
  ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;

ALTER TABLE "public"."invoice_items"
  ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

ALTER TABLE "public"."bom_lines"
  ADD CONSTRAINT "bom_lines_component_id_fkey" FOREIGN KEY (component_id) REFERENCES public.products(id);

ALTER TABLE "public"."bom_lines"
  ADD CONSTRAINT "bom_lines_panel_id_fkey" FOREIGN KEY (panel_id) REFERENCES public.products(id);

ALTER TABLE "public"."bom_lines"
  ADD CONSTRAINT "bom_lines_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE "public"."invoice_items"
  ADD CONSTRAINT "invoice_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."clients"
  ADD CONSTRAINT "clients_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."contracts"
  ADD CONSTRAINT "contracts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."projects"
  ADD CONSTRAINT "projects_analyzing_manager_id_fkey" FOREIGN KEY (analyzing_manager_id) REFERENCES public.profiles(id);

ALTER TABLE "public"."projects"
  ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;

ALTER TABLE "public"."projects"
  ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."projects"
  ADD CONSTRAINT "projects_design_manager_id_fkey" FOREIGN KEY (design_manager_id) REFERENCES public.profiles(id);

ALTER TABLE "public"."contracts"
  ADD CONSTRAINT "contracts_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE "public"."projects"
  ADD CONSTRAINT "projects_production_manager_id_fkey" FOREIGN KEY (production_manager_id) REFERENCES public.profiles(id);

ALTER TABLE "public"."quotation_items"
  ADD CONSTRAINT "quotation_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE "public"."quotations"
  ADD CONSTRAINT "quotations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;

ALTER TABLE "public"."quotations"
  ADD CONSTRAINT "quotations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."contracts"
  ADD CONSTRAINT "contracts_quotation_id_fkey" FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE SET NULL;

ALTER TABLE "public"."quotation_items"
  ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;

ALTER TABLE "public"."quotations"
  ADD CONSTRAINT "quotations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE "public"."stock_movements"
  ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."stock_movements"
  ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE "public"."products"
  ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);

ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

CREATE VIEW "public"."low_stock_products" AS  SELECT id,
    sku,
    name_en,
    stock_qty,
    reorder_level
   FROM public.products
  WHERE (track_stock AND (stock_qty <= reorder_level) AND is_active);

CREATE UNIQUE INDEX idx_banding_types_name ON public.banding_types USING btree (name);

CREATE INDEX idx_bom_lines_product ON public.bom_lines USING btree (product_id);

CREATE INDEX idx_clients_name ON public.clients USING btree (full_name);

CREATE INDEX idx_clients_phone ON public.clients USING btree (phone);

CREATE INDEX idx_invoice_items_i ON public.invoice_items USING btree (invoice_id);

CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id);

CREATE INDEX idx_payments_invoice ON public.payments USING btree (invoice_id);

CREATE INDEX idx_products_category ON public.products USING btree (category);

CREATE INDEX idx_products_sku ON public.products USING btree (sku);

CREATE INDEX idx_projects_client ON public.projects USING btree (client_id);

CREATE INDEX idx_projects_stage ON public.projects USING btree (stage);

CREATE INDEX idx_quotations_client ON public.quotations USING btree (client_id);

CREATE INDEX idx_quote_items_q ON public.quotation_items USING btree (quotation_id);

CREATE INDEX idx_stock_mov_product ON public.stock_movements USING btree (product_id);

CREATE INDEX idx_tasks_assignee ON public.tasks USING btree (assigned_to);

CREATE TRIGGER trg_clients_updated
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_contract_code
  BEFORE INSERT ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_code('CON');

CREATE TRIGGER trg_contracts_updated
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_invoice_items_totals
  AFTER INSERT OR DELETE OR UPDATE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_invoice_totals();

CREATE TRIGGER trg_invoice_code
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_code('INV');

CREATE TRIGGER trg_invoices_updated
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_payments_recompute
  AFTER INSERT OR DELETE OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_invoice_paid();

CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_project_code
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_code('ALY');

CREATE TRIGGER trg_projects_updated
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_quote_items_totals
  AFTER INSERT OR DELETE OR UPDATE ON public.quotation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_quotation_totals();

CREATE TRIGGER trg_quotations_updated
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_quote_code
  BEFORE INSERT ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_code('QUO');

CREATE TRIGGER trg_stock_movement
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_stock_movement();

CREATE TRIGGER trg_suppliers_updated
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_tasks_updated
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "all authenticated read banding_types" ON "public"."banding_types"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "office write banding_types" ON "public"."banding_types"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "factory_worker read bom_lines" ON "public"."bom_lines"
  FOR SELECT
  TO PUBLIC
  USING ((public.current_role_of(auth.uid()) = 'factory_worker'::public.user_role));

CREATE POLICY "office full access bom_lines" ON "public"."bom_lines"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "clients_office" ON "public"."clients"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "contracts_office" ON "public"."contracts"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "invoice_items_office" ON "public"."invoice_items"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "invoices_office" ON "public"."invoices"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "payments_office" ON "public"."payments"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "products_office_write" ON "public"."products"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "products_read" ON "public"."products"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "profiles_admin" ON "public"."profiles"
  FOR ALL
  TO PUBLIC
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "profiles_read" ON "public"."profiles"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "profiles_self" ON "public"."profiles"
  FOR UPDATE
  TO PUBLIC
  USING ((id = auth.uid()));

CREATE POLICY "projects_office_write" ON "public"."projects"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "projects_read" ON "public"."projects"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "quote_items_office" ON "public"."quotation_items"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "quotations_office" ON "public"."quotations"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "stock_read" ON "public"."stock_movements"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "stock_write" ON "public"."stock_movements"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((public.is_office() OR (public.current_role_of(auth.uid()) = 'factory_worker'::public.user_role)));

CREATE POLICY "suppliers_office" ON "public"."suppliers"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "tasks_office" ON "public"."tasks"
  FOR ALL
  TO PUBLIC
  USING (public.is_office())
  WITH CHECK (public.is_office());

CREATE POLICY "tasks_read_own" ON "public"."tasks"
  FOR SELECT
  TO PUBLIC
  USING ((assigned_to = auth.uid()));

CREATE POLICY "tasks_update_own" ON "public"."tasks"
  FOR UPDATE
  TO PUBLIC
  USING ((assigned_to = auth.uid()))
  WITH CHECK ((assigned_to = auth.uid()));

GRANT EXECUTE ON FUNCTION "public"."apply_stock_movement"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."apply_stock_movement"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_stock_movement"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_stock_movement"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."assign_code"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."assign_code"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_code"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_code"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."current_role_of"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."current_role_of"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_role_of"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_role_of"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_office"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_office"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_office"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_office"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."next_code"(text) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."next_code"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."next_code"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."next_code"(text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."recompute_invoice_paid"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."recompute_invoice_paid"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."recompute_invoice_paid"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."recompute_invoice_paid"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."recompute_invoice_totals"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."recompute_invoice_totals"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."recompute_invoice_totals"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."recompute_invoice_totals"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."recompute_quotation_totals"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."recompute_quotation_totals"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."recompute_quotation_totals"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."recompute_quotation_totals"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."banding_types" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."banding_types" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."banding_types" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."banding_types" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bom_lines" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."bom_lines" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bom_lines" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bom_lines" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clients" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."clients" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clients" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clients" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."code_counters" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."code_counters" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."code_counters" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."code_counters" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."contracts" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."contracts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."contracts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."contracts" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoice_items" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."invoice_items" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoice_items" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoice_items" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoices" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."invoices" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoices" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoices" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."payments" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."products" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."projects" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."projects" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."projects" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."projects" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quotation_items" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."quotation_items" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quotation_items" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quotation_items" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quotations" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."quotations" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quotations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quotations" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."stock_movements" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."stock_movements" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."stock_movements" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."stock_movements" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."suppliers" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."suppliers" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."suppliers" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."suppliers" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tasks" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."tasks" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tasks" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tasks" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."low_stock_products" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."low_stock_products" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."low_stock_products" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."low_stock_products" TO "service_role";

