import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeDisplayName(value: unknown) {
  return String(value ?? "").trim();
}

export async function displayNameIsTaken(
  supabase: SupabaseClient,
  name: string,
  excludeUserId?: string,
) {
  let query = supabase.from("profiles").select("id").ilike("name", name);
  if (excludeUserId) query = query.neq("id", excludeUserId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
