// Centralized email / SMTP configuration, resolved at RUNTIME from the container
// environment — same rationale as supabaseEnv.ts (one generic image, each
// deployment supplies its own values as container env vars).
//
// The master switch is USE_SMTP. When it is not "true", the whole email-
// confirmation feature is disabled: registration auto-confirms accounts (the
// historical instant behaviour) and no mail is ever sent. This keeps throwaway
// test servers frictionless. Set USE_SMTP=true and the SMTP_* vars to require
// email validation on signup and send the welcome email.

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
