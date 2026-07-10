// Centralized Supabase configuration, resolved at RUNTIME from the container
// environment.
//
// Why not `NEXT_PUBLIC_*`: Next.js inlines NEXT_PUBLIC_* values at BUILD time
// (in both client and server bundles), which would bake one deployment's URL and
// keys into the image. The plain names below are never inlined, so a single
// GENERIC image serves every deployment — each install supplies its own values
// as container env vars and nobody sees anyone else's IP/keys.
//
// The NEXT_PUBLIC_* fallbacks keep local `next dev` working with the existing
// `.env` (where those names are conventional and present at dev time).

export type PublicRuntimeConfig = {
  /** Browser-facing Supabase URL. A private/LAN value flips the client onto the /api/supabase proxy. */
  supabaseUrl: string;
  /** Supabase anon / publishable key (public by design — shipped to every browser). */
  supabaseAnonKey: string;
  /** Cloudflare Turnstile site key. Public; empty disables CAPTCHA for local/test installs. */
  turnstileSiteKey: string;
};

/** Global on `window` carrying the runtime public config injected by the server. */
export const RUNTIME_CONFIG_GLOBAL = "__MYHEROES_CONFIG__" as const;

declare global {
  interface Window {
    __MYHEROES_CONFIG__?: PublicRuntimeConfig;
  }
}

/** Browser-facing Supabase URL (runtime). */
export function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

/** Supabase anon / publishable key (runtime). */
export function getSupabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
}

/** Where server-side code reaches Supabase. Defaults to the browser-facing URL. */
export function getSupabaseInternalUrl(): string {
  return process.env.SUPABASE_INTERNAL_URL || getSupabaseUrl();
}

/** Server-only service role key (never exposed to the client). */
export function getSupabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function getTurnstileSiteKey(): string {
  return process.env.TURNSTILE_SITE_KEY || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
}

export function getBrowserTurnstileSiteKey(): string {
  if (typeof window !== "undefined") return window[RUNTIME_CONFIG_GLOBAL]?.turnstileSiteKey ?? "";
  return "";
}

/** The public subset that is safe to inject into the page for the browser. */
export function getServerPublicConfig(): PublicRuntimeConfig {
  return {
    supabaseUrl: getSupabaseUrl(),
    supabaseAnonKey: getSupabaseAnonKey(),
    turnstileSiteKey: getTurnstileSiteKey(),
  };
}
