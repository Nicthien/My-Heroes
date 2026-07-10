import { createAdminClient } from "@/lib/supabase/admin";

const ALLOW_ANONYMOUS_USERS_KEY = "allow_anonymous_users";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function getAllowAnonymousUsers(supabase: AdminClient = createAdminClient()) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", ALLOW_ANONYMOUS_USERS_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingSettingsTableError(error)) return true;
    throw error;
  }

  return data?.value !== false;
}

export async function setAllowAnonymousUsers(enabled: boolean, updatedBy: string, supabase: AdminClient = createAdminClient()) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({
      key: ALLOW_ANONYMOUS_USERS_KEY,
      value: enabled,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

function isMissingSettingsTableError(error: unknown) {
  const maybeError = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(maybeError.code ?? "")} ${String(maybeError.message ?? "")} ${String(maybeError.details ?? "")}`.toLowerCase();
  return text.includes("app_settings") || text.includes("42p01") || text.includes("pgrst205") || text.includes("pgrst204");
}
