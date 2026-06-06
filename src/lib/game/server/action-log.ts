import type { GameAction } from "@/lib/game/types";
import type { SupabaseAdmin } from "@/lib/supabase/game-db";

export type GameActionActorKind = "player" | "ai" | "system";

export interface GameActionLogEntry {
  id: string;
  gameId: string;
  gamePlayerId: string | null;
  actorKind: GameActionActorKind;
  turnNumber: number;
  actionType: string;
  category: string;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface RecordGameActionInput {
  gameId: string;
  gamePlayerId?: string | null;
  actorKind: GameActionActorKind;
  turnNumber: number;
  actionType: string;
  category?: string;
  summary: string;
  details?: Record<string, unknown>;
}

type ActionLike = Partial<GameAction> & Record<string, unknown>;

const ACTION_CATEGORY: Record<string, string> = {
  MOVE_HERO: "movement",
  EMBARK_BOAT: "movement",
  DISEMBARK_BOAT: "movement",
  COLLECT_ARTIFACT: "adventure",
  COLLECT_RESOURCE: "adventure",
  VISIT_ADVENTURE_BUILDING: "adventure",
  DIG_GRAIL: "adventure",
  CLAIM_CREATURE_BANK_REWARD: "adventure",
  CAST_ADVENTURE_SPELL: "magic",
  LEARN_MAGIC_SCHOOL: "magic",
  FIGHT_MONSTER: "combat",
  START_COMBAT: "combat",
  ATTACK: "combat",
  SHOOT: "combat",
  MOVE: "combat",
  DEFEND: "combat",
  WAIT: "combat",
  CAST_SPELL: "combat",
  RETREAT: "combat",
  SURRENDER: "combat",
  NEGOTIATE_SURRENDER: "combat",
  ACCEPT_SURRENDER_NEGOTIATION: "combat",
  REJECT_SURRENDER_NEGOTIATION: "combat",
  REQUEST_TRUCE: "combat",
  ACCEPT_TRUCE: "combat",
  REJECT_TRUCE: "combat",
  CAPTURE_BUILDING: "capture",
  CAPTURE_TOWN: "capture",
  CAPTURE_GATE: "capture",
  BUILD: "economy",
  BUILD_BOAT: "economy",
  EXCHANGE_RESOURCES: "economy",
  SELL_CREATURES: "economy",
  RECRUIT_HERO: "recruitment",
  RECRUIT_UNIT: "recruitment",
  UPGRADE_TROOPS: "recruitment",
  TRANSFER_TOWN_GARRISON_TO_HERO: "recruitment",
  TRANSFER_HERO_TO_GARRISON: "recruitment",
  TRANSFER_GATE_GARRISON_TO_HERO: "recruitment",
  TRANSFER_HERO_TO_GATE_GARRISON: "recruitment",
  MERGE_HERO_STACKS: "recruitment",
  SPLIT_HERO_STACK: "recruitment",
  BUY_MERCENARIES: "recruitment",
  BUY_WAR_MACHINE: "recruitment",
  BUY_TOWN_ARTIFACT: "artifact",
  EQUIP_ARTIFACT: "artifact",
  UNEQUIP_ARTIFACT: "artifact",
  TRANSFER_ARTIFACT: "artifact",
  END_TURN: "turn",
  CANCEL_END_TURN: "turn",
};

const ACTION_LABEL: Record<string, string> = {
  MOVE_HERO: "déplace un héros",
  EMBARK_BOAT: "embarque un héros",
  DISEMBARK_BOAT: "débarque un héros",
  COLLECT_ARTIFACT: "collecte un artefact",
  COLLECT_RESOURCE: "collecte des ressources",
  VISIT_ADVENTURE_BUILDING: "visite un lieu d'aventure",
  DIG_GRAIL: "creuse à la recherche du Graal",
  CLAIM_CREATURE_BANK_REWARD: "récupère une récompense",
  CAST_ADVENTURE_SPELL: "lance un sort d'aventure",
  LEARN_MAGIC_SCHOOL: "étudie une école de magie",
  FIGHT_MONSTER: "engage un combat",
  START_COMBAT: "lance un combat",
  ATTACK: "attaque en combat",
  SHOOT: "tire en combat",
  MOVE: "déplace une unité en combat",
  DEFEND: "défend en combat",
  WAIT: "attend en combat",
  CAST_SPELL: "lance un sort en combat",
  RETREAT: "bat en retraite",
  SURRENDER: "se rend",
  NEGOTIATE_SURRENDER: "négocie une reddition",
  ACCEPT_SURRENDER_NEGOTIATION: "accepte une reddition",
  REJECT_SURRENDER_NEGOTIATION: "refuse une reddition",
  REQUEST_TRUCE: "propose une trêve",
  ACCEPT_TRUCE: "accepte une trêve",
  REJECT_TRUCE: "refuse une trêve",
  CAPTURE_BUILDING: "capture une mine",
  CAPTURE_TOWN: "capture un château",
  CAPTURE_GATE: "capture une porte",
  BUILD: "construit un bâtiment",
  BUILD_BOAT: "construit un bateau",
  EXCHANGE_RESOURCES: "échange des ressources",
  SELL_CREATURES: "vend des créatures",
  RECRUIT_HERO: "recrute un héros",
  RECRUIT_UNIT: "recrute des unités",
  UPGRADE_TROOPS: "améliore des troupes",
  TRANSFER_TOWN_GARRISON_TO_HERO: "transfère des troupes vers un héros",
  TRANSFER_HERO_TO_GARRISON: "dépose des troupes en garnison",
  TRANSFER_GATE_GARRISON_TO_HERO: "reprend des troupes à une porte",
  TRANSFER_HERO_TO_GATE_GARRISON: "dépose des troupes à une porte",
  MERGE_HERO_STACKS: "fusionne des troupes",
  SPLIT_HERO_STACK: "sépare des troupes",
  BUY_MERCENARIES: "engage des mercenaires",
  BUY_WAR_MACHINE: "achète une machine de guerre",
  BUY_TOWN_ARTIFACT: "achète un artefact",
  EQUIP_ARTIFACT: "équipe un artefact",
  UNEQUIP_ARTIFACT: "retire un artefact",
  TRANSFER_ARTIFACT: "transfère un artefact",
  END_TURN: "termine son tour",
  CANCEL_END_TURN: "reprend son tour",
};

export async function recordGameAction(supabase: SupabaseAdmin, input: RecordGameActionInput) {
  const { error } = await supabase.from("game_action_logs").insert({
    game_id: input.gameId,
    game_player_id: input.gamePlayerId ?? null,
    actor_kind: input.actorKind,
    turn_number: input.turnNumber,
    action_type: input.actionType,
    category: input.category ?? ACTION_CATEGORY[input.actionType] ?? "action",
    summary: input.summary,
    details: input.details ?? {},
  });

  if (error && !isMissingActionLogTableError(error)) {
    console.error("game_action_logs insert failed", error);
  }
}

/** Resolve the current turn number and a display name/actor kind for a game player. */
async function resolveActorContext(supabase: SupabaseAdmin, gameId: string, gamePlayerId: string) {
  const { data: game } = await supabase.from("games").select("turn_number").eq("id", gameId).maybeSingle();
  const { data: player } = await supabase
    .from("game_players")
    .select("ai_name, profiles(name)")
    .eq("id", gamePlayerId)
    .maybeSingle();
  const profile = (player as { profiles?: { name?: string | null } | { name?: string | null }[] } | null)?.profiles;
  const profileName = Array.isArray(profile) ? profile[0]?.name : profile?.name;
  const aiName = (player as { ai_name?: string | null } | null)?.ai_name;
  return {
    turnNumber: Number(game?.turn_number ?? 0),
    name: aiName || profileName || "Un joueur",
    actorKind: (aiName ? "ai" : "player") as GameActionActorKind,
  };
}

/**
 * Log a CAPTURE_TOWN key moment for a town taken at the end of a persistent
 * combat (where the capture happens in the resolution code, not via a player
 * CAPTURE_TOWN action). Resolves the turn number and a display name itself, so
 * call sites only need the game id and the capturing player id.
 */
export async function recordTownCaptureFromCombat(
  supabase: SupabaseAdmin,
  gameId: string,
  gamePlayerId: string,
) {
  const { turnNumber, name, actorKind } = await resolveActorContext(supabase, gameId, gamePlayerId);
  await recordGameAction(supabase, {
    gameId,
    gamePlayerId,
    actorKind,
    turnNumber,
    actionType: "CAPTURE_TOWN",
    category: "capture",
    summary: `${name} capture un chateau.`,
  });
}

/**
 * Log a COMBAT_WON key moment for the winner of a resolved (persistent) combat.
 * `defeatedHero` distinguishes a duel against an enemy hero from a fight against
 * neutral creatures; `eliminatedPlayer` marks a win that knocked a rival out.
 */
export async function recordCombatVictory(
  supabase: SupabaseAdmin,
  gameId: string,
  gamePlayerId: string,
  outcome: { defeatedHero: boolean; eliminatedPlayer: boolean },
) {
  const { turnNumber, name, actorKind } = await resolveActorContext(supabase, gameId, gamePlayerId);
  const summary = outcome.eliminatedPlayer
    ? `${name} elimine un adversaire au combat.`
    : outcome.defeatedHero
      ? `${name} vainc un heros ennemi.`
      : `${name} remporte un combat.`;
  await recordGameAction(supabase, {
    gameId,
    gamePlayerId,
    actorKind,
    turnNumber,
    actionType: "COMBAT_WON",
    category: "combat",
    summary,
  });
}

export function buildActionLogInput(params: {
  gameId: string;
  gamePlayerId: string;
  actorKind: GameActionActorKind;
  turnNumber: number;
  actorName: string;
  action: ActionLike;
  details?: Record<string, unknown>;
}): RecordGameActionInput {
  const actionType = String(params.action.type ?? "UNKNOWN");
  return {
    gameId: params.gameId,
    gamePlayerId: params.gamePlayerId,
    actorKind: params.actorKind,
    turnNumber: params.turnNumber,
    actionType,
    category: ACTION_CATEGORY[actionType] ?? "action",
    summary: `${params.actorName} ${ACTION_LABEL[actionType] ?? `effectue ${actionType}`}.`,
    details: {
      action: sanitizeActionForLog(params.action),
      ...(params.details ?? {}),
    },
  };
}

export function sanitizeActionForLog(action: ActionLike) {
  return Object.fromEntries(
    Object.entries(action).filter(([key]) => !key.toLowerCase().includes("password") && !key.toLowerCase().includes("token"))
  );
}

function isMissingActionLogTableError(error: { code?: string; message?: string; details?: string | null }) {
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("game_action_logs") || text.includes("relation") && text.includes("does not exist");
}
