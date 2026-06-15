import { NextResponse } from "next/server";
import { isHeroInActiveCombat } from "@/lib/game/combat/active-heroes";
import { normalizeMapMovement } from "@/lib/game/engine";
import { normalizeMapLevel, withActiveMapLayer } from "@/lib/game/map-levels";
import { getArtifact, pickArtifactId } from "@/lib/game/artifacts";
import type { GameMap, Position } from "@/lib/game/types";
import type { MinimalHero, MinimalPlayer, MinimalTown, SupabaseAdminClient } from "./types";

type ActionRecord = Record<string, unknown>;
type ArtifactMutationResult = { ok: true; artifacts: unknown } | { ok: false; error: string };
type ArtifactTransferResult = { ok: true; fromArtifacts: unknown; toArtifacts: unknown } | { ok: false; error: string };
type ApproachResult = { ok: true } | { ok: false; error: string };

type HandleArtifactActionParams = {
  supabase: SupabaseAdminClient;
  game: {
    combats?: Parameters<typeof isHeroInActiveCombat>[0];
    mapData: unknown;
    mapState: unknown;
    turnNumber?: unknown;
  };
  gameId: string;
  gamePlayer: MinimalPlayer;
  action: ActionRecord;
  heroInCombatError: string;
  addArtifactToBag: (value: unknown, artifactId: string) => unknown;
  canTransferArtifactsBetweenHeroes: (fromHero: MinimalHero, toHero: MinimalHero, towns: MinimalTown[]) => boolean;
  equipHeroArtifact: (hero: MinimalHero, artifactId: string, requestedSlot: unknown) => ArtifactMutationResult;
  getActionPosition: (value: unknown) => Position | null;
  logPlayerAction: (supabase: SupabaseAdminClient, game: { turnNumber?: unknown }, gameId: string, gamePlayer: MinimalPlayer, action: ActionRecord) => Promise<void>;
  transferHeroArtifact: (fromHero: MinimalHero, toHero: MinimalHero, artifactId: string) => ArtifactTransferResult;
  unequipHeroArtifact: (hero: MinimalHero, rawSlot: unknown) => ArtifactMutationResult;
  validateAndApplyArtifactApproach: (params: {
    supabase: SupabaseAdminClient;
    mapData: GameMap;
    gamePlayer: MinimalPlayer;
    hero: MinimalHero;
    path: unknown;
    target: Position;
  }) => Promise<ApproachResult>;
};

export async function handleArtifactAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  action,
  heroInCombatError,
  addArtifactToBag,
  canTransferArtifactsBetweenHeroes,
  equipHeroArtifact,
  getActionPosition,
  logPlayerAction,
  transferHeroArtifact,
  unequipHeroArtifact,
  validateAndApplyArtifactApproach,
}: HandleArtifactActionParams) {
  if (action.type === "EQUIP_ARTIFACT") {
    const hero = findOwnedHero(gamePlayer, action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    const result = equipHeroArtifact(hero, String(action.artifactId ?? ""), action.slot);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const { error } = await supabase.from("heroes").update({ artifacts: result.artifacts }).eq("id", hero.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, artifacts: result.artifacts });
  }

  if (action.type === "UNEQUIP_ARTIFACT") {
    const hero = findOwnedHero(gamePlayer, action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    const result = unequipHeroArtifact(hero, action.slot);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const { error } = await supabase.from("heroes").update({ artifacts: result.artifacts }).eq("id", hero.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, artifacts: result.artifacts });
  }

  if (action.type === "TRANSFER_ARTIFACT") {
    const fromHero = findOwnedHero(gamePlayer, action.fromHeroId);
    const toHero = findOwnedHero(gamePlayer, action.toHeroId);
    if (!fromHero || !toHero || fromHero.id === toHero.id) return NextResponse.json({ error: "Transfert invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, fromHero.id) || isHeroInActiveCombat(game.combats, toHero.id)) {
      return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    }
    if (!canTransferArtifactsBetweenHeroes(fromHero, toHero, gamePlayer.towns)) {
      return NextResponse.json({ error: "Les héros doivent être adjacents ou dans le même château" }, { status: 400 });
    }
    const result = transferHeroArtifact(fromHero, toHero, String(action.artifactId ?? ""));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    const { error: fromError } = await supabase.from("heroes").update({ artifacts: result.fromArtifacts }).eq("id", fromHero.id);
    if (fromError) return NextResponse.json({ error: fromError.message }, { status: 500 });
    const { error: toError } = await supabase.from("heroes").update({ artifacts: result.toArtifacts }).eq("id", toHero.id);
    if (toError) return NextResponse.json({ error: toError.message }, { status: 500 });
    await logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true });
  }

  if (action.type === "COLLECT_ARTIFACT") {
    const hero = findOwnedHero(gamePlayer, action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (isHeroInActiveCombat(game.combats, hero.id)) return NextResponse.json({ error: heroInCombatError }, { status: 400 });
    // Scope the map to the hero's current layer: `game.mapData.tiles` is the
    // surface layer, so an underground artifact would otherwise be looked up on
    // the wrong tile and 404 with "Artefact introuvable".
    const mapData = withActiveMapLayer(normalizeMapMovement(game.mapData as GameMap), normalizeMapLevel(hero.mapLevel));
    const targetPosition = getActionPosition(action.targetPosition);
    if (!targetPosition) return NextResponse.json({ error: "Artefact invalide" }, { status: 400 });
    const object = mapData.tiles[targetPosition.y]?.[targetPosition.x]?.object;
    if (object?.type !== "artifact") return NextResponse.json({ error: "Artefact introuvable" }, { status: 404 });
    const mapState = (game.mapState as Record<string, unknown>) ?? {};
    const collected = new Set<string>((mapState.collected as string[]) ?? []);
    const defeatedArtifacts = new Set<string>((mapState.defeatedArtifacts as string[]) ?? []);
    if (collected.has(object.id)) return NextResponse.json({ error: "Artefact déjà collecté" }, { status: 400 });
    if (Number(object.guardianPower ?? 0) > 0 && !defeatedArtifacts.has(object.id)) {
      return NextResponse.json({ error: "L'artefact est gardé" }, { status: 400 });
    }
    const movement = await validateAndApplyArtifactApproach({ supabase, mapData, gamePlayer, hero, path: action.path, target: targetPosition });
    if (!movement.ok) return NextResponse.json({ error: movement.error }, { status: 400 });
    const artifactId = pickArtifactId(object.subtype, `${gameId}:${object.id}`);
    const artifact = getArtifact(artifactId);
    if (!artifact) return NextResponse.json({ error: "Artefact inconnu" }, { status: 400 });
    const artifacts = addArtifactToBag(hero.artifacts, artifactId);
    const { error } = await supabase.from("heroes").update({ artifacts }).eq("id", hero.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    collected.add(object.id);
    await supabase.from("games").update({ map_state: { ...mapState, collected: Array.from(collected), defeatedArtifacts: Array.from(defeatedArtifacts) } }).eq("id", gameId);
    await logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, interaction: { type: "ARTIFACT", artifactId, label: artifact.name, destination: { x: hero.x, y: hero.y } } });
  }

  return null;
}

function findOwnedHero(gamePlayer: MinimalPlayer, value: unknown) {
  return gamePlayer.heroes.find((item) => item.id === value);
}
