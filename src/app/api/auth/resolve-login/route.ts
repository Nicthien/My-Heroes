import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const identifier = String(body.identifier ?? "").trim();

  if (!identifier) {
    return NextResponse.json({ error: "Identifiant requis" }, { status: 400 });
  }

  if (identifier.includes("@")) {
    return NextResponse.json({ email: identifier });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .ilike("name", identifier)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.email) return NextResponse.json({ error: "Identifiant introuvable" }, { status: 404 });

  return NextResponse.json({ email: data.email });
}
