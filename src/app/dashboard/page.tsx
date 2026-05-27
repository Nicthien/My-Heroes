"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { RmgMapPreview, OBJECT_COLOR, TERRAIN_COLOR } from "@/components/game/map/RmgMapPreview";
import { useSession, getSupabaseAccessToken, signOutWithLocalFallback } from "@/lib/auth/client";
import { CREATURE_GROUPS } from "@/lib/game/creature-catalog";
import { generateMap } from "@/lib/game/engine";
import {
  DEFAULT_RMG_TUNING,
  RmgTuning,
  normalizeRmgTuning,
} from "@/lib/game/engine/rmg-tuning";
import { listTemplatesForPlayers } from "@/lib/game/engine/template";
import { GameMap, TerrainType } from "@/lib/game/types";
import { createClient } from "@/lib/supabase/browser";
import { useGameStore } from "@/lib/stores/gameStore";
import {
  CornerOrnaments,
  FleurDeLis,
  OrnateHeader,
  ParchmentBackground,
  goldText,
  ornateFrame,
  ornateFramePolished,
} from "@/components/game/hud/theme";

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

type FactionAlignment = "good" | "evil" | "barbarian";

const FACTION_META: Record<
  string,
  { label: string; color: string; alignment: FactionAlignment; tagline: string; desc: string; emblem: string }
> = {
  castle: {
    label: "Château",
    color: "#3b82f6",
    alignment: "good",
    emblem: "♔",
    tagline: "Nobles humains & créatures célestes",
    desc: "Piquiers, archers, griffons, croisés, cavaliers et anges combattent au nom de la lumière.",
  },
  rampart: {
    label: "Rempart",
    color: "#22c55e",
    alignment: "good",
    emblem: "🌳",
    tagline: "Elfes, nains et dragons",
    desc: "Nains, elfes archers, pégases, druides, licornes et dragons d'or veillent sur la forêt.",
  },
  tower: {
    label: "Tour",
    color: "#8b5cf6",
    alignment: "good",
    emblem: "✦",
    tagline: "Créatures liées à la magie",
    desc: "Gremlins, golems, mages, génies et titans : la science arcanique au service du bien.",
  },
  inferno: {
    label: "Hadès",
    color: "#ef4444",
    alignment: "evil",
    emblem: "🔥",
    tagline: "La ville des démons et des diables",
    desc: "Lutins, gogs, cerbères, démons, magogs et diables surgis des Enfers.",
  },
  necropolis: {
    label: "Nécropole",
    color: "#6b7280",
    alignment: "evil",
    emblem: "☠",
    tagline: "Morts-vivants et fantômes",
    desc: "Squelettes, zombies, fantômes, vampires, liches et dragons-os ressuscités.",
  },
  dungeon: {
    label: "Donjon",
    color: "#7c3aed",
    alignment: "evil",
    emblem: "✸",
    tagline: "Créatures maléfiques des profondeurs",
    desc: "Troglodytes, harpies, gorgones, minotaures, manticores et dragons noirs.",
  },
  stronghold: {
    label: "Bastion",
    color: "#f97316",
    alignment: "barbarian",
    emblem: "⚔",
    tagline: "Adeptes de la force brute",
    desc: "Gobelins, orcs, ogres, rocs, cyclopes et puissants béhémoths.",
  },
  fortress: {
    label: "Forteresse",
    color: "#059669",
    alignment: "barbarian",
    emblem: "🐍",
    tagline: "Poison, marécages et écailles",
    desc: "Gnolls, hommes-lézards, mouches dragons, basilics, gorgones et hydres venimeuses.",
  },
};

const ALIGNMENT_GROUPS: { key: FactionAlignment; label: string; accent: string }[] = [
  { key: "good", label: "Les bons", accent: "text-sky-200" },
  { key: "evil", label: "Les mauvais", accent: "text-rose-200" },
  { key: "barbarian", label: "Les barbares", accent: "text-orange-200" },
];

const FACTION_FIRST_UNIT: Record<string, string | undefined> = Object.fromEntries(
  CREATURE_GROUPS.map((group) => [group.key, group.units[0]]),
);

const MAP_SIZES = {
  S: 36,
  M: 72,
  L: 108,
  XL: 144,
} as const;

const RMG_TUNING_CONTROLS: {
  key: keyof RmgTuning;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "resourceBudgetPercent", label: "Budget de ressources", min: 25, max: 250, step: 5 },
  { key: "buildingPercent", label: "B\u00e2timents \u00e9conomiques", min: 0, max: 250, step: 5 },
  { key: "looseResourcePercent", label: "Ressources libres", min: 0, max: 300, step: 5 },
  { key: "monsterPercent", label: "Monstres gardiens", min: 0, max: 250, step: 5 },
  { key: "adventurePercent", label: "B\u00e2timents d'aventure", min: 0, max: 250, step: 5 },
];

function factionLabel(faction: string) {
  return FACTION_META[faction]?.label ?? faction;
}

function FactionPicker({
  selectedFaction,
  onSelect,
}: {
  selectedFaction: string;
  onSelect: (faction: string) => void;
}) {
  return (
    <div className="mb-4 space-y-3">
      {ALIGNMENT_GROUPS.map((group) => (
        <div key={group.key}>
          <div className={`mb-1 text-[11px] font-bold uppercase tracking-[0.2em] ${group.accent}`}>{group.label}</div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(FACTION_META)
              .filter(([, m]) => m.alignment === group.key)
              .map(([key, meta]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(key)}
                  className={`rounded-lg border p-3 text-left transition ${
                    selectedFaction === key
                      ? "border-amber-400 bg-amber-900/30 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)]"
                      : "border-amber-700/30 bg-stone-950/60 hover:border-amber-500/50 hover:bg-amber-900/15"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <Image
                        src={`/assets/sprites/map/town-${key}.webp`}
                        alt=""
                        aria-hidden
                        width={56}
                        height={56}
                        unoptimized
                        className="h-14 w-14 rounded-md object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
                        style={{ imageRendering: "pixelated" }}
                      />
                      {FACTION_FIRST_UNIT[key] && (
                        <Image
                          src={`/assets/sprites/units/${FACTION_FIRST_UNIT[key]}.webp`}
                          alt=""
                          aria-hidden
                          width={48}
                          height={48}
                          unoptimized
                          className="h-12 w-12 rounded-md object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
                          style={{ imageRendering: "pixelated" }}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base" aria-hidden>{meta.emblem}</span>
                        <div className="h-3 w-3 rounded-full ring-1 ring-amber-200/40" style={{ backgroundColor: meta.color }} />
                        <span className="text-sm font-bold text-amber-100">{meta.label}</span>
                      </div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-amber-200/70">{meta.tagline}</div>
                      <div className="mt-1 text-xs leading-snug text-amber-200/60">{meta.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function randomSeedValue() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let i = 0; i < 8; i++) value += chars[Math.floor(Math.random() * chars.length)];
  return value;
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

function formatGameAge(value?: string | null, now = Date.now()) {
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
  if (years > 0) parts.push(`${years} ${years > 1 ? "ans" : "an"}`);
  if (months > 0) parts.push(`${months} mois`);
  if (days > 0) parts.push(`${days} ${days > 1 ? "jours" : "jour"}`);
  if (parts.length < 2 && hours > 0) parts.push(`${hours} ${hours > 1 ? "heures" : "heure"}`);
  if (parts.length < 2 && minutes > 0) parts.push(`${minutes} ${minutes > 1 ? "minutes" : "minute"}`);

  return parts.slice(0, 3).join(", ") || "moins d'une minute";
}

function adminPlayerName(player?: AdminCreatorInfo | null) {
  if (!player) return "-";
  if (player.isAi) return player.aiName || "IA";
  return player.user?.name || player.email || player.user?.email || "Joueur";
}

function playerName(player?: PlayerInfo | null) {
  if (!player) return "-";
  if (player.isAi) return player.aiName || "IA";
  return player.user?.name || player.email || player.user?.email || "Joueur";
}

function playerStatusLabel(player: PlayerInfo) {
  return player.turnStatus || "-";
}

function playerStatusClass(status?: string | null) {
  if (status === "Doit jouer maintenant") return "text-emerald-300";
  if (status === "A fini son tour" || status === "Pret au lancement" || status === "Partie terminee") return "text-cyan-300";
  if (status === "Pas pret") return "text-red-300";
  return "text-amber-200/70";
}

function RmgTuningSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-md border border-amber-700/30 bg-stone-950/55 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-100">{label}</span>
        <span className="rounded border border-amber-700/40 bg-black/40 px-2 py-1 text-xs font-black text-amber-200">
          {value}%
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-amber-500"
      />
    </label>
  );
}

function GearIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66V21a2 2 0 1 1-4 0v-.09A1.8 1.8 0 0 0 8.7 19.25a1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.8 1.8 0 0 0 4.25 15a1.8 1.8 0 0 0-1.66-1.1H2.5a2 2 0 1 1 0-4h.09A1.8 1.8 0 0 0 4.25 8.8a1.8 1.8 0 0 0-.36-1.98l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.8 1.8 0 0 0 8.7 4.35a1.8 1.8 0 0 0 1.1-1.66V2.6a2 2 0 1 1 4 0v.09a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.66 1.1h.09a2 2 0 1 1 0 4h-.09A1.8 1.8 0 0 0 19.4 15Z" />
    </svg>
  );
}

function SignOutIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 19V5a2 2 0 0 0-2-2h-5" />
      <path d="M14 21h5a2 2 0 0 0 2-2" />
    </svg>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [openGames, setOpenGames] = useState<OpenGame[]>([]);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showRmgPreview, setShowRmgPreview] = useState(false);
  const [showRmgTuning, setShowRmgTuning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GameInfo | null>(null);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
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
  const router = useRouter();
  const templateOptions = useMemo(() => listTemplatesForPlayers(maxPlayers), [maxPlayers]);
  const selectedTemplateId = templateId !== "auto" && templateOptions.some((template) => template.id === templateId)
    ? templateId
    : "auto";
  const effectiveTemplateId = selectedTemplateId === "auto" ? undefined : selectedTemplateId;
  const normalizedRmgTuning = useMemo(() => normalizeRmgTuning(rmgTuning), [rmgTuning]);
  const previewMap = useMemo(
    () =>
      generateMap({
        width: MAP_SIZES[mapSize],
        height: MAP_SIZES[mapSize],
        seed,
        playerCount: maxPlayers,
        templateId: effectiveTemplateId,
        tuning: normalizedRmgTuning,
      }),
    [effectiveTemplateId, mapSize, maxPlayers, normalizedRmgTuning, seed],
  );
  const previewStats = useMemo(() => summarizeMap(previewMap), [previewMap]);
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
      setAdminMessage({ kind: "error", text: data?.error || "Impossible de charger l'administration." });
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
  }, [fetchWithAuth, isAdmin, parseJsonResponse]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMyGames().catch(console.error);
  }, [loadMyGames, status]);

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
      setAdminMessage({ kind: "error", text: "Impossible de charger l'administration." });
      setAdminLoading(false);
    });
  }, [isAdmin, loadAdminData, showAdmin]);

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
    setShowCreate(false);
    setShowJoin(false);
    setShowRmgPreview(false);
  };

  const saveForcedPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPassword = forcedPassword.trim();
    setForcedPasswordError("");

    if (nextPassword.length < 6) {
      setForcedPasswordError("Le mot de passe doit contenir au moins 6 caracteres.");
      return;
    }
    if (nextPassword === "ChangeMe") {
      setForcedPasswordError("Choisissez un mot de passe different du mot de passe par defaut.");
      return;
    }
    if (nextPassword !== forcedPasswordConfirm.trim()) {
      setForcedPasswordError("Les mots de passe ne correspondent pas.");
      return;
    }

    setSavingForcedPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) {
      setForcedPasswordError(error.message || "Impossible de changer le mot de passe.");
      setSavingForcedPassword(false);
      return;
    }

    const response = await fetchWithAuth("/api/auth/password-changed", { method: "POST" });
    if (!response.ok) {
      const data = await parseJsonResponse(response);
      setForcedPasswordError(data?.error || "Impossible de finaliser le changement.");
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
      setAdminMessage({ kind: "error", text: data?.error || "Impossible de supprimer l'utilisateur." });
      return;
    }
    setAdminMessage({ kind: "success", text: "Utilisateur supprime." });
    await loadAdminData();
  };

  const createAdminUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = adminNewUserName.trim();
    const email = adminNewUserEmail.trim();
    const password = adminNewUserPassword;
    setAdminMessage(null);

    if (!name || !email || !password) {
      setAdminMessage({ kind: "error", text: "Pseudo, email et mot de passe sont requis." });
      return;
    }
    if (password.length < 6) {
      setAdminMessage({ kind: "error", text: "Le mot de passe doit contenir au moins 6 caracteres." });
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
      }),
    });

    if (!response.ok) {
      const data = await parseJsonResponse(response);
      setAdminMessage({ kind: "error", text: data?.error || "Impossible de creer l'utilisateur." });
      setCreatingAdminUser(false);
      return;
    }

    setAdminNewUserName("");
    setAdminNewUserEmail("");
    setAdminNewUserPassword("");
    setAdminNewUserRole("user");
    setAdminNewUserMustChangePassword(true);
    setAdminMessage({ kind: "success", text: "Utilisateur cree." });
    setCreatingAdminUser(false);
    await loadAdminData();
  };

  const deleteAdminGame = async (target: AdminGameInfo) => {
    if (!confirm(`Supprimer la partie ${target.name} ?`)) return;
    setAdminMessage(null);
    const response = await fetchWithAuth(`/api/admin/games?id=${encodeURIComponent(target.id)}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await parseJsonResponse(response);
      setAdminMessage({ kind: "error", text: data?.error || "Impossible de supprimer la partie." });
      return;
    }
    setAdminMessage({ kind: "success", text: "Partie supprimee." });
    await Promise.all([loadAdminData(), loadMyGames()]);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.user) return;

    const nextEmail = profileEmail.trim();
    const nextName = profileName.trim();
    const nextPassword = profilePassword.trim();

    if (!nextEmail) {
      setProfileMessage({ kind: "error", text: "L'adresse mail est requise." });
      return;
    }
    if (!nextName) {
      setProfileMessage({ kind: "error", text: "Le pseudo est requis." });
      return;
    }
    if (nextPassword && nextPassword !== profilePasswordConfirm.trim()) {
      setProfileMessage({ kind: "error", text: "Les mots de passe ne correspondent pas." });
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
      setProfileMessage({ kind: "error", text: authError.message || "Impossible de mettre à jour le compte." });
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
      setProfileMessage({ kind: "error", text: data?.error || "Impossible de mettre à jour le profil." });
      setSavingProfile(false);
      return;
    }

    await loadMyGames();
    setProfilePassword("");
    setProfilePasswordConfirm("");
    setProfileMessage({
      kind: "success",
      text: nextEmail !== (session.user.email ?? "")
        ? "Profil mis à jour. Confirmez la nouvelle adresse mail si Supabase vous envoie un message."
        : "Profil mis à jour.",
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
        text: data?.error || "Impossible de creer la partie.",
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
      alert(data.error || "Erreur");
    }
  };

  const leaveGame = async (gameId: string) => {
    if (!confirm("Voulez-vous vraiment quitter cette partie ?")) return;

    const response = await fetchWithAuth(`/api/games/${gameId}/leave`, {
      method: "POST",
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || "Impossible de quitter la partie");
      return;
    }

    if (useGameStore.getState().gameState?.id === gameId) {
      useGameStore.getState().resetGame();
    }
    await loadMyGames();
    if (showJoin) await loadOpenGames();
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
        text: data?.error || "Impossible de supprimer la partie.",
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
      text: `La partie "${game.name}" a bien été supprimée.`,
    });
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-950 via-[#0e0904] to-stone-900 flex items-center justify-center">
        <div className={`text-xl font-black uppercase tracking-widest ${goldText}`}>Chargement...</div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-stone-950 via-[#0e0904] to-stone-900"
      style={{
        backgroundImage:
          "radial-gradient(circle at 15% 10%, rgba(217,119,6,0.08) 0, transparent 40%), radial-gradient(circle at 85% 80%, rgba(120,53,15,0.12) 0, transparent 45%)",
      }}
    >
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <FleurDeLis className="h-10 w-10 text-amber-400 drop-shadow" />
            <div>
              <h1 className={`text-3xl font-black tracking-[0.15em] sm:text-4xl ${goldText}`}>MY HEROES</h1>
              <p className="text-sm uppercase tracking-wider text-amber-200/70 mt-1">
                Bienvenue, {session?.user?.name}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:gap-3">
            <button
              onClick={() => { setShowCreate(true); setShowJoin(false); setShowOptions(false); setShowAdmin(false); setShowRmgPreview(false); }}
              className="touch-target rounded-lg border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-4 py-3 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700 sm:px-6"
            >
              Nouvelle partie
            </button>
            <button
              onClick={() => { setShowJoin(true); setShowCreate(false); setShowOptions(false); setShowAdmin(false); setShowRmgPreview(false); loadOpenGames().catch(() => setOpenGames([])); }}
              className="touch-target rounded-lg border border-emerald-400/60 bg-gradient-to-b from-emerald-600 to-emerald-800 px-4 py-3 font-black uppercase tracking-wider text-emerald-50 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.3)] transition hover:from-emerald-500 hover:to-emerald-700 sm:px-6"
            >
              Rejoindre
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setShowAdmin((value) => !value);
                  setShowCreate(false);
                  setShowJoin(false);
                  setShowOptions(false);
                  setShowRmgPreview(false);
                }}
                className="touch-target rounded-lg border border-cyan-400/60 bg-gradient-to-b from-cyan-700 to-cyan-900 px-4 py-3 font-black uppercase tracking-wider text-cyan-50 shadow-[inset_0_0_0_1px_rgba(165,243,252,0.2)] transition hover:from-cyan-600 hover:to-cyan-800 sm:px-5"
              >
                Admin
              </button>
            )}
            <button
              type="button"
              onClick={openOptions}
              title="Options"
              aria-label="Options"
              className="touch-target flex h-12 w-full items-center justify-center rounded-lg border border-amber-700/50 bg-stone-950/80 text-amber-200/80 transition hover:border-amber-400/60 hover:text-amber-100 sm:w-12"
            >
              <GearIcon />
            </button>
            <button
              type="button"
              onClick={() => signOut().catch((error) => {
                console.error(error);
                setDashboardMessage({ kind: "error", text: "Impossible de se déconnecter." });
                setSigningOut(false);
              })}
              disabled={signingOut}
              title={signingOut ? "Déconnexion..." : "Déconnexion"}
              aria-label={signingOut ? "Déconnexion..." : "Déconnexion"}
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
                Changer le mot de passe
              </h2>
              <p className="mb-4 text-sm leading-6 text-amber-100/80">
                Ce compte utilise un mot de passe temporaire. Choisissez un nouveau mot de passe pour continuer.
              </p>
              {forcedPasswordError && (
                <div className="mb-4 rounded-md border border-red-400/50 bg-red-950/45 px-4 py-3 text-sm font-semibold text-red-100">
                  {forcedPasswordError}
                </div>
              )}
              <form onSubmit={saveForcedPassword} className="space-y-4">
                <div>
                  <label htmlFor="forced-password" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                    Nouveau mot de passe
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
                    Confirmer
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
                  {savingForcedPassword ? "Enregistrement..." : "Enregistrer"}
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
                Options
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
                      Pseudo
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
                      Adresse mail
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
                      Nouveau mot de passe
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
                      Confirmer
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

                <div className="flex flex-wrap justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={savingProfile}
                    onClick={() => setShowOptions(false)}
                    className="rounded-md border border-amber-700/40 bg-stone-950/70 px-6 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-6 py-2 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingProfile ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Dialogue de création */}
        {showCreate && (
          <div
            className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
            onClick={() => { setShowCreate(false); setShowRmgPreview(false); }}
          >
          <div
            className={`relative ${ornateFramePolished} my-auto w-full max-w-4xl p-4 sm:p-6`}
            onClick={(e) => e.stopPropagation()}
          >
            <CornerOrnaments />
            <ParchmentBackground />
            <h2 className={`mb-4 text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>Créer une partie</h2>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="game-name" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">Nom</label>
                <input
                  id="game-name"
                  type="text"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  placeholder={`Partie de ${session?.user?.name}`}
                  className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="max-players" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">Joueurs max</label>
                <select
                  id="max-players"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n} joueurs</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-amber-200/80">Taille de carte</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["S", "M", "L", "XL"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setMapSize(s)}
                    className={`rounded-lg border p-3 text-center transition ${
                      mapSize === s
                        ? "border-amber-400 bg-amber-900/30 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)]"
                        : "border-amber-700/30 bg-stone-950/60 hover:border-amber-500/50"
                    }`}
                  >
                    <div className="text-lg font-black text-amber-100">{s}</div>
                    <div className="text-[10px] uppercase tracking-wider text-amber-200/70">
                      {s === "S" ? "36×36" : s === "M" ? "72×72" : s === "L" ? "108×108" : "144×144"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="template" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">Modèle</label>
                <select
                  id="template"
                  value={selectedTemplateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                >
                  <option value="auto">Auto</option>
                  {templateOptions.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.minPlayers}-{template.maxPlayers} joueurs)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="seed" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">Graine</label>
                <div className="flex gap-2">
                  <input
                    id="seed"
                    type="text"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value.toUpperCase() || randomSeedValue())}
                    placeholder="Graine"
                    maxLength={32}
                    className="flex-1 rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={generateRandomSeed}
                    title="Graine aléatoire"
                    className="rounded-md border border-amber-700/50 bg-stone-950/70 px-3 text-amber-100 hover:border-amber-400"
                  >
                    🎲
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-amber-700/40 bg-stone-950/60">
              <button
                type="button"
                onClick={() => setShowRmgTuning((value) => !value)}
                aria-expanded={showRmgTuning}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
              >
                <span>
                  <span className="block text-xs font-bold uppercase tracking-wider text-amber-200/80">R&eacute;glages de g&eacute;n&eacute;ration</span>
                  <span className="block text-[11px] uppercase tracking-wider text-amber-200/50">
                    Ressources {normalizedRmgTuning.resourceBudgetPercent}% - B&acirc;timents {normalizedRmgTuning.buildingPercent}% - Monstres {normalizedRmgTuning.monsterPercent}%
                  </span>
                </span>
                <span className="shrink-0 rounded border border-amber-700/40 bg-black/40 px-2 py-1 text-sm font-black text-amber-200">
                  {showRmgTuning ? "-" : "+"}
                </span>
              </button>
              {showRmgTuning && (
                <div className="grid gap-3 border-t border-amber-700/30 p-3 md:grid-cols-2">
                  {RMG_TUNING_CONTROLS.map((control) => (
                    <RmgTuningSlider
                      key={control.key}
                      label={control.label}
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={normalizedRmgTuning[control.key]}
                      onChange={(value) => updateRmgTuning(control.key, value)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4 rounded-lg border border-amber-700/40 bg-stone-950/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-200/80">Aperçu de la carte</div>
                  <div className="text-[11px] uppercase tracking-wider text-amber-200/50">
                    Graine {previewMap.seed} - {previewMap.width}x{previewMap.height}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRmgPreview(true)}
                  className="shrink-0 rounded-md border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-100 transition hover:bg-amber-500/25"
                >
                  Grand aperçu
                </button>
              </div>
              <RmgMapPreview
                map={previewMap}
                minSize={260}
                maxSize={360}
                cellScale={4}
                className="h-[360px] rounded-md border-amber-700/40 bg-stone-950/70"
              />
            </div>

            {!isAdmin && (
              <>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-amber-200/80">Faction</label>
                <FactionPicker selectedFaction={selectedFaction} onSelect={setSelectedFaction} />
              </>
            )}

            <div className="grid grid-cols-1 gap-2 sm:flex sm:gap-3">
              <button
                onClick={createGame}
                disabled={creating}
                data-testid="create-game-submit"
                className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-6 py-2 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Création..." : "Créer"}
              </button>
              <button
                onClick={() => { setShowCreate(false); setShowRmgPreview(false); }}
                className="rounded-md border border-amber-700/40 bg-stone-950/70 px-6 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100"
              >
                Annuler
              </button>
            </div>
          </div>
          {showRmgPreview && (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
              onClick={(event) => {
                event.stopPropagation();
                setShowRmgPreview(false);
              }}
            >
              <div
                className="my-auto flex h-[calc(100vh-2rem)] w-full max-w-[1500px] flex-col gap-4 border border-amber-700/40 bg-stone-950 p-4 text-stone-100 shadow-2xl shadow-black/60"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-800 pb-3">
                  <div>
                    <h3 className="text-xl font-semibold tracking-normal">Aperçu RMG</h3>
                    <p className="text-sm text-stone-400">
                      Graine {previewMap.seed} - Modèle {previewMap.templateId}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={generateRandomSeed}
                      className="h-9 rounded border border-amber-500/60 bg-amber-500/15 px-3 text-sm font-semibold text-amber-100 hover:bg-amber-500/25"
                    >
                      Nouvelle graine
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRmgPreview(false)}
                      className="h-9 rounded border border-stone-700 bg-stone-900 px-3 text-sm font-semibold text-stone-200 hover:border-amber-500/60 hover:text-amber-100"
                    >
                      Fermer
                    </button>
                  </div>
                </header>

                <section className="grid gap-3 border-b border-stone-800 pb-4 lg:grid-cols-[1fr_auto_auto_auto]">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-stone-400">Graine</span>
                    <input
                      value={seed}
                      onChange={(event) => setSeed(event.target.value.toUpperCase() || randomSeedValue())}
                      maxLength={32}
                      className="h-9 rounded border border-stone-700 bg-stone-900 px-3 font-mono text-sm outline-none focus:border-amber-400"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-stone-400">Taille</span>
                    <select
                      value={mapSize}
                      onChange={(event) => setMapSize(event.target.value as keyof typeof MAP_SIZES)}
                      className="h-9 rounded border border-stone-700 bg-stone-900 px-3 text-sm outline-none focus:border-amber-400"
                    >
                      {Object.entries(MAP_SIZES).map(([key, value]) => (
                        <option key={key} value={key}>
                          {key} - {value}x{value}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-stone-400">Joueurs</span>
                    <select
                      value={maxPlayers}
                      onChange={(event) => setMaxPlayers(Number(event.target.value))}
                      className="h-9 rounded border border-stone-700 bg-stone-900 px-3 text-sm outline-none focus:border-amber-400"
                    >
                      {[2, 3, 4, 5, 6].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-stone-400">Modèle</span>
                    <select
                      value={selectedTemplateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                      className="h-9 rounded border border-stone-700 bg-stone-900 px-3 text-sm outline-none focus:border-amber-400"
                    >
                      <option value="auto">auto</option>
                      {templateOptions.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>

                <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <RmgMapPreview map={previewMap} minSize={420} maxSize={1120} cellScale={8} />

                  <aside className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1 text-sm">
                    <RmgLegend />
                    <RmgStatBlock title="Terrain" values={previewStats.terrain} total={previewMap.width * previewMap.height} />
                    <RmgStatBlock title="Objets" values={previewStats.objects} total={previewStats.objectTotal} />
                    <RmgStatBlock title="Details" values={previewStats.details} />
                  </aside>
                </section>
              </div>
            </div>
          )}
          </div>
        )}

        {/* Dialogue pour rejoindre une partie */}
        {showJoin && (
          <div
            className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
            onClick={() => setShowJoin(false)}
          >
          <div
            className={`relative ${ornateFramePolished} my-auto w-full max-w-4xl p-4 sm:p-6`}
            onClick={(e) => e.stopPropagation()}
          >
            <CornerOrnaments />
            <ParchmentBackground />
            <h2 className={`mb-4 text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>Rejoindre une partie</h2>

            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-amber-200/80">Votre faction</label>
            <FactionPicker selectedFaction={selectedFaction} onSelect={setSelectedFaction} />

            {openGames.length === 0 ? (
              <div className="py-4 text-center italic text-amber-200/50">Aucune partie en attente</div>
            ) : (
              <div className="space-y-2 mb-4">
                {openGames.map((game) => (
                  <div
                    key={game.id}
                    className="flex flex-col gap-3 rounded-md border border-amber-700/40 bg-stone-950/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="font-bold text-amber-100">{game.name}</div>
                      <div className="text-xs uppercase tracking-wider text-amber-200/60">
                        {game.players.length}/{game.maxPlayers} joueurs
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {game.players.map((p, i) => (
                        <div
                          key={i}
                          className="h-6 w-6 rounded-full ring-2 ring-amber-300/60"
                          style={{ backgroundColor: p.color }}
                          title={`${p.isAi ? p.aiName || "IA" : p.user?.name || "Joueur"} - ${factionLabel(p.faction)}`}
                        />
                      ))}
                      <button
                        onClick={() => joinGame(game.id)}
                        className="rounded-md border border-emerald-400/60 bg-gradient-to-b from-emerald-600 to-emerald-800 px-4 py-1 text-sm font-black uppercase tracking-wider text-emerald-50 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.3)] transition hover:from-emerald-500 hover:to-emerald-700"
                      >
                        Rejoindre
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => loadOpenGames().catch(() => setOpenGames([]))}
              className="mr-3 rounded-md border border-amber-700/50 bg-stone-950/80 px-6 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/80 transition hover:border-amber-400/60 hover:text-amber-100"
            >
              Actualiser
            </button>
            <button
              onClick={() => setShowJoin(false)}
              className="rounded-md border border-amber-700/40 bg-stone-950/70 px-6 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100"
            >
              Fermer
            </button>
          </div>
          </div>
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
                Supprimer la partie
              </h2>
              <p className="text-sm leading-6 text-amber-100/85">
                Vous allez supprimer <span className="font-black text-amber-100">{deleteTarget.name}</span>. Cette action est définitive et retirera la partie pour tous les joueurs.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  disabled={deletingGameId === deleteTarget.id}
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-md border border-amber-700/40 bg-stone-950/70 px-5 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={deletingGameId === deleteTarget.id}
                  onClick={() => deleteGame(deleteTarget).catch((error) => {
                    console.error(error);
                    setDashboardMessage({ kind: "error", text: "Impossible de supprimer la partie." });
                    setDeleteTarget(null);
                    setDeletingGameId(null);
                  })}
                  className="rounded-md border border-red-400/60 bg-gradient-to-b from-red-700 to-red-900 px-5 py-2 text-sm font-black uppercase tracking-wider text-red-50 shadow-[inset_0_0_0_1px_rgba(254,202,202,0.2)] transition hover:from-red-600 hover:to-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingGameId === deleteTarget.id ? "Suppression..." : "Supprimer"}
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
                Administration
              </h2>
              <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadAdminData().catch(console.error)}
                disabled={adminLoading}
                className="rounded-md border border-cyan-400/50 bg-cyan-950/50 px-4 py-2 text-xs font-black uppercase tracking-wider text-cyan-100 transition hover:border-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {adminLoading ? "Chargement..." : "Actualiser"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdmin(false)}
                className="rounded-md border border-amber-700/40 bg-stone-950/70 px-4 py-2 text-xs font-black uppercase tracking-wider text-amber-200/80 transition hover:border-amber-500/60 hover:text-amber-100"
              >
                Fermer
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
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-amber-100">Utilisateurs</h3>
                </div>
                <form
                  onSubmit={createAdminUser}
                  className="mb-4 rounded-md border border-amber-700/35 bg-stone-950/45 p-3"
                >
                  <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_1fr_0.8fr_auto] lg:items-end">
                    <div>
                      <label htmlFor="admin-create-name" className="mb-1 block text-[11px] font-black uppercase tracking-wider text-amber-200/70">
                        Pseudo
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
                        Email
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
                        Mot de passe
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
                        Role
                      </label>
                      <select
                        id="admin-create-role"
                        value={adminNewUserRole}
                        onChange={(event) => setAdminNewUserRole(event.target.value === "admin" ? "admin" : "user")}
                        className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-sm text-amber-100 focus:border-amber-400 focus:outline-none"
                      >
                        <option value="user">Utilisateur</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={creatingAdminUser}
                      className="rounded-md border border-emerald-400/50 bg-emerald-950/60 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingAdminUser ? "Creation..." : "Creer"}
                    </button>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-100/75">
                    <input
                      type="checkbox"
                      checked={adminNewUserMustChangePassword}
                      onChange={(event) => setAdminNewUserMustChangePassword(event.target.checked)}
                      className="h-4 w-4 accent-amber-500"
                    />
                    Demander le changement du mot de passe a la premiere connexion
                  </label>
                </form>
                <div className="overflow-x-auto rounded-md border border-amber-700/35">
                  <table className="min-w-full divide-y divide-amber-900/60 text-left text-sm">
                    <thead className="bg-stone-950/70 text-xs uppercase tracking-wider text-amber-200/70">
                      <tr>
                        <th className="px-3 py-2">Pseudo</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Role</th>
                        <th className="px-3 py-2">Cree le</th>
                        <th className="px-3 py-2">Derniere connexion</th>
                        <th className="px-3 py-2">Parties</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-900/35 bg-stone-950/35 text-amber-100/85">
                      {adminUsers.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-semibold">{item.name || "Sans pseudo"}</td>
                          <td className="px-3 py-2">{item.email || "-"}</td>
                          <td className="px-3 py-2">
                            {item.role === "admin" ? "Admin" : "Utilisateur"}
                            {item.mustChangePassword ? <span className="ml-2 text-xs text-amber-300">mot de passe temporaire</span> : null}
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
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                      {adminUsers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center italic text-amber-200/50">
                            Aucun utilisateur charge.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-amber-100">Parties</h3>
                <div className="space-y-2">
                  {adminGames.map((game) => (
                    <div key={game.id} className="rounded-md border border-amber-700/40 bg-stone-950/55 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-bold text-amber-100">{game.name}</div>
                          <div className="text-xs uppercase tracking-wider text-amber-200/60">
                            {game.status} - Tour {game.turnNumber} - {game.players.length}/{game.maxPlayers} joueurs - {game.mapWidth}x{game.mapHeight}
                          </div>
                          <div className="mt-2 grid gap-1 text-xs text-amber-100/75 sm:grid-cols-2">
                            <div>Cree par: <span className="font-semibold text-amber-100">{adminPlayerName(game.createdBy)}</span></div>
                            <div>Cree le: {formatAdminDate(game.createdAt)}</div>
                            <div>Derniere mise a jour: {formatAdminDate(game.updatedAt)}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => router.push(`/game/${game.id}?admin=1`)}
                            className="rounded border border-cyan-400/50 bg-cyan-950/60 px-3 py-1 text-xs font-black uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-900"
                          >
                            Observer
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAdminGame(game).catch(console.error)}
                            className="rounded border border-red-400/50 bg-red-950/60 px-3 py-1 text-xs font-black uppercase tracking-wider text-red-100 transition hover:bg-red-900"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 rounded border border-amber-900/45 bg-black/25">
                        <div className="overflow-x-auto">
                          <div className="min-w-[760px]">
                            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-2 border-b border-amber-900/45 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-amber-200/55">
                              <div>Joueur</div>
                              <div>Faction</div>
                              <div>Rejoint le</div>
                              <div>Derniere connexion</div>
                              <div>Statut</div>
                            </div>
                            <div className="divide-y divide-amber-900/35">
                              {game.players.map((player) => (
                                <div key={player.id} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-2 px-3 py-2 text-xs text-amber-100/80">
                                  <div className="min-w-0">
                                    <span className="font-semibold text-amber-100">{adminPlayerName(player)}</span>
                                    {player.email && !player.isAi ? <span className="ml-2 text-amber-200/45">{player.email}</span> : null}
                                  </div>
                                  <div>{FACTION_META[player.faction]?.label ?? player.faction}</div>
                                  <div>{formatAdminDate(player.joinedAt)}</div>
                                  <div>{player.isAi ? "-" : formatAdminDate(player.lastSignInAt, "Jamais")}</div>
                                  <div className={`font-semibold ${playerStatusClass(player.turnStatus)}`}>{playerStatusLabel(player)}</div>
                                </div>
                              ))}
                              {game.players.length === 0 && (
                                <div className="px-3 py-4 text-center text-xs italic text-amber-200/50">
                                  Aucun joueur dans cette partie.
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
                      Aucune partie chargee.
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
          <OrnateHeader>Mes parties</OrnateHeader>
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
                Aucune partie. Créez ou rejoignez-en une !
              </div>
            )}
            {games.map((game) => {
              const myPlayer = game.players.find(
                (player) => player.userId === session?.user?.id
              );
              const isHost = myPlayer?.turnOrder === 0;
              const statusLabel =
                game.status === "PENDING" ? "En attente" :
                game.status === "ACTIVE" ? "En cours" :
                game.status === "COMPLETED" ? "Terminée" : game.status;
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
                      Tour {game.turnNumber} <span className="mx-1 text-amber-700">◆</span>
                      <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
                      <span className="mx-1 text-amber-700">◆</span>
                      {game.mapWidth}×{game.mapHeight}
                      {isAdmin && (
                        <>
                          <span className="mx-1 text-amber-700">◆</span>
                          &Acirc;ge {currentTime === null ? "-" : formatGameAge(game.createdAt, currentTime)}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wider text-amber-200/60">
                      {game.players.length}/{game.maxPlayers}
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      {isAdmin || isHost ? (
                        <button
                          className="rounded-md border border-red-400/60 bg-gradient-to-b from-red-700 to-red-900 px-3 py-1 text-xs font-black uppercase tracking-wider text-red-50 shadow-[inset_0_0_0_1px_rgba(254,202,202,0.2)] transition hover:from-red-600 hover:to-red-800"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDashboardMessage(null);
                            setDeleteTarget(game);
                          }}
                        >
                          Supprimer
                        </button>
                      ) : game.status === "PENDING" ? (
                        <button
                          className="rounded-md border border-amber-700/40 bg-stone-950/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-200/80 transition hover:border-amber-500/60 hover:text-amber-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            leaveGame(game.id).catch(console.error);
                          }}
                        >
                          Quitter
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 rounded border border-amber-900/45 bg-black/25">
                  <div className="overflow-x-auto">
                    <div className="min-w-[620px]">
                      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 border-b border-amber-900/45 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-amber-200/55">
                        <div>Pseudo</div>
                        <div>Faction</div>
                        <div>Derniere connexion</div>
                        <div>Statut</div>
                      </div>
                      <div className="divide-y divide-amber-900/35">
                        {game.players.map((player) => {
                          const status = playerStatusLabel(player);
                          return (
                            <div key={player.id} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 px-3 py-2 text-xs text-amber-100/80">
                              <div className="min-w-0 font-semibold text-amber-100">{playerName(player)}</div>
                              <div>{FACTION_META[player.faction]?.label ?? player.faction}</div>
                              <div>{player.isAi ? "-" : formatAdminDate(player.lastSignInAt, "Jamais")}</div>
                              <div className={`font-semibold ${playerStatusClass(status)}`}>{status}</div>
                            </div>
                          );
                        })}
                        {game.players.length === 0 && (
                          <div className="px-3 py-4 text-center text-xs italic text-amber-200/50">
                            Aucun joueur dans cette partie.
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
        </div>
      </div>
    </div>
  );
}

function RmgLegend() {
  const terrainItems = [
    ["Eau", TERRAIN_COLOR.water],
    ["Plage", TERRAIN_COLOR.sand],
    ["Prairie", TERRAIN_COLOR.grass],
    ["Foret", TERRAIN_COLOR.forest],
    ["Montagne", TERRAIN_COLOR.mountain],
    ["Marais", TERRAIN_COLOR.swamp],
    ["Pont", "#8b5a2b"],
  ];

  const objectItems = [
    ["Ville", OBJECT_COLOR.town],
    ["Mine", OBJECT_COLOR.building],
    ["Monstre", OBJECT_COLOR.monster],
    ["Ressource", OBJECT_COLOR.resource],
    ["Mur", OBJECT_COLOR.wall],
  ];

  return (
    <div className="border border-stone-800 bg-stone-900/80 p-3">
      <h4 className="mb-2 text-sm font-semibold text-amber-100">Légende</h4>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-1.5">
          {terrainItems.map(([label, color]) => (
            <RmgLegendItem key={label} label={label} color={color} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5 border-t border-stone-800 pt-2">
          {objectItems.map(([label, color]) => (
            <RmgLegendItem key={label} label={label} color={color} round />
          ))}
        </div>
      </div>
    </div>
  );
}

function RmgLegendItem({ label, color, round = false }: { label: string; color: string; round?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-stone-300">
      <span
        className={round ? "h-3 w-3 shrink-0 rounded-full" : "h-3 w-3 shrink-0 rounded-sm"}
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{label}</span>
    </div>
  );
}

function RmgStatBlock({
  title,
  values,
  total,
}: {
  title: string;
  values: Record<string, number>;
  total?: number;
}) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  return (
    <div className="border border-stone-800 bg-stone-900/80 p-3">
      <h4 className="mb-2 text-sm font-semibold text-amber-100">{title}</h4>
      <div className="grid gap-1.5">
        {entries.map(([key, value]) => {
          const pct = total && total > 0 ? Math.round((value / total) * 100) : null;
          return (
            <div key={key} className="grid grid-cols-[1fr_auto] gap-3 text-xs">
              <span className="truncate text-stone-300">{key}</span>
              <span className="font-mono text-stone-100">{pct === null ? value : `${value} - ${pct}%`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function summarizeMap(map: GameMap) {
  const terrain: Record<string, number> = {};
  const objects: Record<string, number> = {};
  let objectTotal = 0;
  let roads = 0;
  let bridges = 0;
  let decor = 0;
  let blockingDecor = 0;
  let towns = 0;
  let neutralTowns = 0;

  for (const row of map.tiles) {
    for (const tile of row) {
      terrain[tile.terrain] = (terrain[tile.terrain] ?? 0) + 1;
      if (tile.road) {
        roads++;
        if (tile.terrain === TerrainType.WATER) bridges++;
      }
      if (tile.decor) {
        decor++;
        if (tile.decor.blocking) blockingDecor++;
      }
      if (tile.object) {
        objectTotal++;
        objects[tile.object.type] = (objects[tile.object.type] ?? 0) + 1;
        if (tile.object.type === "town") {
          towns++;
          if (tile.object.subtype === "neutral") neutralTowns++;
        }
      }
    }
  }

  return {
    terrain,
    objects,
    objectTotal,
    details: {
      zones: map.zones?.length ?? 0,
      roads,
      bridges,
      decor,
      blockingDecor,
      towns,
      neutralTowns,
    },
  };
}
