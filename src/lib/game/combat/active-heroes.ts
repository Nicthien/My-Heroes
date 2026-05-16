type CombatHeroParticipantLike = {
  heroId?: unknown;
};

type ActiveCombatLike = {
  status?: unknown;
  attackerHeroId?: unknown;
  defenderHeroId?: unknown;
  participants?: CombatHeroParticipantLike[] | null;
};

export function getCombatHeroIds(combat: ActiveCombatLike): Set<string> {
  const heroIds = new Set<string>();
  if (typeof combat.attackerHeroId === "string") heroIds.add(combat.attackerHeroId);
  if (typeof combat.defenderHeroId === "string") heroIds.add(combat.defenderHeroId);

  for (const participant of combat.participants ?? []) {
    if (typeof participant.heroId === "string") heroIds.add(participant.heroId);
  }

  return heroIds;
}

export function getActiveCombatHeroIds(combats: ActiveCombatLike[] | undefined | null): Set<string> {
  const heroIds = new Set<string>();

  for (const combat of combats ?? []) {
    if (combat.status !== "ACTIVE") continue;
    for (const heroId of getCombatHeroIds(combat)) {
      heroIds.add(heroId);
    }
  }

  return heroIds;
}

export function isHeroInActiveCombat(combats: ActiveCombatLike[] | undefined | null, heroId: string): boolean {
  return getActiveCombatHeroIds(combats).has(heroId);
}
