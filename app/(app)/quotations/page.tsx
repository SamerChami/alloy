import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { QuotationsShell, type QuotationListRow, type ClientOption } from "./QuotationsShell";

const OFFICE_ROLES = ["admin", "sales_manager", "design_manager", "production_manager", "analyzing_manager"];

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();
  if (!OFFICE_ROLES.includes(profile?.role ?? "")) redirect("/dashboard");

  const [{ data: quotations }, { data: clients }] = await Promise.all([
    supabase
      .from("quotations")
      .select("id, code, title, status, issue_date, valid_until, total_jod, revision, client:clients(id, full_name)")
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, full_name, phone").order("full_name"),
  ]);

  return (
    <QuotationsShell
      quotations={(quotations ?? []) as unknown as QuotationListRow[]}
      clients={(clients ?? []) as ClientOption[]}
      presetClientId={client ?? null}
    />
  );
}
