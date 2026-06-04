// Runs once when the Next.js server boots. Used to seed the default admin
// account so a fresh install has admin access out of the box (see
// src/lib/auth/seedAdmin.ts). Fire-and-forget so it never delays startup.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { seedAdminOnBoot } = await import("@/lib/auth/seedAdmin");
  void seedAdminOnBoot();
}
