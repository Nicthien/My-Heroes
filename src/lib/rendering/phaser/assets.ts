export const MAP_SPRITES = {
  hero: "/assets/sprites/map/hero-cavalier.svg",
  town: "/assets/sprites/map/town-castle.svg",
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

export const MAP_SPRITE_PATHS = [
  MAP_SPRITES.hero,
  MAP_SPRITES.town,
  MAP_SPRITES.monster,
  ...Object.values(MAP_SPRITES.resources),
  ...Object.values(MAP_SPRITES.buildings),
];
