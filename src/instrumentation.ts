// Runs once when the Next.js server boots. Used to seed the default admin
// account so a fresh install has admin access out of the box (see
// src/lib/auth/seedAdmin.ts). Fire-and-forget so it never delays startup.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { seedAdminOnBoot } = await import("@/lib/auth/seedAdmin");
  void seedAdminOnBoot();

  const globalState = globalThis as typeof globalThis & { __myHeroesGuestCleanupStarted?: boolean };
  if (globalState.__myHeroesGuestCleanupStarted) return;
  globalState.__myHeroesGuestCleanupStarted = true;

  const runCleanup = async () => {
    try {
      const [{ cleanupEphemeralGames }, { createAdminClient }] = await Promise.all([
        import("@/lib/game/server/guest-games"),
        import("@/lib/supabase/admin"),
      ]);
      await cleanupEphemeralGames(createAdminClient());
    } catch (error) {
      console.warn("guest game cleanup failed", error);
    }
  };

  void runCleanup();
  const interval = setInterval(() => void runCleanup(), 60_000);
  interval.unref();
}
