import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { listBugThreads } from "@/lib/email/inbox";

export async function GET(request: Request) {
  const { user, response } = await requireAdminUser(request);
  if (!user) return response;

  const result = await listBugThreads();
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

  return NextResponse.json(result.value);
}
