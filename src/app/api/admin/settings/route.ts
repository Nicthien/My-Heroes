import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { getAllowAnonymousUsers, setAllowAnonymousUsers } from "@/lib/server/app-settings";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  try {
    const supabase = createAdminClient();
    const allowAnonymousUsers = await getAllowAnonymousUsers(supabase);
    return NextResponse.json({ allowAnonymousUsers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de charger les parametres." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  if (typeof body.allowAnonymousUsers !== "boolean") {
    return NextResponse.json({ error: "Parametre invalide." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    await setAllowAnonymousUsers(body.allowAnonymousUsers, user.id, supabase);
    return NextResponse.json({ allowAnonymousUsers: body.allowAnonymousUsers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible d'enregistrer les parametres." },
      { status: 500 },
    );
  }
}
