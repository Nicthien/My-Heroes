import { randomUUID } from "crypto";
import { FACTION_UNITS, UNIT_RULES } from "@/lib/game/economy";
import { Faction } from "@/lib/game/types";

const MEDIUM_NEUTRAL_TOWN_GARRISON = [
  { tierIndex: 1, count: 24 },
  { tierIndex: 2, count: 14 },
  { tierIndex: 3, count: 7 },
] as const;

export function createNeutralTownGarrison(faction: Faction) {
  const tiers = FACTION_UNITS[faction] ?? FACTION_UNITS[Faction.CASTLE];

  return MEDIUM_NEUTRAL_TOWN_GARRISON.map(({ tierIndex, count }, position) => {
    const unitType = tiers[tierIndex] ?? tiers[0];
    const rule = UNIT_RULES[unitType];

    return {
      id: randomUUID(),
      unitType,
      count,
      health: rule.health * count,
      maxHealth: rule.health,
      position,
    };
  });
}
