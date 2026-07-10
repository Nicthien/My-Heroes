import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { updateGamePresence } from "@/lib/game/server/guest-games";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  const body = await request.json().catch(() => ({}));
  const sessionId = String(body.sessionId ?? "");
  const state = body.state === "leave" ? "leave" : "heartbeat";
  if (!UUID_PATTERN.test(sessionId)) {
    return NextResponse.json({ error: "Session de presence invalide." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const result = await updateGamePresence(createAdminClient(), {
      gameId: id,
      userId: user.id,
      sessionId,
      state,
    });
    if (result.status === "not_found") return NextResponse.json({ error: "Partie introuvable" }, { status: 404 });
    if (result.status === "forbidden") return NextResponse.json({ error: "Vous n'etes pas dans cette partie" }, { status: 403 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur serveur" }, { status: 500 });
  }
}
