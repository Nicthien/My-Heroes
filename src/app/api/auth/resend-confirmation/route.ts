import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailEnabled } from "@/lib/config/emailEnv";
import { createConfirmationToken } from "@/lib/email/confirmationTokens";
import { sendConfirmationEmail } from "@/lib/email/send";

export async function POST(request: Request) {
  // Always answer 200 with the same body: never reveal whether an address exists
  // or its confirmation status (avoids account enumeration).
  const ok = NextResponse.json({ success: true });

  if (!isEmailEnabled()) return ok;

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  if (!email) return ok;

  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email_confirmed")
    .ilike("email", email)
    .maybeSingle();

  if (!profile || profile.email_confirmed) return ok;

  const token = await createConfirmationToken(supabase, profile.id);
  if (token) {
    await sendConfirmationEmail(email, profile.name ?? "", token);
  }

  return ok;
}
