import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseInternalUrl } from "@/lib/config/supabaseEnv";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = getSupabaseInternalUrl();
  const key = getSupabaseAnonKey();

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch (error) {
    console.warn("Supabase auth refresh failed; continuing without refreshing the session.", error);
  }

  return response;
}
