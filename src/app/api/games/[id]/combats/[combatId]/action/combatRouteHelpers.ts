import { findNextPrimaryParticipant, type CombatConcessionParticipant } from "@/lib/game/combat/concession";
import type { CombatBoardUnit, Resources } from "@/lib/game/types";

export const RESOURCE_KEYS: Array<keyof Resources> = ["gold", "wood", "ore", "mercury", "crystals", "gems", "sulfur"];

export type SurrenderNegotiationRow = {
  id: string;
  combat_id: string;
  surrendering_player_id: string;
  surrendering_hero_id: string;
  target_player_id: string;
  side: "attacker" | "defender";
  base_gold: number;
  offer: Partial<Resources> | null;
  refusal_count: number;
  status: string;
};

export type CombatTruceRow = {
  id: string;
  combat_id: string;
  requested_by_player_id: string;
  requested_by_hero_id: string;
  side: "attacker" | "defender";
  pause_until_turn: number;
  acknowledged_player_ids?: unknown;
  status: string;
};

export function combatInvolvesPlayer(
  combat: { attacker_player_id: string; defender_player_id?: string | null; combat_participants?: Array<{ player_id: string }> },
  playerId: string
) {
  return (
    combat.attacker_player_id === playerId ||
    combat.defender_player_id === playerId ||
    Boolean(combat.combat_participants?.some((participant) => participant.player_id === playerId))
  );
}

export function getPlayerCombatSide(
  combat: { attacker_player_id: string; defender_player_id?: string | null; combat_participants?: Array<{ player_id: string; side?: "attacker" | "defender" | null }> },
  playerId: string
): "attacker" | "defender" | null {
  if (combat.attacker_player_id === playerId) return "attacker";
  if (combat.defender_player_id === playerId) return "defender";
  return combat.combat_participants?.find((participant) => participant.player_id === playerId)?.side ?? null;
}

export function findActiveCombatParticipant(
  combat: {
    attacker_player_id: string;
    defender_player_id?: string | null;
    attacker_hero_id: string;
    defender_hero_id?: string | null;
    combat_participants?: CombatConcessionParticipant[];
  },
  units: CombatBoardUnit[],
  playerId: string,
  currentUnitId?: string | null
): { playerId: string; heroId: string; side: "attacker" | "defender"; participantId: string | null; label: string } | null {
  const currentUnit = units.find((unit) => unit.id === currentUnitId && unit.ownerPlayerId === playerId && unit.heroId && unit.count > 0);
  const activeUnit = currentUnit ?? units.find((unit) => unit.ownerPlayerId === playerId && unit.heroId && unit.count > 0);
  const side = activeUnit?.side ?? getPlayerCombatSide(combat, playerId);
  if (!side) return null;
  const participant = combat.combat_participants?.find((item) =>
    item.player_id === playerId &&
    item.side === side &&
    (!activeUnit?.heroId || item.hero_id === activeUnit.heroId)
  );
  const heroId = activeUnit?.heroId ??
    (side === "attacker" && combat.attacker_player_id === playerId ? combat.attacker_hero_id : null) ??
    (side === "defender" && combat.defender_player_id === playerId ? combat.defender_hero_id ?? null : null) ??
    participant?.hero_id ??
    null;
  if (!heroId) return null;
  return {
    playerId,
    heroId,
    side,
    participantId: participant?.id ?? activeUnit?.participantId ?? null,
    label: side === "attacker" ? "L'attaquant" : "Le defenseur",
  };
}

export function isPrimaryCombatHero(
  combat: { attacker_hero_id: string; defender_hero_id?: string | null },
  side: "attacker" | "defender",
  heroId: string
) {
  return side === "attacker" ? combat.attacker_hero_id === heroId : combat.defender_hero_id === heroId;
}

export function combatHasPlayerHeroesOnBothSides(
  combat: { attacker_player_id: string; defender_player_id?: string | null; defender_hero_id?: string | null },
  units: CombatBoardUnit[]
) {
  const attackerHasHero = Boolean(combat.attacker_player_id) || units.some((unit) => unit.side === "attacker" && unit.ownerPlayerId && unit.heroId);
  const defenderHasHero = Boolean(combat.defender_player_id && combat.defender_hero_id) || units.some((unit) => unit.side === "defender" && unit.ownerPlayerId && unit.heroId);
  return attackerHasHero && defenderHasHero;
}

/**
 * The player id to credit/display as the winner (or surrender target) for one combat side.
 * Normally the primary slot (`attacker_player_id` / `defender_player_id`), but when that side
 * defended a neutral objective with no primary player — e.g. a neutral castle — the primary id
 * stays null even after an enemy player reinforced it (the join route only adds a participant
 * row). In that case fall back to the side's primary active participant so the player who helped
 * win is still recognised. Capturing the neutral town stays gated on the attacker-wins path, so
 * this never transfers the castle to the reinforcing player.
 */
export function resolveSideWinnerPlayerId(
  combat: { attacker_player_id: string; defender_player_id?: string | null; combat_participants?: CombatConcessionParticipant[] },
  units: CombatBoardUnit[],
  side: "attacker" | "defender"
): string | null {
  const primary = side === "attacker" ? combat.attacker_player_id : combat.defender_player_id ?? null;
  if (primary) return primary;
  return findNextPrimaryParticipant(combat.combat_participants ?? [], units, side)?.player_id ?? null;
}

export function getActiveCombatTruce(
  combat: { combat_truces?: CombatTruceRow[] },
  gameTurnNumber: number
): CombatTruceRow | null {
  return combat.combat_truces?.find((truce) =>
    truce.status === "ACTIVE" &&
    Number(truce.pause_until_turn ?? 0) > gameTurnNumber
  ) ?? null;
}

export function normalizeAcknowledgedPlayerIds(value: unknown) {
  return Array.isArray(value) ? Array.from(new Set(value.map(String))) : [];
}

export function hasPendingSurrenderNegotiation(combat: { combat_surrender_negotiations?: Array<{ status?: string }> }) {
  return Boolean(combat.combat_surrender_negotiations?.some((negotiation) => negotiation.status === "PENDING"));
}

export function normalizeSurrenderOffer(value: unknown, defaults: Partial<Resources> = {}): Resources {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof Resources, unknown>>;
  return RESOURCE_KEYS.reduce((offer, key) => {
    const nextValue = Number(raw[key] ?? defaults[key] ?? 0);
    offer[key] = Number.isFinite(nextValue) ? Math.max(0, Math.floor(nextValue)) : 0;
    return offer;
  }, {} as Resources);
}

export function playerResources(player: { resources?: Partial<Record<keyof Resources, unknown>>; gold?: unknown; wood?: unknown; ore?: unknown; mercury?: unknown; crystals?: unknown; gems?: unknown; sulfur?: unknown }) {
  const source = player.resources ?? player;
  return RESOURCE_KEYS.reduce((resources, key) => {
    resources[key] = Number(source[key] ?? 0);
    return resources;
  }, {} as Resources);
}

export function hasResources(resources: Resources, cost: Resources) {
  return RESOURCE_KEYS.every((key) => resources[key] >= cost[key]);
}

export function isMissingSpellSchemaError(error: { message?: string; details?: string | null; code?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("mana") || text.includes("has_spell_book") || text.includes("known_spells") || text.includes("morale") || text.includes("schema cache");
}

export function isMissingSkillsSchemaError(error: { message?: string; details?: string | null; code?: string }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("skills") || text.includes("war_machines");
}

export function getSideLosses(side: "attacker" | "defender", before: CombatBoardUnit[], after: CombatBoardUnit[]) {
  return before
    .filter((unit) => unit.side === side)
    .map((unit) => {
      const next = after.find((item) => item.id === unit.id);
      return { unitType: unit.unitType, lost: Math.max(0, unit.count - (next?.count ?? 0)) };
    })
    .filter((loss) => loss.lost > 0);
}

export function combatActionLabel(actionType: string) {
  const labels: Record<string, string> = {
    ACCEPT_SURRENDER_NEGOTIATION: "accepte une reddition",
    ACCEPT_TRUCE: "accepte une trêve",
    ATTACK: "attaque en combat",
    CAST_SPELL: "lance un sort en combat",
    DEFEND: "défend en combat",
    MOVE: "déplace une unité en combat",
    NEGOTIATE_SURRENDER: "négocie une reddition",
    REJECT_SURRENDER_NEGOTIATION: "refuse une reddition",
    REJECT_TRUCE: "refuse une trêve",
    REQUEST_TRUCE: "propose une trêve",
    RETREAT: "bat en retraite",
    SHOOT: "tire en combat",
    SURRENDER: "se rend",
    WAIT: "attend en combat",
  };
  return labels[actionType] ?? `effectue ${actionType} en combat`;
}
