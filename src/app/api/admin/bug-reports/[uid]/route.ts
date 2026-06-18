import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { fetchBugThread, markBugThreadFlags } from "@/lib/email/inbox";

// Folder name `[uid]` is kept for backwards compatibility; the param itself
// is now a stable string threadId (GUID embedded in the bug-report subject).

function parseThreadId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^[a-z0-9-]{4,64}$/i.test(value)) return null;
  return value.toLowerCase();
}

export async function GET(request: Request, ctx: { params: Promise<{ uid: string }> }) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  const params = await ctx.params;
  const threadId = parseThreadId(params.uid);
  if (!threadId) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const result = await fetchBugThread(threadId);
  if (!result.ok) {
    if (result.reason === "disabled") {
      return NextResponse.json(
        { error: "Le client IMAP n'est pas configure sur ce serveur." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: result.error ?? "Impossible de joindre la boite mail." },
      { status: 502 },
    );
  }

  if (!result.value) {
    return NextResponse.json({ error: "Message introuvable." }, { status: 404 });
  }

  if (result.value.unread) {
    void markBugThreadFlags(threadId, { seen: true });
  }

  return NextResponse.json(result.value);
}
