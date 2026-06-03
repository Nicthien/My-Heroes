import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeLocale } from "@/lib/i18n/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const language = normalizeLocale(body.language);

  if (!name) return NextResponse.json({ error: "Le pseudo est requis." }, { status: 400 });
  if (!email) return NextResponse.json({ error: "L'adresse mail est requise." }, { status: 400 });
  if (!password) return NextResponse.json({ error: "Le mot de passe est requis." }, { status: 400 });

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

  const { error: profileError } = await supabase.from("profiles").insert({
    id: created.user.id,
    email,
    name,
    role: "user",
    must_change_password: false,
    language,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
