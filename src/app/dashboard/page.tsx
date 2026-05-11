"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

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

    await loadMyGames();
    if (showJoin) await loadOpenGames();
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <div className="max-w-5xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white">My Heroes</h1>
            <p className="text-gray-400 mt-1">Bienvenue, {session?.user?.name}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowCreate(true); setShowJoin(false); }}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-bold transition"
            >
              Nouvelle partie
            </button>
            <button
              onClick={() => { setShowJoin(true); setShowCreate(false); loadOpenGames().catch(() => setOpenGames([])); }}
              className="bg-green-700 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-bold transition"
            >
              Rejoindre
            </button>
          </div>
        </div>

        {/* Dialogue de création */}
        {showCreate && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <h2 className="text-white text-xl font-bold mb-4">Créer une partie</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-gray-300 text-sm block mb-1">Nom</label>
                <input
                  type="text"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  placeholder={`Partie de ${session?.user?.name}`}
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-gray-300 text-sm block mb-1">Joueurs max</label>
                <select
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600"
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n} joueurs</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="text-gray-300 text-sm block mb-2">Faction</label>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {Object.entries(FACTION_META).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setSelectedFaction(key)}
                  className={`p-3 rounded-lg border-2 transition text-left ${
                    selectedFaction === key
                      ? "border-yellow-500 bg-gray-700"
                      : "border-gray-600 bg-gray-800 hover:bg-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span className="text-white font-bold text-sm">{meta.label}</span>
                  </div>
                  <div className="text-gray-400 text-xs mt-1">{meta.desc}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={createGame}
                disabled={creating}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded font-bold disabled:opacity-50"
              >
                {creating ? "Création..." : "Créer"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="bg-gray-700 text-gray-300 px-6 py-2 rounded hover:bg-gray-600"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Dialogue pour rejoindre une partie */}
        {showJoin && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <h2 className="text-white text-xl font-bold mb-4">Rejoindre une partie</h2>

            <label className="text-gray-300 text-sm block mb-2">Votre faction</label>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {Object.entries(FACTION_META).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setSelectedFaction(key)}
                  className={`p-2 rounded-lg border-2 transition text-left ${
                    selectedFaction === key
                      ? "border-yellow-500 bg-gray-700"
                      : "border-gray-600 bg-gray-800 hover:bg-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span className="text-white text-sm font-bold">{meta.label}</span>
                  </div>
                </button>
              ))}
            </div>

            {openGames.length === 0 ? (
              <div className="text-gray-400 text-center py-4">Aucune partie en attente</div>
            ) : (
              <div className="space-y-2 mb-4">
                {openGames.map((game) => (
                  <div
                    key={game.id}
                    className="bg-gray-700/50 border border-gray-600 rounded p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-white font-bold">{game.name}</div>
                      <div className="text-gray-400 text-sm">
                        {game.players.length}/{game.maxPlayers} joueurs
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {game.players.map((p, i) => (
                        <div
                          key={i}
                          className="w-6 h-6 rounded-full border-2 border-white"
                          style={{ backgroundColor: p.color }}
                          title={factionLabel(p.faction)}
                        />
                      ))}
                      <button
                        onClick={() => joinGame(game.id)}
                        className="bg-green-700 hover:bg-green-600 text-white px-4 py-1 rounded font-bold text-sm"
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
              className="bg-blue-700 text-white px-6 py-2 rounded hover:bg-blue-600 mr-3"
            >
              Actualiser
            </button>
            <button
              onClick={() => setShowJoin(false)}
              className="bg-gray-700 text-gray-300 px-6 py-2 rounded hover:bg-gray-600"
            >
              Fermer
            </button>
          </div>
        )}

        {/* Mes parties */}
        <h2 className="text-white text-xl font-bold mb-4">Mes parties</h2>
        <div className="space-y-3">
          {games.length === 0 && (
            <div className="text-gray-500 text-center py-12">
              Aucune partie. Créez ou rejoignez-en une !
            </div>
          )}
          {games.map((game) => {
            const myPlayer = game.players.find(
              (player) => player.userId === session?.user?.id
            );
            const isHost = myPlayer?.turnOrder === 0;

            return (
            <div
              key={game.id}
              className="bg-gray-800/80 border border-gray-700 rounded-lg p-4 hover:border-gray-500 transition cursor-pointer"
              onClick={() => router.push(`/game/${game.id}`)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold">{game.name}</h3>
                  <div className="text-gray-400 text-sm mt-1">
                    Tour {game.turnNumber} |{" "}
                    <span className={
                      game.status === "ACTIVE" ? "text-green-400" :
                      game.status === "PENDING" ? "text-yellow-400" :
                      game.status === "COMPLETED" ? "text-blue-400" : "text-gray-400"
                    }>
                      {game.status === "PENDING" ? "En attente" :
                       game.status === "ACTIVE" ? "En cours" :
                        game.status === "COMPLETED" ? "Terminée" : game.status}
                    </span>
                    | {game.mapWidth}x{game.mapHeight}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-gray-400 text-sm">
                    {game.players.length}/{game.maxPlayers}
                  </div>
                  <div className="flex gap-1 mt-1">
                    {game.players.map((p, i) => (
                      <div
                        key={i}
                        className="w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold"
                        style={{
                          backgroundColor: p.color,
                          borderColor: p.isAlive ? "#22c55e" : "#ef4444",
                          color: "#fff",
                        }}
                        title={factionLabel(p.faction)}
                      >
                        {p.user.name?.[0]?.toUpperCase() || "?"}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3 justify-end">
                    {isHost ? (
                      <button
                        className="bg-red-800 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-bold"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteGame(game.id).catch(console.error);
                        }}
                      >
                        Supprimer
                      </button>
                    ) : game.status === "PENDING" ? (
                      <button
                        className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1 rounded text-xs font-bold"
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
  );
}
