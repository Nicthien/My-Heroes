import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeConfirmationTokenForUser, validateConfirmationToken } from "@/lib/email/confirmationTokens";
import { sendWelcomeEmail } from "@/lib/email/send";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();

  if (!token) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const result = await validateConfirmationToken(supabase, token);

  if (result.status !== "ok") {
    return NextResponse.json({ status: result.status }, { status: 400 });
  }

  const { error: gamesError } = await supabase
    .from("games")
    .update({ is_ephemeral: false, preservation_pending_until: null })
    .eq("created_by_user_id", result.userId)
    .eq("is_ephemeral", true);
  if (gamesError) {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  const { data: profile, error: updateError } = await supabase
    .from("profiles")
    .update({ email_confirmed: true, is_guest: false })
    .eq("id", result.userId)
    .select("email, name")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  // Mark the GoTrue user as confirmed too, keeping both sides aligned.
  const { error: authError } = await supabase.auth.admin.updateUserById(result.userId, { email_confirm: true });
  if (authError) {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  const { error: consumeError } = await consumeConfirmationTokenForUser(supabase, result.userId);
  if (consumeError) {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  // Best-effort thank-you / welcome email — never blocks confirmation.
  if (profile?.email) {
    await sendWelcomeEmail(profile.email, profile.name ?? "");
  }

  return NextResponse.json({ status: "ok" });
}
