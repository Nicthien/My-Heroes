import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { getSupabaseInternalUrl, getSupabaseServiceRoleKey } from "@/lib/config/supabaseEnv";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  const supabase = createAdminClient();
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

  const { profiles, error: profilesError } = await fetchAdminProfiles(supabase);
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

  const { data: memberships, error: membershipsError } = await supabase
    .from("game_players")
    .select("user_id")
    .not("user_id", "is", null);
  if (membershipsError) return NextResponse.json({ error: membershipsError.message }, { status: 500 });

  const gameCounts = new Map<string, number>();
  for (const membership of memberships ?? []) {
    const userId = membership.user_id as string | null;
    if (!userId) continue;
    gameCounts.set(userId, (gameCounts.get(userId) ?? 0) + 1);
  }

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const users = authUsers.users.map((authUser) => {
    const profile = profilesById.get(authUser.id);
    return {
      id: authUser.id,
      email: profile?.email ?? authUser.email ?? null,
      name: profile?.name ?? (authUser.user_metadata?.name as string | undefined) ?? null,
      role: profile?.role ?? "user",
      mustChangePassword: Boolean(profile?.must_change_password),
      godModeEnabled: Boolean(profile?.god_mode_enabled),
      createdAt: profile?.created_at ?? authUser.created_at,
      lastSignInAt: authUser.last_sign_in_at ?? null,
      gameCount: gameCounts.get(authUser.id) ?? 0,
    };
  });

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const role = body.role === "admin" ? "admin" : "user";
  const mustChangePassword = Boolean(body.mustChangePassword);
  const godModeEnabled = Boolean(body.godModeEnabled);

  if (!name) return NextResponse.json({ error: "Le pseudo est requis." }, { status: 400 });
  if (!email) return NextResponse.json({ error: "L'adresse mail est requise." }, { status: 400 });
  if (!password) return NextResponse.json({ error: "Le mot de passe est requis." }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Le mot de passe doit contenir au moins 6 caracteres." }, { status: 400 });

  const supabase = createAdminClient();
  const { data: existingName, error: existingNameError } = await supabase
    .from("profiles")
    .select("id")
    .ilike("name", name)
    .maybeSingle();

  if (existingNameError) return NextResponse.json({ error: existingNameError.message }, { status: 400 });
  if (existingName) return NextResponse.json({ error: "Ce pseudo est deja utilise." }, { status: 409 });

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "Impossible de creer le compte." }, { status: 400 });
  }

  const profilePayload = {
    id: created.user.id,
    email,
    name,
    role,
    must_change_password: mustChangePassword,
    god_mode_enabled: godModeEnabled,
  };
  const { error: profileError } = await supabase.from("profiles").insert(profilePayload);

  if (profileError) {
    if (isMissingGodModeColumnError(profileError) && !godModeEnabled) {
      const { god_mode_enabled: _godModeEnabled, ...fallbackPayload } = profilePayload;
      void _godModeEnabled;
      const { error: fallbackProfileError } = await supabase.from("profiles").insert(fallbackPayload);
      if (!fallbackProfileError) return NextResponse.json({ success: true }, { status: 201 });
    }
    await supabase.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const userId = typeof body.id === "string" ? body.id : "";
  if (!userId) return NextResponse.json({ error: "Utilisateur requis" }, { status: 400 });

  const result = await updateProfileGodMode(userId, Boolean(body.godModeEnabled));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ success: true });
}

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

async function fetchAdminProfiles(supabase: AdminSupabaseClient) {
  const withGodMode = await supabase
    .from("profiles")
    .select("id,email,name,role,must_change_password,god_mode_enabled,created_at");

  if (!withGodMode.error || !isMissingGodModeColumnError(withGodMode.error)) {
    return { profiles: withGodMode.data ?? [], error: withGodMode.error };
  }

  const fallback = await supabase
    .from("profiles")
    .select("id,email,name,role,must_change_password,created_at");

  return {
    profiles: (fallback.data ?? []).map((profile) => ({ ...profile, god_mode_enabled: false })),
    error: fallback.error,
  };
}

function isMissingGodModeColumnError(error: unknown) {
  const maybeError = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(maybeError.code ?? "")} ${String(maybeError.message ?? "")} ${String(maybeError.details ?? "")}`;
  return text.includes("god_mode_enabled") || text.includes("42703") || text.includes("PGRST204");
}

async function updateProfileGodMode(userId: string, enabled: boolean) {
  const url = getSupabaseInternalUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) return { ok: false, error: "Variables Supabase serveur manquantes." };

  const response = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ god_mode_enabled: enabled }),
  });

  if (response.ok) return { ok: true, error: null };

  const text = await response.text();
  let message = text;
  try {
    const data = JSON.parse(text) as { message?: string; details?: string; hint?: string };
    message = data.message ?? data.details ?? data.hint ?? text;
  } catch {
    message = text;
  }

  return { ok: false, error: message || "Impossible de modifier le mode dieu." };
}

export async function DELETE(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("id");
  if (!userId) return NextResponse.json({ error: "Utilisateur requis" }, { status: 400 });
  if (userId === user.id) return NextResponse.json({ error: "Vous ne pouvez pas supprimer votre propre compte." }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
