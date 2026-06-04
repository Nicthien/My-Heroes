import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseInternalUrl } from "@/lib/config/supabaseEnv";

export async function createClient() {
  const cookieStore = await cookies();
  const url = getSupabaseInternalUrl();
  const key = getSupabaseAnonKey();

  if (!url || !key) {
    throw new Error("Variables Supabase publiques manquantes");
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. Route Handlers can.
        }
      },
    },
  });
}
