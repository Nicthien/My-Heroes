import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getCurrentUser(request?: Request) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (!error && data.user) {
    const profile = await getUserProfile(data.user.id);
    return {
      id: data.user.id,
      email: data.user.email?.trim() || null,
      name: profile?.name ?? (data.user.user_metadata?.name as string | undefined) ?? data.user.email ?? null,
      role: profile?.role ?? "user",
      mustChangePassword: profile?.must_change_password ?? false,
      language: profile?.language ?? "fr",
      godModeEnabled: profile?.god_mode_enabled ?? false,
      isGuest: profile?.is_guest ?? Boolean(data.user.is_anonymous),
      isAnonymous: Boolean(data.user.is_anonymous),
    };
  }

  if (!request) return null;

  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring("Bearer ".length);
  const adminSupabase = createAdminClient();
  const { data: tokenData, error: tokenError } = await adminSupabase.auth.getUser(token);

  if (tokenError || !tokenData.user) return null;

  const profile = await getUserProfile(tokenData.user.id);
  return {
    id: tokenData.user.id,
    email: tokenData.user.email?.trim() || null,
    name: profile?.name ?? (tokenData.user.user_metadata?.name as string | undefined) ?? tokenData.user.email ?? null,
    role: profile?.role ?? "user",
    mustChangePassword: profile?.must_change_password ?? false,
    language: profile?.language ?? "fr",
    godModeEnabled: profile?.god_mode_enabled ?? false,
    isGuest: profile?.is_guest ?? Boolean(tokenData.user.is_anonymous),
    isAnonymous: Boolean(tokenData.user.is_anonymous),
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

export async function requireAdminUser(request?: Request) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return { user, response };
  if (user.role !== "admin") {
    return {
      user: null,
      response: NextResponse.json({ error: "Acces administrateur requis" }, { status: 403 }),
    };
  }

  return { user, response: null };
}

async function getUserProfile(userId: string) {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("profiles")
    .select("name,role,must_change_password,language,god_mode_enabled,is_guest")
    .eq("id", userId)
    .maybeSingle();

  if (error && isMissingGodModeColumnError(error)) {
    const { data: fallbackData } = await adminSupabase
      .from("profiles")
      .select("name,role,must_change_password,language,is_guest")
      .eq("id", userId)
      .maybeSingle();

    return fallbackData
      ? {
          ...fallbackData,
          god_mode_enabled: false,
        } as {
          name: string | null;
          role: string | null;
          must_change_password: boolean | null;
          language: string | null;
          god_mode_enabled: boolean | null;
          is_guest: boolean | null;
        }
      : null;
  }

  return data as {
    name: string | null;
    role: string | null;
    must_change_password: boolean | null;
    language: string | null;
    god_mode_enabled: boolean | null;
    is_guest: boolean | null;
  } | null;
}

function isMissingGodModeColumnError(error: unknown) {
  const maybeError = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(maybeError.code ?? "")} ${String(maybeError.message ?? "")} ${String(maybeError.details ?? "")}`;
  return text.includes("god_mode_enabled") || text.includes("42703") || text.includes("PGRST204");
}
