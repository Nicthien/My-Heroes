import { Faction, UnitType, type UnitStack } from "@/lib/game/types";
import { UNIT_RULES, getFactionBuildingRule } from "@/lib/game/economy";
import { KING_UNIT_SPRITES } from "@/lib/rendering/phaser/assets";
import type { Locale } from "@/lib/i18n/types";
import { unitTypeToEnglishLabel } from "@/lib/i18n/gameLabels";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";

const DEFAULT_KING_SPRITE = "/assets/sprites/units/kings/king-castle.webp";

/**
 * Returns the King's faction portrait sprite when a hero carries the King unit,
 * so panels can show his head instead of the hero's initials. Null otherwise.
 */
export function kingPortraitSprite(armies: UnitStack[] | undefined, faction: string): string | null {
  if (!armies?.some((stack) => stack.unitType === UnitType.KING)) return null;
  return KING_UNIT_SPRITES[faction as keyof typeof KING_UNIT_SPRITES] ?? DEFAULT_KING_SPRITE;
}

export const NOTIFICATION_PROMPT_DISMISSED_KEY = "my-heroes:notifications:prompt-dismissed";

export function getNotificationPromptDismissed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NOTIFICATION_PROMPT_DISMISSED_KEY) === "true";
}

export function markNotificationPromptDismissed() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIFICATION_PROMPT_DISMISSED_KEY, "true");
}

export async function showBrowserNotification(title: string, options: NotificationOptions) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }

    new Notification(title, options);
  } catch (error) {
    console.warn("Unable to show browser notification.", error);
  }
}

export function factionLabel(f: Faction, locale: Locale = "fr"): string {
  const labelsEn: Record<string, string> = {
    castle: "Steel Crowns",
    rampart: "Sylvan Pact",
    tower: "Azure Circle",
    inferno: "Profane Embers",
    necropolis: "Bone Veil",
    dungeon: "Understone Realm",
    stronghold: "Red Hammers",
    fortress: "Swamp Oaths",
    conflux: "Primordial Orb",
  };
  const labels: Record<string, string> = {
    castle: "Couronnes d'Acier",
    rampart: "Pacte des Sylves",
    tower: "Cercle d'Azur",
    inferno: "Braises Profanes",
    necropolis: "Voile d'Os",
    dungeon: "Royaume Sous-Roche",
    stronghold: "Marteaux Rouges",
    fortress: "Serments du Marais",
    conflux: "Orbe Primordial",
  };
  return (locale === "en" ? labelsEn[f] : labels[f]) || f;
}

export function unitTypeLabel(u: string, locale: Locale = "fr"): string {
  if (locale === "en") return unitTypeToEnglishLabel(u);
  return UNIT_RULES[u as UnitType]?.label ?? u;
}

export function buildingTypeLabel(building: string, faction: Faction = Faction.CASTLE, locale: Locale = "fr"): string {
  if (locale === "en") return unitTypeToEnglishLabel(building);
  const factionRule = getFactionBuildingRule(faction, building);
  if (factionRule) return factionRule.label;
  const labels: Record<string, string> = {
    castle: "Mairie du village",
    village_hall: "Mairie du village",
    town_hall: "Mairie",
    city_hall: "Hôtel de ville",
    capitol: "Capitole",
    tavern: "Taverne",
    market: "Marché",
    barracks: "Caserne",
    mage_guild: "Guilde des mages",
    resource_silo: "Silo de ressources",
    dwelling_1: "Corps de garde",
    dwelling_2: "Champ de tir",
    dwelling_3: "Tour des griffons",
    dwelling_4: "Bâtiment de niveau 4",
    dwelling_5: "Bâtiment de niveau 5",
    dwelling_6: "Bâtiment de niveau 6",
    dwelling_7: "Bâtiment de niveau 7",
  };
  return labels[building] || building;
}

export async function getApiErrorMessage(response: Response, fallback: string, locale: Locale = "fr") {
  const data = await response.json().catch(() => null);
  if (typeof data?.error !== "string") return fallback;
  return localizedServerMessage(data.error, locale) ?? data.error;
}
