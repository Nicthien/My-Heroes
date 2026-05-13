import { TerrainType } from "../types";

export type GuardStrength = "weak" | "normal" | "strong" | "veryStrong";
export type WallType = "natural" | "brick";
export type MonsterStrength = "weak" | "normal" | "strong";
export type LandStyle = "islands" | "volcanic-crown";

export interface ZoneTemplate {
  id: string;
  type: "player" | "treasure" | "junction";
  ownerIndex?: number;
  baseTerrain: TerrainType;
  sizeWeight: number;
  value: number;
  hasTown?: boolean;
  townIsNeutral?: boolean;
  monsterStrength: MonsterStrength;
  /** Position normalisée [0..1] dans la carte */
  nx: number;
  ny: number;
}

export interface ConnectionTemplate {
  from: string;
  to: string;
  guardStrength: GuardStrength;
  wallType: WallType;
}

export interface MapTemplate {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  landStyle?: LandStyle;
  zones: ZoneTemplate[];
  connections: ConnectionTemplate[];
}

export const GUARD_MULTIPLIER: Record<GuardStrength, number> = {
  weak: 0.25,
  normal: 0.5,
  strong: 0.9,
  veryStrong: 1.5,
};

export const MONSTER_STRENGTH_MULTIPLIER: Record<MonsterStrength, number> = {
  weak: 0.25,
  normal: 0.5,
  strong: 0.9,
};

const JEBUS_CROSS: MapTemplate = {
  id: "jebus-cross",
  name: "Jebus Cross",
  minPlayers: 2,
  maxPlayers: 4,
  zones: [
    {
      id: "p1",
      type: "player",
      ownerIndex: 0,
      baseTerrain: TerrainType.GRASS,
      sizeWeight: 1.0,
      value: 2000,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.18,
      ny: 0.18,
    },
    {
      id: "p2",
      type: "player",
      ownerIndex: 1,
      baseTerrain: TerrainType.GRASS,
      sizeWeight: 1.0,
      value: 2000,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.82,
      ny: 0.18,
    },
    {
      id: "p3",
      type: "player",
      ownerIndex: 2,
      baseTerrain: TerrainType.GRASS,
      sizeWeight: 1.0,
      value: 2000,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.18,
      ny: 0.82,
    },
    {
      id: "p4",
      type: "player",
      ownerIndex: 3,
      baseTerrain: TerrainType.GRASS,
      sizeWeight: 1.0,
      value: 2000,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.82,
      ny: 0.82,
    },
    {
      id: "j-n",
      type: "junction",
      baseTerrain: TerrainType.FOREST,
      sizeWeight: 0.8,
      value: 2500,
      monsterStrength: "normal",
      hasTown: true,
      townIsNeutral: true,
      nx: 0.5,
      ny: 0.18,
    },
    {
      id: "j-s",
      type: "junction",
      baseTerrain: TerrainType.SWAMP,
      sizeWeight: 0.8,
      value: 2500,
      monsterStrength: "normal",
      hasTown: true,
      townIsNeutral: true,
      nx: 0.5,
      ny: 0.82,
    },
    {
      id: "j-w",
      type: "junction",
      baseTerrain: TerrainType.SAND,
      sizeWeight: 0.8,
      value: 2500,
      monsterStrength: "normal",
      hasTown: true,
      townIsNeutral: true,
      nx: 0.18,
      ny: 0.5,
    },
    {
      id: "j-e",
      type: "junction",
      baseTerrain: TerrainType.SNOW,
      sizeWeight: 0.8,
      value: 2500,
      monsterStrength: "normal",
      hasTown: true,
      townIsNeutral: true,
      nx: 0.82,
      ny: 0.5,
    },
    {
      id: "center",
      type: "treasure",
      baseTerrain: TerrainType.DIRT,
      sizeWeight: 1.3,
      value: 8000,
      hasTown: true,
      townIsNeutral: true,
      monsterStrength: "strong",
      nx: 0.5,
      ny: 0.5,
    },
  ],
  connections: [
    { from: "p1", to: "j-n", guardStrength: "normal", wallType: "natural" },
    { from: "p1", to: "j-w", guardStrength: "normal", wallType: "natural" },
    { from: "p2", to: "j-n", guardStrength: "normal", wallType: "natural" },
    { from: "p2", to: "j-e", guardStrength: "normal", wallType: "natural" },
    { from: "p3", to: "j-s", guardStrength: "normal", wallType: "natural" },
    { from: "p3", to: "j-w", guardStrength: "normal", wallType: "natural" },
    { from: "p4", to: "j-s", guardStrength: "normal", wallType: "natural" },
    { from: "p4", to: "j-e", guardStrength: "normal", wallType: "natural" },
    { from: "j-n", to: "center", guardStrength: "veryStrong", wallType: "brick" },
    { from: "j-s", to: "center", guardStrength: "veryStrong", wallType: "brick" },
    { from: "j-w", to: "center", guardStrength: "veryStrong", wallType: "brick" },
    { from: "j-e", to: "center", guardStrength: "veryStrong", wallType: "brick" },
  ],
};

const DUEL: MapTemplate = {
  id: "duel",
  name: "Duel",
  minPlayers: 2,
  maxPlayers: 2,
  zones: [
    {
      id: "p1",
      type: "player",
      ownerIndex: 0,
      baseTerrain: TerrainType.GRASS,
      sizeWeight: 1.0,
      value: 2500,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.18,
      ny: 0.5,
    },
    {
      id: "p2",
      type: "player",
      ownerIndex: 1,
      baseTerrain: TerrainType.GRASS,
      sizeWeight: 1.0,
      value: 2500,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.82,
      ny: 0.5,
    },
    {
      id: "center",
      type: "treasure",
      baseTerrain: TerrainType.DIRT,
      sizeWeight: 1.2,
      value: 6000,
      hasTown: true,
      townIsNeutral: true,
      monsterStrength: "strong",
      nx: 0.5,
      ny: 0.5,
    },
  ],
  connections: [
    { from: "p1", to: "center", guardStrength: "strong", wallType: "natural" },
    { from: "p2", to: "center", guardStrength: "strong", wallType: "natural" },
  ],
};

const ARCHIPELAGO: MapTemplate = {
  id: "archipelago",
  name: "Archipelago",
  minPlayers: 2,
  maxPlayers: 4,
  zones: [
    {
      id: "p1",
      type: "player",
      ownerIndex: 0,
      baseTerrain: TerrainType.GRASS,
      sizeWeight: 0.95,
      value: 2200,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.2,
      ny: 0.22,
    },
    {
      id: "p2",
      type: "player",
      ownerIndex: 1,
      baseTerrain: TerrainType.SAND,
      sizeWeight: 0.95,
      value: 2200,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.8,
      ny: 0.24,
    },
    {
      id: "p3",
      type: "player",
      ownerIndex: 2,
      baseTerrain: TerrainType.FOREST,
      sizeWeight: 0.95,
      value: 2200,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.22,
      ny: 0.78,
    },
    {
      id: "p4",
      type: "player",
      ownerIndex: 3,
      baseTerrain: TerrainType.SWAMP,
      sizeWeight: 0.95,
      value: 2200,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.78,
      ny: 0.76,
    },
    {
      id: "north-isle",
      type: "junction",
      baseTerrain: TerrainType.FOREST,
      sizeWeight: 0.75,
      value: 2600,
      hasTown: true,
      townIsNeutral: true,
      monsterStrength: "normal",
      nx: 0.5,
      ny: 0.2,
    },
    {
      id: "south-isle",
      type: "junction",
      baseTerrain: TerrainType.SWAMP,
      sizeWeight: 0.75,
      value: 2600,
      hasTown: true,
      townIsNeutral: true,
      monsterStrength: "normal",
      nx: 0.5,
      ny: 0.8,
    },
    {
      id: "center",
      type: "treasure",
      baseTerrain: TerrainType.DIRT,
      sizeWeight: 1.1,
      value: 8500,
      hasTown: true,
      townIsNeutral: true,
      monsterStrength: "strong",
      nx: 0.5,
      ny: 0.5,
    },
  ],
  connections: [
    { from: "p1", to: "north-isle", guardStrength: "normal", wallType: "natural" },
    { from: "p2", to: "north-isle", guardStrength: "normal", wallType: "natural" },
    { from: "p3", to: "south-isle", guardStrength: "normal", wallType: "natural" },
    { from: "p4", to: "south-isle", guardStrength: "normal", wallType: "natural" },
    { from: "north-isle", to: "center", guardStrength: "veryStrong", wallType: "natural" },
    { from: "south-isle", to: "center", guardStrength: "veryStrong", wallType: "natural" },
  ],
};

const BROKEN_KINGDOMS: MapTemplate = {
  id: "broken-kingdoms",
  name: "Broken Kingdoms",
  minPlayers: 3,
  maxPlayers: 4,
  zones: [
    {
      id: "p1",
      type: "player",
      ownerIndex: 0,
      baseTerrain: TerrainType.GRASS,
      sizeWeight: 1.05,
      value: 2300,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.18,
      ny: 0.2,
    },
    {
      id: "p2",
      type: "player",
      ownerIndex: 1,
      baseTerrain: TerrainType.SNOW,
      sizeWeight: 1.05,
      value: 2300,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.82,
      ny: 0.22,
    },
    {
      id: "p3",
      type: "player",
      ownerIndex: 2,
      baseTerrain: TerrainType.SWAMP,
      sizeWeight: 1.05,
      value: 2300,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.2,
      ny: 0.8,
    },
    {
      id: "p4",
      type: "player",
      ownerIndex: 3,
      baseTerrain: TerrainType.SAND,
      sizeWeight: 1.05,
      value: 2300,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.8,
      ny: 0.78,
    },
    {
      id: "west-vault",
      type: "treasure",
      baseTerrain: TerrainType.FOREST,
      sizeWeight: 0.85,
      value: 5200,
      hasTown: true,
      townIsNeutral: true,
      monsterStrength: "strong",
      nx: 0.32,
      ny: 0.5,
    },
    {
      id: "east-vault",
      type: "treasure",
      baseTerrain: TerrainType.DIRT,
      sizeWeight: 0.85,
      value: 5200,
      hasTown: true,
      townIsNeutral: true,
      monsterStrength: "strong",
      nx: 0.68,
      ny: 0.5,
    },
    {
      id: "crown",
      type: "junction",
      baseTerrain: TerrainType.MOUNTAIN,
      sizeWeight: 0.7,
      value: 3600,
      monsterStrength: "normal",
      nx: 0.5,
      ny: 0.5,
    },
  ],
  connections: [
    { from: "p1", to: "west-vault", guardStrength: "normal", wallType: "natural" },
    { from: "p3", to: "west-vault", guardStrength: "normal", wallType: "natural" },
    { from: "p2", to: "east-vault", guardStrength: "normal", wallType: "natural" },
    { from: "p4", to: "east-vault", guardStrength: "normal", wallType: "natural" },
    { from: "west-vault", to: "crown", guardStrength: "strong", wallType: "brick" },
    { from: "east-vault", to: "crown", guardStrength: "strong", wallType: "brick" },
  ],
};

const VOLCANIC_CROWN: MapTemplate = {
  id: "volcanic-crown",
  name: "Volcanic Crown",
  minPlayers: 2,
  maxPlayers: 6,
  landStyle: "volcanic-crown",
  zones: [
    {
      id: "p1",
      type: "player",
      ownerIndex: 0,
      baseTerrain: TerrainType.SNOW,
      sizeWeight: 0.82,
      value: 2400,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.18,
      ny: 0.17,
    },
    {
      id: "p2",
      type: "player",
      ownerIndex: 1,
      baseTerrain: TerrainType.SNOW,
      sizeWeight: 0.82,
      value: 2400,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.82,
      ny: 0.18,
    },
    {
      id: "p3",
      type: "player",
      ownerIndex: 2,
      baseTerrain: TerrainType.FOREST,
      sizeWeight: 0.86,
      value: 2400,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.18,
      ny: 0.79,
    },
    {
      id: "p4",
      type: "player",
      ownerIndex: 3,
      baseTerrain: TerrainType.FOREST,
      sizeWeight: 0.86,
      value: 2400,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.82,
      ny: 0.79,
    },
    {
      id: "p5",
      type: "player",
      ownerIndex: 4,
      baseTerrain: TerrainType.GRASS,
      sizeWeight: 0.65,
      value: 2200,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.12,
      ny: 0.5,
    },
    {
      id: "p6",
      type: "player",
      ownerIndex: 5,
      baseTerrain: TerrainType.MOUNTAIN,
      sizeWeight: 0.65,
      value: 2200,
      hasTown: true,
      monsterStrength: "weak",
      nx: 0.88,
      ny: 0.5,
    },
    {
      id: "north-pass",
      type: "junction",
      baseTerrain: TerrainType.SAND,
      sizeWeight: 0.55,
      value: 3200,
      hasTown: true,
      townIsNeutral: true,
      monsterStrength: "normal",
      nx: 0.5,
      ny: 0.23,
    },
    {
      id: "south-pass",
      type: "junction",
      baseTerrain: TerrainType.DIRT,
      sizeWeight: 0.55,
      value: 3200,
      hasTown: true,
      townIsNeutral: true,
      monsterStrength: "normal",
      nx: 0.5,
      ny: 0.78,
    },
    {
      id: "volcanic-ring",
      type: "treasure",
      baseTerrain: TerrainType.MOUNTAIN,
      sizeWeight: 1.25,
      value: 9000,
      hasTown: true,
      townIsNeutral: true,
      monsterStrength: "strong",
      nx: 0.5,
      ny: 0.5,
    },
    {
      id: "hellcore",
      type: "treasure",
      baseTerrain: TerrainType.LAVA,
      sizeWeight: 0.7,
      value: 9000,
      hasTown: true,
      townIsNeutral: true,
      monsterStrength: "strong",
      nx: 0.5,
      ny: 0.57,
    },
  ],
  connections: [
    { from: "p1", to: "north-pass", guardStrength: "normal", wallType: "natural" },
    { from: "p2", to: "north-pass", guardStrength: "normal", wallType: "natural" },
    { from: "p3", to: "south-pass", guardStrength: "normal", wallType: "natural" },
    { from: "p4", to: "south-pass", guardStrength: "normal", wallType: "natural" },
    { from: "p5", to: "volcanic-ring", guardStrength: "strong", wallType: "natural" },
    { from: "p6", to: "volcanic-ring", guardStrength: "strong", wallType: "natural" },
    { from: "north-pass", to: "volcanic-ring", guardStrength: "veryStrong", wallType: "brick" },
    { from: "south-pass", to: "volcanic-ring", guardStrength: "veryStrong", wallType: "brick" },
    { from: "volcanic-ring", to: "hellcore", guardStrength: "veryStrong", wallType: "brick" },
  ],
};

export const TEMPLATES: MapTemplate[] = [JEBUS_CROSS, DUEL, ARCHIPELAGO, BROKEN_KINGDOMS, VOLCANIC_CROWN];

export function getTemplate(id: string): MapTemplate {
  const t = TEMPLATES.find((tpl) => tpl.id === id);
  if (!t) throw new Error(`Unknown map template: ${id}`);
  return t;
}

export function listTemplatesForPlayers(playerCount: number): MapTemplate[] {
  return TEMPLATES.filter((t) => playerCount >= t.minPlayers && playerCount <= t.maxPlayers);
}

/** Résout le template pour un nombre de joueurs : ne garde que les zones joueur utiles. */
export function resolveTemplate(template: MapTemplate, playerCount: number): MapTemplate {
  const playerZones = template.zones.filter((z) => z.type === "player");
  if (playerCount > playerZones.length) {
    throw new Error(
      `Template ${template.id} supports up to ${playerZones.length} players, got ${playerCount}`,
    );
  }
  const keepIds = new Set<string>(
    template.zones.filter((z) => z.type !== "player").map((z) => z.id),
  );
  const sortedPlayerZones = playerZones
    .slice()
    .sort((a, b) => (a.ownerIndex ?? 0) - (b.ownerIndex ?? 0));
  for (let i = 0; i < playerCount; i++) keepIds.add(sortedPlayerZones[i].id);

  return {
    ...template,
    zones: template.zones.filter((z) => keepIds.has(z.id)),
    connections: template.connections.filter((c) => keepIds.has(c.from) && keepIds.has(c.to)),
  };
}
