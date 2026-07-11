import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { displayNameIsTaken, normalizeDisplayName } from "@/lib/auth/displayName";
import { isEmailEnabled } from "@/lib/config/emailEnv";
import { createConfirmationToken } from "@/lib/email/confirmationTokens";
import { sendConfirmationEmail } from "@/lib/email/send";
import { normalizeLocale } from "@/lib/i18n/types";
import { recordAnonymousAccountEvent } from "@/lib/server/anonymous-account-events";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;
  if (!user.isGuest) {
    return NextResponse.json({ error: "Ce compte est deja permanent." }, { status: 409 });
  }
  if (!user.isAnonymous) {
    return NextResponse.json({ error: "La validation de votre email est deja en attente." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const name = normalizeDisplayName(body.name ?? user.name);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const language = normalizeLocale(body.language ?? user.language);

  if (!name) return NextResponse.json({ error: "Le pseudo est requis." }, { status: 400 });
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "L'adresse mail est invalide." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 6 caracteres." }, { status: 400 });
  }

  const supabase = createAdminClient();
  try {
    if (await displayNameIsTaken(supabase, name, user.id)) {
      return NextResponse.json({ error: "Ce pseudo est deja utilise." }, { status: 409 });
    }
    const { data: emailOwner, error: emailLookupError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .neq("id", user.id)
      .maybeSingle();
    if (emailLookupError) throw emailLookupError;
    if (emailOwner) return NextResponse.json({ error: "Cette adresse mail est deja utilisee." }, { status: 409 });

    const requiresConfirmation = isEmailEnabled();
    const confirmation = requiresConfirmation
      ? await createConfirmationToken(supabase, user.id)
      : null;
    if (requiresConfirmation && !confirmation) {
      return NextResponse.json({ error: "Impossible de preparer la confirmation email." }, { status: 500 });
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(user.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (authError) {
      await supabase.from("email_confirmations").delete().eq("user_id", user.id);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    await recordAnonymousAccountEvent(supabase, user.id, "conversion_requested");

    const { error: profileError } = await supabase.from("profiles").update({
      email,
      name,
      language,
      email_confirmed: !requiresConfirmation,
      is_guest: requiresConfirmation,
    }).eq("id", user.id);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    const gameUpdate = requiresConfirmation
      ? { preservation_pending_until: confirmation!.expiresAt }
      : { is_ephemeral: false, preservation_pending_until: null };
    const { error: gameError } = await supabase
      .from("games")
      .update(gameUpdate)
      .eq("created_by_user_id", user.id)
      .eq("is_ephemeral", true);
    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 });

    if (!requiresConfirmation) {
      await recordAnonymousAccountEvent(supabase, user.id, "conversion_completed");
    }

    if (requiresConfirmation) {
      await sendConfirmationEmail(email, name, confirmation!.token);
    }

    return NextResponse.json({ success: true, requiresConfirmation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur serveur" }, { status: 500 });
  }
}
