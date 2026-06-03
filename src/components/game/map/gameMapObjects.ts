import { MapObjectData } from "@/lib/rendering/mapRenderer";
import { getMapObjectHoverDescription } from "@/lib/rendering/phaser/mapObjectLayout";
import { Position, ResourceBuilding, type MapLevelId } from "@/lib/game/types";
import { SURFACE_LEVEL, normalizeExploredTileKey, normalizeMapLevel, withActiveMapLayer } from "@/lib/game/map-levels";
import { getAdventureBuildingExhaustion, getAdventureBuildingLabel } from "@/lib/game/adventure-buildings";
import { getExternalDwellingLabel, isExternalDwellingType } from "@/lib/game/external-dwellings";
import { getCombatHeroIds } from "@/lib/game/combat/active-heroes";
import { RESOURCE_BUILDING_RULES } from "@/lib/game/economy";
import { getPlayerVisionCenters } from "@/lib/game/engine";
import { useGameStore } from "@/lib/stores/gameStore";
import { translate } from "@/lib/i18n/translate";
import { localizedLabelFromId } from "@/lib/i18n/gameLabels";
import type { Locale } from "@/lib/i18n/types";

const RESOURCE_BUILDING_LABEL_BY_TYPE = new Map<string, string>(
  RESOURCE_BUILDING_RULES.map((rule) => [rule.type, rule.label])
);

export function buildObjects(
  gameState: NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>,
  currentPlayer: { id: string; isAlive?: boolean; exploredTiles: string[]; heroes: { position: Position }[]; towns: { position: Position }[] } | undefined,
  revealMap = false,
  selectedHeroId?: string | null,
  activeMapLevel: MapLevelId = SURFACE_LEVEL,
  activeMap = withActiveMapLayer(gameState.map, activeMapLevel),
  locale: Locale = "fr",
): MapObjectData[] {
  const adventureVisits = gameState.adventureVisits;
  const exhaustionCtx = currentPlayer && adventureVisits ? {
    playerId: currentPlayer.id,
    selectedHeroId: selectedHeroId ?? null,
    turnNumber: gameState.turnNumber ?? 1,
    visitedAdventureBuildings: new Set(adventureVisits.visitedAdventureBuildings ?? []),
    playerAdventureVisits: adventureVisits.playerAdventureVisits ?? {},
    heroAdventureVisits: adventureVisits.heroAdventureVisits ?? {},
    weeklyAdventureVisits: adventureVisits.weeklyAdventureVisits ?? {},
    mysticalGardenVisits: adventureVisits.mysticalGardenVisits ?? {},
  } : null;
  const objects: MapObjectData[] = [];
  const exploredSet = new Set(
    (currentPlayer?.exploredTiles ?? [])
      .map(normalizeExploredTileKey)
      .filter((key) => key.startsWith(`${activeMapLevel}:`))
      .map((key) => key.slice(key.indexOf(":") + 1))
  );
  const visiblePositions = new Set<string>();
  const heroCombatIds = new Map<string, string>();
  const embarkedHeroIds = new Set((gameState.boats ?? []).map((boat) => boat.heroId).filter(Boolean));

  for (const combat of gameState.activeCombats ?? []) {
    for (const heroId of getCombatHeroIds(combat)) {
      heroCombatIds.set(heroId, combat.id);
    }
  }

  if (revealMap || currentPlayer?.isAlive === false) {
    for (let y = 0; y < activeMap.height; y++) {
      for (let x = 0; x < activeMap.width; x++) {
        const key = `${x},${y}`;
        exploredSet.add(key);
        visiblePositions.add(key);
      }
    }
  } else if (currentPlayer) {
    for (const center of getPlayerVisionCenters(currentPlayer)) {
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= 5) {
            visiblePositions.add(`${center.x + dx},${center.y + dy}`);
          }
        }
      }
    }
  }

  for (const player of gameState.players) {
    const isCurrentPlayer = player.id === currentPlayer?.id;
    const layerTowns = player.towns.filter((town) => normalizeMapLevel(town.position.level) === activeMapLevel);
    const layerHeroes = player.heroes.filter((hero) => normalizeMapLevel(hero.position.level) === activeMapLevel);
    const townPositions = new Set(layerTowns.map((town) => `${town.position.x},${town.position.y}`));
    const heroesByTown = new Map<string, typeof player.heroes>();
    for (const town of layerTowns) {
      const key = `${town.position.x},${town.position.y}`;
      heroesByTown.set(
        key,
        layerHeroes.filter((hero) => hero.position.x === town.position.x && hero.position.y === town.position.y)
      );
    }

    if (gameState.status !== "PENDING") {
      for (const hero of layerHeroes) {
        const key = `${hero.position.x},${hero.position.y}`;
        if (!isCurrentPlayer && currentPlayer?.isAlive !== false && !visiblePositions.has(key)) continue;
        const townHeroes = heroesByTown.get(key) ?? [];
        const townHeroIndex = townHeroes.findIndex((item) => item.id === hero.id);
        const townHeroOffset = townHeroIndex >= 0
          ? getTownHeroRenderOffset(townHeroIndex, townHeroes.length)
          : null;
        objects.push({
          type: "hero",
          id: hero.id,
          playerId: player.id,
          x: hero.position.x,
          y: hero.position.y,
          faction: player.faction as string,
          color: player.color,
          name: hero.name,
          onWater: embarkedHeroIds.has(hero.id),
          inTown: townPositions.has(key),
          renderOffsetX: townHeroOffset?.x,
          renderOffsetY: townHeroOffset?.y,
        });
      }
    }
    for (const town of layerTowns) {
      const key = `${town.position.x},${town.position.y}`;
      // Show own towns always, enemy towns only if explored
      if (!isCurrentPlayer && currentPlayer?.isAlive !== false && !exploredSet.has(key)) continue;
      objects.push({
        type: "town",
        id: town.id,
        playerId: player.id,
        x: town.position.x,
        y: town.position.y,
        faction: (town.townType ?? town.faction) as string,
        color: player.color,
        name: town.name,
      });
    }
  }

  for (const boat of gameState.boats ?? []) {
    if (boat.heroId) continue;
    if (normalizeMapLevel(boat.position.level) !== activeMapLevel) continue;
    const key = `${boat.position.x},${boat.position.y}`;
    if (currentPlayer?.isAlive !== false && !exploredSet.has(key) && !visiblePositions.has(key)) continue;
    objects.push({
      type: "boat",
      id: boat.id,
      playerId: boat.ownerId,
      x: boat.position.x,
      y: boat.position.y,
      faction: String(boat.faction ?? "castle"),
      color: "#f8fafc",
      name: translate(locale, "build.boat"),
      onWater: true,
    });
  }

  const knownTownPositions = new Set(
    gameState.players
      .flatMap((player) => player.towns)
      .map((town) => `${town.position.x},${town.position.y}`)
  );
  const buildingByPosition = new Map<string, ResourceBuilding>();
  const ownerByBuildingId = new Map<string, (typeof gameState.players)[number]>();
  const playerById = new Map(gameState.players.map((player) => [player.id, player]));

  for (const player of gameState.players) {
    for (const building of player.resourceBuildings) {
      if (normalizeMapLevel(building.position.level) !== activeMapLevel) continue;
      buildingByPosition.set(`${building.position.x},${building.position.y}`, building);
      ownerByBuildingId.set(building.id, player);
    }
  }

  if (activeMap?.tiles) {
    for (let y = 0; y < activeMap.height; y++) {
      for (let x = 0; x < activeMap.width; x++) {
        const tile = activeMap.tiles[y]?.[x];
        if (!tile?.object || tile.object.type !== "town") continue;
        const key = `${x},${y}`;
        if (knownTownPositions.has(key)) continue;
        if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;

        objects.push({
          type: "town",
          id: tile.object.id,
          playerId: null,
          x,
          y,
          faction: tile.object.subtype ?? "neutral",
          color: "#a8a29e",
          name: tile.object.name ?? translate(locale, "map.neutralTown"),
        });
      }
    }
  }

  // Resource buildings from map tiles + ownership data
  if (activeMap?.tiles) {
    for (let y = 0; y < activeMap.height; y++) {
      for (let x = 0; x < activeMap.width; x++) {
        const tile = activeMap.tiles[y]?.[x];
        if (!tile?.object || tile.object.type !== "building") continue;
        const tileObject = tile.object;
        const key = `${x},${y}`;
        if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;

        const building = buildingByPosition.get(key);
        const owner = building ? ownerByBuildingId.get(building.id) : undefined;
        const buildingType = building?.type ?? tileObject.subtype;

        objects.push({
          type: "building",
          id: tileObject.id,
          playerId: owner?.id ?? null,
          x,
          y,
          faction: owner?.faction as string ?? "",
          color: owner?.color ?? "",
          name: localizedLabelFromId(buildingType ?? "", RESOURCE_BUILDING_LABEL_BY_TYPE.get(buildingType ?? "") ?? buildingType ?? "", locale),
          buildingType: tileObject.subtype,
          guardianPower: tileObject.guardianPower ?? building?.guardianPower ?? 0,
        });
      }
    }
  }

  if (activeMap?.tiles) {
    for (let y = 0; y < activeMap.height; y++) {
      for (let x = 0; x < activeMap.width; x++) {
        const tile = activeMap.tiles[y]?.[x];
        if (!tile?.object || tile.object.type !== "adventure_building") continue;
        const key = `${x},${y}`;
        if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;

        const exhaustion = exhaustionCtx ? getAdventureBuildingExhaustion({
          ...exhaustionCtx,
          buildingId: tile.object.id,
          subtype: tile.object.subtype,
        }) : { exhausted: false };
        const baseDescription = getMapObjectHoverDescription(tile.object, locale) ?? undefined;
        const description = exhaustion.exhausted
          ? (baseDescription ? `${baseDescription}\n${exhaustion.reason}` : exhaustion.reason)
          : baseDescription;

        objects.push({
          type: "adventure_building",
          id: tile.object.id,
          playerId: tile.object.ownerId ?? null,
          x,
          y,
          faction: tile.object.ownerId ? (playerById.get(tile.object.ownerId)?.faction as string ?? "") : "",
          color: tile.object.ownerId ? (playerById.get(tile.object.ownerId)?.color ?? "") : "",
          name: isExternalDwellingType(tile.object.subtype)
            ? localizedLabelFromId(tile.object.targetId ?? "", getExternalDwellingLabel(tile.object.targetId), locale)
            : tile.object.name ?? localizedLabelFromId(tile.object.subtype ?? "", getAdventureBuildingLabel(tile.object.subtype), locale),
          description,
          buildingType: tile.object.subtype,
          dwellingUnitType: isExternalDwellingType(tile.object.subtype) ? tile.object.targetId : undefined,
          guardianPower: tile.object.guardianPower ?? 0,
          visited: exhaustion.exhausted,
        });
      }
    }
  }

  const gatePositions = new Set<string>();
  for (const gate of gameState.gates ?? []) {
    if (normalizeMapLevel(gate.position.level) !== activeMapLevel) continue;
    const key = `${gate.position.x},${gate.position.y}`;
    if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;
    gatePositions.add(key);
    const owner = gate.ownerId ? playerById.get(gate.ownerId) : undefined;
    objects.push({
      type: "gate",
      id: gate.id,
      playerId: gate.ownerId,
      x: gate.position.x,
      y: gate.position.y,
      faction: owner?.faction as string ?? "",
      color: owner?.color ?? "",
      name: translate(locale, owner ? "map.gateOwned" : "map.gateNeutral"),
      guardianPower: gate.guardianPower,
    });
  }

  if (activeMap?.tiles) {
    for (let y = 0; y < activeMap.height; y++) {
      for (let x = 0; x < activeMap.width; x++) {
        const tile = activeMap.tiles[y]?.[x];
        if (!tile?.object || tile.object.type !== "gate") continue;
        const key = `${x},${y}`;
        if (gatePositions.has(key)) continue;
        if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;

        objects.push({
          type: "gate",
          id: tile.object.id,
          playerId: tile.object.ownerId ?? null,
          x,
          y,
          faction: "",
          color: "",
          name: translate(locale, tile.object.ownerId ? "map.gateOwned" : "map.gateNeutral"),
          guardianPower: tile.object.guardianPower ?? 0,
        });
      }
    }
  }

  for (const combat of gameState.activeCombats ?? []) {
    if (normalizeMapLevel(combat.position.level) !== activeMapLevel) continue;
    const key = `${combat.position.x},${combat.position.y}`;
    if (!exploredSet.has(key) && !visiblePositions.has(key)) continue;
    objects.push({
      type: "combat",
      id: combat.id,
      playerId: combat.attackerPlayerId,
      x: combat.position.x,
      y: combat.position.y,
      faction: "castle",
      color: "#f97316",
      name: translate(locale, "map.combatInProgress"),
    });
  }

  for (const player of gameState.players) {
    const isCurrentPlayer = player.id === currentPlayer?.id;
    for (const hero of player.heroes.filter((item) => normalizeMapLevel(item.position.level) === activeMapLevel)) {
      const combatId = heroCombatIds.get(hero.id);
      if (!combatId) continue;
      const key = `${hero.position.x},${hero.position.y}`;
      if (!isCurrentPlayer && currentPlayer?.isAlive !== false && !visiblePositions.has(key) && !exploredSet.has(key)) continue;
      objects.push({
        type: "combat",
        id: combatId,
        playerId: player.id,
        x: hero.position.x,
        y: hero.position.y,
        faction: player.faction as string,
        color: "#f97316",
        name: translate(locale, "game.combatMarker"),
      });
    }
  }

  return objects;
}

function getTownHeroRenderOffset(index: number, total: number) {
  const clampedTotal = Math.max(1, total);
  const rowSize = clampedTotal <= 5 ? clampedTotal : Math.ceil(clampedTotal / 2);
  const row = Math.floor(index / rowSize);
  const column = index % rowSize;
  const itemsInRow = row === 0 ? Math.min(rowSize, clampedTotal) : clampedTotal - rowSize;
  const centered = column - (Math.max(1, itemsInRow) - 1) / 2;

  return {
    x: centered * 18,
    y: row * 13,
  };
}
