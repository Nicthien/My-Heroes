// Centralized email / SMTP / IMAP configuration, resolved at RUNTIME from the
// container environment — same rationale as supabaseEnv.ts (one generic image,
// each deployment supplies its own values as container env vars).
//
// The master switch is USE_SMTP. When it is not "true", the whole email-
// confirmation feature is disabled: registration auto-confirms accounts (the
// historical instant behaviour) and no mail is ever sent. This keeps throwaway
// test servers frictionless. Set USE_SMTP=true and the SMTP_* vars to require
// email validation on signup and send the welcome email.
//
// IMAP is a separate, optional feature used only by the admin "Rapports de bug"
// panel. Set USE_IMAP=true and the IMAP_* vars (IMAP_HOST, IMAP_PORT, IMAP_USER,
// IMAP_PASS, IMAP_SECURE, optionally IMAP_MAILBOX defaulting to "INBOX") to let
// admins browse and reply to [My-Heroes][BUG-REPORT] emails from inside the app.

export type SmtpConfig = {
  host: string;
  port: number;
  /** true => implicit TLS (port 465); false => STARTTLS / plain (port 587/25). */
  secure: boolean;
  user: string;
  pass: string;
  /** From header, e.g. `My Heroes <no-reply@example.com>`. */
  from: string;
};

export type ImapConfig = {
  host: string;
  port: number;
  /** true => implicit TLS (993); false => STARTTLS / plain (143). */
  secure: boolean;
  user: string;
  pass: string;
  /** Mailbox to scan for [My-Heroes][BUG-REPORT] messages. Defaults to "INBOX". */
  mailbox: string;
};

/** Master switch. When false, email confirmation is skipped entirely. */
export function isEmailEnabled(): boolean {
  return (process.env.USE_SMTP ?? "").trim().toLowerCase() === "true";
}

/** Public base URL of the app, used to build confirmation links in emails. */
export function getAppPublicUrl(): string {
  const raw = process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  return raw.replace(/\/+$/, "");
}

/**
 * Resolve the SMTP configuration from env. Returns null when email is disabled
 * or when a required value is missing, so callers can degrade gracefully.
 */
export function getSmtpConfig(): SmtpConfig | null {
  if (!isEmailEnabled()) return null;

  const host = process.env.SMTP_HOST?.trim() || "";
  const from = process.env.SMTP_FROM?.trim() || "";
  if (!host || !from) return null;

  const port = Number(process.env.SMTP_PORT ?? "587") || 587;
  const secure = (process.env.SMTP_SECURE ?? "").trim().toLowerCase() === "true" || port === 465;

  return {
    host,
    port,
    secure,
    user: process.env.SMTP_USER?.trim() || "",
    pass: process.env.SMTP_PASS ?? "",
    from,
  };
}

/** Master switch for the admin bug-report inbox reader. */
export function isImapEnabled(): boolean {
  return (process.env.USE_IMAP ?? "").trim().toLowerCase() === "true";
}

/**
 * Mailpit base URL (dev-only). When set, the admin bug-report panel reads
 * from the Mailpit REST API instead of opening an IMAP connection. Lets us
 * close the loop locally: app → SMTP → Mailpit → admin panel.
 * Example: MAILPIT_URL=http://127.0.0.1:48324
 *
 * Recent Supabase CLI versions ship Mailpit (not Inbucket) for the local
 * email-testing UI even though `supabase/config.toml` still names the section
 * `[inbucket]` for backwards compatibility.
 */
export function getMailpitUrl(): string | null {
  const raw = (process.env.MAILPIT_URL ?? "").trim().replace(/\/+$/, "");
  return raw || null;
}

/**
 * Resolve the IMAP configuration from env. Returns null when IMAP is disabled
 * or when a required value is missing.
 */
export function getImapConfig(): ImapConfig | null {
  if (!isImapEnabled()) return null;

  const host = process.env.IMAP_HOST?.trim() || "";
  const user = process.env.IMAP_USER?.trim() || "";
  const pass = process.env.IMAP_PASS ?? "";
  if (!host || !user || !pass) return null;

  const port = Number(process.env.IMAP_PORT ?? "993") || 993;
  const secureRaw = (process.env.IMAP_SECURE ?? "").trim().toLowerCase();
  const secure = secureRaw === "true" || (secureRaw === "" && port === 993);
  const mailbox = process.env.IMAP_MAILBOX?.trim() || "INBOX";

  return { host, port, secure, user, pass, mailbox };
}
