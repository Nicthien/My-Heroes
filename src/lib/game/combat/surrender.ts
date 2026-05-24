import { UNIT_RULES } from "@/lib/game/economy";
import type { CombatBoardUnit } from "@/lib/game/types";

export const SURRENDER_BASE_RANSOM_RATE = 0.35;

export function computeSurrenderGoldCost(
  units: CombatBoardUnit[],
  side: "attacker" | "defender",
  skills: Partial<Record<string, "basic" | "advanced" | "expert">> = {}
) {
  const armyGoldValue = units
    .filter((unit) => unit.side === side && unit.count > 0)
    .reduce((total, unit) => total + Number(unit.count ?? 0) * Number(UNIT_RULES[unit.unitType]?.cost?.gold ?? 0), 0);
  const diplomacy = skills.diplomacy;
  const diplomacyReduction = diplomacy === "expert" ? 0.6 : diplomacy === "advanced" ? 0.4 : diplomacy === "basic" ? 0.2 : 0;
  return Math.ceil(armyGoldValue * SURRENDER_BASE_RANSOM_RATE * (1 - diplomacyReduction));
}
