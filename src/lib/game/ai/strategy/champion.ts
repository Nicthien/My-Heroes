import { calculateHeroPower } from "../combat";
import type { AiContext, AiHero } from "../types";
import type { AiPlayerMemory } from "./memory";

export function pickChampion(context: AiContext, memory: AiPlayerMemory): string | null {
  const heroes = context.player.heroes ?? [];
  if (heroes.length === 0) return null;

  // Si le champion mémorisé est toujours vivant on le garde (sauf si beaucoup plus faible).
  const existing = memory.championHeroId
    ? heroes.find((hero) => hero.id === memory.championHeroId)
    : null;

  const strongest = [...heroes].sort((a, b) => calculateHeroPower(b) - calculateHeroPower(a))[0];
  if (!strongest) return null;
  if (existing) {
    const existingPower = calculateHeroPower(existing);
    const strongestPower = calculateHeroPower(strongest);
    // Bascule le titre si quelqu'un d'autre est nettement plus fort (>= 1.5x).
    if (existing.id !== strongest.id && strongestPower >= existingPower * 1.5) {
      return strongest.id;
    }
    return existing.id;
  }
  return strongest.id;
}

export function isChampion(memory: AiPlayerMemory, hero: AiHero) {
  return memory.championHeroId === hero.id;
}
