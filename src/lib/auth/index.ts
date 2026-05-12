import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    name: (data.user.user_metadata?.name as string | undefined) ?? data.user.email ?? null,
  };
}

export async function auth() {
  const user = await getCurrentUser();
  return user ? { user } : null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Non autorise" }, { status: 401 }),
    };
  }

  return { user, response: null };
}
