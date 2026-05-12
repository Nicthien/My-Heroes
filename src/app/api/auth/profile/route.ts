import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user, response } = await requireCurrentUser();
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? user.name ?? user.email ?? "Joueur").trim();

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      email: user.email,
      name,
    }, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
