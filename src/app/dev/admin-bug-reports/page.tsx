"use client";

import { useMemo } from "react";
import { BugReportsPanel } from "@/app/dashboard/BugReportsPanel";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { useI18n } from "@/lib/i18n/I18nProvider";

interface MockMessage {
  uid: number;
  direction: "incoming" | "outgoing";
  fromName: string;
  fromAddress: string;
  to: string[];
  cc: string[];
  date: string;
  text: string;
  html: string | null;
  seen: boolean;
  messageId: string | null;
}

interface MockThread {
  threadId: string;
  subject: string;
  lastDate: string;
  lastReporter: { name: string; address: string };
  messageCount: number;
  unread: boolean;
  answered: boolean;
  preview: string;
  messages: MockMessage[];
}

const MOCK_THREADS: MockThread[] = [
  {
    threadId: "a1b2c3d4",
    subject: "Le héros traverse une montagne",
    lastDate: "2026-06-12T10:01:00.000Z",
    lastReporter: { name: "Alice Dupont", address: "alice@example.com" },
    messageCount: 2,
    unread: true,
    answered: true,
    preview: "Merci pour ta réponse rapide !",
    messages: [
      {
        uid: 1,
        direction: "incoming",
        fromName: "Alice Dupont",
        fromAddress: "alice@example.com",
        to: ["contact@nthstudio.eu"],
        cc: [],
        date: "2026-06-12T09:32:00.000Z",
        text:
          "En tour 14, mon héros est parti de (12,8) en direction de (12,4) et a traversé\n" +
          "la chaîne de montagnes au lieu de la contourner.\n\n" +
          "Reproduction : carte XL, seed 4242, faction Castle.",
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
        text:
          "Pendant un combat manuel contre des squelettes, je clique sur 'Attendre' avec une\n" +
          "stack de gobelins et l'écran de combat se fige. Le bouton de tour ne répond plus.",
        html: null,
        seen: false,
        messageId: "<mock-incoming-3@example.com>",
      },
    ],
  },
];

function buildMockFetch(): (input: RequestInfo, init?: RequestInit) => Promise<Response> {
  return async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.endsWith("/api/admin/bug-reports")) {
      const summaries = MOCK_THREADS.map(({ messages: _messages, ...rest }) => {
        void _messages;
        return rest;
      });
      return new Response(JSON.stringify(summaries), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/reply")) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const match = url.match(/\/api\/admin\/bug-reports\/([^/?]+)/);
    if (match) {
      const threadId = decodeURIComponent(match[1]);
      const found = MOCK_THREADS.find((thread) => thread.threadId === threadId);
      if (found) {
        return new Response(JSON.stringify(found), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }
    return new Response(JSON.stringify({ error: "unknown route" }), { status: 404 });
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function PanelHost() {
  const { locale, t } = useI18n();
  const fetchWithAuth = useMemo(() => buildMockFetch(), []);
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-[#0e0904] to-stone-900 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BugReportsPanel
          fetchWithAuth={fetchWithAuth}
          parseJsonResponse={parseJsonResponse}
          t={t}
          locale={locale}
        />
      </div>
    </div>
  );
}

export default function DevAdminBugReportsPage() {
  return (
    <I18nProvider>
      <PanelHost />
    </I18nProvider>
  );
}
