import { createClient } from "@supabase/supabase-js";
import { getSupabaseInternalUrl, getSupabaseServiceRoleKey } from "@/lib/config/supabaseEnv";

export function createAdminClient() {
  const url = getSupabaseInternalUrl();
  const key = getSupabaseServiceRoleKey();

  if (!url || !key) {
    throw new Error("Variables Supabase serveur manquantes");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
