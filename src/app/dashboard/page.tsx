"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/client";
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
  userId: string;
  user: { name: string | null };
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
  players: PlayerInfo[];
}

interface OpenGame {
  id: string;
  name: string;
  maxPlayers: number;
  players: PlayerInfo[];
}

const FACTION_META: Record<string, { label: string; color: string; desc: string }> = {
  castle: { label: "Château", color: "#3b82f6", desc: "Chevaliers et clercs humains" },
  rampart: { label: "Rempart", color: "#22c55e", desc: "Rôdeurs elfes et druides" },
  tower: { label: "Tour", color: "#8b5cf6", desc: "Mages et alchimistes" },
  inferno: { label: "Enfer", color: "#ef4444", desc: "Démons et hérétiques" },
  necropolis: { label: "Nécropole", color: "#6b7280", desc: "Morts-vivants et nécromanciens" },
  dungeon: { label: "Donjon", color: "#7c3aed", desc: "Seigneurs sombres et sorciers" },
  stronghold: { label: "Bastion", color: "#f97316", desc: "Barbares orcs" },
  fortress: { label: "Forteresse", color: "#059669", desc: "Hommes-lézards et sorcières" },
};

function factionLabel(faction: string) {
  return FACTION_META[faction]?.label ?? faction;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [openGames, setOpenGames] = useState<OpenGame[]>([]);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [selectedFaction, setSelectedFaction] = useState<string>("castle");
  const [gameName, setGameName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const router = useRouter();

  const loadMyGames = async () => {
    const response = await fetch("/api/games", { cache: "no-store" });
    const data = await response.json();
    setGames(Array.isArray(data) ? data : []);
  };

  const loadOpenGames = async () => {
    const response = await fetch("/api/games/open", { cache: "no-store" });
    const data = await response.json();
    setOpenGames(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMyGames().catch(console.error);
  }, [status]);

  useEffect(() => {
    if (!showJoin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOpenGames().catch(() => setOpenGames([]));
    const interval = setInterval(() => {
      loadOpenGames().catch(() => setOpenGames([]));
    }, 3000);
    return () => clearInterval(interval);
  }, [showJoin]);

  const createGame = async () => {
    setCreating(true);
    useGameStore.getState().resetGame();
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: gameName || `Partie de ${session?.user?.name}`,
        maxPlayers,
        mapWidth: 36,
        mapHeight: 36,
        faction: selectedFaction,
      }),
    });
    if (res.ok) {
      const game = await res.json();
      router.push(`/game/${game.id}`);
    }
    setCreating(false);
  };

  const joinGame = async (gameId: string) => {
    useGameStore.getState().resetGame();
    const res = await fetch(`/api/games/${gameId}/join`, {
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

    const response = await fetch(`/api/games/${gameId}/leave`, {
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

  const deleteGame = async (gameId: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette partie ? Cette action est définitive.")) return;

    const response = await fetch(`/api/games/${gameId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || "Impossible de supprimer la partie");
      return;
    }

    if (useGameStore.getState().gameState?.id === gameId) {
      useGameStore.getState().resetGame();
    }
    await loadMyGames();
    if (showJoin) await loadOpenGames();
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
      <div className="max-w-5xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <FleurDeLis className="h-10 w-10 text-amber-400 drop-shadow" />
            <div>
              <h1 className={`text-4xl font-black tracking-[0.15em] ${goldText}`}>MY HEROES</h1>
              <p className="text-sm uppercase tracking-wider text-amber-200/70 mt-1">
                Bienvenue, {session?.user?.name}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowCreate(true); setShowJoin(false); }}
              className="rounded-lg border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-6 py-3 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700"
            >
              Nouvelle partie
            </button>
            <button
              onClick={() => { setShowJoin(true); setShowCreate(false); loadOpenGames().catch(() => setOpenGames([])); }}
              className="rounded-lg border border-emerald-400/60 bg-gradient-to-b from-emerald-600 to-emerald-800 px-6 py-3 font-black uppercase tracking-wider text-emerald-50 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.3)] transition hover:from-emerald-500 hover:to-emerald-700"
            >
              Rejoindre
            </button>
          </div>
        </div>

        {/* Dialogue de création */}
        {showCreate && (
          <div className={`relative ${ornateFramePolished} mb-6 p-6`}>
            <CornerOrnaments />
            <ParchmentBackground />
            <h2 className={`mb-4 text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>Créer une partie</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
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
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n} joueurs</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-amber-200/80">Faction</label>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {Object.entries(FACTION_META).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setSelectedFaction(key)}
                  className={`rounded-lg border p-3 text-left transition ${
                    selectedFaction === key
                      ? "border-amber-400 bg-amber-900/30 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)]"
                      : "border-amber-700/30 bg-stone-950/60 hover:border-amber-500/50 hover:bg-amber-900/15"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full ring-1 ring-amber-200/40" style={{ backgroundColor: meta.color }} />
                    <span className="text-sm font-bold text-amber-100">{meta.label}</span>
                  </div>
                  <div className="mt-1 text-xs text-amber-200/60">{meta.desc}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={createGame}
                disabled={creating}
                data-testid="create-game-submit"
                className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-6 py-2 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Création..." : "Créer"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-md border border-amber-700/40 bg-stone-950/70 px-6 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Dialogue pour rejoindre une partie */}
        {showJoin && (
          <div className={`relative ${ornateFramePolished} mb-6 p-6`}>
            <CornerOrnaments />
            <ParchmentBackground />
            <h2 className={`mb-4 text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>Rejoindre une partie</h2>

            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-amber-200/80">Votre faction</label>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {Object.entries(FACTION_META).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setSelectedFaction(key)}
                  className={`rounded-lg border p-2 text-left transition ${
                    selectedFaction === key
                      ? "border-amber-400 bg-amber-900/30 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)]"
                      : "border-amber-700/30 bg-stone-950/60 hover:border-amber-500/50 hover:bg-amber-900/15"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full ring-1 ring-amber-200/40" style={{ backgroundColor: meta.color }} />
                    <span className="text-sm font-bold text-amber-100">{meta.label}</span>
                  </div>
                </button>
              ))}
            </div>

            {openGames.length === 0 ? (
              <div className="py-4 text-center italic text-amber-200/50">Aucune partie en attente</div>
            ) : (
              <div className="space-y-2 mb-4">
                {openGames.map((game) => (
                  <div
                    key={game.id}
                    className="flex items-center justify-between rounded-md border border-amber-700/40 bg-stone-950/60 p-3"
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
                          title={factionLabel(p.faction)}
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
        )}

        {/* Mes parties */}
        <div className={`relative ${ornateFrame}`}>
          <CornerOrnaments />
          <ParchmentBackground />
          <OrnateHeader>Mes parties</OrnateHeader>
          <div className="space-y-3 p-4">
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
                onClick={() => router.push(`/game/${game.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`text-lg font-black ${goldText}`}>{game.name}</h3>
                    <div className="mt-1 text-xs uppercase tracking-wider text-amber-200/70">
                      Tour {game.turnNumber} <span className="mx-1 text-amber-700">◆</span>
                      <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
                      <span className="mx-1 text-amber-700">◆</span>
                      {game.mapWidth}×{game.mapHeight}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wider text-amber-200/60">
                      {game.players.length}/{game.maxPlayers}
                    </div>
                    <div className="mt-1 flex justify-end gap-1">
                      {game.players.map((p, i) => (
                        <div
                          key={i}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white shadow-inner shadow-black/40"
                          style={{
                            backgroundColor: p.color,
                            boxShadow: `inset 0 0 0 2px ${p.isAlive ? "rgba(252,211,77,0.6)" : "rgba(239,68,68,0.6)"}`,
                          }}
                          title={factionLabel(p.faction)}
                        >
                          {p.user.name?.[0]?.toUpperCase() || "?"}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      {isHost ? (
                        <button
                          className="rounded-md border border-red-400/60 bg-gradient-to-b from-red-700 to-red-900 px-3 py-1 text-xs font-black uppercase tracking-wider text-red-50 shadow-[inset_0_0_0_1px_rgba(254,202,202,0.2)] transition hover:from-red-600 hover:to-red-800"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteGame(game.id).catch(console.error);
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
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
