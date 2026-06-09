import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_ADMIN = {
  email: "admin@myheroes.local",
  name: "Admin",
  password: "ChangeMe",
};

type AdminClient = ReturnType<typeof createAdminClient>;

async function findUserByEmail(supabase: AdminClient, email: string) {
  const perPage = 100;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
}

/**
 * Creates the default admin account the first time the app runs against a fresh
 * database, so every install has admin access out of the box.
 *
 * This is a SERVER-MANAGEMENT account only — it administers/observes games but
 * cannot play (the games create/join routes reject admins as players).
 *
 * Idempotent and NON-destructive: if the admin already exists it does nothing
 * (a changed password therefore persists across restarts). Skipped when there is
 * no service role key or when ADMIN_SEED_DISABLED is set. Credentials are
 * overridable via ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME; the profile is
 * flagged must_change_password so the default password must be changed on first
 * login.
 */
export async function seedAdminIfMissing(): Promise<"created" | "exists" | "skipped"> {
  if (process.env.ADMIN_SEED_DISABLED === "1" || process.env.ADMIN_SEED_DISABLED === "true") {
    return "skipped";
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return "skipped";

  const email = process.env.ADMIN_EMAIL || DEFAULT_ADMIN.email;
  const name = process.env.ADMIN_NAME || DEFAULT_ADMIN.name;
  const password = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN.password;

  const supabase = createAdminClient();

  if (await findUserByEmail(supabase, email)) return "exists";

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) throw error;

  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: data.user.id, email, name, role: "admin", must_change_password: true, email_confirmed: true },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  return "created";
}

/**
 * Best-effort seed for server boot: retries a few times (Supabase may still be
 * starting) and NEVER throws — it must not crash the server.
 */
export async function seedAdminOnBoot(): Promise<void> {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await seedAdminIfMissing();
      if (result === "created") {
        console.log("[seed-admin] default admin account created (change the password on first login).");
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === attempts) {
        console.warn(`[seed-admin] could not seed the admin account after ${attempts} attempts: ${message}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}
