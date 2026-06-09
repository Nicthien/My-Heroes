import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getSmtpConfig } from "@/lib/config/emailEnv";

// Lazily-created singleton transporter, mirroring the lazy-Audio pattern used
// for SFX: built on first use, reused afterwards, and tolerant of a missing
// configuration (returns null instead of throwing).

let cached: Transporter | null = null;
let cachedFrom: string | null = null;

type ResolvedTransport = { transporter: Transporter; from: string };

/** Get a ready transporter, or null when SMTP is disabled / not configured. */
export function getTransport(): ResolvedTransport | null {
  const config = getSmtpConfig();
  if (!config) {
    cached = null;
    cachedFrom = null;
    return null;
  }

  if (!cached) {
    cached = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
    cachedFrom = config.from;
  }

  return { transporter: cached, from: cachedFrom ?? config.from };
}
