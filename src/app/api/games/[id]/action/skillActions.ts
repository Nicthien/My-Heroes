import { NextResponse } from "next/server";
import { BuildingType, Faction, HeroClass, type Resources } from "@/lib/game/types";
import { countSkillLevels, generateSkillChoices, sanitizePendingSkillEntry, type HeroSkills, type SkillId } from "@/lib/game/skills";
import { getBlacksmithMachines, WAR_MACHINE_COST, type WarMachineKey } from "@/lib/game/war-machines-shop";
import type { MinimalPlayer, SupabaseAdminClient } from "./types";

type ActionRecord = Record<string, unknown>;

type SkillActionHelpers = {
  logPlayerAction: (
    supabase: SupabaseAdminClient,
    game: { turnNumber?: unknown; mapState?: unknown },
    gameId: string,
    gamePlayer: MinimalPlayer,
    action: ActionRecord,
  ) => Promise<void>;
  updatePlayerResources: (
    supabase: SupabaseAdminClient,
    playerId: string,
    resources: Partial<Resources>,
  ) => Promise<void>;
};

type HandleSkillActionParams = {
  supabase: SupabaseAdminClient;
  game: { turnNumber?: unknown; mapState?: unknown };
  gameId: string;
  gamePlayer: MinimalPlayer;
  action: ActionRecord;
  helpers: SkillActionHelpers;
};

export async function handleSkillAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  action,
  helpers,
}: HandleSkillActionParams) {
  if (action.type === "LEARN_SKILL") {
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });

    const level = Number(action.level ?? 0);
    const choice = String(action.skillId ?? "");
    const mapState = (game.mapState as Record<string, unknown>) ?? {};
    const pendingMap = (mapState.pendingSkillChoices as Record<string, Array<{ level: number; options: string[] }>> | undefined) ?? {};
    const pending = pendingMap[hero.id] ?? [];
    const { data: heroRow } = await supabase.from("heroes").select("skills,hero_class").eq("id", hero.id).maybeSingle();
    const currentSkills = ((heroRow?.skills ?? {}) as HeroSkills);
    const heroClass = (heroRow?.hero_class ?? undefined) as HeroClass | undefined;

    let idx = pending.findIndex((entry) => entry.level === level);
    let entry = idx >= 0 ? pending[idx] : null;
    if (!entry) {
      const expectedFromLevels = Math.max(0, Number(hero.level ?? 1) - 1);
      const learnedFromLevels = countSkillLevels(currentSkills);
      const repairLevel = learnedFromLevels + 2;
      const repairedOptions = learnedFromLevels < expectedFromLevels && level === repairLevel
        ? generateSkillChoices(currentSkills, `${gameId}:${hero.id}:level:${level}`, undefined, heroClass)
        : [];
      if (repairedOptions.length > 0) {
        entry = { level, options: repairedOptions };
        idx = -1;
      }
    }
    if (!entry) {
      return NextResponse.json({ error: "Aucun choix de compétence en attente pour ce niveau" }, { status: 400 });
    }
    // Repair stale options stored before class-based bans: keep accepted options in sync
    // with what the display path (getVisiblePendingSkillChoices) now offers.
    entry = sanitizePendingSkillEntry(
      { level: entry.level, options: entry.options as SkillId[] },
      currentSkills,
      heroClass,
      `${gameId}:${hero.id}:level:${level}`,
    );
    if (!entry.options.includes(choice as SkillId)) {
      return NextResponse.json({ error: "Choix invalide" }, { status: 400 });
    }

    const skillChoice = choice as SkillId;
    const current = currentSkills[skillChoice];
    const next: "basic" | "advanced" | "expert" =
      current === "expert" ? "expert" : current === "advanced" ? "expert" : current === "basic" ? "advanced" : "basic";
    const nextSkills = { ...currentSkills, [skillChoice]: next };
    const skillUpdate = await supabase.from("heroes").update({ skills: nextSkills }).eq("id", hero.id);
    if (skillUpdate.error) {
      console.error("LEARN_SKILL: failed to persist hero skills", skillUpdate.error);
      return NextResponse.json({ error: "Impossible d'enregistrer la compétence (DB)" }, { status: 500 });
    }

    const remaining = idx >= 0 ? pending.filter((_, index) => index !== idx) : pending;
    const nextPending = { ...pendingMap };
    if (remaining.length > 0) nextPending[hero.id] = remaining;
    else delete nextPending[hero.id];
    await supabase.from("games").update({ map_state: { ...mapState, pendingSkillChoices: nextPending } }).eq("id", gameId);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true, skill: choice, level: next });
  }

  if (action.type === "BUY_WAR_MACHINE") {
    const town = gamePlayer.towns.find((item) => item.id === action.townId);
    if (!town) return NextResponse.json({ error: "Ville invalide" }, { status: 400 });
    const townFaction = ((town.townType ?? gamePlayer.faction ?? Faction.CASTLE) as Faction);
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (hero.x !== town.x || hero.y !== town.y) {
      return NextResponse.json({ error: "Le héros doit être au château" }, { status: 400 });
    }

    const machine = String(action.machine ?? "ballista") as WarMachineKey;
    // The Blacksmith forges this faction's war machine. Need the building and a
    // machine that this faction actually sells.
    if (!(town.buildings ?? []).includes(BuildingType.BLACKSMITH)) {
      return NextResponse.json({ error: "Cette ville n'a pas de Forgeron" }, { status: 400 });
    }
    if (!getBlacksmithMachines(townFaction).includes(machine)) {
      return NextResponse.json({ error: "Cette machine n'est pas forgée par cette faction" }, { status: 400 });
    }
    const cost = WAR_MACHINE_COST[machine];
    const key = machine;
    if (gamePlayer.gold < cost) return NextResponse.json({ error: "Or insuffisant" }, { status: 400 });

    const { data: heroRow } = await supabase.from("heroes").select("war_machines").eq("id", hero.id).maybeSingle();
    const warMachines = ((heroRow?.war_machines ?? {}) as Record<string, boolean>);
    if (warMachines[key]) {
      return NextResponse.json({ error: "Ce héros possède déjà cette machine" }, { status: 400 });
    }
    await helpers.updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold - cost });
    const warMachineUpdate = await supabase.from("heroes").update({ war_machines: { ...warMachines, [key]: true } }).eq("id", hero.id);
    if (warMachineUpdate.error) {
      console.error("BUY_WAR_MACHINE: failed to persist war machines", warMachineUpdate.error);
      return NextResponse.json({ error: "Impossible d'enregistrer la machine de guerre (DB)" }, { status: 500 });
    }
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true });
  }

  if (action.type === "LEARN_MAGIC_SCHOOL") {
    const town = gamePlayer.towns.find((item) => item.id === action.townId);
    if (!town) return NextResponse.json({ error: "Ville invalide" }, { status: 400 });
    const townFaction = ((town.townType ?? gamePlayer.faction ?? Faction.CASTLE) as Faction);
    if (townFaction !== Faction.CONFLUX || !(town.buildings ?? []).includes(BuildingType.UNIQUE_1)) {
      return NextResponse.json({ error: "Cette ville n'a pas d'Université de magie" }, { status: 400 });
    }
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (hero.x !== town.x || hero.y !== town.y) {
      return NextResponse.json({ error: "Le héros doit être au château" }, { status: 400 });
    }

    const school = String(action.school ?? "");
    const validSchools = ["fire_magic", "water_magic", "earth_magic", "air_magic"];
    if (!validSchools.includes(school)) return NextResponse.json({ error: "École inconnue" }, { status: 400 });
    const cost = 2000;
    if (gamePlayer.gold < cost) return NextResponse.json({ error: "Or insuffisant" }, { status: 400 });

    const { data: heroRow } = await supabase.from("heroes").select("skills").eq("id", hero.id).maybeSingle();
    const currentSkills = ((heroRow?.skills ?? {}) as Record<string, "basic" | "advanced" | "expert">);
    if (currentSkills[school]) {
      return NextResponse.json({ error: "Ce héros connaît déjà cette école" }, { status: 400 });
    }
    if (Object.keys(currentSkills).length >= 8) {
      return NextResponse.json({ error: "Maximum 8 compétences" }, { status: 400 });
    }

    await helpers.updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold - cost });
    const nextSkills = { ...currentSkills, [school]: "basic" as const };
    const schoolUpdate = await supabase.from("heroes").update({ skills: nextSkills }).eq("id", hero.id);
    if (schoolUpdate.error) {
      console.error("LEARN_MAGIC_SCHOOL: failed to persist hero skills", schoolUpdate.error);
      return NextResponse.json({ error: "Impossible d'enregistrer l'école de magie (DB)" }, { status: 500 });
    }
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);

    return NextResponse.json({ success: true, school });
  }

  return null;
}
