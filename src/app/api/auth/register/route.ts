import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeLocale } from "@/lib/i18n/types";
import { isEmailEnabled } from "@/lib/config/emailEnv";
import { createConfirmationToken } from "@/lib/email/confirmationTokens";
import { sendConfirmationEmail } from "@/lib/email/send";
import { displayNameIsTaken, normalizeDisplayName } from "@/lib/auth/displayName";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = normalizeDisplayName(body.name);
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const language = normalizeLocale(body.language);

  if (!name) return NextResponse.json({ error: "Le pseudo est requis." }, { status: 400 });
  if (!email) return NextResponse.json({ error: "L'adresse mail est requise." }, { status: 400 });
  if (!password) return NextResponse.json({ error: "Le mot de passe est requis." }, { status: 400 });

  const supabase = createAdminClient();
  try {
    if (await displayNameIsTaken(supabase, name)) {
      return NextResponse.json({ error: "Ce pseudo est deja utilise." }, { status: 409 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur serveur" }, { status: 400 });
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message ?? "Impossible de creer le compte." }, { status: 400 });
  }

  // When SMTP is enabled the account must validate its email before logging in.
  // When disabled (e.g. test servers, USE_SMTP=false) the account is confirmed
  // instantly — the historical behaviour.
  const requiresConfirmation = isEmailEnabled();

  const { error: profileError } = await supabase.from("profiles").insert({
    id: created.user.id,
    email,
    name,
    role: "user",
    must_change_password: false,
    language,
    email_confirmed: !requiresConfirmation,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (requiresConfirmation) {
    const confirmation = await createConfirmationToken(supabase, created.user.id);
    if (confirmation) {
      await sendConfirmationEmail(email, name, confirmation.token);
    }
  }

  return NextResponse.json({ success: true, requiresConfirmation }, { status: 201 });
}
