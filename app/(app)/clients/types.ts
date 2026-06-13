export type Client = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  location: string | null;
  project_type: string;
  referred_by: string;
  referred_note: string | null;
  budget_jod: number | null;
  prerequisites: string | null;
  notes: string | null;
  drive_folder_url: string | null;
  created_at: string;
};
