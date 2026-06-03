import type { GameActionLogEntry } from "@/lib/game/server/action-log";
import type { Player } from "@/lib/game/types";
import { translate, type TranslationKey } from "@/lib/i18n/translate";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";
import type { Locale } from "@/lib/i18n/types";

export function playerName(player: Player, locale: Locale = "fr") {
  if (player.isAi) return player.name || translate(locale, "common.ai");
  return player.name || translate(locale, "common.player");
}

export function categoryLabel(category: string, locale: Locale = "fr") {
  const keys: Record<string, TranslationKey> = {
    action: "journal.cat.action",
    adventure: "journal.cat.adventure",
    artifact: "journal.cat.artifact",
    capture: "journal.cat.capture",
    combat: "journal.cat.combat",
    economy: "journal.cat.economy",
    magic: "journal.cat.magic",
    movement: "journal.cat.movement",
    recruitment: "journal.cat.recruitment",
    turn: "journal.cat.turn",
  };
  return keys[category] ? translate(locale, keys[category]) : category;
}

export function formatActor(entry: GameActionLogEntry, player?: Player, locale: Locale = "fr") {
  if (player) return playerName(player, locale);
  if (entry.actorKind === "ai") return translate(locale, "common.ai");
  if (entry.actorKind === "system") return translate(locale, "journal.system");
  return translate(locale, "common.player");
}

export function formatLogTime(value: string, locale: Locale = "fr") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(locale === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatActionLogTooltip(entry: GameActionLogEntry, player: Player | undefined, locale: Locale = "fr") {
  return [
    localizedServerMessage(entry.summary, locale),
    translate(locale, "journal.tipActor", { actor: formatActor(entry, player, locale) }),
    translate(locale, "journal.tipTurn", { turn: entry.turnNumber }),
    translate(locale, "journal.tipCategory", { category: categoryLabel(entry.category, locale) }),
    translate(locale, "journal.tipType", { type: entry.actionType }),
    formatLogTime(entry.createdAt, locale) ? translate(locale, "journal.tipTime", { time: formatLogTime(entry.createdAt, locale) }) : "",
    ...formatDetails(entry.details, locale),
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

function formatDetails(details: Record<string, unknown>, locale: Locale) {
  const flattened = flattenDetails(details, "", locale)
    .filter(([key]) => !key.toLowerCase().includes("password") && !key.toLowerCase().includes("token"))
    .slice(0, 8);
  if (flattened.length === 0) return [];
  return ["", translate(locale, "journal.details"), ...flattened.map(([key, value]) => `${detailLabel(key, locale)} : ${formatValue(value)}`)];
}

function flattenDetails(value: unknown, prefix = "", locale: Locale = "fr"): Array<[string, unknown]> {
  if (!value || typeof value !== "object") return prefix ? [[prefix, value]] : [];
  if (Array.isArray(value)) {
    if (value.length === 0) return prefix ? [[prefix, "[]"]] : [];
    if (value.length > 4) return prefix ? [[prefix, translate(locale, "journal.elements", { n: value.length })]] : [];
    return value.flatMap((item, index) => flattenDetails(item, prefix ? `${prefix}.${index + 1}` : String(index + 1), locale));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
    flattenDetails(item, prefix ? `${prefix}.${key}` : key, locale)
  );
}

function detailLabel(key: string, locale: Locale) {
  const keys: Record<string, TranslationKey> = {
    "action.type": "journal.field.type",
    "action.heroId": "journal.field.heroId",
    "action.attackerHeroId": "journal.field.attackerHeroId",
    "action.townId": "journal.field.townId",
    "action.building": "journal.field.building",
    "action.buildingId": "journal.field.buildingId",
    "action.unitType": "journal.field.unitType",
    "action.count": "journal.field.count",
    "action.targetType": "journal.field.target",
    "action.targetId": "journal.field.target",
    "action.mode": "journal.field.mode",
    combatId: "journal.field.combat",
    targetType: "journal.field.target",
    targetId: "journal.field.target",
    mode: "journal.field.mode",
    result: "journal.field.result",
    "position.x": "journal.field.posX",
    "position.y": "journal.field.posY",
  };
  return keys[key] ? translate(locale, keys[key]) : key;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
