import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { SingleImportShell } from "./SingleImportShell";

const OFFICE_ROLES = [
  "admin",
  "sales_manager",
  "design_manager",
  "production_manager",
  "analyzing_manager",
];

export default async function ImportSketchupSinglePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();

  if (!OFFICE_ROLES.includes(profile?.role ?? "")) {
    redirect("/products");
  }

  return <SingleImportShell />;
}
