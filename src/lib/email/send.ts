import "server-only";
import { getTransport } from "./transport";
import { confirmationEmail, welcomeEmail, bugReportEmail, type BugReportInput } from "./templates";
import { getAppPublicUrl } from "@/lib/config/emailEnv";

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

  const { subject, html, text } = bugReportEmail(input);

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
