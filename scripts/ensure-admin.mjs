import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readSupabaseEnv } from "./lib/local-supabase.mjs";

const ADMIN_EMAIL = "admin@myheroes.local";
const ADMIN_NAME = "Admin";
const ADMIN_PASSWORD = "ChangeMe";

export async function ensureAdminAccount(supabase) {
  const existing = await findUserByEmail(supabase, ADMIN_EMAIL);
  let userId = existing?.id;

  if (userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME },
    });
    if (error) throw error;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME },
    });
    if (error) throw error;
    userId = data.user.id;
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    email: ADMIN_EMAIL,
    name: ADMIN_NAME,
    role: "admin",
    must_change_password: true,
  }, { onConflict: "id" });

  if (profileError) throw profileError;

  console.log(`Admin account ready: ${ADMIN_NAME} <${ADMIN_EMAIL}>`);
  return { userId, email: ADMIN_EMAIL, name: ADMIN_NAME };
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

async function main() {
  loadDotEnv();
  const localSupabase = readLocalSupabaseEnv();
  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || localSupabase?.url;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || localSupabase?.serviceRoleKey;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_INTERNAL_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await ensureAdminAccount(supabase);
}

function readLocalSupabaseEnv() {
  try {
    return readSupabaseEnv();
  } catch {
    return null;
  }
}

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([^=]+)=(.*)$/.exec(trimmed);
    if (!match) continue;

    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
