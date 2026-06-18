"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

interface BugReportThread {
  threadId: string;
  subject: string;
  lastDate: string | null;
  lastReporter: { name: string; address: string };
  messageCount: number;
  unread: boolean;
  answered: boolean;
  preview: string;
}

interface BugReportMessage {
  uid: number;
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

interface BugReportThreadDetail extends BugReportThread {
  messages: BugReportMessage[];
}

export interface BugReportCounts {
  total: number;
  unread: number;
  unanswered: number;
}

interface BugReportsPanelProps {
  fetchWithAuth: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  parseJsonResponse: (response: Response) => Promise<unknown>;
  t: TFn;
  locale: Locale;
  onCountsChange?: (counts: BugReportCounts) => void;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function reporterLabel(thread: BugReportThread) {
  if (thread.lastReporter.name && thread.lastReporter.address) {
    return `${thread.lastReporter.name} <${thread.lastReporter.address}>`;
  }
  return thread.lastReporter.address || thread.lastReporter.name || "—";
}

function senderLabel(message: BugReportMessage) {
  if (message.fromName && message.fromAddress) return `${message.fromName} <${message.fromAddress}>`;
  return message.fromAddress || message.fromName || "—";
}

export function BugReportsPanel({ fetchWithAuth, parseJsonResponse, t, locale, onCountsChange }: BugReportsPanelProps) {
  const [threads, setThreads] = useState<BugReportThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BugReportThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyMessage, setReplyMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setListError(null);
    const response = await fetchWithAuth("/api/admin/bug-reports", { cache: "no-store" });
    if (!response.ok) {
      const data = (await parseJsonResponse(response)) as { error?: string } | null;
      setListError(localizedServerMessage(data?.error, locale) || t("admin.bugReports.loadFailed"));
      setThreads([]);
      setLoading(false);
      return;
    }
    const data = (await parseJsonResponse(response)) as BugReportThread[] | null;
    setThreads(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [fetchWithAuth, parseJsonResponse, locale, t]);

  const loadDetail = useCallback(
    async (threadId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      setDetail(null);
      setReplyMessage(null);
      const response = await fetchWithAuth(`/api/admin/bug-reports/${encodeURIComponent(threadId)}`, { cache: "no-store" });
      if (!response.ok) {
        const data = (await parseJsonResponse(response)) as { error?: string } | null;
        setDetailError(localizedServerMessage(data?.error, locale) || t("admin.bugReports.loadFailed"));
        setDetailLoading(false);
        return;
      }
      const data = (await parseJsonResponse(response)) as BugReportThreadDetail | null;
      setDetail(data ?? null);
      setThreads((current) =>
        current.map((item) => (item.threadId === threadId ? { ...item, unread: false } : item)),
      );
      setDetailLoading(false);
    },
    [fetchWithAuth, parseJsonResponse, locale, t],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList().catch(console.error);
  }, [loadList]);

  useEffect(() => {
    if (selectedThreadId === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetail(null);
      setReplyBody("");
      setReplyMessage(null);
      return;
    }
    loadDetail(selectedThreadId).catch(console.error);
  }, [loadDetail, selectedThreadId]);

  useEffect(() => {
    if (!onCountsChange) return;
    const counts: BugReportCounts = {
      total: threads.length,
      unread: threads.filter((t) => t.unread).length,
      unanswered: threads.filter((t) => !t.answered).length,
    };
    onCountsChange(counts);
  }, [threads, onCountsChange]);

  const sendReply = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!detail) return;
      const body = replyBody.trim();
      if (!body) {
        setReplyMessage({ kind: "error", text: t("admin.bugReports.replyEmpty") });
        return;
      }
      setReplying(true);
      setReplyMessage(null);
      const response = await fetchWithAuth(
        `/api/admin/bug-reports/${encodeURIComponent(detail.threadId)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!response.ok) {
        const data = (await parseJsonResponse(response)) as { error?: string } | null;
        setReplyMessage({
          kind: "error",
          text: localizedServerMessage(data?.error, locale) || t("admin.bugReports.replyFailed"),
        });
        setReplying(false);
        return;
      }
      setReplyMessage({ kind: "success", text: t("admin.bugReports.replySent") });
      setReplyBody("");
      setThreads((current) =>
        current.map((item) =>
          item.threadId === detail.threadId
            ? { ...item, answered: true, unread: false }
            : item,
        ),
      );
      setReplying(false);
      // Refresh the thread to pick up the just-sent outgoing message.
      loadDetail(detail.threadId).catch(console.error);
    },
    [detail, fetchWithAuth, parseJsonResponse, replyBody, locale, t, loadDetail],
  );

  const selectedThread = useMemo(
    () => threads.find((item) => item.threadId === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );

  return (
    <section data-testid="admin-bug-reports">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-amber-100">
          {t("admin.bugReports.title")}
        </h3>
        <button
          type="button"
          onClick={() => loadList().catch(console.error)}
          disabled={loading}
          className="rounded-md border border-cyan-400/50 bg-cyan-950/50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-cyan-100 transition hover:border-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t("common.loading") : t("admin.refresh")}
        </button>
      </div>

      {listError && (
        <div className="mb-3 rounded-md border border-red-400/50 bg-red-950/45 px-3 py-2 text-xs font-semibold text-red-100">
          {listError}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)]">
        <div className="overflow-hidden rounded-md border border-amber-700/35 bg-stone-950/45">
          <div className="max-h-[480px] overflow-y-auto">
            {threads.length === 0 && !loading && !listError && (
              <div className="px-3 py-6 text-center text-xs italic text-amber-200/55">
                {t("admin.bugReports.empty")}
              </div>
            )}
            <ul className="divide-y divide-amber-900/40">
              {threads.map((thread) => {
                const isSelected = thread.threadId === selectedThreadId;
                return (
                  <li key={thread.threadId}>
                    <button
                      type="button"
                      onClick={() => setSelectedThreadId(thread.threadId)}
                      className={`flex w-full flex-col gap-1 px-3 py-2 text-left transition ${
                        isSelected
                          ? "bg-amber-900/30 text-amber-50"
                          : "text-amber-100/85 hover:bg-stone-900/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider">
                        <span className="truncate text-amber-200/75">{reporterLabel(thread)}</span>
                        <span className="whitespace-nowrap text-amber-200/55">{formatDate(thread.lastDate)}</span>
                      </div>
                      <div className={`truncate text-sm ${thread.unread ? "font-black text-amber-50" : "font-medium"}`}>
                        {thread.subject || "(sans sujet)"}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-amber-200/55">
                        {thread.messageCount > 1 && (
                          <span className="rounded border border-amber-400/40 bg-stone-950/60 px-1.5 py-0.5 font-bold text-amber-200">
                            {t("admin.bugReports.messageCount", { n: thread.messageCount })}
                          </span>
                        )}
                        {thread.answered && (
                          <span className="rounded border border-emerald-400/40 bg-emerald-950/40 px-1.5 py-0.5 font-bold text-emerald-200">
                            {t("admin.bugReports.answered")}
                          </span>
                        )}
                        {thread.unread && (
                          <span className="rounded border border-red-400/40 bg-red-950/45 px-1.5 py-0.5 font-bold text-red-100">
                            {t("admin.bugReports.unread")}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-amber-700/35 bg-stone-950/45">
          {selectedThread === null && (
            <div className="px-3 py-6 text-center text-xs italic text-amber-200/55">
              {t("admin.bugReports.selectPrompt")}
            </div>
          )}
          {selectedThread && (
            <div className="flex max-h-[600px] flex-col">
              <div className="border-b border-amber-900/40 px-3 py-2">
                <div className="text-base font-black text-amber-50">{selectedThread.subject || "(sans sujet)"}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-amber-200/65">
                  {t("admin.bugReports.threadMeta", {
                    count: selectedThread.messageCount,
                    last: formatDate(selectedThread.lastDate),
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {detailLoading && (
                  <div className="text-xs italic text-amber-200/60">{t("common.loading")}</div>
                )}
                {detailError && (
                  <div className="rounded-md border border-red-400/50 bg-red-950/45 px-3 py-2 text-xs font-semibold text-red-100">
                    {detailError}
                  </div>
                )}
                {detail && !detailLoading && detail.messages.map((message) => {
                  const isIncoming = message.direction === "incoming";
                  return (
                    <div
                      key={message.uid}
                      className={`rounded-md border px-3 py-2 ${
                        isIncoming
                          ? "border-amber-700/40 bg-stone-950/55"
                          : "border-cyan-400/30 bg-cyan-950/30 ml-4"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider">
                        <span className="truncate text-amber-200/75">
                          {isIncoming
                            ? senderLabel(message)
                            : t("admin.bugReports.studioSender", { name: message.fromName || "" }).trim()}
                        </span>
                        <span className="whitespace-nowrap text-amber-200/55">{formatDate(message.date)}</span>
                      </div>
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-amber-100/90">
                        {message.text || t("admin.bugReports.empty")}
                      </pre>
                    </div>
                  );
                })}
              </div>

              {detail && (
                <form onSubmit={sendReply} className="border-t border-amber-900/40 px-3 py-3">
                  <label
                    htmlFor="bug-report-reply"
                    className="mb-1 block text-[11px] font-black uppercase tracking-wider text-amber-200/70"
                  >
                    {t("admin.bugReports.replyLabel")}
                  </label>
                  <textarea
                    id="bug-report-reply"
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    rows={4}
                    disabled={replying || !detail.lastReporter.address}
                    placeholder={
                      detail.lastReporter.address
                        ? t("admin.bugReports.replyPlaceholder")
                        : t("admin.bugReports.noSender")
                    }
                    className="w-full resize-y rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-sm text-amber-100 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none disabled:opacity-60"
                  />
                  {replyMessage && (
                    <div
                      role="status"
                      className={`mt-2 rounded-md border px-3 py-2 text-xs font-semibold ${
                        replyMessage.kind === "success"
                          ? "border-emerald-400/50 bg-emerald-950/45 text-emerald-100"
                          : "border-red-400/50 bg-red-950/45 text-red-100"
                      }`}
                    >
                      {replyMessage.text}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-amber-200/55">
                      {detail.lastReporter.address ? `${t("admin.bugReports.replyTo")} ${detail.lastReporter.address}` : ""}
                    </span>
                    <button
                      type="submit"
                      disabled={replying || !detail.lastReporter.address}
                      className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {replying ? t("admin.bugReports.sending") : t("admin.bugReports.send")}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
