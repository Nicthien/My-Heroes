import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { displayNameIsTaken, normalizeDisplayName } from "@/lib/auth/displayName";
import { normalizeLocale } from "@/lib/i18n/types";
import { getAllowAnonymousUsers } from "@/lib/server/app-settings";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;
  if (!user.isAnonymous) {
    return NextResponse.json({ error: "Cette session n'est pas anonyme." }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!(await getAllowAnonymousUsers(supabase))) {
    await supabase.auth.admin.deleteUser(user.id).catch(() => undefined);
    return NextResponse.json({ error: "Le mode invite est desactive par l'administrateur." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const name = normalizeDisplayName(body.name);
  const language = normalizeLocale(body.language);
  if (!name) return NextResponse.json({ error: "Le pseudo est requis." }, { status: 400 });

  try {
    if (await displayNameIsTaken(supabase, name, user.id)) {
      await supabase.auth.admin.deleteUser(user.id);
      return NextResponse.json({ error: "Ce pseudo est deja utilise." }, { status: 409 });
    }

    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      email: null,
      name,
      role: "user",
      must_change_password: false,
      language,
      email_confirmed: true,
      is_guest: true,
    });
    if (error) {
      await supabase.auth.admin.deleteUser(user.id);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, name, isGuest: true }, { status: 201 });
  } catch (error) {
    await supabase.auth.admin.deleteUser(user.id).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur serveur" }, { status: 500 });
  }
}
