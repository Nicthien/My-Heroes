import { Faction, UnitType } from "@/lib/game/types";
import { UNIT_RULES, getFactionBuildingRule } from "@/lib/game/economy";

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

export function factionLabel(f: Faction): string {
  const labels: Record<string, string> = {
    castle: "Château",
    rampart: "Rempart",
    tower: "Tour",
    inferno: "Hadès",
    necropolis: "Nécropole",
    dungeon: "Donjon",
    stronghold: "Bastion",
    fortress: "Forteresse",
    conflux: "Conflux",
  };
  return labels[f] || f;
}

export function unitTypeLabel(u: string): string {
  return UNIT_RULES[u as UnitType]?.label ?? u;
}

export function buildingTypeLabel(building: string, faction: Faction = Faction.CASTLE): string {
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

export async function getApiErrorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
}
