import "server-only";
import crypto from "node:crypto";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { getImapConfig, getMailpitUrl } from "@/lib/config/emailEnv";

// Read-only helper used by the admin "Rapports de bug" panel.
// Groups messages into threads via the GUID embedded in the subject by
// `bugReportEmail` (templates.ts). Older messages without a GUID fall back to
// a hash of their normalized subject so they still appear as a single thread.

const SUBJECT_FILTER = "[My-Heroes][BUG-REPORT]";
/** Hard cap so a large mailbox can't blow up the admin response. */
const MAX_LIST_RESULTS = 200;
/** Local-part of BUG_REPORT_RECIPIENT (src/lib/email/send.ts). */
const BUG_REPORT_MAILBOX = "contact";

// === Exported types ========================================================

export interface BugReportMessage {
  /** Numeric id used by the client. Maps to a Mailpit string id internally. */
  uid: number;
  /** Incoming = sent by a player to the studio. Outgoing = studio reply. */
  direction: "incoming" | "outgoing";
  fromName: string;
  fromAddress: string;
  to: string[];
  cc: string[];
  date: string | null;
  text: string;
  html: string | null;
  seen: boolean;
  messageId: string | null;
}

export interface BugReportThread {
  /** Stable id. GUID extracted from subject, or hashed normalized subject. */
  threadId: string;
  /** Subject with the `[My-Heroes][BUG-REPORT][guid]` and `Re:` prefixes stripped. */
  subject: string;
  /** Timestamp of the latest message. */
  lastDate: string | null;
  /** Reporter of the latest *incoming* message — who to write back to. */
  lastReporter: { name: string; address: string };
  messageCount: number;
  /** True when at least one incoming message is unread. */
  unread: boolean;
  /** True when the studio has sent at least one outgoing message. */
  answered: boolean;
  /** Snippet of the latest message (text body). */
  preview: string;
}

export interface BugReportThreadDetail extends BugReportThread {
  /** Chronological order, oldest first. */
  messages: BugReportMessage[];
}

export type InboxOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "disabled" | "error"; error?: string };

// === Mock branch ===========================================================

function isMockEnabled(): boolean {
  return (process.env.IMAP_MOCK ?? "").trim().toLowerCase() === "true";
}

const MOCK_THREADS: BugReportThreadDetail[] = [
  {
    threadId: "a1b2c3d4",
    subject: "Le héros traverse une montagne",
    lastDate: "2026-06-12T10:01:00.000Z",
    lastReporter: { name: "Alice Dupont", address: "alice@example.com" },
    messageCount: 2,
    unread: true,
    answered: true,
    preview: "Merci pour ta réponse rapide ! …",
    messages: [
      {
        uid: 1,
        direction: "incoming",
        fromName: "Alice Dupont",
        fromAddress: "alice@example.com",
        to: ["contact@nthstudio.eu"],
        cc: [],
        date: "2026-06-12T09:32:00.000Z",
        text: "En tour 14, mon héros a traversé une chaîne de montagnes au lieu de la contourner.\n\nReproduction : carte XL, seed 4242, faction Castle.",
        html: null,
        seen: true,
        messageId: "<mock-incoming-1@example.com>",
      },
      {
        uid: 2,
        direction: "outgoing",
        fromName: "Studio",
        fromAddress: "no-reply@myheroes.local",
        to: ["alice@example.com"],
        cc: [],
        date: "2026-06-12T09:55:00.000Z",
        text: "Bonjour Alice,\n\nMerci pour le signalement, je regarde ça !\n\nStudio",
        html: null,
        seen: true,
        messageId: "<mock-outgoing-2@myheroes.local>",
      },
    ],
  },
  {
    threadId: "5e6f7a8b",
    subject: "Crash combat manuel",
    lastDate: "2026-06-15T18:05:00.000Z",
    lastReporter: { name: "Bob", address: "bob@example.com" },
    messageCount: 1,
    unread: true,
    answered: false,
    preview: "Le combat plante quand je clique sur Attendre…",
    messages: [
      {
        uid: 3,
        direction: "incoming",
        fromName: "Bob",
        fromAddress: "bob@example.com",
        to: ["contact@nthstudio.eu"],
        cc: [],
        date: "2026-06-15T18:05:00.000Z",
        text: "Pendant un combat manuel contre des squelettes, je clique sur 'Attendre' avec une stack de gobelins et l'écran de combat se fige. Le bouton de tour ne répond plus.",
        html: null,
        seen: false,
        messageId: "<mock-incoming-3@example.com>",
      },
    ],
  },
];

function listMockThreads(): InboxOutcome<BugReportThread[]> {
  return {
    ok: true,
    value: MOCK_THREADS.map(({ messages: _messages, ...thread }) => {
      void _messages;
      return thread;
    }),
  };
}

function fetchMockThread(threadId: string): InboxOutcome<BugReportThreadDetail | null> {
  const found = MOCK_THREADS.find((thread) => thread.threadId === threadId);
  return { ok: true, value: found ?? null };
}

function markMockThread(
  threadId: string,
  flags: { seen?: boolean; answered?: boolean },
): InboxOutcome<true> {
  const thread = MOCK_THREADS.find((t) => t.threadId === threadId);
  if (thread) {
    if (flags.seen === true) {
      thread.unread = false;
      for (const message of thread.messages) message.seen = true;
    }
    if (flags.answered === true) thread.answered = true;
  }
  return { ok: true, value: true };
}

// === Thread-id helpers =====================================================

function extractThreadId(subject: string | undefined): string | null {
  if (!subject) return null;
  const match = subject.match(/\[My-Heroes\]\[BUG-REPORT\]\[([0-9a-f]{8,16})\]/i);
  return match ? match[1].toLowerCase() : null;
}

function normalizeSubject(subject: string | undefined): string {
  if (!subject) return "";
  let value = subject;
  while (/^\s*re\s*:/i.test(value)) {
    value = value.replace(/^\s*re\s*:\s*/i, "");
  }
  value = value.replace(/^\[My-Heroes\]\[BUG-REPORT\](?:\[[^\]]+\])?\s*/i, "");
  return value.trim();
}

/** Stable threadId for messages without an embedded GUID. */
function fallbackThreadId(subject: string | undefined): string {
  const normalized = normalizeSubject(subject).toLowerCase();
  const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 10);
  return `legacy-${hash}`;
}

function threadIdFor(subject: string | undefined): string {
  return extractThreadId(subject) ?? fallbackThreadId(subject);
}

// === IMAP branch (production) ==============================================

async function withClient<T>(
  run: (client: ImapFlow) => Promise<T>,
): Promise<InboxOutcome<T>> {
  const config = getImapConfig();
  if (!config) return { ok: false, reason: "disabled" };

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  try {
    await client.connect();
  } catch (error) {
    console.error("[imap] connect failed:", error);
    return { ok: false, reason: "error", error: messageFromError(error) };
  }

  const lock = await client.getMailboxLock(config.mailbox).catch((error) => {
    console.error("[imap] mailbox lock failed:", error);
    return null;
  });
  if (!lock) {
    await safeLogout(client);
    return { ok: false, reason: "error", error: "mailbox lock failed" };
  }

  try {
    const value = await run(client);
    return { ok: true, value };
  } catch (error) {
    console.error("[imap] operation failed:", error);
    return { ok: false, reason: "error", error: messageFromError(error) };
  } finally {
    lock.release();
    await safeLogout(client);
  }
}

async function safeLogout(client: ImapFlow) {
  try {
    await client.logout();
  } catch {
    // ignore — we already have the result we need.
  }
}

function messageFromError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function firstAddress(addr: AddressObject | AddressObject[] | undefined): {
  name: string;
  address: string;
} {
  if (!addr) return { name: "", address: "" };
  const list = Array.isArray(addr) ? addr : [addr];
  for (const entry of list) {
    const value = entry?.value?.[0];
    if (value?.address) {
      return { name: value.name?.trim() || "", address: value.address.trim() };
    }
  }
  return { name: "", address: "" };
}

function addressList(addr: AddressObject | AddressObject[] | undefined): string[] {
  if (!addr) return [];
  const list = Array.isArray(addr) ? addr : [addr];
  const result: string[] = [];
  for (const entry of list) {
    for (const value of entry?.value ?? []) {
      if (value?.address) {
        result.push(value.name ? `${value.name} <${value.address}>` : value.address);
      }
    }
  }
  return result;
}

function shortPreview(text: string, limit = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
}

function toIsoOrNull(value: Date | string | undefined | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

interface ImapParsedMessage {
  uid: number;
  subject: string;
  date: string | null;
  fromName: string;
  fromAddress: string;
  to: string[];
  cc: string[];
  text: string;
  html: string | null;
  seen: boolean;
  messageId: string | null;
}

async function parseImapMessage(message: FetchMessageObject): Promise<ImapParsedMessage | null> {
  const envelope = message.envelope;
  if (!envelope) return null;
  const subject = envelope.subject ?? "";
  if (!subject.toLowerCase().includes(SUBJECT_FILTER.toLowerCase())) return null;

  const parsed = await simpleParser(message.source as Buffer);
  const from = firstAddress(parsed.from);
  const text = parsed.text?.trim() || "";
  const html = typeof parsed.html === "string" ? parsed.html : null;
  const flags = message.flags ?? new Set<string>();

  return {
    uid: message.uid,
    subject,
    date: toIsoOrNull(envelope.date),
    fromName: from.name,
    fromAddress: from.address,
    to: addressList(parsed.to),
    cc: addressList(parsed.cc),
    text,
    html,
    seen: flags.has("\\Seen"),
    messageId: parsed.messageId ?? null,
  };
}

function imapDirection(message: ImapParsedMessage): "incoming" | "outgoing" {
  const matches = message.to.some((entry) => {
    const match = entry.match(/<([^>]+)>/) ?? [null, entry];
    const address = (match[1] ?? entry).trim().toLowerCase();
    return address.split("@")[0] === BUG_REPORT_MAILBOX;
  });
  return matches ? "incoming" : "outgoing";
}

function groupParsedToThreads(parsed: ImapParsedMessage[]): BugReportThreadDetail[] {
  const byThread = new Map<string, BugReportMessage[]>();
  const subjectByThread = new Map<string, string>();
  for (const message of parsed) {
    const threadId = threadIdFor(message.subject);
    const list = byThread.get(threadId) ?? [];
    list.push({
      uid: message.uid,
      direction: imapDirection(message),
      fromName: message.fromName,
      fromAddress: message.fromAddress,
      to: message.to,
      cc: message.cc,
      date: message.date,
      text: message.text,
      html: message.html,
      seen: message.seen,
      messageId: message.messageId,
    });
    byThread.set(threadId, list);
    if (!subjectByThread.has(threadId)) {
      subjectByThread.set(threadId, normalizeSubject(message.subject));
    }
  }
  return [...byThread.entries()].map(([threadId, messages]) =>
    buildThreadDetail(threadId, subjectByThread.get(threadId) ?? "", messages),
  );
}

function buildThreadDetail(
  threadId: string,
  subject: string,
  messages: BugReportMessage[],
): BugReportThreadDetail {
  messages.sort((a, b) => {
    const aTime = a.date ? Date.parse(a.date) : 0;
    const bTime = b.date ? Date.parse(b.date) : 0;
    return aTime - bTime;
  });
  const last = messages[messages.length - 1];
  const lastIncoming = [...messages].reverse().find((m) => m.direction === "incoming") ?? last;
  return {
    threadId,
    subject,
    lastDate: last?.date ?? null,
    lastReporter: {
      name: lastIncoming?.fromName ?? "",
      address: lastIncoming?.fromAddress ?? "",
    },
    messageCount: messages.length,
    unread: messages.some((m) => m.direction === "incoming" && !m.seen),
    answered: messages.some((m) => m.direction === "outgoing"),
    preview: shortPreview(last?.text ?? ""),
    messages,
  };
}

function summarize(thread: BugReportThreadDetail): BugReportThread {
  const { messages: _messages, ...rest } = thread;
  void _messages;
  return rest;
}

async function listImapBugThreads(): Promise<InboxOutcome<BugReportThread[]>> {
  return (
    await withClient(async (client) => {
      const parsed: ImapParsedMessage[] = [];
      for await (const message of client.fetch(
        { subject: SUBJECT_FILTER },
        { envelope: true, flags: true, source: true },
      )) {
        const next = await parseImapMessage(message);
        if (next) parsed.push(next);
      }
      const threads = groupParsedToThreads(parsed)
        .sort((a, b) => {
          const aTime = a.lastDate ? Date.parse(a.lastDate) : 0;
          const bTime = b.lastDate ? Date.parse(b.lastDate) : 0;
          return bTime - aTime;
        })
        .slice(0, MAX_LIST_RESULTS)
        .map(summarize);
      return threads;
    })
  );
}

async function fetchImapBugThread(
  threadId: string,
): Promise<InboxOutcome<BugReportThreadDetail | null>> {
  return (
    await withClient(async (client) => {
      const parsed: ImapParsedMessage[] = [];
      for await (const message of client.fetch(
        { subject: SUBJECT_FILTER },
        { envelope: true, flags: true, source: true },
      )) {
        const next = await parseImapMessage(message);
        if (next && threadIdFor(next.subject) === threadId) parsed.push(next);
      }
      if (parsed.length === 0) return null;
      const [thread] = groupParsedToThreads(parsed);
      return thread ?? null;
    })
  );
}

async function markImapThreadFlags(
  threadId: string,
  flags: { seen?: boolean; answered?: boolean },
): Promise<InboxOutcome<true>> {
  return (
    await withClient(async (client) => {
      const uids: number[] = [];
      for await (const message of client.fetch(
        { subject: SUBJECT_FILTER },
        { envelope: true, uid: true },
      )) {
        if (message.envelope && threadIdFor(message.envelope.subject ?? "") === threadId) {
          uids.push(message.uid);
        }
      }
      if (uids.length === 0) return true as const;

      const add: string[] = [];
      const remove: string[] = [];
      if (flags.seen === true) add.push("\\Seen");
      if (flags.seen === false) remove.push("\\Seen");
      if (flags.answered === true) add.push("\\Answered");
      if (flags.answered === false) remove.push("\\Answered");

      const uidSet = uids.join(",");
      if (add.length > 0) await client.messageFlagsAdd(uidSet, add, { uid: true });
      if (remove.length > 0) await client.messageFlagsRemove(uidSet, remove, { uid: true });
      return true as const;
    })
  );
}

// === Mailpit branch (dev) ==================================================

interface MailpitAddress {
  Name: string;
  Address: string;
}

interface MailpitListMessage {
  ID: string;
  MessageID: string;
  Read: boolean;
  From: MailpitAddress | null;
  To: MailpitAddress[] | null;
  Cc?: MailpitAddress[] | null;
  ReplyTo?: MailpitAddress[] | null;
  Subject: string;
  Created: string;
  Snippet?: string;
}

interface MailpitListResponse {
  total: number;
  unread: number;
  count: number;
  messages_count: number;
  start: number;
  messages: MailpitListMessage[];
}

interface MailpitMessageDetail {
  ID: string;
  MessageID: string;
  From: MailpitAddress | null;
  To: MailpitAddress[] | null;
  Cc: MailpitAddress[] | null;
  ReplyTo?: MailpitAddress[] | null;
  Subject: string;
  Date: string;
  Text: string;
  HTML: string;
}

const mailpitUidByMessageId = new Map<string, number>();
const mailpitMessageIdByUid = new Map<number, string>();
let nextMailpitUid = 1;

function getOrCreateMailpitUid(messageId: string): number {
  const existing = mailpitUidByMessageId.get(messageId);
  if (existing !== undefined) return existing;
  const uid = nextMailpitUid++;
  mailpitUidByMessageId.set(messageId, uid);
  mailpitMessageIdByUid.set(uid, messageId);
  return uid;
}

function mailpitAddressArray(value: MailpitAddress[] | null | undefined): string[] {
  if (!value) return [];
  return value
    .filter((entry) => entry?.Address)
    .map((entry) => (entry.Name ? `${entry.Name} <${entry.Address}>` : entry.Address));
}

function mailpitAddressLocalParts(value: MailpitAddress[] | null | undefined): string[] {
  if (!value) return [];
  return value
    .filter((entry) => entry?.Address)
    .map((entry) => entry.Address.split("@")[0].toLowerCase());
}

/** Outgoing studio replies have `From: no-reply@myheroes.local` and no
 *  Reply-To; incoming bug reports relayed via the studio SMTP set Reply-To
 *  to the actual reporter (see sendBugReport in send.ts). */
function pickIncomingSender(msg: MailpitListMessage | MailpitMessageDetail) {
  const replyTo = msg.ReplyTo?.[0];
  if (replyTo?.Address) return { name: replyTo.Name?.trim() ?? "", address: replyTo.Address.trim() };
  if (msg.From?.Address) return { name: msg.From.Name?.trim() ?? "", address: msg.From.Address.trim() };
  return { name: "", address: "" };
}

function pickOutgoingSender(msg: MailpitListMessage | MailpitMessageDetail) {
  if (msg.From?.Address) return { name: msg.From.Name?.trim() ?? "", address: msg.From.Address.trim() };
  return { name: "", address: "" };
}

function mailpitDirection(msg: MailpitListMessage | MailpitMessageDetail): "incoming" | "outgoing" {
  const recipients = mailpitAddressLocalParts(msg.To);
  return recipients.includes(BUG_REPORT_MAILBOX) ? "incoming" : "outgoing";
}

async function mailpitRequest<T>(baseUrl: string, path: string): Promise<InboxOutcome<T | null>> {
  try {
    const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
    if (response.status === 404) return { ok: true, value: null };
    if (!response.ok) {
      return { ok: false, reason: "error", error: `Mailpit ${response.status}` };
    }
    const data = (await response.json()) as T;
    return { ok: true, value: data };
  } catch (error) {
    return { ok: false, reason: "error", error: messageFromError(error) };
  }
}

async function fetchMailpitDetail(
  baseUrl: string,
  mailpitId: string,
): Promise<MailpitMessageDetail | null> {
  const result = await mailpitRequest<MailpitMessageDetail>(
    baseUrl,
    `/api/v1/message/${encodeURIComponent(mailpitId)}`,
  );
  if (!result.ok || !result.value) return null;
  return result.value;
}

async function loadMailpitThreads(
  baseUrl: string,
): Promise<InboxOutcome<BugReportThreadDetail[]>> {
  const list = await mailpitRequest<MailpitListResponse>(
    baseUrl,
    `/api/v1/messages?limit=${MAX_LIST_RESULTS}`,
  );
  if (!list.ok) return list;
  const summaries = list.value?.messages ?? [];

  // Group summaries first so we only fetch detail bodies for relevant messages.
  type Bucket = { subject: string; summaries: MailpitListMessage[] };
  const buckets = new Map<string, Bucket>();
  for (const summary of summaries) {
    const subject = summary.Subject ?? "";
    if (!subject.toLowerCase().includes(SUBJECT_FILTER.toLowerCase())) continue;
    const threadId = threadIdFor(subject);
    const bucket = buckets.get(threadId) ?? { subject: normalizeSubject(subject), summaries: [] };
    bucket.summaries.push(summary);
    buckets.set(threadId, bucket);
  }

  const threads: BugReportThreadDetail[] = [];
  for (const [threadId, bucket] of buckets) {
    const messages: BugReportMessage[] = [];
    for (const summary of bucket.summaries) {
      const detail = await fetchMailpitDetail(baseUrl, summary.ID);
      if (!detail) continue;
      const direction = mailpitDirection(detail);
      const sender = direction === "incoming" ? pickIncomingSender(detail) : pickOutgoingSender(detail);
      const uid = getOrCreateMailpitUid(detail.ID);
      const text = detail.Text?.trim() ?? "";
      const html = detail.HTML?.length ? detail.HTML : null;
      messages.push({
        uid,
        direction,
        fromName: sender.name,
        fromAddress: sender.address,
        to: mailpitAddressArray(detail.To),
        cc: mailpitAddressArray(detail.Cc),
        date: toIsoOrNull(detail.Date),
        text,
        html,
        seen: summary.Read,
        messageId: detail.MessageID ? `<${detail.MessageID}>` : null,
      });
    }
    if (messages.length > 0) {
      threads.push(buildThreadDetail(threadId, bucket.subject, messages));
    }
  }

  threads.sort((a, b) => {
    const aTime = a.lastDate ? Date.parse(a.lastDate) : 0;
    const bTime = b.lastDate ? Date.parse(b.lastDate) : 0;
    return bTime - aTime;
  });

  return { ok: true, value: threads };
}

async function listMailpitBugThreads(
  baseUrl: string,
): Promise<InboxOutcome<BugReportThread[]>> {
  const result = await loadMailpitThreads(baseUrl);
  if (!result.ok) return result;
  return { ok: true, value: result.value.map(summarize) };
}

async function fetchMailpitBugThread(
  baseUrl: string,
  threadId: string,
): Promise<InboxOutcome<BugReportThreadDetail | null>> {
  const result = await loadMailpitThreads(baseUrl);
  if (!result.ok) return result;
  const thread = result.value.find((t) => t.threadId === threadId);
  return { ok: true, value: thread ?? null };
}

async function markMailpitThread(
  baseUrl: string,
  threadId: string,
  flags: { seen?: boolean; answered?: boolean },
): Promise<InboxOutcome<true>> {
  // Mailpit has no "answered" concept; we only forward the Read flag, and
  // the `answered` aspect is derived from the presence of outgoing messages.
  void flags.answered;

  if (flags.seen !== undefined) {
    // Refetch to find the Mailpit ids that belong to this thread.
    const fresh = await loadMailpitThreads(baseUrl);
    if (!fresh.ok) return fresh;
    const target = fresh.value.find((t) => t.threadId === threadId);
    if (!target) return { ok: true, value: true };
    const ids: string[] = [];
    for (const message of target.messages) {
      const mailpitId = mailpitMessageIdByUid.get(message.uid);
      if (mailpitId) ids.push(mailpitId);
    }
    if (ids.length > 0) {
      try {
        await fetch(`${baseUrl}/api/v1/messages`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ IDs: ids, Read: flags.seen }),
        });
      } catch (error) {
        console.error("[mailpit] mark Read failed:", error);
      }
    }
  }

  return { ok: true, value: true };
}

// === Exported entry points =================================================

export async function listBugThreads(): Promise<InboxOutcome<BugReportThread[]>> {
  if (isMockEnabled()) return listMockThreads();
  const mailpit = getMailpitUrl();
  if (mailpit) return listMailpitBugThreads(mailpit);
  return listImapBugThreads();
}

export async function fetchBugThread(
  threadId: string,
): Promise<InboxOutcome<BugReportThreadDetail | null>> {
  if (isMockEnabled()) return fetchMockThread(threadId);
  const mailpit = getMailpitUrl();
  if (mailpit) return fetchMailpitBugThread(mailpit, threadId);
  return fetchImapBugThread(threadId);
}

export async function markBugThreadFlags(
  threadId: string,
  flags: { seen?: boolean; answered?: boolean },
): Promise<InboxOutcome<true>> {
  if (isMockEnabled()) return markMockThread(threadId, flags);
  const mailpit = getMailpitUrl();
  if (mailpit) return markMailpitThread(mailpit, threadId, flags);
  return markImapThreadFlags(threadId, flags);
}
