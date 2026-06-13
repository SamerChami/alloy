import { createClient } from "@/lib/supabase-server";
import { ClientsShell } from "./ClientsShell";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select(
      "id, full_name, phone, email, location, project_type, referred_by, referred_note, budget_jod, prerequisites, notes, drive_folder_url, created_at"
    )
    .order("created_at", { ascending: false });

  return <ClientsShell initialClients={clients ?? []} />;
}
