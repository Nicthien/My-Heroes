import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeLocale } from "@/lib/i18n/types";

export async function GET(request: Request) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role ?? "user",
    mustChangePassword: Boolean(user.mustChangePassword),
    language: user.language ?? "fr",
    godModeEnabled: Boolean(user.godModeEnabled),
    isGuest: Boolean(user.isGuest),
  });
}

export async function POST(request: Request) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;
  if (user.isGuest) {
    return NextResponse.json({ error: "Créez un compte pour modifier votre profil." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? user.name ?? user.email ?? "Joueur").trim();
  const language = normalizeLocale(body.language ?? user.language ?? "fr");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      email: user.email,
      name,
      role: user.role ?? "user",
      must_change_password: Boolean(user.mustChangePassword),
      language,
    }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
