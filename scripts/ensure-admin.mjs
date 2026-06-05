import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readSupabaseEnv } from "./lib/local-supabase.mjs";

const ADMIN_EMAIL = "admin@myheroes.local";
const ADMIN_NAME = "Admin";
const ADMIN_PASSWORD = "ChangeMe";

export async function ensureAdminAccount(supabase) {
  const email = process.env.ADMIN_EMAIL || ADMIN_EMAIL;
  const name = process.env.ADMIN_NAME || ADMIN_NAME;
  const password = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD;

  const existing = await findUserByEmail(supabase, email);
  let userId = existing?.id;
  let mustChangePassword = false;

  if (userId) {
    const existingProfile = await findProfileById(supabase, userId);
    mustChangePassword = Boolean(existingProfile?.must_change_password);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error) throw error;
    userId = data.user.id;
    mustChangePassword = true;
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    email,
    name,
    role: "admin",
    must_change_password: mustChangePassword,
  }, { onConflict: "id" });

  if (profileError) throw profileError;

  console.log(`Admin account ready: ${name} <${email}>`);
  return { userId, email, name };
}

async function findProfileById(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
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
