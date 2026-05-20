import {
  GameState, Faction, HeroClass, UnitType, BuildingType,
  Hero, Town, Player, GameMap, MapTile, PersistentCombat,
  ResourceBuilding, ResourceBuildingType, TavernHeroOffer, NeutralArmy, AdventureBuildingType, Gate, MapObject,
} from "./types";
import { isCreatureBankType } from "./creature-banks";
import { computeVisibleTiles, getPlayerVisionCenters, normalizeMapMovement } from "./engine";
import { createNeutralArmyStacksForTile, getDominantUnitType } from "./neutral-armies";
import { normalizeTownBuildings } from "./town-buildings";

interface ApiPlayer {
  id: string;
  userId: string | null;
  user?: { name: string | null };
  isAi?: boolean;
  aiName?: string | null;
  faction: string;
  color: string;
  gold: number;
  wood: number;
  ore: number;
  mercury: number;
  crystals: number;
  gems?: number;
  sulfur: number;
  isAlive: boolean;
  turnOrder: number;
  exploredTiles: string[];
  heroes: ApiHero[];
  towns: ApiTown[];
  resourceBuildings?: ApiResourceBuilding[];
}

interface ApiTurn {
  gamePlayerId: string;
  turnNumber: number;
  isCompleted: boolean;
}

interface ApiHero {
  id: string;
  name: string;
  class?: string;
  specialty?: string | null;
  level: number;
  experience: number;
  attack: number;
  defense: number;
  spellPower: number;
  knowledge: number;
  x: number;
  y: number;
  movement: number;
  maxMovement: number;
  armies: ApiArmy[];
}

interface ApiArmy {
  id: string;
  unitType: string;
  count: number;
  health: number;
  maxHealth: number;
  position: number;
}

interface ApiNeutralArmy {
  id: string;
  status: string;
  x: number;
  y: number;
  stacks?: ApiArmy[];
}

interface ApiGate {
  id: string;
  gamePlayerId: string | null;
  x: number;
  y: number;
  guardianPower: number;
  garrison?: ApiArmy[];
}

interface ApiTown {
  id: string;
  name: string;
  townType?: string;
  x: number;
  y: number;
  level: number;
  buildings: string[];
  garrison: string[];
  neutralGarrison?: ApiArmy[];
  isNeutral?: boolean;
  availableRecruits?: Record<string, number>;
  tavernOffer?: TavernHeroOffer[];
  lastBuiltTurn?: number | null;
}

interface ApiResourceBuilding {
  id: string;
  gamePlayerId: string | null;
  buildingType: string;
  x: number;
  y: number;
  guardianPower: number;
}

interface ApiCombat {
  id: string;
  gameId: string;
  mode: "AUTO" | "MANUAL";
  status: "ACTIVE" | "RESOLVED";
  attackerPlayerId: string;
  defenderPlayerId?: string | null;
  attackerHeroId: string;
  defenderHeroId?: string | null;
  neutralArmyId?: string | null;
  gateId?: string | null;
  currentPlayerId?: string | null;
  currentUnitId?: string | null;
  round: number;
  x: number;
  y: number;
  boardState: PersistentCombat["boardState"];
  turnQueue: string[];
  actionLog: string[];
  participants?: PersistentCombat["participants"];
  result?: PersistentCombat["result"];
  visibility?: PersistentCombat["visibility"];
}

const staticGameMaps = new Map<string, GameMap>();

function cloneGameMap(map: GameMap) {
  return structuredClone(map);
}

function shouldAlwaysKeepTileObject(object: MapTile["object"] | undefined) {
  return object?.type === "wall";
}

export function getCachedStaticGameMap(gameId: string) {
  return staticGameMaps.get(gameId) ?? null;
}

export function setCachedStaticGameMap(gameId: string, map: GameMap) {
  staticGameMaps.set(gameId, normalizeMapMovement(cloneGameMap(map)));
}

function getCompletedTurnPlayerIds(data: Record<string, unknown>, turnNumber: number) {
  return new Set(
    ((data.turns as ApiTurn[] | undefined) ?? [])
      .filter((turn) => turn.turnNumber === turnNumber && turn.isCompleted)
      .map((turn) => turn.gamePlayerId)
  );
}

function mapPlayers(data: Record<string, unknown>, turnNumber: number) {
  const completedTurnPlayerIds = getCompletedTurnPlayerIds(data, turnNumber);

  return ((data.players as ApiPlayer[] | undefined) ?? []).map((player): Player => ({
    id: player.id,
    userId: player.userId,
    name: player.isAi ? player.aiName || "IA" : player.user?.name || "Joueur inconnu",
    isAi: player.isAi ?? false,
    faction: player.faction as Faction,
    color: player.color,
    resources: {
      gold: player.gold,
      wood: player.wood,
      ore: player.ore,
      mercury: player.mercury,
      crystals: player.crystals,
      gems: player.gems ?? 0,
      sulfur: player.sulfur,
    },
    heroes: player.heroes.map((hero): Hero => ({
      id: hero.id,
      name: hero.name,
      class: (hero.class ?? "knight") as HeroClass,
      specialty: hero.specialty ?? undefined,
      level: hero.level,
      experience: hero.experience,
      stats: {
        attack: hero.attack,
        defense: hero.defense,
        spellPower: hero.spellPower,
        knowledge: hero.knowledge,
      },
      position: { x: hero.x, y: hero.y },
      movement: hero.movement,
      maxMovement: hero.maxMovement,
      armies: hero.armies.map((army) => ({
        id: army.id,
        unitType: army.unitType as UnitType,
        count: army.count,
        health: army.health,
        maxHealth: army.maxHealth,
        position: army.position,
      })),
    })),
    towns: player.towns.map((town): Town => ({
      id: town.id,
      name: town.name,
      faction: player.faction as Faction,
      townType: town.townType as Faction | undefined,
      position: { x: town.x, y: town.y },
      level: town.level,
      buildings: normalizeTownBuildings((town.buildings || []) as BuildingType[]),
      garrison: (town.garrison || []) as never[],
      neutralGarrison: (town.neutralGarrison ?? []).map((army) => ({
        id: army.id,
        unitType: army.unitType as UnitType,
        count: army.count,
        health: army.health,
        maxHealth: army.maxHealth,
        position: army.position,
      })),
      isNeutral: town.isNeutral ?? false,
      availableRecruits: (town.availableRecruits ?? {}) as Partial<Record<UnitType, number>>,
      tavernOffer: town.tavernOffer ?? [],
      lastBuiltTurn: town.lastBuiltTurn ?? null,
    })),
    resourceBuildings: (player.resourceBuildings ?? []).map((building): ResourceBuilding => ({
      id: building.id,
      type: building.buildingType as ResourceBuildingType,
      position: { x: building.x, y: building.y },
      ownerId: building.gamePlayerId,
      guardianPower: building.guardianPower ?? 0,
    })),
    isAlive: player.isAlive,
    turnOrder: player.turnOrder,
    exploredTiles: player.exploredTiles ?? [],
    hasEndedTurn: completedTurnPlayerIds.has(player.id),
  }));
}

function mapNeutralArmies(data: Record<string, unknown>) {
  return ((data.neutralArmies as ApiNeutralArmy[] | undefined) ?? []).map((army): NeutralArmy => ({
    id: army.id,
    status: army.status,
    position: { x: army.x, y: army.y },
    stacks: (army.stacks ?? []).map((stack) => ({
      id: stack.id,
      unitType: stack.unitType as UnitType,
      count: stack.count,
      health: stack.health,
      maxHealth: stack.maxHealth,
      position: stack.position,
    })),
  }));
}

function isLegacyGateMonsterObject(object: MapObject | undefined): object is MapObject & { type: "monster"; id: string } {
  return object?.type === "monster" && typeof object.id === "string" && object.id.includes("gate-mon-");
}

function isGateMapObject(object: MapObject | undefined): object is MapObject & { id: string } {
  return object?.type === "gate" && typeof object.id === "string";
}

function mapGates(data: Record<string, unknown>, neutralArmies: NeutralArmy[] = [], staticMapOverride?: GameMap): Gate[] {
  const gatesById = new Map<string, Gate>();
  for (const gate of ((data.gates as ApiGate[] | undefined) ?? []).map((gate): Gate => ({
    id: gate.id,
    ownerId: gate.gamePlayerId,
    position: { x: gate.x, y: gate.y },
    guardianPower: gate.guardianPower ?? 0,
    garrison: (gate.garrison ?? []).map((stack) => ({
      id: stack.id,
      unitType: stack.unitType as UnitType,
      count: stack.count,
      health: stack.health,
      maxHealth: stack.maxHealth,
      position: stack.position,
    })),
  }))) {
    gatesById.set(gate.id, gate);
  }

  const neutralArmiesById = new Map(neutralArmies.map((army) => [army.id, army]));
  const mapData = (data.mapData as GameMap | undefined) ?? staticMapOverride;
  for (const row of mapData?.tiles ?? []) {
    for (const tile of row) {
      const object = tile.object;
      if (!isLegacyGateMonsterObject(object) && !isGateMapObject(object)) continue;
      if (gatesById.has(object.id)) continue;
      const neutralArmy = neutralArmiesById.get(object.id);
      const fallbackGarrison = object.type === "gate"
        ? createNeutralArmyStacksForTile(tile, object.guardianPower ?? 100, object.id).map((stack) => ({
          id: `${object.id}-stack-${stack.position}`,
          unitType: stack.unitType,
          count: stack.count,
          health: stack.health,
          maxHealth: stack.maxHealth,
          position: stack.position,
        }))
        : [];
      gatesById.set(object.id, {
        id: object.id,
        ownerId: null,
        position: { x: tile.x, y: tile.y },
        guardianPower: object.guardianPower ?? 0,
        garrison: neutralArmy?.status === "ACTIVE" ? neutralArmy.stacks : fallbackGarrison,
      });
    }
  }

  return [...gatesById.values()];
}

function mapActiveCombats(data: Record<string, unknown>) {
  return ((data.combats as ApiCombat[] | undefined) ?? [])
    .filter((combat) => combat.status === "ACTIVE")
    .map((combat): PersistentCombat => ({
      id: combat.id,
      gameId: combat.gameId,
      mode: combat.mode,
      status: combat.status,
      attackerPlayerId: combat.attackerPlayerId,
      defenderPlayerId: combat.defenderPlayerId,
      attackerHeroId: combat.attackerHeroId,
      defenderHeroId: combat.defenderHeroId,
      neutralArmyId: combat.neutralArmyId,
      gateId: combat.gateId,
      currentPlayerId: combat.currentPlayerId,
      currentUnitId: combat.currentUnitId,
      round: combat.round,
      position: { x: combat.x, y: combat.y },
      boardState: combat.boardState,
      turnQueue: combat.turnQueue,
      actionLog: combat.actionLog,
      participants: combat.participants ?? [],
      result: combat.result,
      visibility: combat.visibility ?? "full",
    }));
}

function buildExploredSet(
  map: GameMap,
  currentPlayer: Player | undefined,
  revealMap: boolean
) {
  if (revealMap) {
    const explored = new Set<string>();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        explored.add(`${x},${y}`);
      }
    }
    return explored;
  }

  const explored = new Set(currentPlayer?.exploredTiles ?? []);
  if (!currentPlayer) return explored;

  for (const key of computeVisibleTiles(map, getPlayerVisionCenters(currentPlayer), 5)) {
    explored.add(key);
  }

  return explored;
}

function applyDynamicMapState(
  targetMap: GameMap,
  staticMap: GameMap,
  players: Player[],
  currentPlayer: Player | undefined,
  neutralArmies: NeutralArmy[],
  mapStateValue: unknown,
  revealMap: boolean
) {
  const mapState = (mapStateValue as Record<string, unknown>) ?? {};
  const collected = new Set<string>((mapState.collected as string[]) ?? []);
  const killed = new Set<string>((mapState.killed as string[]) ?? []);
  const visitedAdventureBuildings = new Set<string>((mapState.visitedAdventureBuildings as string[]) ?? []);
  const defeatedCreatureBanks = new Set(
    Object.entries((mapState.creatureBanks as Record<string, { defeated?: boolean; claimed?: boolean }> | undefined) ?? {})
      .filter(([, state]) => state.defeated || state.claimed)
      .map(([bankId]) => bankId)
  );
  const defeatedNeutralArmies = new Set(
    neutralArmies
      .filter((army) => army.status !== "ACTIVE")
      .map((army) => army.id)
  );
  const dominantNeutralUnits = new Map(
    neutralArmies
      .filter((army) => army.status === "ACTIVE")
      .map((army) => [army.id, getDominantUnitType(army.stacks)] as const)
      .filter((entry): entry is readonly [string, UnitType] => Boolean(entry[1]))
  );
  const gates = (mapState.gates as Gate[] | undefined) ?? [];
  const exploredSet = buildExploredSet(targetMap, currentPlayer, revealMap);
  const allBuildings = players.flatMap((player) => player.resourceBuildings);
  const buildingsById = new Map<string, ResourceBuilding>(
    allBuildings.map((building) => [building.id, building])
  );
  const buildingsByPosition = new Map<string, ResourceBuilding>(
    allBuildings.map((building) => [`${building.position.x},${building.position.y}`, building])
  );
  const gatesById = new Map<string, Gate>(gates.map((gate) => [gate.id, gate]));
  const gatesByPosition = new Map<string, Gate>(
    gates.map((gate) => [`${gate.position.x},${gate.position.y}`, gate])
  );

  for (let y = 0; y < targetMap.height; y++) {
    for (let x = 0; x < targetMap.width; x++) {
      const tile = targetMap.tiles[y]?.[x] as MapTile | undefined;
      const sourceTile = staticMap.tiles[y]?.[x] as MapTile | undefined;
      if (!tile || !sourceTile) continue;

      tile.object = sourceTile.object ? { ...sourceTile.object } : undefined;
      tile.isPassable = sourceTile.isPassable;
      tile.movementCost = sourceTile.movementCost;

      const key = `${x},${y}`;
      const isExplored = revealMap || exploredSet.has(key);
      const gateData = gatesByPosition.get(key);

      if (!tile.object && gateData) {
        tile.object = {
          type: "gate",
          id: gateData.id,
          ownerId: gateData.ownerId,
          guardianPower: gateData.guardianPower,
        };
      }

      if (tile.object) {
        const object = tile.object;
        if (isLegacyGateMonsterObject(object)) {
          const legacyGate = gatesById.get(object.id) ?? gateData;
          tile.object = {
            type: "gate",
            id: legacyGate?.id ?? object.id,
            subtype: object.subtype,
            ownerId: legacyGate?.ownerId ?? null,
            guardianPower: legacyGate?.guardianPower ?? object.guardianPower ?? 0,
          };
          if (!isExplored) {
            delete tile.object;
          }
        } else if (object.type === "resource" && collected.has(object.id)) {
          delete tile.object;
        } else if (object.type === "monster" && (killed.has(object.id) || defeatedNeutralArmies.has(object.id))) {
          delete tile.object;
        } else if (
          object.type === "adventure_building" &&
          object.subtype === AdventureBuildingType.CAMPFIRE &&
          visitedAdventureBuildings.has(object.id)
        ) {
          delete tile.object;
        } else if (
          object.type === "adventure_building" &&
          isCreatureBankType(object.subtype) &&
          defeatedCreatureBanks.has(object.id)
        ) {
          delete tile.object;
        } else if (object.type === "monster") {
          const dominantUnitType = dominantNeutralUnits.get(object.id);
          if (dominantUnitType) object.subtype = dominantUnitType;
        } else if (object.type === "building") {
          const buildingData = buildingsById.get(object.id) ?? buildingsByPosition.get(key);
          if (buildingData) {
            object.guardianPower = buildingData.guardianPower;
          }
          if (!isExplored) {
            delete tile.object;
          }
        } else if (object.type === "gate") {
          const currentGateData = gatesById.get(object.id) ?? gateData;
          if (currentGateData) {
            object.id = currentGateData.id;
            object.ownerId = currentGateData.ownerId;
            object.guardianPower = currentGateData.guardianPower;
          }
          if (!isExplored) {
            delete tile.object;
          }
        } else if (!isExplored && !shouldAlwaysKeepTileObject(object)) {
          delete tile.object;
        }
      }

      if (!isExplored) {
        tile.isPassable = false;
        tile.movementCost = 999;
      }
    }
  }
}

export function mapApiToGameState(
  data: Record<string, unknown>,
  currentUserId?: string,
  options: { revealMap?: boolean } = {}
): GameState {
  const turnNumber = data.turnNumber as number;
  const players = mapPlayers(data, turnNumber);
  const neutralArmies = mapNeutralArmies(data);
  const gates = mapGates(data, neutralArmies);
  const activeCombats = mapActiveCombats(data);
  const currentPlayer = players.find((player) => player.userId === currentUserId);
  const mapId = data.id as string;
  const normalizedStaticMap = normalizeMapMovement(cloneGameMap(data.mapData as GameMap));

  staticGameMaps.set(mapId, normalizedStaticMap);

  const map = cloneGameMap(normalizedStaticMap);
  applyDynamicMapState(
    map,
    normalizedStaticMap,
    players,
    currentPlayer,
    neutralArmies,
    { ...((data.mapState as Record<string, unknown> | undefined) ?? {}), gates },
    Boolean(options.revealMap)
  );

  return {
    id: mapId,
    status: data.status as GameState["status"],
    maxPlayers: (data.maxPlayers as number) ?? 8,
    players,
    map,
    turnNumber,
    calendar: getGameCalendar(turnNumber),
    currentTurnPlayerId: (data.currentTurnPlayerId as string) || "",
    winnerId: data.winnerId as string | undefined,
    neutralArmies,
    gates,
    activeCombats,
  };
}

export function mergeGameDynamicState(
  baseGameState: GameState,
  data: Record<string, unknown>,
  currentUserId?: string,
  options: { revealMap?: boolean } = {}
): GameState {
  const staticMap = getCachedStaticGameMap(baseGameState.id);
  if (!staticMap) return baseGameState;

  const turnNumber = data.turnNumber as number;
  const players = mapPlayers(data, turnNumber);
  const neutralArmies = mapNeutralArmies(data);
  const gates = mapGates(data, neutralArmies, staticMap);
  const activeCombats = mapActiveCombats(data);
  const currentPlayer = players.find((player) => player.userId === currentUserId);

  applyDynamicMapState(
    baseGameState.map,
    staticMap,
    players,
    currentPlayer,
    neutralArmies,
    { ...((data.mapState as Record<string, unknown> | undefined) ?? {}), gates },
    Boolean(options.revealMap)
  );

  return {
    ...baseGameState,
    status: (data.status as GameState["status"]) ?? baseGameState.status,
    players,
    turnNumber,
    calendar: getGameCalendar(turnNumber),
    currentTurnPlayerId: (data.currentTurnPlayerId as string) || baseGameState.currentTurnPlayerId,
    winnerId: (data.winnerId as string | undefined) ?? baseGameState.winnerId,
    neutralArmies,
    gates,
    activeCombats,
  };
}

function getGameCalendar(dayNumber: number) {
  const zeroBasedDay = Math.max(0, dayNumber - 1);
  return {
    dayNumber,
    dayOfWeek: (zeroBasedDay % 7) + 1,
    weekNumber: Math.floor(zeroBasedDay / 7) + 1,
    weekOfMonth: (Math.floor(zeroBasedDay / 7) % 4) + 1,
    monthNumber: Math.floor(zeroBasedDay / 28) + 1,
    monthOfYear: (Math.floor(zeroBasedDay / 28) % 12) + 1,
    yearNumber: Math.floor(zeroBasedDay / 336) + 1,
  };
}
