import type { SupabaseAdmin } from "@/lib/supabase/game-db";
import type { AiArmy, AiContext, AiHero, AiTown } from "../types";

const DEFAULT_GARRISON_RESERVE_RATIO = 0.25;
const DEFEND_GARRISON_RESERVE_RATIO = 0.45;

const ADJACENT = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= 1;

const CHEBYSHEV = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export async function executeArmyTransfers(
  supabase: SupabaseAdmin,
  context: AiContext,
  championId: string | null,
) {
  const heroes = context.player.heroes ?? [];
  const towns = context.player.towns ?? [];

  // 1) Récupération de garnison : tout héros sur ou adjacent à une ville propre tire les unités de la garnison.
  // Sans ça, les unités recrutées restent en garnison et le héros part trop faible pour battre les gardiens.
  for (const hero of heroes) {
    const town = towns.find((t) => ADJACENT(hero.x, hero.y, t.x, t.y));
    if (!town) continue;
    await pickupGarrisonToHero(supabase, hero, town, context.posture === "DEFEND");
  }

  if (heroes.length < 2 && towns.length === 0) return;
  const champion = championId ? heroes.find((hero) => hero.id === championId) ?? null : null;

  // 2) Fusion vers le champion ou dépôt en garnison.
  for (const hero of heroes) {
    if (championId && hero.id === championId) continue;
    if ((hero.armies ?? []).length === 0) continue;

    if (champion && ADJACENT(hero.x, hero.y, champion.x, champion.y)) {
      await transferStacksToHero(supabase, hero, champion);
      continue;
    }

    // Relais : transférer à un allié adjacent strictement plus proche du champion,
    // pour faire avancer les troupes le long d'une chaîne de héros.
    if (champion) {
      const relay = heroes.find((other) =>
        other.id !== hero.id &&
        other.id !== championId &&
        ADJACENT(hero.x, hero.y, other.x, other.y) &&
        CHEBYSHEV(other.x, other.y, champion.x, champion.y) < CHEBYSHEV(hero.x, hero.y, champion.x, champion.y)
      );
      if (relay) {
        await transferStacksToHero(supabase, hero, relay);
        continue;
      }
    }

    if (context.posture === "DEFEND") {
      const town = towns.find((t) => ADJACENT(hero.x, hero.y, t.x, t.y));
      if (town) {
        await transferStacksToGarrison(supabase, hero, town);
      }
    }
  }
}

export async function pickupNearbyGarrisonForHero(
  supabase: SupabaseAdmin,
  context: AiContext,
  hero: AiHero,
  townId?: string,
) {
  const town = (context.player.towns ?? []).find((candidate) =>
    (!townId || candidate.id === townId) &&
    ADJACENT(hero.x, hero.y, candidate.x, candidate.y)
  );
  if (!town) return false;
  return pickupGarrisonToHero(supabase, hero, town, context.posture === "DEFEND");
}

async function pickupGarrisonToHero(
  supabase: SupabaseAdmin,
  hero: AiHero,
  town: AiTown,
  defensiveReserve: boolean,
) {
  const garrison = (town.garrison as AiArmy[] | undefined) ?? [];
  const { movers, remainingGarrison } = splitGarrisonForPickup(garrison, defensiveReserve);
  if (movers.length === 0) return;

  // Ajoute les stacks à l'armée du héros (regroupe par unitType si possible).
  const heroArmies = ((hero.armies as AiArmy[] | undefined) ?? []).map((s) => ({ ...s }));
  let nextHeroArmies = heroArmies;
  for (const stack of movers) {
    const existing = nextHeroArmies.find((s) => s.unitType === stack.unitType);
    if (existing) {
      const merged = {
        ...existing,
        count: (existing.count ?? 0) + (stack.count ?? 0),
        health: (existing.health ?? 0) + (stack.health ?? 0),
      };
      await supabase
        .from("armies")
        .update({ count: merged.count, health: merged.health })
        .eq("id", existing.id);
      nextHeroArmies = nextHeroArmies.map((s) => (s.id === existing.id ? merged : s));
    } else {
      // Insère un nouveau stack lié au héros.
      const position = nextHeroArmies.length;
      const { data: inserted, error } = await supabase
        .from("armies")
        .insert({
          hero_id: hero.id,
          unit_type: stack.unitType,
          count: stack.count,
          health: stack.health,
          max_health: stack.maxHealth,
          position,
        })
        .select("id")
        .single();
      if (error) continue;
      nextHeroArmies = [
        ...nextHeroArmies,
        { ...stack, id: (inserted?.id as string) ?? stack.id, position },
      ];
    }
  }
  // Met à jour la garnison (JSON sur towns).
  await supabase
    .from("towns")
    .update({
      garrison: remainingGarrison.map((s, position) => ({ ...s, position })),
    })
    .eq("id", town.id);
  // Mutation locale pour les étapes suivantes du même tour.
  hero.armies = nextHeroArmies;
  town.garrison = remainingGarrison;
  return true;
}

export function getGarrisonPickupStacks(town: AiTown, defensiveReserve = false): AiArmy[] {
  return splitGarrisonForPickup((town.garrison as AiArmy[] | undefined) ?? [], defensiveReserve).movers;
}

function splitGarrisonForPickup(garrison: AiArmy[], defensiveReserve: boolean) {
  const reserveRatio = defensiveReserve ? DEFEND_GARRISON_RESERVE_RATIO : DEFAULT_GARRISON_RESERVE_RATIO;
  const movers: AiArmy[] = [];
  const remainingGarrison: AiArmy[] = [];

  for (const stack of garrison) {
    const count = Math.max(0, Math.trunc(Number(stack.count ?? 0)));
    if (count <= 1) {
      remainingGarrison.push({ ...stack, count });
      continue;
    }

    const keepCount = Math.max(1, Math.ceil(count * reserveRatio));
    const moveCount = Math.max(0, count - keepCount);
    if (moveCount <= 0) {
      remainingGarrison.push({ ...stack, count });
      continue;
    }

    const maxHealth = Math.max(1, Number(stack.maxHealth ?? 1));
    const totalHealth = Math.max(0, Number(stack.health ?? count * maxHealth));
    const keepHealth = Math.min(totalHealth, keepCount * maxHealth);
    const moveHealth = Math.max(0, totalHealth - keepHealth);

    remainingGarrison.push({
      ...stack,
      count: keepCount,
      health: keepHealth,
    });
    movers.push({
      ...stack,
      count: moveCount,
      health: moveHealth || moveCount * maxHealth,
    });
  }

  return {
    movers,
    remainingGarrison: remainingGarrison.map((stack, position) => ({ ...stack, position })),
  };
}

async function transferStacksToHero(supabase: SupabaseAdmin, fromHero: AiHero, toHero: AiHero) {
  const fromStacks = (fromHero.armies as AiArmy[] | undefined) ?? [];
  if (fromStacks.length <= 1) return;
  // On laisse la plus petite stack pour que le héros reste valide.
  const sorted = [...fromStacks].sort((a, b) => (a.count ?? 0) - (b.count ?? 0));
  const keep = sorted[0];
  const movers = sorted.slice(1);
  if (movers.length === 0) return;
  await mergeStacksIntoOwner(supabase, "armies", { hero_id: toHero.id }, (toHero.armies as AiArmy[]) ?? [], movers);
  void keep;
}

async function transferStacksToGarrison(supabase: SupabaseAdmin, fromHero: AiHero, town: AiTown) {
  const fromStacks = (fromHero.armies as AiArmy[] | undefined) ?? [];
  if (fromStacks.length <= 1) return;
  const sorted = [...fromStacks].sort((a, b) => (a.count ?? 0) - (b.count ?? 0));
  const movers = sorted.slice(1);
  if (movers.length === 0) return;

  // La garnison est un champ JSON sur la ligne town. On la met à jour en une fois.
  let garrison = (town.garrison as AiArmy[] | undefined) ?? [];
  for (const stack of movers) {
    garrison = mergeIntoJsonGarrison(garrison, stack);
    await supabase.from("armies").delete().eq("id", stack.id);
  }
  await supabase.from("towns").update({ garrison }).eq("id", town.id);
}

function mergeIntoJsonGarrison(garrison: AiArmy[], incoming: AiArmy): AiArmy[] {
  const existing = garrison.find((s) => s.unitType === incoming.unitType);
  if (existing) {
    return garrison.map((s) =>
      s.unitType === incoming.unitType
        ? {
            ...s,
            count: (s.count ?? 0) + (incoming.count ?? 0),
            health: (s.health ?? 0) + (incoming.health ?? 0),
          }
        : s,
    );
  }
  return [
    ...garrison,
    {
      ...incoming,
      position: garrison.length,
    },
  ];
}

async function mergeStacksIntoOwner(
  supabase: SupabaseAdmin,
  table: "armies",
  ownerKey: { hero_id: string },
  existing: AiArmy[],
  movers: AiArmy[],
) {
  const existingByType = new Map(existing.map((s) => [s.unitType, s]));
  for (const stack of movers) {
    const target = existingByType.get(stack.unitType);
    if (target) {
      await supabase
        .from(table)
        .update({
          count: (target.count ?? 0) + (stack.count ?? 0),
          health: (target.health ?? 0) + (stack.health ?? 0),
        })
        .eq("id", target.id);
      target.count = (target.count ?? 0) + (stack.count ?? 0);
      target.health = (target.health ?? 0) + (stack.health ?? 0);
      await supabase.from(table).delete().eq("id", stack.id);
    } else {
      await supabase
        .from(table)
        .update({
          ...ownerKey,
          position: existing.length,
        })
        .eq("id", stack.id);
      existing.push({ ...stack, position: existing.length });
      existingByType.set(stack.unitType, stack);
    }
  }
}
