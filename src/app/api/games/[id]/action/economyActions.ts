import { NextResponse } from "next/server";
import { UNIT_RULES } from "@/lib/game/economy";
import { getArtifact } from "@/lib/game/artifacts";
import { BuildingType, Faction, type Resources, type UnitType } from "@/lib/game/types";
import { computeExchangeAmount, getMarketplaceCount } from "@/lib/game/market";
import type { MinimalArmy, MinimalPlayer, MinimalTown, SupabaseAdminClient } from "./types";

type ActionRecord = Record<string, unknown>;

type EconomyActionHelpers = {
  addArtifactToBag: (value: unknown, artifactId: string) => unknown;
  getArtifactMerchantBuilding: (faction: Faction) => BuildingType | null;
  logPlayerAction: (
    supabase: SupabaseAdminClient,
    game: { turnNumber?: unknown },
    gameId: string,
    gamePlayer: MinimalPlayer,
    action: ActionRecord,
  ) => Promise<void>;
  playerResources: (player: MinimalPlayer) => Resources;
  removeUnitsFromStackList: (stacks: MinimalArmy[], unitType: UnitType, count: number, maxHealth: number) => MinimalArmy[];
  updatePlayerResources: (supabase: SupabaseAdminClient, playerId: string, resources: Partial<Resources>) => Promise<void>;
};

type HandleEconomyActionParams = {
  supabase: SupabaseAdminClient;
  game: {
    mapState: unknown;
    turnNumber?: unknown;
  };
  gameId: string;
  gamePlayer: MinimalPlayer;
  action: ActionRecord;
  helpers: EconomyActionHelpers;
};

export async function handleEconomyAction({
  supabase,
  game,
  gameId,
  gamePlayer,
  action,
  helpers,
}: HandleEconomyActionParams) {
  if (action.type === "EXCHANGE_RESOURCES") {
    const town = findTown(gamePlayer, action.townId);
    if (!town) return NextResponse.json({ error: "Ville invalide" }, { status: 400 });
    const buildings = town.buildings ?? [];
    if (!buildings.includes(BuildingType.MARKET)) {
      return NextResponse.json({ error: "Construisez d'abord le Marché" }, { status: 400 });
    }
    const from = String(action.from ?? "") as keyof Resources;
    const to = String(action.to ?? "") as keyof Resources;
    const fromAmount = Math.max(0, Math.floor(Number(action.amount ?? 0)));
    if (from === to || fromAmount <= 0) return NextResponse.json({ error: "Échange invalide" }, { status: 400 });
    const resources = helpers.playerResources(gamePlayer);
    if ((resources[from] ?? 0) < fromAmount) return NextResponse.json({ error: "Ressources insuffisantes" }, { status: 400 });
    const marketplaceCount = getMarketplaceCount({ towns: gamePlayer.towns });
    const toAmount = computeExchangeAmount(from, to, fromAmount, marketplaceCount);
    if (toAmount <= 0) return NextResponse.json({ error: "Conversion non supportée" }, { status: 400 });
    const next = { ...resources, [from]: (resources[from] ?? 0) - fromAmount, [to]: (resources[to] ?? 0) + toAmount };
    await helpers.updatePlayerResources(supabase, gamePlayer.id, next);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, gained: { resource: to, amount: toAmount } });
  }

  if (action.type === "SELL_CREATURES") {
    const town = findTown(gamePlayer, action.townId);
    if (!town) return NextResponse.json({ error: "Ville invalide" }, { status: 400 });
    const buildings = town.buildings ?? [];
    const townFaction = (town.townType ?? gamePlayer.faction ?? Faction.CASTLE) as Faction;
    if (townFaction !== Faction.STRONGHOLD || !buildings.includes(BuildingType.UNIQUE_2)) {
      return NextResponse.json({ error: "Cette ville n'a pas de Guilde des francs-tireurs" }, { status: 400 });
    }
    const unitType = action.unitType as UnitType;
    const count = Math.max(1, Math.floor(Number(action.count ?? 1)));
    const rule = UNIT_RULES[unitType];
    if (!rule) return NextResponse.json({ error: "Unité invalide" }, { status: 400 });
    const garrison = town.garrison ?? [];
    const source = garrison.find((unit) => unit.unitType === unitType);
    if (!source || source.count < count) return NextResponse.json({ error: "Garnison insuffisante" }, { status: 400 });
    const unitGoldValue = Math.max(10, Math.floor((rule.cost.gold ?? 100) * 0.5));
    const totalGold = unitGoldValue * count;
    const nextGarrison = helpers.removeUnitsFromStackList(garrison, unitType, count, rule.health);
    await supabase.from("towns").update({ garrison: nextGarrison }).eq("id", town.id);
    await helpers.updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold + totalGold });
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, gold: totalGold });
  }

  if (action.type === "BUY_TOWN_ARTIFACT") {
    const town = findTown(gamePlayer, action.townId);
    if (!town) return NextResponse.json({ error: "Ville invalide" }, { status: 400 });
    const buildings = town.buildings ?? [];
    const townFaction = (town.townType ?? gamePlayer.faction ?? Faction.CASTLE) as Faction;
    const artifactBuilding = helpers.getArtifactMerchantBuilding(townFaction);
    if (!artifactBuilding || !buildings.includes(artifactBuilding)) {
      return NextResponse.json({ error: "Cette ville n'a pas de Marchands d'artefacts" }, { status: 400 });
    }
    const hero = gamePlayer.heroes.find((item) => item.id === action.heroId);
    if (!hero) return NextResponse.json({ error: "Héros invalide" }, { status: 400 });
    if (hero.x !== town.x || hero.y !== town.y) {
      return NextResponse.json({ error: "Le héros doit être au château pour acheter" }, { status: 400 });
    }
    const mapState = (game.mapState as Record<string, unknown>) ?? {};
    const townArtifactOffers = (mapState.townArtifactOffers as Record<string, string[]> | undefined) ?? {};
    const offer = townArtifactOffers[town.id] ?? [];
    const artifactId = String(action.artifactId ?? "");
    if (!offer.includes(artifactId)) return NextResponse.json({ error: "Artefact indisponible" }, { status: 400 });
    const artifact = getArtifact(artifactId);
    if (!artifact) return NextResponse.json({ error: "Artefact inconnu" }, { status: 400 });
    const price = artifact.cost ?? 5000;
    if (gamePlayer.gold < price) return NextResponse.json({ error: "Or insuffisant" }, { status: 400 });
    await helpers.updatePlayerResources(supabase, gamePlayer.id, { gold: gamePlayer.gold - price });
    const nextArtifacts = helpers.addArtifactToBag(hero.artifacts, artifactId);
    await supabase.from("heroes").update({ artifacts: nextArtifacts }).eq("id", hero.id);
    const nextOffer = offer.filter((id) => id !== artifactId);
    await supabase.from("games").update({
      map_state: { ...mapState, townArtifactOffers: { ...townArtifactOffers, [town.id]: nextOffer } },
    }).eq("id", gameId);
    await helpers.logPlayerAction(supabase, game, gameId, gamePlayer, action);
    return NextResponse.json({ success: true, artifact: artifact.name, price });
  }

  return null;
}

function findTown(gamePlayer: MinimalPlayer, value: unknown): MinimalTown | undefined {
  return gamePlayer.towns.find((town) => town.id === value);
}
