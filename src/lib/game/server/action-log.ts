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
  COLLECT_ARTIFACT: "adventure",
  VISIT_ADVENTURE_BUILDING: "adventure",
  CAST_ADVENTURE_SPELL: "magic",
  CAPTURE_BUILDING: "capture",
  CAPTURE_TOWN: "capture",
  CAPTURE_GATE: "capture",
  BUILD: "economy",
  BUILD_BOAT: "economy",
  RECRUIT_HERO: "recruitment",
  RECRUIT_UNIT: "recruitment",
  UPGRADE_TROOPS: "recruitment",
  EXCHANGE_RESOURCES: "economy",
  SELL_CREATURES: "economy",
  BUY_TOWN_ARTIFACT: "artifact",
  EQUIP_ARTIFACT: "artifact",
  UNEQUIP_ARTIFACT: "artifact",
  TRANSFER_ARTIFACT: "artifact",
  END_TURN: "turn",
  CANCEL_END_TURN: "turn",
};

const ACTION_LABEL: Record<string, string> = {
  MOVE_HERO: "déplace un héros",
  COLLECT_ARTIFACT: "collecte un artefact",
  VISIT_ADVENTURE_BUILDING: "visite un lieu d'aventure",
  CAST_ADVENTURE_SPELL: "lance un sort d'aventure",
  CAPTURE_BUILDING: "capture un bâtiment",
  CAPTURE_TOWN: "capture un château",
  CAPTURE_GATE: "capture une porte",
  BUILD: "construit un bâtiment",
  BUILD_BOAT: "construit un bateau",
  RECRUIT_HERO: "recrute un héros",
  RECRUIT_UNIT: "recrute des unités",
  UPGRADE_TROOPS: "améliore des troupes",
  EXCHANGE_RESOURCES: "échange des ressources",
  SELL_CREATURES: "vend des créatures",
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
