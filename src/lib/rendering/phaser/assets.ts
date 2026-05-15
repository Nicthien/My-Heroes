import { UnitType } from "@/lib/game/types";

export const UNIT_SPRITES = Object.values(UnitType).reduce((sprites, unitType) => {
  sprites[unitType] = `/assets/sprites/units/${unitType}.svg`;
  return sprites;
}, {} as Record<UnitType, string>);

export const MAP_SPRITES = {
  town: "/assets/sprites/map/town-castle.webp",
  towns: {
    castle: "/assets/sprites/map/town-castle.webp",
    rampart: "/assets/sprites/map/town-rampart.webp",
    tower: "/assets/sprites/map/town-tower.webp",
    inferno: "/assets/sprites/map/town-inferno.webp",
    necropolis: "/assets/sprites/map/town-necropolis.webp",
    dungeon: "/assets/sprites/map/town-dungeon.webp",
    stronghold: "/assets/sprites/map/town-stronghold.webp",
    fortress: "/assets/sprites/map/town-fortress.webp",
    conflux: "/assets/sprites/map/town-conflux.webp",
  } as Record<string, string>,
  resources: {
    gold: "/assets/sprites/resources/gold.svg",
    wood: "/assets/sprites/resources/wood.svg",
    ore: "/assets/sprites/resources/ore.svg",
    mercury: "/assets/sprites/resources/mercury.svg",
    crystals: "/assets/sprites/resources/crystals.svg",
    gems: "/assets/sprites/resources/gems.svg",
    sulfur: "/assets/sprites/resources/sulfur.svg",
  } as Record<string, string>,
  buildings: {
    gold_mine: "/assets/sprites/map/gold-mine.svg",
    sawmill: "/assets/sprites/map/sawmill.svg",
    ore_pit: "/assets/sprites/map/ore-pit.svg",
    alchemist_lab: "/assets/sprites/map/alchemist-lab.svg",
    crystal_cavern: "/assets/sprites/map/crystal-cavern.svg",
    gem_pond: "/assets/sprites/map/gem-pond.svg",
    sulfur_dune: "/assets/sprites/map/sulfur-dune.svg",
  } as Record<string, string>,
  adventureBuildings: {
    observatory: "/assets/sprites/map/adventure-observatory.svg",
    campfire: "/assets/sprites/map/adventure-campfire.svg",
    lighthouse: "/assets/sprites/map/adventure-lighthouse.svg",
    stargate: "/assets/sprites/map/adventure-stargate.svg",
  } as Record<string, string>,
  decor: {
    wall_brick: "/assets/sprites/map/wall-brick.svg",
    wall_vegetal: "/assets/sprites/map/wall-vegetal.svg",
    tree_pine: "/assets/sprites/map/tree-pine.svg",
    tree_oak: "/assets/sprites/map/tree-oak.svg",
    tree_dead: "/assets/sprites/map/tree-dead.svg",
    grove_pine: "/assets/sprites/map/grove-pine.svg",
    grove_oak: "/assets/sprites/map/grove-oak.svg",
    grove_dead: "/assets/sprites/map/grove-dead.svg",
    rock_large: "/assets/sprites/map/rock-large.svg",
    rock_small: "/assets/sprites/map/rock-small.svg",
    boulder_cluster: "/assets/sprites/map/boulder-cluster.svg",
    bush: "/assets/sprites/map/bush.svg",
    flower: "/assets/sprites/map/flower.svg",
    grass_tuft: "/assets/sprites/map/grass-tuft.svg",
  } as Record<string, string>,
};

export type DirectionalSpriteState = "idle" | "walk";

export type DirectionalSpritesheet = {
  key: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
  displayWidth: number;
  displayHeight: number;
  townDisplayWidth: number;
  townDisplayHeight: number;
  columns: number;
  animationPrefix: string;
};

export type HeroSpritesheet = DirectionalSpritesheet & {
  faction: string;
};

export const HERO_DIRECTIONS = ["s", "sw", "w", "nw", "n", "ne", "e", "se"] as const;
export type HeroDirection = (typeof HERO_DIRECTIONS)[number];

const HERO_SPRITESHEET_FACTIONS = [
  "castle",
  "rampart",
  "tower",
  "inferno",
  "necropolis",
  "dungeon",
  "stronghold",
  "fortress",
  "conflux",
] as const;

export const HERO_SPRITESHEETS = HERO_SPRITESHEET_FACTIONS.reduce((sheets, faction) => {
  sheets[faction] = {
    faction,
    key: `hero-${faction}`,
    path: `/assets/sprites/heroes/${faction}/adventure.webp`,
    frameWidth: 80,
    frameHeight: 80,
    displayWidth: 52,
    displayHeight: 52,
    townDisplayWidth: 34,
    townDisplayHeight: 34,
    columns: 12,
    animationPrefix: `hero-${faction}`,
  };
  return sheets;
}, {} as Record<string, HeroSpritesheet>);

export type BoatSpritesheet = DirectionalSpritesheet & {
  faction: string;
};

export const BOAT_SPRITESHEETS = HERO_SPRITESHEET_FACTIONS.reduce((sheets, faction) => {
  sheets[faction] = {
    faction,
    key: `boat-${faction}`,
    path: `/assets/sprites/boats/${faction}/adventure.webp`,
    frameWidth: 80,
    frameHeight: 80,
    displayWidth: 58,
    displayHeight: 54,
    townDisplayWidth: 58,
    townDisplayHeight: 54,
    columns: 12,
    animationPrefix: `boat-${faction}`,
  };
  return sheets;
}, {} as Record<string, BoatSpritesheet>);

export const DIRECTIONAL_SPRITESHEETS: DirectionalSpritesheet[] = [
  ...Object.values(HERO_SPRITESHEETS),
  ...Object.values(BOAT_SPRITESHEETS),
];

export function getHeroSpritesheet(faction: string) {
  return HERO_SPRITESHEETS[faction] ?? HERO_SPRITESHEETS.castle;
}

export function getBoatSpritesheet(faction: string) {
  return BOAT_SPRITESHEETS[faction] ?? BOAT_SPRITESHEETS.castle;
}

export function getTownSpritePath(faction: string) {
  return MAP_SPRITES.towns[faction] ?? MAP_SPRITES.town;
}

export function getMonsterSpritePath(unitType: string | undefined) {
  return UNIT_SPRITES[unitType as UnitType] ?? UNIT_SPRITES[UnitType.PIKEMAN];
}

export const MAP_SPRITE_PATHS = Array.from(new Set([
  MAP_SPRITES.town,
  ...Object.values(MAP_SPRITES.towns),
  ...Object.values(UNIT_SPRITES),
  ...Object.values(MAP_SPRITES.resources),
  ...Object.values(MAP_SPRITES.buildings),
  ...Object.values(MAP_SPRITES.adventureBuildings),
  ...Object.values(MAP_SPRITES.decor),
]));
