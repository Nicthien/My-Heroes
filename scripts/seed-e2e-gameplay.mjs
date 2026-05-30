import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { readSupabaseEnv, run } from "./lib/local-supabase.mjs";

export const GAMEPLAY_E2E_EMAIL = process.env.E2E_GAMEPLAY_EMAIL || "e2e-player-a@myheroes.local";
export const GAMEPLAY_E2E_PASSWORD = process.env.E2E_GAMEPLAY_PASSWORD || "ChangeMe123!";
const GAMEPLAY_E2E_NAME = process.env.E2E_GAMEPLAY_NAME || "E2E Player";

export async function seedGameplayUser({ startSupabase = false } = {}) {
  if (startSupabase) {
    console.log("Starting local Supabase...");
    await run("supabase", ["start"]);
  }

  const localSupabase = readSupabaseEnv();
  if (!localSupabase.anonKey || !localSupabase.serviceRoleKey) {
    throw new Error("Supabase local API keys were not found. Is Supabase running?");
  }

  const supabase = createClient(localSupabase.url, localSupabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const existing = await findUserByEmail(supabase, GAMEPLAY_E2E_EMAIL);
  let userId = existing?.id;

  if (userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      email: GAMEPLAY_E2E_EMAIL,
      password: GAMEPLAY_E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { name: GAMEPLAY_E2E_NAME },
    });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: GAMEPLAY_E2E_EMAIL,
      password: GAMEPLAY_E2E_PASSWORD,
      email_confirm: true,
      user_metadata: { name: GAMEPLAY_E2E_NAME },
    });
    if (error) throw error;
    userId = data.user.id;
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    email: GAMEPLAY_E2E_EMAIL,
    name: GAMEPLAY_E2E_NAME,
    role: "user",
    must_change_password: false,
  }, { onConflict: "id" });
  if (profileError) throw profileError;

  await deletePreviousGameplayGames(supabase, userId);

  console.log(`Gameplay E2E account ready: ${GAMEPLAY_E2E_NAME} <${GAMEPLAY_E2E_EMAIL}>`);
  return {
    ...localSupabase,
    email: GAMEPLAY_E2E_EMAIL,
    password: GAMEPLAY_E2E_PASSWORD,
    userId,
  };
}

async function findUserByEmail(supabase, email) {
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function deletePreviousGameplayGames(supabase, userId) {
  const { error } = await supabase
    .from("games")
    .delete()
    .eq("created_by_user_id", userId)
    .like("name", "Gameplay E2E%");

  if (error && !isMissingCreatedByColumnError(error)) throw error;
}

function isMissingCreatedByColumnError(error) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("created_by_user_id") || text.includes("schema cache");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedGameplayUser({ startSupabase: process.argv.includes("--start-supabase") }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
