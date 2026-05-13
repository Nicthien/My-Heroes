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
  } as Record<string, string>,
  monster: "/assets/sprites/map/monster.svg",
  resources: {
    gold: "/assets/sprites/resources/gold.svg",
    wood: "/assets/sprites/resources/wood.svg",
    ore: "/assets/sprites/resources/ore.svg",
    mercury: "/assets/sprites/resources/mercury.svg",
    crystals: "/assets/sprites/resources/crystals.svg",
    sulfur: "/assets/sprites/resources/sulfur.svg",
  } as Record<string, string>,
  buildings: {
    gold_mine: "/assets/sprites/map/gold-mine.svg",
    sawmill: "/assets/sprites/map/sawmill.svg",
    ore_pit: "/assets/sprites/map/ore-pit.svg",
    alchemist_lab: "/assets/sprites/map/alchemist-lab.svg",
    crystal_cavern: "/assets/sprites/map/crystal-cavern.svg",
    sulfur_dune: "/assets/sprites/map/sulfur-dune.svg",
  } as Record<string, string>,
};

export function getHeroSpritePath(faction: string) {
  return MAP_SPRITES.heroes[faction] ?? MAP_SPRITES.hero;
}

export function getTownSpritePath(faction: string) {
  return MAP_SPRITES.towns[faction] ?? MAP_SPRITES.town;
}

export const MAP_SPRITE_PATHS = Array.from(new Set([
  MAP_SPRITES.hero,
  MAP_SPRITES.town,
  ...Object.values(MAP_SPRITES.heroes),
  ...Object.values(MAP_SPRITES.towns),
  MAP_SPRITES.monster,
  ...Object.values(MAP_SPRITES.resources),
  ...Object.values(MAP_SPRITES.buildings),
]));
