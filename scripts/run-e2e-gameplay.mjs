import { seedGameplayUser } from "./seed-e2e-gameplay.mjs";
import { run } from "./lib/local-supabase.mjs";

async function main() {
  const supabase = await seedGameplayUser({ startSupabase: true });
  const port = process.env.PLAYWRIGHT_PORT || "3000";

  console.log(`Running gameplay E2E against Supabase at ${supabase.url}...`);

  await run("playwright", ["test", "tests/e2e/gameplay.spec.ts", ...process.argv.slice(2)], {
    env: {
      ...process.env,
      PLAYWRIGHT_PORT: port,
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || `http://127.0.0.1:${port}`,
      E2E_GAMEPLAY_EMAIL: supabase.email,
      E2E_GAMEPLAY_PASSWORD: supabase.password,
    },
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
