import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { isEmailEnabled } from "@/lib/config/emailEnv";
import { sendBugReport } from "@/lib/email/send";

const MAX_TITLE = 160;
const MAX_DESCRIPTION = 5000;

export async function POST(request: Request) {
  const { user, response } = await requireCurrentUser(request);
  if (!user) return response;

  if (!isEmailEnabled()) {
    return NextResponse.json({ error: "L'envoi d'email n'est pas configure sur ce serveur." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim().slice(0, MAX_TITLE);
  const description = String(body.description ?? "").trim().slice(0, MAX_DESCRIPTION);

  if (!title) return NextResponse.json({ error: "Le titre est requis." }, { status: 400 });
  if (!description) return NextResponse.json({ error: "La description est requise." }, { status: 400 });

  // Friendly labels for well-known technical keys; any other provided key is
  // kept as-is (capped) so callers (e.g. in-game) can attach game context freely.
  const KNOWN_LABELS: Record<string, string> = {
    appVersion: "Version",
    url: "Page",
    userAgent: "Navigateur",
  };
  const MAX_CONTEXT_ENTRIES = 16;

  const context: Record<string, string> = {};
  const rawContext = body.context;
  if (rawContext && typeof rawContext === "object") {
    for (const [key, value] of Object.entries(rawContext)) {
      if (Object.keys(context).length >= MAX_CONTEXT_ENTRIES) break;
      if (typeof value !== "string" && typeof value !== "number") continue;
      const text = String(value).trim();
      if (!text) continue;
      const label = (KNOWN_LABELS[key] ?? key).slice(0, 40);
      context[label] = text.slice(0, 300);
    }
  }
  if (user.language) context["Langue"] = String(user.language);

  const sent = await sendBugReport({
    title,
    description,
    reporterName: user.name ?? user.email ?? "Joueur",
    reporterEmail: user.email ?? "",
    context,
  });

  if (!sent) {
    return NextResponse.json({ error: "Impossible d'envoyer le signalement. Reessayez plus tard." }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
