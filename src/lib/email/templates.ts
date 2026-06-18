// French, player-facing email bodies. Kept as small self-contained HTML so they
// render without external assets. Subjects/strings stay in French to match the
// in-game UI (see AGENTS.md "Localization").
//
// Images are referenced by ABSOLUTE URL built from APP_PUBLIC_URL — emails can't
// load relative/bundled assets. When APP_PUBLIC_URL is unset, logos are omitted
// (rather than rendering as broken images).

import { getAppPublicUrl } from "@/lib/config/emailEnv";

const BRAND = "My Heroes";
const STUDIO_NAME = "NTH Studio";
const STUDIO_URL = "https://nthstudio.eu";
const KOFI_URL = "https://ko-fi.com/nthstudio";

function brandHeader(): string {
  const base = getAppPublicUrl();
  const logo = base
    ? `<img src="${base}/icon.png" width="40" height="40" alt="" style="display:block;border-radius:8px;" />`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
    <tr>
      ${logo ? `<td style="padding-right:12px;vertical-align:middle;">${logo}</td>` : ""}
      <td style="vertical-align:middle;font-size:22px;font-weight:bold;color:#e8c87a;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${BRAND}</td>
    </tr>
  </table>`;
}

function studioFooter(): string {
  const base = getAppPublicUrl();
  const studioLogo = base
    ? `<img src="${base}/logo_nthstudio.png" width="28" height="28" alt="" style="display:inline-block;border-radius:6px;vertical-align:middle;margin-right:8px;" />`
    : "";
  const studioLink = `<a href="${STUDIO_URL}" style="text-decoration:none;color:#e8c87a;font-size:13px;font-weight:bold;white-space:nowrap;">
      ${studioLogo}<span style="vertical-align:middle;">${STUDIO_NAME}</span>
    </a>`;
  const kofiLink = `<a href="${KOFI_URL}" style="text-decoration:none;color:#e8a0b4;font-size:13px;font-weight:bold;white-space:nowrap;">
      <span style="color:#e0567a;vertical-align:middle;margin-right:6px;font-size:15px;">&#10084;</span><span style="vertical-align:middle;">Soutenir le jeu</span>
    </a>`;
  return `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #3a2f1e;text-align:center;">
    ${studioLink}
    <span style="color:#6b5d41;margin:0 12px;">&middot;</span>
    ${kofiLink}
  </div>`;
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#1a1410;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#f3e9d2;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      ${brandHeader()}
      <h2 style="font-size:18px;color:#f3e9d2;margin:0 0 16px;">${title}</h2>
      ${bodyHtml}
      <p style="margin-top:32px;font-size:12px;color:#b5a98a;">
        Cet email vous a été envoyé par ${BRAND}. Si vous n'êtes pas à l'origine de cette action, ignorez ce message.
      </p>
      ${studioFooter()}
    </div>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${href}" style="display:inline-block;background:#c9962f;color:#1a1410;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;">
      ${label}
    </a>
  </p>
  <p style="font-size:13px;color:#b5a98a;">Ou copiez ce lien dans votre navigateur :<br><a href="${href}" style="color:#e8c87a;">${href}</a></p>`;
}

export type EmailContent = { subject: string; html: string; text: string };

export function confirmationEmail(name: string, confirmUrl: string): EmailContent {
  const greeting = name ? `Bonjour ${name},` : "Bonjour,";
  return {
    subject: `Confirmez votre inscription à ${BRAND}`,
    html: shell(
      "Confirmez votre adresse email",
      `<p>${greeting}</p>
       <p>Merci de vous être inscrit·e à <strong>${BRAND}</strong>. Pour activer votre compte et commencer à jouer, confirmez votre adresse email :</p>
       ${button(confirmUrl, "Confirmer mon email")}
       <p style="font-size:13px;color:#b5a98a;">Ce lien expire dans 24 heures.</p>`,
    ),
    text: `${greeting}\n\nMerci de vous être inscrit·e à ${BRAND}. Confirmez votre adresse email en ouvrant ce lien (valable 24 h) :\n${confirmUrl}\n\n${STUDIO_NAME} — ${STUDIO_URL}\nSoutenir le jeu — ${KOFI_URL}`,
  };
}

export function welcomeEmail(name: string, loginUrl: string): EmailContent {
  const greeting = name ? `Bonjour ${name},` : "Bonjour,";
  return {
    subject: `Bienvenue dans ${BRAND} !`,
    html: shell(
      "Votre compte est activé",
      `<p>${greeting}</p>
       <p>Votre adresse email est confirmée et votre compte est désormais actif. Merci de rejoindre l'aventure <strong>${BRAND}</strong> !</p>
       ${button(loginUrl, "Se connecter et jouer")}
       <p>À vous de jouer.</p>`,
    ),
    text: `${greeting}\n\nVotre compte ${BRAND} est activé. Connectez-vous pour jouer :\n${loginUrl}\n\nÀ vous de jouer.\n\n${STUDIO_NAME} — ${STUDIO_URL}\nSoutenir le jeu — ${KOFI_URL}`,
  };
}

/** Escape user-supplied text before interpolating it into the HTML body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type BugReportInput = {
  title: string;
  description: string;
  reporterName: string;
  reporterEmail: string;
  /** Thread id embedded in the subject so the admin panel can group messages.
   *  Generated by sendBugReport when omitted. */
  threadId?: string;
  /** Optional technical context (app version, user agent, locale, etc.). */
  context?: Record<string, string>;
};

/** Regex that matches the bracketed thread id token in a bug-report subject. */
export const BUG_REPORT_THREAD_TOKEN = /\[([0-9a-f]{8,16})\]/i;

/** Build the canonical subject for a bug report. Kept in one place so the
 *  inbox grouping helper can re-derive expectations from the same pattern. */
export function buildBugReportSubject(threadId: string, title: string): string {
  return `[My-Heroes][BUG-REPORT][${threadId}] ${title}`;
}

export type BugReportReplyInput = {
  /** Reporter's name (used in the salutation). */
  toName: string;
  /** Original subject — used to derive the "Re:" subject. */
  originalSubject: string;
  /** Free-text reply body from the admin. */
  body: string;
  /** Admin's name (used in the sign-off). */
  fromName: string;
};

/** Studio reply to a player's bug report. Subject is prefixed with "Re:". */
export function bugReportReplyEmail(input: BugReportReplyInput): EmailContent {
  const { toName, originalSubject, body, fromName } = input;
  const greeting = toName ? `Bonjour ${toName},` : "Bonjour,";
  const signature = fromName ? `${fromName} — ${STUDIO_NAME}` : STUDIO_NAME;
  const reSubject = originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`;

  return {
    subject: reSubject,
    html: shell(
      "Réponse à votre signalement",
      `<p>${greeting}</p>
       <div style="white-space:pre-wrap;line-height:1.5;color:#f3e9d2;margin:16px 0;">${escapeHtml(body)}</div>
       <p style="color:#b5a98a;font-size:13px;">${escapeHtml(signature)}</p>`,
    ),
    text:
      `${greeting}\n\n` +
      `${body}\n\n` +
      `${signature}\n` +
      `${STUDIO_URL}\n`,
  };
}

/** Internal email sent to the studio when a player reports a bug. */
export function bugReportEmail(input: Required<Pick<BugReportInput, "threadId">> & BugReportInput): EmailContent {
  const { title, description, reporterName, reporterEmail, context = {}, threadId } = input;
  const contextRows = Object.entries(context)
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#b5a98a;">${escapeHtml(k)}</td><td style="padding:2px 0;color:#f3e9d2;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  const subject = buildBugReportSubject(threadId, title);

  return {
    subject,
    html: shell(
      "Signalement de bug",
      `<p style="color:#b5a98a;margin:0 0 4px;">Rapporté par <strong style="color:#f3e9d2;">${escapeHtml(reporterName)}</strong> (${escapeHtml(reporterEmail)})</p>
       <h3 style="font-size:16px;color:#e8c87a;margin:18px 0 6px;">${escapeHtml(title)}</h3>
       <div style="white-space:pre-wrap;line-height:1.5;color:#f3e9d2;">${escapeHtml(description)}</div>
       ${contextRows ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;font-size:13px;">${contextRows}</table>` : ""}`,
    ),
    text:
      `${subject}\n\n` +
      `Rapporté par ${reporterName} (${reporterEmail})\n\n` +
      `${description}\n\n` +
      Object.entries(context)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n"),
  };
}
