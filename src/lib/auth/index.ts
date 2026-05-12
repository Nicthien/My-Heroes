import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getCurrentUser(request?: Request) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (!error && data.user) {
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      name: (data.user.user_metadata?.name as string | undefined) ?? data.user.email ?? null,
    };
  }

  if (!request) return null;

  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring("Bearer ".length);
  const adminSupabase = createAdminClient();
  const { data: tokenData, error: tokenError } = await adminSupabase.auth.getUser(token);

  if (tokenError || !tokenData.user) return null;

  return {
    id: tokenData.user.id,
    email: tokenData.user.email ?? null,
    name: (tokenData.user.user_metadata?.name as string | undefined) ?? tokenData.user.email ?? null,
  };
}

export async function auth(request?: Request) {
  const user = await getCurrentUser(request);
  return user ? { user } : null;
}

export async function requireCurrentUser(request?: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Non autorise" }, { status: 401 }),
    };
  }

  return { user, response: null };
}
