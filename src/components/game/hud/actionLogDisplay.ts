import type { GameActionLogEntry } from "@/lib/game/server/action-log";
import type { Player } from "@/lib/game/types";

export function playerName(player: Player) {
  if (player.isAi) return player.name || "IA";
  return player.name || "Joueur";
}

export function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    action: "Action",
    adventure: "Aventure",
    artifact: "Artefact",
    capture: "Capture",
    combat: "Combat",
    economy: "Economie",
    magic: "Magie",
    movement: "Mouvement",
    recruitment: "Recrutement",
    turn: "Tour",
  };
  return labels[category] ?? category;
}

export function formatActor(entry: GameActionLogEntry, player?: Player) {
  if (player) return playerName(player);
  if (entry.actorKind === "ai") return "IA";
  if (entry.actorKind === "system") return "Systeme";
  return "Joueur";
}

export function formatLogTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatActionLogTooltip(entry: GameActionLogEntry, player?: Player) {
  return [
    entry.summary,
    `Acteur : ${formatActor(entry, player)}`,
    `Tour : ${entry.turnNumber}`,
    `Catégorie : ${categoryLabel(entry.category)}`,
    `Type : ${entry.actionType}`,
    formatLogTime(entry.createdAt) ? `Heure : ${formatLogTime(entry.createdAt)}` : "",
    ...formatDetails(entry.details),
  ].filter(Boolean).join("\n");
}

export function sortActionLogNewestFirst(entries: GameActionLogEntry[]) {
  return entries
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getKnownActionLogEntries(entries: GameActionLogEntry[] | undefined, playerId: string) {
  return sortActionLogNewestFirst((entries ?? []).filter((entry) =>
    entry.actionType !== "MOVE_HERO" && isKnownActionLogEntry(entry, playerId)
  ));
}

function isKnownActionLogEntry(entry: GameActionLogEntry, playerId: string) {
  return entry.gamePlayerId === playerId ||
    entry.actorKind === "system" ||
    containsExactString(entry.details, playerId);
}

function containsExactString(value: unknown, needle: string): boolean {
  if (value === needle) return true;
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, needle));
  return Object.values(value as Record<string, unknown>).some((item) => containsExactString(item, needle));
}

function formatDetails(details: Record<string, unknown>) {
  const flattened = flattenDetails(details)
    .filter(([key]) => !key.toLowerCase().includes("password") && !key.toLowerCase().includes("token"))
    .slice(0, 8);
  if (flattened.length === 0) return [];
  return ["", "Détails :", ...flattened.map(([key, value]) => `${detailLabel(key)} : ${formatValue(value)}`)];
}

function flattenDetails(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (!value || typeof value !== "object") return prefix ? [[prefix, value]] : [];
  if (Array.isArray(value)) {
    if (value.length === 0) return prefix ? [[prefix, "[]"]] : [];
    if (value.length > 4) return prefix ? [[prefix, `${value.length} éléments`]] : [];
    return value.flatMap((item, index) => flattenDetails(item, prefix ? `${prefix}.${index + 1}` : String(index + 1)));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
    flattenDetails(item, prefix ? `${prefix}.${key}` : key)
  );
}

function detailLabel(key: string) {
  const labels: Record<string, string> = {
    "action.type": "Action",
    "action.heroId": "Héros",
    "action.attackerHeroId": "Héros attaquant",
    "action.townId": "Château",
    "action.building": "Bâtiment",
    "action.buildingId": "Mine",
    "action.unitType": "Unité",
    "action.count": "Quantité",
    "action.targetType": "Cible",
    "action.targetId": "Cible",
    "action.mode": "Mode",
    combatId: "Combat",
    targetType: "Cible",
    targetId: "Cible",
    mode: "Mode",
    result: "Résultat",
    "position.x": "Position X",
    "position.y": "Position Y",
  };
  return labels[key] ?? key;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
