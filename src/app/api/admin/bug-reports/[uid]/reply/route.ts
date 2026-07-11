import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { isEmailEnabled } from "@/lib/config/emailEnv";
import { fetchBugThread, markBugThreadFlags } from "@/lib/email/inbox";
import { sendBugReportReply } from "@/lib/email/send";
import { buildBugReportSubject } from "@/lib/email/templates";

const MAX_BODY = 8000;

function isMockEnabled(): boolean {
  return (process.env.IMAP_MOCK ?? "").trim().toLowerCase() === "true";
}

function parseThreadId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^[a-z0-9-]{4,64}$/i.test(value)) return null;
  return value.toLowerCase();
}

export async function POST(request: Request, ctx: { params: Promise<{ uid: string }> }) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  if (!isEmailEnabled() && !isMockEnabled()) {
    return NextResponse.json(
      { error: "L'envoi d'email n'est pas configure sur ce serveur." },
      { status: 503 },
    );
  }

  const params = await ctx.params;
  const threadId = parseThreadId(params.uid);
  if (!threadId) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const payload = await request.json().catch(() => ({}));
  const body = String(payload.body ?? "").trim().slice(0, MAX_BODY);
  if (!body) {
    return NextResponse.json({ error: "Le message est requis." }, { status: 400 });
  }

  const detail = await fetchBugThread(threadId);
  if (!detail.ok) {
    if (detail.reason === "disabled") {
      return NextResponse.json(
        { error: "Le client IMAP n'est pas configure sur ce serveur." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: detail.error ?? "Impossible de joindre la boite mail." },
      { status: 502 },
    );
  }

  if (!detail.value) {
    return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  }
  if (!detail.value.lastReporter.address) {
    return NextResponse.json(
      { error: "Cette conversation n'a pas d'adresse d'expediteur exploitable." },
      { status: 422 },
    );
  }

  // Pick the latest incoming message to thread the reply (In-Reply-To).
  const lastIncoming = [...detail.value.messages].reverse().find((m) => m.direction === "incoming");
  const inReplyTo = lastIncoming?.messageId ?? null;
  // Preserve the canonical subject with the thread token so subsequent admin
  // refreshes keep grouping the reply into the same conversation.
  const subject = buildBugReportSubject(threadId, detail.value.subject);

  if (isMockEnabled()) {
    console.log("[bug-report reply mock] to=%s subject=%s", detail.value.lastReporter.address, subject);
    await markBugThreadFlags(threadId, { seen: true, answered: true });
    return NextResponse.json({ success: true });
  }

  const sent = await sendBugReportReply({
    toAddress: detail.value.lastReporter.address,
    toName: detail.value.lastReporter.name,
    originalSubject: subject,
    body,
    fromName: user.name ?? "",
    inReplyTo,
    references: lastIncoming?.messageId ? [lastIncoming.messageId] : [],
  });

  if (!sent) {
    return NextResponse.json(
      { error: "Impossible d'envoyer la reponse. Reessayez plus tard." },
      { status: 502 },
    );
  }

  // Persist the IMAP Answered flag before returning. A fire-and-forget update
  // can be terminated by a serverless runtime and make the KPI regress after
  // the next refresh.
  await markBugThreadFlags(threadId, { seen: true, answered: true });

  return NextResponse.json({ success: true });
}
