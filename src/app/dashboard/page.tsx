"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, getSupabaseAccessToken, signOutWithLocalFallback } from "@/lib/auth/client";
import { generateMap } from "@/lib/game/engine";
import {
  DEFAULT_RMG_TUNING,
  RmgTuning,
  normalizeRmgTuning,
} from "@/lib/game/engine/rmg-tuning";
import { listTemplatesForPlayers } from "@/lib/game/engine/template";
import { GameMap, type MapLevelId, type VictoryConditionType } from "@/lib/game/types";
import {
  DEFAULT_GOLD_TARGET,
  DEFAULT_TURN_LIMIT,
  describeVictoryCondition,
  normalizeVictoryCondition,
} from "@/lib/game/victory";
import { SURFACE_LEVEL, withActiveMapLayer } from "@/lib/game/map-levels";
import { createClient } from "@/lib/supabase/browser";
import { useGameStore } from "@/lib/stores/gameStore";
import { version as APP_VERSION } from "../../../package.json";
import {
  CornerOrnaments,
  FleurDeLis,
  OrnateHeader,
  ParchmentBackground,
  goldText,
  ornateFrame,
  ornateFramePolished,
} from "@/components/game/hud/theme";
import { GearIcon, SignOutIcon } from "./dashboardRmgControls";
import { MAP_SIZES, randomSeedValue, summarizeMap, turnTimerToSeconds, type TurnTimerUnit } from "./dashboardConstants";
import { factionLabel } from "./factionMeta";
import { useI18n } from "@/lib/i18n/I18nProvider";
import LanguageSelect from "@/components/i18n/LanguageSelect";
import type { TranslationKey } from "@/lib/i18n/translate";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";
import type { Locale } from "@/lib/i18n/types";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;
import { CreateGameWizard } from "./CreateGameWizard";
import { JoinGameWizard } from "./JoinGameWizard";
import { ChangelogModal } from "./ChangelogModal";
import { SupportFooter, SupportPromptModal, useSupportPrompt } from "./SupportKofi";
import { StatsPanel } from "./StatsPanel";
import { ReportBugModal, BugIcon } from "@/components/ReportBugModal";
import { Leaderboard } from "./Leaderboard";
import { RenderPerformanceWarning } from "./RenderPerformanceWarning";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

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

interface GameInfo {
  id: string;
  name: string;
  status: string;
  turnNumber: number;
  maxPlayers: number;
  mapWidth: number;
  mapHeight: number;
  createdAt?: string | null;
  gameConfig?: { victory?: unknown } | null;
  players: PlayerInfo[];
}

interface AdminGamePlayerInfo extends PlayerInfo {
  email?: string | null;
  joinedAt?: string | null;
  lastSignInAt?: string | null;
  turnStatus?: string | null;
}

interface AdminCreatorInfo {
  id: string;
  userId?: string | null;
  user?: { name: string | null; email?: string | null };
  email?: string | null;
  isAi?: boolean;
  aiName?: string | null;
}

interface OpenGame {
  id: string;
  name: string;
  maxPlayers: number;
  players: PlayerInfo[];
}

interface AdminUserInfo {
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

interface AdminGameInfo extends Omit<GameInfo, "players"> {
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: AdminCreatorInfo | null;
  players: AdminGamePlayerInfo[];
}


function formatAdminDate(value?: string | null, fallback = "-") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function buildVictoryPayload(type: VictoryConditionType, goldTarget: number, turnLimit: number) {
  if (type === "GOLD") return { type, goldTarget };
  if (type === "TURN_LIMIT") return { type, turnLimit };
  return { type };
}

function formatGameAge(value: string | null | undefined, now: number, t: TFn) {
  if (!value) return "-";
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return "-";

  const current = new Date(now);
  if (createdAt.getTime() > current.getTime()) return "moins d'une minute";

  let years = current.getFullYear() - createdAt.getFullYear();
  let months = current.getMonth() - createdAt.getMonth();
  let days = current.getDate() - createdAt.getDate();
  let hours = current.getHours() - createdAt.getHours();
  let minutes = current.getMinutes() - createdAt.getMinutes();

  if (minutes < 0) {
    minutes += 60;
    hours -= 1;
  }
  if (hours < 0) {
    hours += 24;
    days -= 1;
  }
  if (days < 0) {
    const previousMonth = new Date(current.getFullYear(), current.getMonth(), 0);
    days += previousMonth.getDate();
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(t(years > 1 ? "age.years" : "age.year", { n: years }));
  if (months > 0) parts.push(t("age.months", { n: months }));
  if (days > 0) parts.push(t(days > 1 ? "age.days" : "age.day", { n: days }));
  if (parts.length < 2 && hours > 0) parts.push(t(hours > 1 ? "age.hours" : "age.hour", { n: hours }));
  if (parts.length < 2 && minutes > 0) parts.push(t(minutes > 1 ? "age.minutes" : "age.minute", { n: minutes }));

  return parts.slice(0, 3).join(", ") || t("age.lessThanMinute");
}

function adminPlayerName(player: AdminCreatorInfo | null | undefined, t: TFn) {
  if (!player) return "-";
  if (player.isAi) return player.aiName || t("common.ai");
  return player.user?.name || player.email || player.user?.email || t("common.player");
}

function playerName(player: PlayerInfo | null | undefined, t: TFn) {
  if (!player) return "-";
  if (player.isAi) return player.aiName || t("common.ai");
  return player.user?.name || player.email || player.user?.email || t("common.player");
}

function playerStatusLabel(player: PlayerInfo, locale: Locale) {
  return localizedServerMessage(player.turnStatus, locale) || "-";
}

function playerStatusClass(status?: string | null) {
  if (status === "Doit jouer maintenant") return "text-emerald-300";
  if (status === "A fini son tour" || status === "Pret au lancement" || status === "Partie terminee") return "text-cyan-300";
  if (status === "Pas pret") return "text-red-300";
  return "text-amber-200/70";
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const { locale, setLocale, t } = useI18n();
  const { shouldShow: showSupportPrompt, dismiss: dismissSupportPrompt } = useSupportPrompt();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [openGames, setOpenGames] = useState<OpenGame[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [showJoin, setShowJoin] = useState(false);
  const [joinStep, setJoinStep] = useState<1 | 2>(1);
  const [showOptions, setShowOptions] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showRmgPreview, setShowRmgPreview] = useState(false);
  const [showRmgTuning, setShowRmgTuning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GameInfo | null>(null);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
  const [surrenderTarget, setSurrenderTarget] = useState<GameInfo | null>(null);
  const [surrenderingGameId, setSurrenderingGameId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileEmail, setProfileEmail] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [profilePasswordConfirm, setProfilePasswordConfirm] = useState("");
  const [profileMessage, setProfileMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [dashboardMessage, setDashboardMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserInfo[]>([]);
  const [adminGames, setAdminGames] = useState<AdminGameInfo[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [creatingAdminUser, setCreatingAdminUser] = useState(false);
  const [adminNewUserName, setAdminNewUserName] = useState("");
  const [adminNewUserEmail, setAdminNewUserEmail] = useState("");
  const [adminNewUserPassword, setAdminNewUserPassword] = useState("");
  const [adminNewUserRole, setAdminNewUserRole] = useState<"user" | "admin">("user");
  const [adminNewUserMustChangePassword, setAdminNewUserMustChangePassword] = useState(true);
  const [adminNewUserGodModeEnabled, setAdminNewUserGodModeEnabled] = useState(false);
  const [forcedPassword, setForcedPassword] = useState("");
  const [forcedPasswordConfirm, setForcedPasswordConfirm] = useState("");
  const [savingForcedPassword, setSavingForcedPassword] = useState(false);
  const [forcedPasswordError, setForcedPasswordError] = useState("");
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [selectedFaction, setSelectedFaction] = useState<string>("castle");
  const [gameName, setGameName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [mapSize, setMapSize] = useState<"S" | "M" | "L" | "XL">("M");
  const [seed, setSeed] = useState(() => randomSeedValue());
  const [templateId, setTemplateId] = useState<string>("auto");
  const [rmgTuning, setRmgTuning] = useState<RmgTuning>(DEFAULT_RMG_TUNING);
  const [undergroundEnabled, setUndergroundEnabled] = useState(false);
  const [victoryType, setVictoryType] = useState<VictoryConditionType>("KING");
  const [goldTarget, setGoldTarget] = useState(DEFAULT_GOLD_TARGET);
  const [turnLimit, setTurnLimit] = useState(DEFAULT_TURN_LIMIT);
  const [turnTimerEnabled, setTurnTimerEnabled] = useState(false);
  const [turnTimerValue, setTurnTimerValue] = useState(5);
  const [turnTimerUnit, setTurnTimerUnit] = useState<TurnTimerUnit>("minutes");
  const [previewLevel, setPreviewLevel] = useState<MapLevelId>(SURFACE_LEVEL);
  const [previewMap, setPreviewMap] = useState<GameMap | null>(null);
  const [previewGenerationProgress, setPreviewGenerationProgress] = useState(0);
  const [isPreviewGenerating, setIsPreviewGenerating] = useState(true);
  const router = useRouter();
  const templateOptions = useMemo(() => listTemplatesForPlayers(maxPlayers), [maxPlayers]);
  const selectedTemplateId = templateId !== "auto" && templateOptions.some((template) => template.id === templateId)
    ? templateId
    : "auto";
  const effectiveTemplateId = selectedTemplateId === "auto" ? undefined : selectedTemplateId;
  const normalizedRmgTuning = useMemo(() => normalizeRmgTuning(rmgTuning), [rmgTuning]);
  const previewGenerationOptions = useMemo(
    () => ({
      width: MAP_SIZES[mapSize],
      height: MAP_SIZES[mapSize],
      seed,
      playerCount: maxPlayers,
      templateId: effectiveTemplateId,
      tuning: normalizedRmgTuning,
      undergroundEnabled,
    }),
    [effectiveTemplateId, mapSize, maxPlayers, normalizedRmgTuning, seed, undergroundEnabled],
  );
  useEffect(() => {
    let cancelled = false;
    let progressTimer: number | null = null;
    let generationTimer: number | null = null;
    let completionTimer: number | null = null;

    const startTimer = window.setTimeout(() => {
      if (cancelled) return;

      setPreviewMap(null);
      setIsPreviewGenerating(true);
      setPreviewGenerationProgress(8);

      progressTimer = window.setInterval(() => {
        setPreviewGenerationProgress((current) => {
          if (current < 35) return Math.min(35, current + 9);
          if (current < 72) return Math.min(72, current + 6);
          return Math.min(90, current + 3);
        });
      }, 140);

      generationTimer = window.setTimeout(() => {
        const nextMap = generateMap(previewGenerationOptions);
        if (cancelled) return;

        if (progressTimer) window.clearInterval(progressTimer);
        setPreviewMap(nextMap);
        setPreviewGenerationProgress(100);

        completionTimer = window.setTimeout(() => {
          if (!cancelled) setIsPreviewGenerating(false);
        }, 120);
      }, 80);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (generationTimer) window.clearTimeout(generationTimer);
      if (completionTimer) window.clearTimeout(completionTimer);
      if (progressTimer) window.clearInterval(progressTimer);
    };
  }, [previewGenerationOptions]);
  const visiblePreviewMap = useMemo(
    () => previewMap ? withActiveMapLayer(previewMap, undergroundEnabled ? previewLevel : SURFACE_LEVEL) : null,
    [previewLevel, previewMap, undergroundEnabled],
  );
  const previewStats = useMemo(() => visiblePreviewMap ? summarizeMap(visiblePreviewMap) : null, [visiblePreviewMap]);
  const previewSeedLabel = previewMap?.seed ?? seed;
  const previewSizeLabel = visiblePreviewMap
    ? `${visiblePreviewMap.width}x${visiblePreviewMap.height}`
    : `${MAP_SIZES[mapSize]}x${MAP_SIZES[mapSize]}`;
  const previewTemplateLabel = previewMap?.templateId ?? selectedTemplateId;
  const isAdmin = session?.user?.role === "admin";
  const mustChangePassword = Boolean(session?.user?.mustChangePassword);
  const generateRandomSeed = () => {
    setSeed(randomSeedValue());
  };
  const updateRmgTuning = (key: keyof RmgTuning, value: number) => {
    setRmgTuning((current) => normalizeRmgTuning({ ...current, [key]: value }));
  };

  const signOut = async () => {
    setSigningOut(true);
    setDashboardMessage(null);

    const error = await signOutWithLocalFallback();

    if (error) {
      console.warn("Remote signOut failed; local session was cleared.", error);
    }

    useGameStore.getState().resetGame();
    router.replace("/auth/login");
  };

  const fetchWithAuth = useCallback(async (input: RequestInfo, init?: RequestInit) => {
    const token = await getSupabaseAccessToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "include" });
  }, []);

  const parseJsonResponse = useCallback(async (response: Response) => {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      console.error("Failed to parse JSON response:", text, error);
      return null;
    }
  }, []);

  const loadMyGames = useCallback(async () => {
    const response = await fetchWithAuth("/api/games", { cache: "no-store" });
    if (!response.ok) {
      const data = await parseJsonResponse(response);
      console.warn("loadMyGames failed", response.status, data);
      setGames([]);
      return;
    }

    const data = await parseJsonResponse(response);
    setGames(Array.isArray(data) ? data : []);
  }, [fetchWithAuth, parseJsonResponse]);

  const loadLeaderboard = useCallback(async () => {
    const response = await fetchWithAuth("/api/leaderboard", { cache: "no-store" });
    if (!response.ok) {
      console.warn("loadLeaderboard failed", response.status);
      setLeaderboard([]);
      return;
    }
    const data = await parseJsonResponse(response);
    setLeaderboard(Array.isArray(data) ? data : []);
  }, [fetchWithAuth, parseJsonResponse]);

  const loadOpenGames = useCallback(async () => {
    const response = await fetchWithAuth("/api/games/open", { cache: "no-store" });
    if (!response.ok) {
      console.warn("loadOpenGames failed", response.status);
      setOpenGames([]);
      return;
    }

    const data = await parseJsonResponse(response);
    setOpenGames(Array.isArray(data) ? data : []);
  }, [fetchWithAuth, parseJsonResponse]);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    setAdminMessage(null);
    const [usersResponse, gamesResponse] = await Promise.all([
      fetchWithAuth("/api/admin/users", { cache: "no-store" }),
      fetchWithAuth("/api/admin/games", { cache: "no-store" }),
    ]);

    if (!usersResponse.ok || !gamesResponse.ok) {
      const data = !usersResponse.ok
        ? await parseJsonResponse(usersResponse)
        : await parseJsonResponse(gamesResponse);
      setAdminMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("admin.loadFailed") });
      setAdminUsers([]);
      setAdminGames([]);
      setAdminLoading(false);
      return;
    }

    const usersData = await parseJsonResponse(usersResponse);
    const gamesData = await parseJsonResponse(gamesResponse);
    setAdminUsers(Array.isArray(usersData) ? usersData : []);
    setAdminGames(Array.isArray(gamesData) ? gamesData : []);
    setAdminLoading(false);
  }, [fetchWithAuth, isAdmin, parseJsonResponse, locale, t]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMyGames().catch(console.error);
    loadLeaderboard().catch(console.error);
  }, [loadMyGames, loadLeaderboard, status]);

  useEffect(() => {
    if (!showJoin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOpenGames().catch(() => setOpenGames([]));
    const interval = setInterval(() => {
      loadOpenGames().catch(() => setOpenGames([]));
    }, 3000);
    return () => clearInterval(interval);
  }, [loadOpenGames, showJoin]);

  useEffect(() => {
    if (!showAdmin || !isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAdminData().catch((error) => {
      console.error(error);
      setAdminMessage({ kind: "error", text: t("admin.loadFailed") });
      setAdminLoading(false);
    });
  }, [isAdmin, loadAdminData, showAdmin, t]);

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentTime(Date.now());
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [isAdmin]);

  const openOptions = () => {
    setProfileEmail(session?.user?.email ?? "");
    setProfileName(session?.user?.name ?? "");
    setProfilePassword("");
    setProfilePasswordConfirm("");
    setProfileMessage(null);
    setShowOptions(true);
    setShowAdmin(false);
    setShowStats(false);
    setShowCreate(false);
    setShowJoin(false);
    setShowRmgPreview(false);
  };

  const saveForcedPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPassword = forcedPassword.trim();
    setForcedPasswordError("");

    if (nextPassword.length < 6) {
      setForcedPasswordError(t("dashboard.pwMinLength"));
      return;
    }
    if (nextPassword === "ChangeMe") {
      setForcedPasswordError(t("dashboard.pwNotDefault"));
      return;
    }
    if (nextPassword !== forcedPasswordConfirm.trim()) {
      setForcedPasswordError(t("dashboard.options.passwordMismatch"));
      return;
    }

    setSavingForcedPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) {
      setForcedPasswordError(error.message || t("dashboard.pwChangeFailed"));
      setSavingForcedPassword(false);
      return;
    }

    const response = await fetchWithAuth("/api/auth/password-changed", { method: "POST" });
    if (!response.ok) {
      const data = await parseJsonResponse(response);
      setForcedPasswordError(localizedServerMessage(data?.error, locale) || t("dashboard.pwFinalizeFailed"));
      setSavingForcedPassword(false);
      return;
    }

    setForcedPassword("");
    setForcedPasswordConfirm("");
    setSavingForcedPassword(false);
    router.refresh();
    window.location.reload();
  };

  const deleteAdminUser = async (target: AdminUserInfo) => {
    if (!confirm(`Supprimer l'utilisateur ${target.name || target.email || target.id} ?`)) return;
    setAdminMessage(null);
    const response = await fetchWithAuth(`/api/admin/users?id=${encodeURIComponent(target.id)}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await parseJsonResponse(response);
      setAdminMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("admin.userDeleteFailed") });
      return;
    }
    setAdminMessage({ kind: "success", text: t("admin.userDeleted") });
    await loadAdminData();
  };

  const createAdminUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = adminNewUserName.trim();
    const email = adminNewUserEmail.trim();
    const password = adminNewUserPassword;
    setAdminMessage(null);

    if (!name || !email || !password) {
      setAdminMessage({ kind: "error", text: t("admin.fieldsRequired") });
      return;
    }
    if (password.length < 6) {
      setAdminMessage({ kind: "error", text: t("admin.passwordMinLength") });
      return;
    }

    setCreatingAdminUser(true);
    const response = await fetchWithAuth("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        role: adminNewUserRole,
        mustChangePassword: adminNewUserMustChangePassword,
        godModeEnabled: adminNewUserGodModeEnabled,
      }),
    });

    if (!response.ok) {
      const data = await parseJsonResponse(response);
      setAdminMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("admin.userCreateFailed") });
      setCreatingAdminUser(false);
      return;
    }

    setAdminNewUserName("");
    setAdminNewUserEmail("");
    setAdminNewUserPassword("");
    setAdminNewUserRole("user");
    setAdminNewUserMustChangePassword(true);
    setAdminNewUserGodModeEnabled(false);
    setAdminMessage({ kind: "success", text: t("admin.userCreated") });
    setCreatingAdminUser(false);
    await loadAdminData();
  };

  const updateAdminUserGodMode = async (target: AdminUserInfo, godModeEnabled: boolean) => {
    setAdminMessage(null);
    const response = await fetchWithAuth("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: target.id, godModeEnabled }),
    });

    if (!response.ok) {
      const data = await parseJsonResponse(response);
      setAdminMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("admin.godModeUpdateFailed") });
      return;
    }

    setAdminUsers((current) => current.map((item) => item.id === target.id ? { ...item, godModeEnabled } : item));
    setAdminMessage({ kind: "success", text: godModeEnabled ? t("admin.godModeEnabled") : t("admin.godModeDisabled") });
  };

  const deleteAdminGame = async (target: AdminGameInfo) => {
    if (!confirm(`Supprimer la partie ${target.name} ?`)) return;
    setAdminMessage(null);
    const response = await fetchWithAuth(`/api/admin/games?id=${encodeURIComponent(target.id)}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await parseJsonResponse(response);
      setAdminMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("admin.gameDeleteFailed") });
      return;
    }
    setAdminMessage({ kind: "success", text: t("admin.gameDeleted") });
    await Promise.all([loadAdminData(), loadMyGames()]);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.user) return;

    const nextEmail = profileEmail.trim();
    const nextName = profileName.trim();
    const nextPassword = profilePassword.trim();

    if (!nextEmail) {
      setProfileMessage({ kind: "error", text: t("dashboard.options.emailRequired") });
      return;
    }
    if (!nextName) {
      setProfileMessage({ kind: "error", text: t("dashboard.options.nameRequired") });
      return;
    }
    if (nextPassword && nextPassword !== profilePasswordConfirm.trim()) {
      setProfileMessage({ kind: "error", text: t("dashboard.options.passwordMismatch") });
      return;
    }

    setSavingProfile(true);
    setProfileMessage(null);

    const supabase = createClient();
    const authUpdates: {
      email?: string;
      password?: string;
      data?: { name: string };
    } = { data: { name: nextName } };

    if (nextEmail !== (session.user.email ?? "")) authUpdates.email = nextEmail;
    if (nextPassword) authUpdates.password = nextPassword;

    const { error: authError } = await supabase.auth.updateUser(authUpdates);
    if (authError) {
      setProfileMessage({ kind: "error", text: authError.message || t("dashboard.options.accountUpdateFailed") });
      setSavingProfile(false);
      return;
    }

    const profileResponse = await fetchWithAuth("/api/auth/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    });

    if (!profileResponse.ok) {
      const data = await parseJsonResponse(profileResponse);
      setProfileMessage({ kind: "error", text: localizedServerMessage(data?.error, locale) || t("dashboard.options.profileUpdateFailed") });
      setSavingProfile(false);
      return;
    }

    await loadMyGames();
    setProfilePassword("");
    setProfilePasswordConfirm("");
    setProfileMessage({
      kind: "success",
      text: nextEmail !== (session.user.email ?? "")
        ? t("dashboard.options.updatedWithEmail")
        : t("dashboard.options.updated"),
    });
    setSavingProfile(false);
    router.refresh();
  };

  const createGame = async () => {
    setCreating(true);
    useGameStore.getState().resetGame();
    const res = await fetchWithAuth("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: gameName || `Partie de ${session?.user?.name}`,
        maxPlayers,
        mapSize,
        seed,
        templateId: effectiveTemplateId,
        rmgTuning: normalizedRmgTuning,
        undergroundEnabled,
        victory: buildVictoryPayload(victoryType, goldTarget, turnLimit),
        turnTimeLimit: turnTimerEnabled ? turnTimerToSeconds(turnTimerValue, turnTimerUnit) : null,
        ...(isAdmin ? {} : { faction: selectedFaction }),
      }),
    });
    if (res.ok) {
      const game = await res.json();
      router.push(`/game/${game.id}${isAdmin ? "?admin=1" : ""}`);
    } else {
      const data = await parseJsonResponse(res);
      setDashboardMessage({
        kind: "error",
        text: localizedServerMessage(data?.error, locale) || t("dashboard.createGameFailed"),
      });
      console.warn("createGame failed", res.status, data);
    }
    setCreating(false);
  };

  const joinGame = async (gameId: string) => {
    useGameStore.getState().resetGame();
    const res = await fetchWithAuth(`/api/games/${gameId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faction: selectedFaction }),
    });
    if (res.ok) {
      router.push(`/game/${gameId}`);
    } else {
      const data = await res.json();
      alert(localizedServerMessage(data.error, locale) || t("dashboard.genericError"));
    }
  };

  const leaveGame = async (gameId: string) => {
    if (!confirm(t("dashboard.leaveConfirm"))) return;

    const response = await fetchWithAuth(`/api/games/${gameId}/leave`, {
      method: "POST",
    });

    if (!response.ok) {
      const data = await response.json();
      alert(localizedServerMessage(data.error, locale) || t("dashboard.leaveFailed"));
      return;
    }

    if (useGameStore.getState().gameState?.id === gameId) {
      useGameStore.getState().resetGame();
    }
    await loadMyGames();
    if (showJoin) await loadOpenGames();
  };

  const surrenderGame = async (game: GameInfo) => {
    setSurrenderingGameId(game.id);
    setDashboardMessage(null);

    const response = await fetchWithAuth(`/api/games/${game.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "SURRENDER_GAME" }),
    });

    if (!response.ok) {
      const data = await parseJsonResponse(response);
      setDashboardMessage({
        kind: "error",
        text: localizedServerMessage(data?.error, locale) || t("dashboard.surrenderError"),
      });
      setSurrenderTarget(null);
      setSurrenderingGameId(null);
      return;
    }

    await loadMyGames();
    if (isAdmin) await loadAdminData();
    setSurrenderTarget(null);
    setSurrenderingGameId(null);
    setDashboardMessage({
      kind: "success",
      text: t("dashboard.surrenderedMessage", { name: game.name }),
    });
  };

  const deleteGame = async (game: GameInfo) => {
    setDeletingGameId(game.id);
    setDashboardMessage(null);

    const response = await fetchWithAuth(`/api/games/${game.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await parseJsonResponse(response);
      setDashboardMessage({
        kind: "error",
        text: localizedServerMessage(data?.error, locale) || t("dashboard.deleteError"),
      });
      setDeleteTarget(null);
      setDeletingGameId(null);
      return;
    }

    if (useGameStore.getState().gameState?.id === game.id) {
      useGameStore.getState().resetGame();
    }
    await loadMyGames();
    if (showJoin) await loadOpenGames();
    if (isAdmin) await loadAdminData();
    setDeleteTarget(null);
    setDeletingGameId(null);
    setDashboardMessage({
      kind: "success",
      text: t("dashboard.deletedMessage", { name: game.name }),
    });
  };

  if (status === "loading") {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-stone-950 via-[#0e0904] to-stone-900">
        <DashboardBackgroundLayers />
        <div className={`relative z-10 text-xl font-black uppercase tracking-widest ${goldText}`}>{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-stone-950 via-[#0e0904] to-stone-900">
      <DashboardBackgroundLayers />
      <div className="relative z-10 mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <RenderPerformanceWarning />
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <FleurDeLis className="h-10 w-10 text-amber-400 drop-shadow" />
            <div>
              <h1 className={`text-3xl font-black tracking-[0.15em] sm:text-4xl ${goldText}`}>
                MY HEROES
                <button
                  type="button"
                  onClick={() => setShowChangelog(true)}
                  title={t("changelog.title")}
                  aria-label={t("changelog.button")}
                  className="ml-2 inline-block cursor-pointer rounded border border-amber-700/40 bg-stone-950/60 px-1.5 py-0.5 align-super text-xs font-semibold tracking-normal text-amber-200/60 transition hover:border-amber-400/60 hover:text-amber-100"
                >
                  v{APP_VERSION}
                </button>
              </h1>
              <p className="text-sm uppercase tracking-wider text-amber-200/70 mt-1">
                {t("dashboard.welcome", { name: session?.user?.name ?? "" })}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:gap-3">
            <button
              onClick={() => { setCreateStep(1); setShowCreate(true); setShowJoin(false); setShowOptions(false); setShowAdmin(false); setShowStats(false); setShowRmgPreview(false); }}
              className="touch-target rounded-lg border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-4 py-3 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700 sm:px-6"
            >
              {t("dashboard.newGame")}
            </button>
            <button
              onClick={() => { setJoinStep(1); setShowJoin(true); setShowCreate(false); setShowOptions(false); setShowAdmin(false); setShowStats(false); setShowRmgPreview(false); loadOpenGames().catch(() => setOpenGames([])); }}
              className="touch-target rounded-lg border border-emerald-400/60 bg-gradient-to-b from-emerald-600 to-emerald-800 px-4 py-3 font-black uppercase tracking-wider text-emerald-50 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.3)] transition hover:from-emerald-500 hover:to-emerald-700 sm:px-6"
            >
              {t("common.join")}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setShowAdmin((value) => !value);
                  setShowStats(false);
                  setShowCreate(false);
                  setShowJoin(false);
                  setShowOptions(false);
                  setShowRmgPreview(false);
                }}
                className="touch-target rounded-lg border border-cyan-400/60 bg-gradient-to-b from-cyan-700 to-cyan-900 px-4 py-3 font-black uppercase tracking-wider text-cyan-50 shadow-[inset_0_0_0_1px_rgba(165,243,252,0.2)] transition hover:from-cyan-600 hover:to-cyan-800 sm:px-5"
              >
                {t("dashboard.admin")}
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setShowStats((value) => !value);
                  setShowAdmin(false);
                  setShowCreate(false);
                  setShowJoin(false);
                  setShowOptions(false);
                  setShowRmgPreview(false);
                }}
                className="touch-target rounded-lg border border-violet-400/60 bg-gradient-to-b from-violet-700 to-violet-900 px-4 py-3 font-black uppercase tracking-wider text-violet-50 shadow-[inset_0_0_0_1px_rgba(196,181,253,0.2)] transition hover:from-violet-600 hover:to-violet-800 sm:px-5"
              >
                {t("dashboard.stats")}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowReport(true);
                setShowOptions(false);
                setShowAdmin(false);
                setShowStats(false);
                setShowCreate(false);
                setShowJoin(false);
                setShowRmgPreview(false);
              }}
              title={t("dashboard.report.button")}
              aria-label={t("dashboard.report.button")}
              className="touch-target flex h-12 w-full items-center justify-center rounded-lg border border-red-500/50 bg-stone-950/80 text-red-300/85 transition hover:border-red-400/70 hover:text-red-200 sm:w-12"
            >
              <BugIcon />
            </button>
            <button
              type="button"
              onClick={openOptions}
              title={t("dashboard.options.title")}
              aria-label={t("dashboard.options.title")}
              className="touch-target flex h-12 w-full items-center justify-center rounded-lg border border-amber-700/50 bg-stone-950/80 text-amber-200/80 transition hover:border-amber-400/60 hover:text-amber-100 sm:w-12"
            >
              <GearIcon />
            </button>
            <button
              type="button"
              onClick={() => signOut().catch((error) => {
                console.error(error);
                setDashboardMessage({ kind: "error", text: t("dashboard.signOutError") });
                setSigningOut(false);
              })}
              disabled={signingOut}
              title={signingOut ? t("dashboard.signingOut") : t("dashboard.signOut")}
              aria-label={signingOut ? t("dashboard.signingOut") : t("dashboard.signOut")}
              className="touch-target flex h-12 w-full items-center justify-center rounded-lg border border-amber-700/50 bg-stone-950/80 text-amber-200/80 transition hover:border-amber-400/60 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-12"
            >
              <SignOutIcon />
            </button>
          </div>
        </div>

        {mustChangePassword && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="forced-password-title"
              className={`relative ${ornateFramePolished} w-full max-w-lg p-4 sm:p-6`}
            >
              <CornerOrnaments />
              <ParchmentBackground />
              <h2 id="forced-password-title" className={`mb-3 text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>
                {t("dashboard.changePassword")}
              </h2>
              <p className="mb-4 text-sm leading-6 text-amber-100/80">
                {t("dashboard.changePasswordIntro")}
              </p>
              {forcedPasswordError && (
                <div className="mb-4 rounded-md border border-red-400/50 bg-red-950/45 px-4 py-3 text-sm font-semibold text-red-100">
                  {forcedPasswordError}
                </div>
              )}
              <form onSubmit={saveForcedPassword} className="space-y-4">
                <div>
                  <label htmlFor="forced-password" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                    {t("dashboard.options.newPassword")}
                  </label>
                  <input
                    id="forced-password"
                    type="password"
                    value={forcedPassword}
                    onChange={(event) => setForcedPassword(event.target.value)}
                    className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="forced-password-confirm" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                    {t("dashboard.options.confirmPassword")}
                  </label>
                  <input
                    id="forced-password-confirm"
                    type="password"
                    value={forcedPasswordConfirm}
                    onChange={(event) => setForcedPasswordConfirm(event.target.value)}
                    className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingForcedPassword}
                  className="w-full rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-6 py-2 font-black uppercase tracking-wider text-amber-50 transition hover:from-amber-500 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingForcedPassword ? t("dashboard.options.saving") : t("dashboard.options.save")}
                </button>
              </form>
            </div>
          </div>
        )}

        {showOptions && (
          <div
            className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
            onClick={() => {
              if (!savingProfile) setShowOptions(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="account-options-title"
              className={`relative ${ornateFramePolished} my-auto w-full max-w-2xl p-4 sm:p-6`}
              onClick={(event) => event.stopPropagation()}
            >
              <CornerOrnaments />
              <ParchmentBackground />
              <h2 id="account-options-title" className={`mb-4 text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>
                {t("dashboard.options.title")}
              </h2>

              {profileMessage && (
                <div
                  role="status"
                  className={`mb-4 rounded-md border px-4 py-3 text-sm font-semibold ${
                    profileMessage.kind === "success"
                      ? "border-emerald-400/50 bg-emerald-950/45 text-emerald-100"
                      : "border-red-400/50 bg-red-950/45 text-red-100"
                  }`}
                >
                  {profileMessage.text}
                </div>
              )}

              <form onSubmit={saveProfile} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="profile-name" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                      {t("dashboard.options.name")}
                    </label>
                    <input
                      id="profile-name"
                      type="text"
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                      className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-email" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                      {t("dashboard.options.email")}
                    </label>
                    <input
                      id="profile-email"
                      type="email"
                      value={profileEmail}
                      onChange={(event) => setProfileEmail(event.target.value)}
                      className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="profile-password" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                      {t("dashboard.options.newPassword")}
                    </label>
                    <input
                      id="profile-password"
                      type="password"
                      value={profilePassword}
                      onChange={(event) => setProfilePassword(event.target.value)}
                      className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-password-confirm" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                      {t("dashboard.options.confirmPassword")}
                    </label>
                    <input
                      id="profile-password-confirm"
                      type="password"
                      value={profilePasswordConfirm}
                      onChange={(event) => setProfilePasswordConfirm(event.target.value)}
                      className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none"
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                    {t("dashboard.options.language")}
                  </label>
                  <LanguageSelect value={locale} onChange={setLocale} />
                </div>

                <div className="flex flex-wrap justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={() => setShowOptions(false)}
                    className="rounded-md border border-amber-700/40 bg-stone-950/70 px-6 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("dashboard.options.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-6 py-2 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingProfile ? t("dashboard.options.saving") : t("dashboard.options.save")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}

        {showReport && (
          <ReportBugModal
            onClose={() => setShowReport(false)}
            fetchWithAuth={fetchWithAuth}
            t={t}
            locale={locale}
            appVersion={APP_VERSION}
          />
        )}

        {showStats && isAdmin && (
          <StatsPanel
            fetchWithAuth={fetchWithAuth}
            parseJsonResponse={parseJsonResponse}
            t={t}
            locale={locale}
            onClose={() => setShowStats(false)}
          />
        )}

        {/* Assistant de création de partie */}
        {showCreate && (
          <CreateGameWizard
            step={createStep}
            onStepChange={setCreateStep}
            isAdmin={isAdmin}
            userName={session?.user?.name}
            gameName={gameName}
            setGameName={setGameName}
            maxPlayers={maxPlayers}
            setMaxPlayers={setMaxPlayers}
            mapSize={mapSize}
            setMapSize={setMapSize}
            seed={seed}
            setSeed={setSeed}
            selectedTemplateId={selectedTemplateId}
            setTemplateId={setTemplateId}
            templateOptions={templateOptions}
            normalizedRmgTuning={normalizedRmgTuning}
            updateRmgTuning={updateRmgTuning}
            undergroundEnabled={undergroundEnabled}
            setUndergroundEnabled={setUndergroundEnabled}
            victoryType={victoryType}
            setVictoryType={setVictoryType}
            goldTarget={goldTarget}
            setGoldTarget={setGoldTarget}
            turnLimit={turnLimit}
            setTurnLimit={setTurnLimit}
            turnTimerEnabled={turnTimerEnabled}
            setTurnTimerEnabled={setTurnTimerEnabled}
            turnTimerValue={turnTimerValue}
            setTurnTimerValue={setTurnTimerValue}
            turnTimerUnit={turnTimerUnit}
            setTurnTimerUnit={setTurnTimerUnit}
            showRmgTuning={showRmgTuning}
            setShowRmgTuning={setShowRmgTuning}
            showRmgPreview={showRmgPreview}
            setShowRmgPreview={setShowRmgPreview}
            previewLevel={previewLevel}
            setPreviewLevel={setPreviewLevel}
            generateRandomSeed={generateRandomSeed}
            isPreviewGenerating={isPreviewGenerating}
            visiblePreviewMap={visiblePreviewMap}
            previewStats={previewStats}
            previewGenerationProgress={previewGenerationProgress}
            previewSeedLabel={previewSeedLabel}
            previewSizeLabel={previewSizeLabel}
            previewTemplateLabel={previewTemplateLabel}
            selectedFaction={selectedFaction}
            setSelectedFaction={setSelectedFaction}
            creating={creating}
            onCreate={createGame}
            onClose={() => { setShowCreate(false); setShowRmgPreview(false); }}
          />
        )}

        {/* Assistant pour rejoindre une partie */}
        {showJoin && (
          <JoinGameWizard
            step={joinStep}
            onStepChange={setJoinStep}
            selectedFaction={selectedFaction}
            onSelectFaction={setSelectedFaction}
            openGames={openGames}
            onJoin={joinGame}
            onRefresh={() => loadOpenGames().catch(() => setOpenGames([]))}
            onClose={() => setShowJoin(false)}
          />
        )}

        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
            onClick={() => {
              if (!deletingGameId) setDeleteTarget(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-game-title"
              className={`relative ${ornateFramePolished} w-full max-w-lg p-4 sm:p-6`}
              onClick={(event) => event.stopPropagation()}
            >
              <CornerOrnaments />
              <ParchmentBackground />
              <h2 id="delete-game-title" className={`mb-3 text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>
                {t("dashboard.deleteTitle")}
              </h2>
              <p className="text-sm leading-6 text-amber-100/85">
                {t("dashboard.deleteConfirmPrefix")}<span className="font-black text-amber-100">{deleteTarget.name}</span>{t("dashboard.deleteConfirmSuffix")}
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  disabled={deletingGameId === deleteTarget.id}
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-md border border-amber-700/40 bg-stone-950/70 px-5 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={deletingGameId === deleteTarget.id}
                  onClick={() => deleteGame(deleteTarget).catch((error) => {
                    console.error(error);
                    setDashboardMessage({ kind: "error", text: t("dashboard.deleteError") });
                    setDeleteTarget(null);
                    setDeletingGameId(null);
                  })}
                  className="rounded-md border border-red-400/60 bg-gradient-to-b from-red-700 to-red-900 px-5 py-2 text-sm font-black uppercase tracking-wider text-red-50 shadow-[inset_0_0_0_1px_rgba(254,202,202,0.2)] transition hover:from-red-600 hover:to-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingGameId === deleteTarget.id ? t("dashboard.deleting") : t("common.delete")}
                </button>
              </div>
            </div>
          </div>
        )}

        {surrenderTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
            onClick={() => {
              if (!surrenderingGameId) setSurrenderTarget(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="surrender-game-title"
              className={`relative ${ornateFramePolished} w-full max-w-lg p-4 sm:p-6`}
              onClick={(event) => event.stopPropagation()}
            >
              <CornerOrnaments />
              <ParchmentBackground />
              <h2 id="surrender-game-title" className={`mb-3 text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>
                {t("dashboard.surrenderTitle")}
              </h2>
              <p className="text-sm leading-6 text-amber-100/85">
                {t("dashboard.surrenderConfirmPrefix")}<span className="font-black text-amber-100">{surrenderTarget.name}</span>{t("dashboard.surrenderConfirmSuffix")}
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  disabled={surrenderingGameId === surrenderTarget.id}
                  onClick={() => setSurrenderTarget(null)}
                  className="rounded-md border border-amber-700/40 bg-stone-950/70 px-5 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={surrenderingGameId === surrenderTarget.id}
                  onClick={() => surrenderGame(surrenderTarget).catch((error) => {
                    console.error(error);
                    setDashboardMessage({ kind: "error", text: t("dashboard.surrenderError") });
                    setSurrenderTarget(null);
                    setSurrenderingGameId(null);
                  })}
                  className="rounded-md border border-red-400/60 bg-gradient-to-b from-red-700 to-red-900 px-5 py-2 text-sm font-black uppercase tracking-wider text-red-50 shadow-[inset_0_0_0_1px_rgba(254,202,202,0.2)] transition hover:from-red-600 hover:to-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {surrenderingGameId === surrenderTarget.id ? t("dashboard.surrendering") : t("common.surrender")}
                </button>
              </div>
            </div>
          </div>
        )}

        {showAdmin && isAdmin && (
          <div
            className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
            onClick={() => setShowAdmin(false)}
          >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-panel-title"
            className={`relative ${ornateFramePolished} my-auto w-full max-w-6xl p-4 sm:p-6`}
            data-testid="admin-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <CornerOrnaments />
            <ParchmentBackground />
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="admin-panel-title" className={`text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>
                {t("admin.title")}
              </h2>
              <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadAdminData().catch(console.error)}
                disabled={adminLoading}
                className="rounded-md border border-cyan-400/50 bg-cyan-950/50 px-4 py-2 text-xs font-black uppercase tracking-wider text-cyan-100 transition hover:border-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {adminLoading ? t("common.loading") : t("admin.refresh")}
              </button>
              <button
                type="button"
                onClick={() => setShowAdmin(false)}
                className="rounded-md border border-amber-700/40 bg-stone-950/70 px-4 py-2 text-xs font-black uppercase tracking-wider text-amber-200/80 transition hover:border-amber-500/60 hover:text-amber-100"
              >
                {t("common.close")}
              </button>
              </div>
            </div>
            <div className="max-h-[calc(100dvh-10rem)] space-y-6 overflow-y-auto pr-1">
              {adminMessage && (
                <div
                  role="status"
                  className={`rounded-md border px-4 py-3 text-sm font-semibold ${
                    adminMessage.kind === "success"
                      ? "border-emerald-400/50 bg-emerald-950/45 text-emerald-100"
                      : "border-red-400/50 bg-red-950/45 text-red-100"
                  }`}
                >
                  {adminMessage.text}
                </div>
              )}

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-amber-100">{t("admin.users")}</h3>
                </div>
                <form
                  onSubmit={createAdminUser}
                  className="mb-4 rounded-md border border-amber-700/35 bg-stone-950/45 p-3"
                >
                  <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_1fr_0.8fr_auto] lg:items-end">
                    <div>
                      <label htmlFor="admin-create-name" className="mb-1 block text-[11px] font-black uppercase tracking-wider text-amber-200/70">
                        {t("dashboard.options.name")}
                      </label>
                      <input
                        id="admin-create-name"
                        type="text"
                        value={adminNewUserName}
                        onChange={(event) => setAdminNewUserName(event.target.value)}
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
                        value={adminNewUserEmail}
                        onChange={(event) => setAdminNewUserEmail(event.target.value)}
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
                        value={adminNewUserPassword}
                        onChange={(event) => setAdminNewUserPassword(event.target.value)}
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
                        value={adminNewUserRole}
                        onChange={(event) => setAdminNewUserRole(event.target.value === "admin" ? "admin" : "user")}
                        className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-sm text-amber-100 focus:border-amber-400 focus:outline-none"
                      >
                        <option value="user">{t("admin.roleUser")}</option>
                        <option value="admin">{t("admin.roleAdmin")}</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={creatingAdminUser}
                      className="rounded-md border border-emerald-400/50 bg-emerald-950/60 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingAdminUser ? t("admin.creating") : t("admin.create")}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs font-semibold text-amber-100/75">
                      <input
                        type="checkbox"
                        checked={adminNewUserMustChangePassword}
                        onChange={(event) => setAdminNewUserMustChangePassword(event.target.checked)}
                        className="h-4 w-4 accent-amber-500"
                      />
                      {t("admin.requirePasswordChange")}
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-amber-100/75">
                      <input
                        type="checkbox"
                        checked={adminNewUserGodModeEnabled}
                        onChange={(event) => setAdminNewUserGodModeEnabled(event.target.checked)}
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
                      {adminUsers.map((item) => (
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
                                onChange={(event) => updateAdminUserGodMode(item, event.target.checked).catch(console.error)}
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
                              disabled={item.id === session?.user?.id}
                              onClick={() => deleteAdminUser(item).catch(console.error)}
                              className="rounded border border-red-400/50 bg-red-950/60 px-3 py-1 text-xs font-black uppercase tracking-wider text-red-100 transition hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {t("common.delete")}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {adminUsers.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-3 py-6 text-center italic text-amber-200/50">
                            {t("admin.noUsers")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-amber-100">{t("admin.games")}</h3>
                <div className="space-y-2">
                  {adminGames.map((game) => (
                    <div key={game.id} className="rounded-md border border-amber-700/40 bg-stone-950/55 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-bold text-amber-100">{game.name}</div>
                          <div className="text-xs uppercase tracking-wider text-amber-200/60">
                            {t("admin.gameMeta", { status: game.status, turn: game.turnNumber, count: game.players.length, max: game.maxPlayers, w: game.mapWidth, h: game.mapHeight })} - 🏆 {describeVictoryCondition(normalizeVictoryCondition(game.gameConfig?.victory), locale)}
                          </div>
                          <div className="mt-2 grid gap-1 text-xs text-amber-100/75 sm:grid-cols-2">
                            <div>{t("admin.createdBy")} <span className="font-semibold text-amber-100">{adminPlayerName(game.createdBy, t)}</span></div>
                            <div>{t("admin.createdAt")} {formatAdminDate(game.createdAt)}</div>
                            <div>{t("admin.updatedAt")} {formatAdminDate(game.updatedAt)}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => router.push(`/game/${game.id}?admin=1`)}
                            className="rounded border border-cyan-400/50 bg-cyan-950/60 px-3 py-1 text-xs font-black uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-900"
                          >
                            {t("admin.observe")}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAdminGame(game).catch(console.error)}
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
                                <div key={player.id} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-2 text-xs text-amber-100/80">
                                  <div className="min-w-0">
                                    <span className="font-semibold text-amber-100">{adminPlayerName(player, t)}</span>
                                    {player.email && !player.isAi ? <span className="ml-2 text-amber-200/45">{player.email}</span> : null}
                                  </div>
                                  <div>{factionLabel(player.faction, locale)}</div>
                                  <div>{formatAdminDate(player.joinedAt)}</div>
                                  <div>{player.isAi ? "-" : formatAdminDate(player.lastSignInAt, t("common.never"))}</div>
                                  <div className={`font-semibold ${playerStatusClass(player.turnStatus)}`}>{playerStatusLabel(player, locale)}</div>
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
                  {adminGames.length === 0 && (
                    <div className="rounded-md border border-amber-700/35 bg-stone-950/35 px-3 py-6 text-center italic text-amber-200/50">
                      {t("admin.noGames")}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
          </div>
        )}

        {/* Mes parties */}
        <div className={`relative ${ornateFrame}`}>
          <CornerOrnaments />
          <ParchmentBackground />
          <OrnateHeader>{t("dashboard.myGames")}</OrnateHeader>
          <div className="space-y-3 p-4">
            {dashboardMessage && (
              <div
                role="status"
                className={`rounded-md border px-4 py-3 text-sm font-semibold ${
                  dashboardMessage.kind === "success"
                    ? "border-emerald-400/50 bg-emerald-950/45 text-emerald-100"
                    : "border-red-400/50 bg-red-950/45 text-red-100"
                }`}
              >
                {dashboardMessage.text}
              </div>
            )}
            {games.length === 0 && (
              <div className="py-12 text-center italic text-amber-200/40">
                {t("dashboard.noGames")}
              </div>
            )}
            {games.length > 0 && (
            // Show roughly the 3 most recent games (already ordered newest-first
            // by the API); older games stay reachable by scrolling.
            <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
            {games.map((game) => {
              const myPlayer = game.players.find(
                (player) => player.userId === session?.user?.id
              );
              const isHost = myPlayer?.turnOrder === 0;
              const statusLabel =
                game.status === "PENDING" ? t("status.pending") :
                game.status === "ACTIVE" ? t("status.active") :
                game.status === "COMPLETED" ? t("status.completed") : game.status;
              const statusColor =
                game.status === "ACTIVE" ? "text-emerald-300" :
                game.status === "PENDING" ? "text-amber-300" :
                game.status === "COMPLETED" ? "text-cyan-300" : "text-stone-400";

              return (
              <div
                key={game.id}
                className="cursor-pointer rounded-lg border border-amber-700/40 bg-gradient-to-b from-stone-900/80 to-black/60 p-4 transition hover:border-amber-400/60 hover:shadow-[inset_0_0_0_1px_rgba(252,211,77,0.15)]"
                onClick={() => router.push(`/game/${game.id}${isAdmin ? "?admin=1" : ""}`)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`text-lg font-black ${goldText}`}>{game.name}</h3>
                    <div className="mt-1 text-xs uppercase tracking-wider text-amber-200/70">
                      {t("dashboard.turn", { n: game.turnNumber })} <span className="mx-1 text-amber-700">◆</span>
                      <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
                      <span className="mx-1 text-amber-700">◆</span>
                      {game.mapWidth}×{game.mapHeight}
                      <span className="mx-1 text-amber-700">◆</span>
                      🏆 {describeVictoryCondition(normalizeVictoryCondition(game.gameConfig?.victory), locale)}
                      {isAdmin && (
                        <>
                          <span className="mx-1 text-amber-700">◆</span>
                          {t("admin.age")} {currentTime === null ? "-" : formatGameAge(game.createdAt, currentTime, t)}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wider text-amber-200/60">
                      {game.players.length}/{game.maxPlayers}
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      {game.status === "ACTIVE" && myPlayer?.isAlive && (
                        <button
                          className="rounded-md border border-amber-700/40 bg-stone-950/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-200/80 transition hover:border-red-400/60 hover:bg-red-950/40 hover:text-red-200"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDashboardMessage(null);
                            setSurrenderTarget(game);
                          }}
                        >
                          {t("common.surrender")}
                        </button>
                      )}
                      {isAdmin || isHost ? (
                        <button
                          className="rounded-md border border-red-400/60 bg-gradient-to-b from-red-700 to-red-900 px-3 py-1 text-xs font-black uppercase tracking-wider text-red-50 shadow-[inset_0_0_0_1px_rgba(254,202,202,0.2)] transition hover:from-red-600 hover:to-red-800"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDashboardMessage(null);
                            setDeleteTarget(game);
                          }}
                        >
                          {t("common.delete")}
                        </button>
                      ) : game.status === "PENDING" ? (
                        <button
                          className="rounded-md border border-amber-700/40 bg-stone-950/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-200/80 transition hover:border-amber-500/60 hover:text-amber-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            leaveGame(game.id).catch(console.error);
                          }}
                        >
                          {t("common.leave")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 rounded border border-amber-900/45 bg-black/25">
                  <div className="overflow-x-auto">
                    <div className="min-w-[620px]">
                      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 border-b border-amber-900/45 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-amber-200/55">
                        <div>{t("dashboard.colUsername")}</div>
                        <div>{t("dashboard.colFaction")}</div>
                        <div>{t("dashboard.colLastLogin")}</div>
                        <div>{t("dashboard.colStatus")}</div>
                      </div>
                      <div className="divide-y divide-amber-900/35">
                        {game.players.map((player) => {
                          const status = playerStatusLabel(player, locale);
                          return (
                            <div key={player.id} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 px-3 py-2 text-xs text-amber-100/80">
                              <div className="min-w-0 font-semibold text-amber-100">{playerName(player, t)}</div>
                              <div>{factionLabel(player.faction, locale)}</div>
                              <div>{player.isAi ? "-" : formatAdminDate(player.lastSignInAt, t("common.never"))}</div>
                              <div className={`font-semibold ${playerStatusClass(player.turnStatus)}`}>{status}</div>
                            </div>
                          );
                        })}
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
              );
            })}
            </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <Leaderboard entries={leaderboard} />
        </div>

        <div className="mt-8 flex justify-center pb-2">
          <SupportFooter t={t} />
        </div>
      </div>

      {showSupportPrompt && (
        <SupportPromptModal t={t} onClose={dismissSupportPrompt} />
      )}
    </div>
  );
}

function DashboardBackgroundLayers() {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(245,158,11,0.12), transparent 36%), linear-gradient(45deg, rgba(16,185,129,0.10), transparent 42%), url('/assets/textures/terrain/mountain/mountain-dark-rock.webp')",
          backgroundSize: "auto, auto, 220px 220px",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.7),rgba(0,0,0,0.18)_44%,rgba(0,0,0,0.72))]"
      />
    </>
  );
}
