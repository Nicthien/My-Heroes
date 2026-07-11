"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CornerOrnaments,
  OrnateHeader,
  ParchmentBackground,
  ornateFrame,
} from "@/components/game/hud/theme";
import { describeVictoryCondition, normalizeVictoryCondition } from "@/lib/game/victory";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";
import { BugReportsPanel, type BugReportCounts } from "./BugReportsPanel";
import { StatsPanelBody } from "./StatsPanel";
import { factionLabel } from "./factionMeta";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

interface PlayerInfo {
  id: string;
  userId: string | null;
  user?: { name: string | null; email?: string | null };
  email?: string | null;
  lastSignInAt?: string | null;
  turnStatus?: string | null;
  isAi?: boolean;
  aiName?: string | null;
  faction: string;
  isAlive: boolean;
  color: string;
  turnOrder: number;
}

export interface AdminUserInfo {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  mustChangePassword: boolean;
  godModeEnabled: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  gameCount: number;
}

interface AdminGamePlayerInfo extends PlayerInfo {
  joinedAt?: string | null;
}

interface AdminCreatorInfo {
  id: string;
  userId?: string | null;
  user?: { name: string | null; email?: string | null };
  email?: string | null;
  isAi?: boolean;
  aiName?: string | null;
}

export interface AdminGameInfo {
  id: string;
  name: string;
  status: string;
  turnNumber: number;
  maxPlayers: number;
  mapWidth: number;
  mapHeight: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  gameConfig?: { victory?: unknown } | null;
  createdBy?: AdminCreatorInfo | null;
  players: AdminGamePlayerInfo[];
}

interface AdminSettings {
  allowAnonymousUsers: boolean;
}

interface AdminHomeDashboardProps {
  fetchWithAuth: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  parseJsonResponse: (response: Response) => Promise<unknown>;
  t: TFn;
  locale: Locale;
  sessionUserId: string | undefined;
  onObserveGame: (gameId: string) => void;
}

type AdminTabId = "overview" | "users" | "games" | "bugReports" | "settings";

function formatAdminDate(value?: string | null, fallback = "-") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function adminPlayerName(player: AdminCreatorInfo | PlayerInfo | null | undefined, t: TFn) {
  if (!player) return "-";
  if (player.isAi) return player.aiName || t("common.ai");
  return player.user?.name || player.email || player.user?.email || t("common.player");
}

function playerStatusClass(status?: string | null) {
  if (status === "Doit jouer maintenant") return "text-emerald-300";
  if (status === "A fini son tour" || status === "Pret au lancement" || status === "Partie terminee") return "text-cyan-300";
  if (status === "Pas pret") return "text-red-300";
  return "text-amber-200/70";
}

function playerStatusLabel(player: PlayerInfo, locale: Locale) {
  return localizedServerMessage(player.turnStatus, locale) || "-";
}

export function AdminHomeDashboard({
  fetchWithAuth,
  parseJsonResponse,
  t,
  locale,
  sessionUserId,
  onObserveGame,
}: AdminHomeDashboardProps) {
  const [users, setUsers] = useState<AdminUserInfo[]>([]);
  const [games, setGames] = useState<AdminGameInfo[]>([]);
  const [settings, setSettings] = useState<AdminSettings>({ allowAnonymousUsers: true });
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");
  const [newUserMustChangePassword, setNewUserMustChangePassword] = useState(true);
  const [newUserGodMode, setNewUserGodMode] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  const [bugCounts, setBugCounts] = useState<BugReportCounts>({ total: 0, unread: 0, unanswered: 0 });
  const [activeTab, setActiveTab] = useState<AdminTabId>("overview");


  const loadTabData = useCallback(async (tab: AdminTabId) => {
    if (tab === "overview" || tab === "bugReports") return;
    setLoading(true);
    setMessage(null);
    const endpoint = tab === "users" ? "/api/admin/users" : tab === "games" ? "/api/admin/games" : "/api/admin/settings";
    const response = await fetchWithAuth(endpoint, { cache: "no-store" });
    if (!response.ok) {
      const data = (await parseJsonResponse(response)) as { error?: string } | null;
      setMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("admin.loadFailed") });
      setLoading(false);
      return;
    }
    const data = await parseJsonResponse(response);
    if (tab === "users") setUsers(Array.isArray(data) ? (data as AdminUserInfo[]) : []);
    if (tab === "games") setGames(Array.isArray(data) ? (data as AdminGameInfo[]) : []);
    if (tab === "settings") {
      setSettings({ allowAnonymousUsers: (data as AdminSettings | null)?.allowAnonymousUsers !== false });
    }
    setLoading(false);
  }, [fetchWithAuth, parseJsonResponse, locale, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTabData(activeTab).catch((error) => {
      console.error(error);
      setMessage({ kind: "error", text: t("admin.loadFailed") });
      setLoading(false);
    });
  }, [activeTab, loadTabData, t]);

  const deleteUser = async (target: AdminUserInfo) => {
    if (!confirm(`Supprimer l'utilisateur ${target.name || target.email || target.id} ?`)) return;
    setMessage(null);
    const response = await fetchWithAuth(`/api/admin/users?id=${encodeURIComponent(target.id)}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await parseJsonResponse(response)) as { error?: string } | null;
      setMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("admin.userDeleteFailed") });
      return;
    }
    setMessage({ kind: "success", text: t("admin.userDeleted") });
    await loadTabData("users");
  };

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newUserName.trim();
    const email = newUserEmail.trim();
    const password = newUserPassword;
    setMessage(null);

    if (!name || !email || !password) {
      setMessage({ kind: "error", text: t("admin.fieldsRequired") });
      return;
    }
    if (password.length < 6) {
      setMessage({ kind: "error", text: t("admin.passwordMinLength") });
      return;
    }

    setCreatingUser(true);
    const response = await fetchWithAuth("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        role: newUserRole,
        mustChangePassword: newUserMustChangePassword,
        godModeEnabled: newUserGodMode,
      }),
    });

    if (!response.ok) {
      const data = (await parseJsonResponse(response)) as { error?: string } | null;
      setMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("admin.userCreateFailed") });
      setCreatingUser(false);
      return;
    }

    setNewUserName("");
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserRole("user");
    setNewUserMustChangePassword(true);
    setNewUserGodMode(false);
    setMessage({ kind: "success", text: t("admin.userCreated") });
    setCreatingUser(false);
    await loadTabData("users");
  };

  const updateUserGodMode = async (target: AdminUserInfo, enabled: boolean) => {
    setMessage(null);
    const response = await fetchWithAuth("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: target.id, godModeEnabled: enabled }),
    });
    if (!response.ok) {
      const data = (await parseJsonResponse(response)) as { error?: string } | null;
      setMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("admin.godModeUpdateFailed") });
      return;
    }
    setUsers((current) => current.map((item) => (item.id === target.id ? { ...item, godModeEnabled: enabled } : item)));
    setMessage({ kind: "success", text: enabled ? t("admin.godModeEnabled") : t("admin.godModeDisabled") });
  };

  const updateAllowAnonymousUsers = async (enabled: boolean) => {
    setMessage(null);
    setSavingSettings(true);
    const response = await fetchWithAuth("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowAnonymousUsers: enabled }),
    });

    if (!response.ok) {
      const data = (await parseJsonResponse(response)) as { error?: string } | null;
      setMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("admin.settingsSaveFailed") });
      setSavingSettings(false);
      return;
    }

    setSettings({ allowAnonymousUsers: enabled });
    setMessage({ kind: "success", text: enabled ? t("admin.anonymousUsersEnabled") : t("admin.anonymousUsersDisabled") });
    setSavingSettings(false);
  };

  const deleteGame = async (target: AdminGameInfo) => {
    if (!confirm(`Supprimer la partie ${target.name} ?`)) return;
    setMessage(null);
    const response = await fetchWithAuth(`/api/admin/games?id=${encodeURIComponent(target.id)}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await parseJsonResponse(response)) as { error?: string } | null;
      setMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("admin.gameDeleteFailed") });
      return;
    }
    setMessage({ kind: "success", text: t("admin.gameDeleted") });
    await loadTabData("games");
  };

  return (
    <div className={`relative ${ornateFrame}`}>
      <CornerOrnaments />
      <ParchmentBackground />
      <OrnateHeader>{t("admin.title")}</OrnateHeader>

      <div className="space-y-4 p-4">
        <div className="overflow-x-auto border-b border-amber-700/40" role="tablist" aria-label={t("admin.title")}>
          <div className="flex min-w-max gap-1">
            {([
              ["overview", t("admin.tabs.overview")],
              ["users", `${t("admin.tabs.users")}${users.length ? ` (${users.length})` : ""}`],
              ["games", `${t("admin.tabs.games")}${games.length ? ` (${games.length})` : ""}`],
              ["bugReports", `${t("admin.tabs.bugReports")}${bugCounts.unread ? ` (${bugCounts.unread})` : ""}`],
              ["settings", t("admin.tabs.settings")],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                id={`admin-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`admin-panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={`border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  activeTab === id
                    ? "border-amber-300 bg-amber-950/45 text-amber-100"
                    : "border-transparent text-amber-200/60 hover:bg-stone-900/50 hover:text-amber-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {message && (
          <div
            role="status"
            className={`rounded-md border px-4 py-3 text-sm font-semibold ${
              message.kind === "success"
                ? "border-emerald-400/50 bg-emerald-950/45 text-emerald-100"
                : "border-red-400/50 bg-red-950/45 text-red-100"
            }`}
          >
            {message.text}
          </div>
        )}

        {(activeTab === "users" || activeTab === "games" || activeTab === "settings") && <div className="flex justify-end">
          <button
            type="button"
            onClick={() => loadTabData(activeTab).catch(console.error)}
            disabled={loading}
            className="rounded-md border border-cyan-400/50 bg-cyan-950/50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-cyan-100 transition hover:border-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t("common.loading") : t("admin.refresh")}
          </button>
        </div>}

        {activeTab === "overview" && (
          <div id="admin-panel-overview" role="tabpanel" aria-labelledby="admin-tab-overview">
            <StatsPanelBody fetchWithAuth={fetchWithAuth} parseJsonResponse={parseJsonResponse} t={t} locale={locale} />
          </div>
        )}

        {activeTab === "settings" && (
            <div id="admin-panel-settings" role="tabpanel" aria-labelledby="admin-tab-settings" className="space-y-3 rounded-md border border-amber-700/40 bg-stone-950/45 p-3">
              <label className="flex flex-col gap-3 rounded-md border border-amber-700/35 bg-stone-950/45 p-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="block text-sm font-black uppercase tracking-[0.14em] text-amber-100">
                    {t("admin.allowAnonymousUsers")}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-amber-100/65">
                    {t("admin.allowAnonymousUsersHelp")}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-100/75">
                  <input
                    type="checkbox"
                    checked={settings.allowAnonymousUsers}
                    onChange={(event) => updateAllowAnonymousUsers(event.target.checked).catch(console.error)}
                    disabled={savingSettings}
                    className="h-4 w-4 accent-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {settings.allowAnonymousUsers ? t("common.yes") : t("common.no")}
                </span>
              </label>
              <p className="text-xs leading-5 text-amber-100/55">{t("admin.allowAnonymousUsersSupabaseNote")}</p>
            </div>
        )}

        {activeTab === "bugReports" && (
            <div id="admin-panel-bugReports" role="tabpanel" aria-labelledby="admin-tab-bugReports" className="rounded-md border border-amber-700/40 bg-stone-950/45 p-3">
              <BugReportsPanel
                fetchWithAuth={fetchWithAuth}
                parseJsonResponse={parseJsonResponse}
                t={t}
                locale={locale}
                onCountsChange={setBugCounts}
              />
            </div>
        )}

        {activeTab === "users" && (
            <div id="admin-panel-users" role="tabpanel" aria-labelledby="admin-tab-users" className="space-y-3 rounded-md border border-amber-700/40 bg-stone-950/45 p-3">
              <form onSubmit={createUser} className="rounded-md border border-amber-700/35 bg-stone-950/45 p-3">
                <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_1fr_0.8fr_auto] lg:items-end">
                  <div>
                    <label htmlFor="admin-create-name" className="mb-1 block text-[11px] font-black uppercase tracking-wider text-amber-200/70">
                      {t("dashboard.options.name")}
                    </label>
                    <input
                      id="admin-create-name"
                      type="text"
                      value={newUserName}
                      onChange={(event) => setNewUserName(event.target.value)}
                      className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-sm text-amber-100 focus:border-amber-400 focus:outline-none"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-create-email" className="mb-1 block text-[11px] font-black uppercase tracking-wider text-amber-200/70">
                      {t("auth.register.email")}
                    </label>
                    <input
                      id="admin-create-email"
                      type="email"
                      value={newUserEmail}
                      onChange={(event) => setNewUserEmail(event.target.value)}
                      className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-sm text-amber-100 focus:border-amber-400 focus:outline-none"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-create-password" className="mb-1 block text-[11px] font-black uppercase tracking-wider text-amber-200/70">
                      {t("auth.register.password")}
                    </label>
                    <input
                      id="admin-create-password"
                      type="password"
                      value={newUserPassword}
                      onChange={(event) => setNewUserPassword(event.target.value)}
                      className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-sm text-amber-100 focus:border-amber-400 focus:outline-none"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-create-role" className="mb-1 block text-[11px] font-black uppercase tracking-wider text-amber-200/70">
                      {t("admin.role")}
                    </label>
                    <select
                      id="admin-create-role"
                      value={newUserRole}
                      onChange={(event) => setNewUserRole(event.target.value === "admin" ? "admin" : "user")}
                      className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-sm text-amber-100 focus:border-amber-400 focus:outline-none"
                    >
                      <option value="user">{t("admin.roleUser")}</option>
                      <option value="admin">{t("admin.roleAdmin")}</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="rounded-md border border-emerald-400/50 bg-emerald-950/60 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creatingUser ? t("admin.creating") : t("admin.create")}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-amber-100/75">
                    <input
                      type="checkbox"
                      checked={newUserMustChangePassword}
                      onChange={(event) => setNewUserMustChangePassword(event.target.checked)}
                      className="h-4 w-4 accent-amber-500"
                    />
                    {t("admin.requirePasswordChange")}
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-amber-100/75">
                    <input
                      type="checkbox"
                      checked={newUserGodMode}
                      onChange={(event) => setNewUserGodMode(event.target.checked)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                    {t("admin.godMode")}
                  </label>
                </div>
              </form>

              <div className="overflow-x-auto rounded-md border border-amber-700/35">
                <table className="min-w-full divide-y divide-amber-900/60 text-left text-sm">
                  <thead className="bg-stone-950/70 text-xs uppercase tracking-wider text-amber-200/70">
                    <tr>
                      <th className="px-3 py-2">{t("dashboard.options.name")}</th>
                      <th className="px-3 py-2">{t("auth.register.email")}</th>
                      <th className="px-3 py-2">{t("admin.role")}</th>
                      <th className="px-3 py-2">{t("admin.godMode")}</th>
                      <th className="px-3 py-2">{t("admin.colCreatedAt")}</th>
                      <th className="px-3 py-2">{t("dashboard.colLastLogin")}</th>
                      <th className="px-3 py-2">{t("admin.colGames")}</th>
                      <th className="px-3 py-2 text-right">{t("admin.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-900/35 bg-stone-950/35 text-amber-100/85">
                    {users.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 font-semibold">{item.name || t("admin.noName")}</td>
                        <td className="px-3 py-2">{item.email || "-"}</td>
                        <td className="px-3 py-2">
                          {item.role === "admin" ? t("admin.roleAdmin") : t("admin.roleUser")}
                          {item.mustChangePassword ? <span className="ml-2 text-xs text-amber-300">{t("admin.tempPassword")}</span> : null}
                        </td>
                        <td className="px-3 py-2">
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-100/75">
                            <input
                              type="checkbox"
                              checked={item.godModeEnabled}
                              onChange={(event) => updateUserGodMode(item, event.target.checked).catch(console.error)}
                              className="h-4 w-4 accent-emerald-500"
                              aria-label={t("admin.godModeFor", { name: item.name || item.email || item.id })}
                            />
                            {item.godModeEnabled ? t("common.yes") : t("common.no")}
                          </label>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatAdminDate(item.createdAt)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatAdminDate(item.lastSignInAt, "Jamais")}</td>
                        <td className="px-3 py-2">{item.gameCount}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={item.id === sessionUserId}
                            onClick={() => deleteUser(item).catch(console.error)}
                            className="rounded border border-red-400/50 bg-red-950/60 px-3 py-1 text-xs font-black uppercase tracking-wider text-red-100 transition hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {t("common.delete")}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-center italic text-amber-200/50">
                          {t("admin.noUsers")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
        )}

        {activeTab === "games" && (
            <div id="admin-panel-games" role="tabpanel" aria-labelledby="admin-tab-games" className="space-y-2 rounded-md border border-amber-700/40 bg-stone-950/45 p-3">
              {games.map((game) => (
                <div key={game.id} className="rounded-md border border-amber-700/40 bg-stone-950/55 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-bold text-amber-100">{game.name}</div>
                      <div className="text-xs uppercase tracking-wider text-amber-200/60">
                        {t("admin.gameMeta", {
                          status: game.status,
                          turn: game.turnNumber,
                          count: game.players.length,
                          max: game.maxPlayers,
                          w: game.mapWidth,
                          h: game.mapHeight,
                        })} - 🏆 {describeVictoryCondition(normalizeVictoryCondition(game.gameConfig?.victory), locale)}
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-amber-100/75 sm:grid-cols-2">
                        <div>
                          {t("admin.createdBy")} <span className="font-semibold text-amber-100">{adminPlayerName(game.createdBy, t)}</span>
                        </div>
                        <div>{t("admin.createdAt")} {formatAdminDate(game.createdAt)}</div>
                        <div>{t("admin.updatedAt")} {formatAdminDate(game.updatedAt)}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onObserveGame(game.id)}
                        className="rounded border border-cyan-400/50 bg-cyan-950/60 px-3 py-1 text-xs font-black uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-900"
                      >
                        {t("admin.observe")}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteGame(game).catch(console.error)}
                        className="rounded border border-red-400/50 bg-red-950/60 px-3 py-1 text-xs font-black uppercase tracking-wider text-red-100 transition hover:bg-red-900"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 rounded border border-amber-900/45 bg-black/25">
                    <div className="overflow-x-auto">
                      <div className="min-w-[760px]">
                        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-2 border-b border-amber-900/45 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-amber-200/55">
                          <div>{t("leaderboard.player")}</div>
                          <div>{t("dashboard.colFaction")}</div>
                          <div>{t("admin.joinedAt")}</div>
                          <div>{t("dashboard.colLastLogin")}</div>
                          <div>{t("dashboard.colStatus")}</div>
                        </div>
                        <div className="divide-y divide-amber-900/35">
                          {game.players.map((player) => (
                            <div
                              key={player.id}
                              className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-2 text-xs text-amber-100/80"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold text-amber-100">{adminPlayerName(player, t)}</span>
                                {player.email && !player.isAi ? <span className="ml-2 text-amber-200/45">{player.email}</span> : null}
                              </div>
                              <div>{factionLabel(player.faction, locale)}</div>
                              <div>{formatAdminDate(player.joinedAt)}</div>
                              <div>{player.isAi ? "-" : formatAdminDate(player.lastSignInAt, t("common.never"))}</div>
                              <div className={`font-semibold ${playerStatusClass(player.turnStatus)}`}>
                                {playerStatusLabel(player, locale)}
                              </div>
                            </div>
                          ))}
                          {game.players.length === 0 && (
                            <div className="px-3 py-4 text-center text-xs italic text-amber-200/50">
                              {t("dashboard.noPlayers")}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {games.length === 0 && (
                <div className="rounded-md border border-amber-700/35 bg-stone-950/35 px-3 py-6 text-center italic text-amber-200/50">
                  {t("admin.noGames")}
                </div>
              )}
            </div>
        )}

      </div>
    </div>
  );
}
