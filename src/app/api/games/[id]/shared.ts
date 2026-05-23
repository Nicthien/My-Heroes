export function sanitizePlayerForViewer<T extends {
  id: string;
  heroes?: Array<Record<string, unknown>>;
  towns?: Array<Record<string, unknown>>;
}>(player: T, viewerPlayerId?: string) {
  if (player.id === viewerPlayerId) return player;

  return {
    ...player,
    heroes: (player.heroes ?? []).map((hero) => ({
      ...hero,
      movement: 0,
      maxMovement: 0,
      attack: 0,
      defense: 0,
      spellPower: 0,
      knowledge: 0,
      luck: 0,
      artifacts: { inventory: [], equipment: {} },
      armies: [],
    })),
    towns: (player.towns ?? []).map((town) => ({
      ...town,
      buildings: [],
      garrison: [],
      availableRecruits: {},
      tavernOffer: [],
    })),
  };
}

export function sanitizeCombatForViewer(combat: Record<string, unknown>, viewerPlayerId?: string, isSpectator = false) {
  if (!viewerPlayerId) return summarizeCombat(combat);
  if (isSpectator || combatInvolvesPlayer(combat, viewerPlayerId)) {
    return { ...combat, visibility: "full" };
  }
  return summarizeCombat(combat);
}

export function getAllTileKeys(width: number, height: number) {
  const keys: string[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      keys.push(`${x},${y}`);
    }
  }
  return keys;
}

function summarizeCombat(combat: Record<string, unknown>) {
  return {
    ...combat,
    visibility: "joinable_summary",
    boardState: { units: [] },
    turnQueue: [],
    actionLog: [],
    result: null,
  };
}

function combatInvolvesPlayer(combat: Record<string, unknown>, playerId: string) {
  const participants = Array.isArray(combat.participants) ? combat.participants : [];
  return (
    combat.attackerPlayerId === playerId ||
    combat.defenderPlayerId === playerId ||
    participants.some((participant) => (participant as { playerId?: string }).playerId === playerId)
  );
}
