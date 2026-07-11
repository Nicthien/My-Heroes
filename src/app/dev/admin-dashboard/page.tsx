"use client";

import { useCallback } from "react";
import { AdminHomeDashboard } from "@/app/dashboard/AdminHomeDashboard";
import { translate } from "@/lib/i18n/translate";

const days = [
  { date: "2026-07-09", count: 1 },
  { date: "2026-07-10", count: 2 },
  { date: "2026-07-11", count: 3 },
];

const stats = {
  totals: { users: 12, admins: 1, games: 4, pendingGames: 1, activeGames: 2, completedGames: 1, abandonedGames: 0, players: 15, humanPlayers: 11, aiPlayers: 4, combats: 8, heroes: 17 },
  averages: { turnsPerGame: 12.5, turnsPerCompletedGame: 28, playersPerGame: 3.75 },
  gamesByStatus: [{ key: "ACTIVE", count: 2 }],
  factionDistribution: [{ key: "castle", count: 5 }],
  gamesOverTime: days,
  usersOverTime: days,
  anonymousUsers: {
    trackingStartedAt: "2026-07-11T00:00:00.000Z",
    totals: { currentAnonymous: 7, pendingConversions: 2, guestsCreated: 18, conversionRequests: 6, conversionsCompleted: 4, conversionRate: 22.2 },
    guestsOverTime: days,
    conversionRequestsOverTime: days.map((day, index) => ({ ...day, count: index === 2 ? 2 : 0 })),
    conversionsCompletedOverTime: days.map((day, index) => ({ ...day, count: index === 2 ? 1 : 0 })),
  },
  topPlayers: [{ name: "Catherine", gamesPlayed: 4, gamesWon: 3, bestScore: 1200 }],
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export default function DevAdminDashboardPage() {
  const fetchWithAuth = useCallback(async (input: RequestInfo) => {
    const url = String(input);
    if (url === "/api/admin/stats") return json(stats);
    if (url === "/api/admin/users") return json([{ id: "user-1", email: "user@local", name: "Catherine", role: "user", mustChangePassword: false, godModeEnabled: false, createdAt: "2026-07-10T10:00:00Z", lastSignInAt: "2026-07-11T10:00:00Z", gameCount: 2 }]);
    if (url === "/api/admin/games") return json([{ id: "game-1", name: "Démo admin", status: "ACTIVE", turnNumber: 3, maxPlayers: 2, mapWidth: 36, mapHeight: 36, players: [] }]);
    if (url === "/api/admin/settings") return json({ allowAnonymousUsers: true });
    if (url === "/api/admin/bug-reports") return json([]);
    return json({ error: "Mock endpoint missing" }, 404);
  }, []);

  const parseJsonResponse = useCallback(async (response: Response) => response.json().catch(() => null), []);
  const t = useCallback((key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate("fr", key, params), []);

  return (
    <main data-testid="admin-dashboard-tabs" className="min-h-screen bg-stone-950 p-3 sm:p-6">
      <AdminHomeDashboard
        fetchWithAuth={fetchWithAuth}
        parseJsonResponse={parseJsonResponse}
        t={t}
        locale="fr"
        sessionUserId="admin-dev"
        onObserveGame={() => undefined}
      />
    </main>
  );
}
