import "server-only";
import crypto from "node:crypto";
import { getTransport } from "./transport";
import {
  bugReportEmail,
  bugReportReplyEmail,
  confirmationEmail,
  welcomeEmail,
  type BugReportInput,
  type BugReportReplyInput,
} from "./templates";
import { getAppPublicUrl } from "@/lib/config/emailEnv";

/** Generate a short hex thread id. 8 hex chars = 4 billion combinations,
 *  well beyond what a small studio inbox would ever conflict on. */
function generateThreadId(): string {
  return crypto.randomBytes(4).toString("hex");
}

/** Studio inbox that receives player bug reports. */
const BUG_REPORT_RECIPIENT = "contact@nthstudio.eu";

// Thin send helpers. They return a boolean instead of throwing: a failed
// welcome email must never break the confirmation flow, and a failed
// confirmation email is surfaced to the caller as `false` so the API can react
// (e.g. delete the half-created account) without crashing the request.

function buildUrl(path: string): string {
  const base = getAppPublicUrl();
  return base ? `${base}${path}` : path;
}

/** Send the signup confirmation email. Returns false if disabled or on error. */
export async function sendConfirmationEmail(
  to: string,
  name: string,
  token: string,
): Promise<boolean> {
  const resolved = getTransport();
  if (!resolved) return false;

  const confirmUrl = buildUrl(`/auth/confirm?token=${encodeURIComponent(token)}`);
  const { subject, html, text } = confirmationEmail(name, confirmUrl);

  try {
    await resolved.transporter.sendMail({ from: resolved.from, to, subject, html, text });
    return true;
  } catch (error) {
    console.error("[email] failed to send confirmation email:", error);
    return false;
  }
}

/** Send the welcome / thank-you email after confirmation. Best-effort. */
export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  const resolved = getTransport();
  if (!resolved) return false;

  const loginUrl = buildUrl("/auth/login");
  const { subject, html, text } = welcomeEmail(name, loginUrl);

  try {
    await resolved.transporter.sendMail({ from: resolved.from, to, subject, html, text });
    return true;
  } catch (error) {
    console.error("[email] failed to send welcome email:", error);
    return false;
  }
}

/**
 * Send a player bug report to the studio inbox. Returns false when email is
 * disabled (so the API can tell the user) or on transport error.
 * The reporter's address is set as Reply-To so the studio can answer directly.
 */
export async function sendBugReport(input: BugReportInput): Promise<boolean> {
  const resolved = getTransport();
  if (!resolved) return false;

  const threadId = input.threadId ?? generateThreadId();
  const { subject, html, text } = bugReportEmail({ ...input, threadId });

  try {
    await resolved.transporter.sendMail({
      from: resolved.from,
      to: BUG_REPORT_RECIPIENT,
      replyTo: input.reporterEmail || undefined,
      subject,
      html,
      text,
    });
    return true;
  } catch (error) {
    console.error("[email] failed to send bug report:", error);
    return false;
  }
}

export type SendReplyParams = BugReportReplyInput & {
  toAddress: string;
  /** Original Message-ID, threaded via In-Reply-To/References when set. */
  inReplyTo?: string | null;
  references?: string[];
};

/**
 * Send a reply to a player's bug report. Threading headers keep the exchange
 * in the same conversation in the studio's inbox.
 */
export async function sendBugReportReply(params: SendReplyParams): Promise<boolean> {
  const resolved = getTransport();
  if (!resolved) return false;

  const { subject, html, text } = bugReportReplyEmail(params);
  const headers: Record<string, string> = {};
  if (params.inReplyTo) headers["In-Reply-To"] = params.inReplyTo;
  const refs = [...(params.references ?? [])];
  if (params.inReplyTo && !refs.includes(params.inReplyTo)) refs.push(params.inReplyTo);
  if (refs.length > 0) headers["References"] = refs.join(" ");

  try {
    await resolved.transporter.sendMail({
      from: resolved.from,
      to: params.toAddress,
      subject,
      html,
      text,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
    return true;
  } catch (error) {
    console.error("[email] failed to send bug report reply:", error);
    return false;
  }
}
