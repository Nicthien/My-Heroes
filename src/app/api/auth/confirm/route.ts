import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeConfirmationToken } from "@/lib/email/confirmationTokens";
import { sendWelcomeEmail } from "@/lib/email/send";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();

  if (!token) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const result = await consumeConfirmationToken(supabase, token);

  if (result.status !== "ok") {
    return NextResponse.json({ status: result.status }, { status: 400 });
  }

  const { data: profile, error: updateError } = await supabase
    .from("profiles")
    .update({ email_confirmed: true })
    .eq("id", result.userId)
    .select("email, name")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  // Mark the GoTrue user as confirmed too, keeping both sides aligned.
  await supabase.auth.admin.updateUserById(result.userId, { email_confirm: true });

  // Best-effort thank-you / welcome email — never blocks confirmation.
  if (profile?.email) {
    await sendWelcomeEmail(profile.email, profile.name ?? "");
  }

  return NextResponse.json({ status: "ok" });
}
