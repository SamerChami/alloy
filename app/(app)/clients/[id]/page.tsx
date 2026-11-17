import { createClient } from "@/lib/supabase-server";
import { ClientDetail, type ClientQuotation } from "./ClientDetail";
import { ClientNotFound } from "./ClientNotFound";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select(
      "id, full_name, phone, email, location, project_type, referred_by, referred_note, budget_jod, prerequisites, notes, drive_folder_url, created_at"
    )
    .eq("id", id)
    .single();

  if (!client) return <ClientNotFound />;

  const { data: quotations } = await supabase
    .from("quotations")
    .select("id, code, title, status, issue_date, total_jod")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  return <ClientDetail client={client} quotations={(quotations ?? []) as ClientQuotation[]} />;
}
