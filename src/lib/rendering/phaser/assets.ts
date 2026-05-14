import { UnitType } from "@/lib/game/types";
import { ADVENTURE_OBJECT_RULES } from "@/lib/game/adventure-objects";

export const UNIT_SPRITES = Object.values(UnitType).reduce((sprites, unitType) => {
  sprites[unitType] = `/assets/sprites/units/${unitType}.svg`;
  return sprites;
}, {} as Record<UnitType, string>);

export const MAP_SPRITES = {
  hero: "/assets/sprites/map/hero-cavalier.svg",
  town: "/assets/sprites/map/town-castle.svg",
  heroes: {
    castle: "/assets/sprites/map/hero-cavalier.svg",
    rampart: "/assets/sprites/map/hero-rampart.svg",
    tower: "/assets/sprites/map/hero-tower.svg",
    inferno: "/assets/sprites/map/hero-inferno.svg",
    necropolis: "/assets/sprites/map/hero-necropolis.svg",
    dungeon: "/assets/sprites/map/hero-dungeon.svg",
    stronghold: "/assets/sprites/map/hero-stronghold.svg",
    fortress: "/assets/sprites/map/hero-fortress.svg",
    conflux: "/assets/sprites/map/hero-tower.svg",
  } as Record<string, string>,
  towns: {
    castle: "/assets/sprites/map/town-castle.svg",
    rampart: "/assets/sprites/map/town-rampart.svg",
    tower: "/assets/sprites/map/town-tower.svg",
    inferno: "/assets/sprites/map/town-inferno.svg",
    necropolis: "/assets/sprites/map/town-necropolis.svg",
    dungeon: "/assets/sprites/map/town-dungeon.svg",
    stronghold: "/assets/sprites/map/town-stronghold.svg",
    fortress: "/assets/sprites/map/town-fortress.svg",
    conflux: "/assets/sprites/map/town-tower.svg",
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
  adventure: Object.fromEntries(
    ADVENTURE_OBJECT_RULES.map((rule) => [rule.id, rule.sprite]),
  ) as Record<string, string>,
  decor: {
    wall_brick: "/assets/sprites/map/wall-brick.svg",
    wall_vegetal: "/assets/sprites/map/wall-vegetal.svg",
    tree_pine: "/assets/sprites/map/tree-pine.svg",
    tree_oak: "/assets/sprites/map/tree-oak.svg",
    tree_dead: "/assets/sprites/map/tree-dead.svg",
    rock_large: "/assets/sprites/map/rock-large.svg",
    rock_small: "/assets/sprites/map/rock-small.svg",
    bush: "/assets/sprites/map/bush.svg",
    flower: "/assets/sprites/map/flower.svg",
    grass_tuft: "/assets/sprites/map/grass-tuft.svg",
  } as Record<string, string>,
};

export function getHeroSpritePath(faction: string) {
  return MAP_SPRITES.heroes[faction] ?? MAP_SPRITES.hero;
}

export function getTownSpritePath(faction: string) {
  return MAP_SPRITES.towns[faction] ?? MAP_SPRITES.town;
}

export function getMonsterSpritePath(unitType: string | undefined) {
  return UNIT_SPRITES[unitType as UnitType] ?? UNIT_SPRITES[UnitType.PIKEMAN];
}

export const MAP_SPRITE_PATHS = Array.from(new Set([
  MAP_SPRITES.hero,
  MAP_SPRITES.town,
  ...Object.values(MAP_SPRITES.heroes),
  ...Object.values(MAP_SPRITES.towns),
  ...Object.values(UNIT_SPRITES),
  ...Object.values(MAP_SPRITES.resources),
  ...Object.values(MAP_SPRITES.buildings),
  ...Object.values(MAP_SPRITES.adventure),
  ...Object.values(MAP_SPRITES.decor),
]));
