import { UnitType } from "@/lib/game/types";

const UNIT_SPRITE_OVERRIDES: Partial<Record<UnitType, string>> = {
  [UnitType.PIKEMAN]: "/assets/sprites/units/pikeman.webp",
  [UnitType.HALBERDIER]: "/assets/sprites/units/halberdier.webp",
  [UnitType.ARCHER]: "/assets/sprites/units/archer.webp",
  [UnitType.MARKSMAN]: "/assets/sprites/units/marksman.webp",
  [UnitType.GRIFFIN]: "/assets/sprites/units/griffin.webp",
  [UnitType.ROYAL_GRIFFIN]: "/assets/sprites/units/royal_griffin.webp",
  [UnitType.SWORDSMAN]: "/assets/sprites/units/swordsman.webp",
  [UnitType.CRUSADER]: "/assets/sprites/units/crusader.webp",
  [UnitType.MONK]: "/assets/sprites/units/monk.webp",
  [UnitType.ZEALOT]: "/assets/sprites/units/zealot.webp",
  [UnitType.CAVALIER]: "/assets/sprites/units/cavalier.webp",
  [UnitType.CHAMPION]: "/assets/sprites/units/champion.webp",
  [UnitType.ANGEL]: "/assets/sprites/units/angel.webp",
  [UnitType.ARCHANGEL]: "/assets/sprites/units/archangel.webp",
  [UnitType.CENTAUR]: "/assets/sprites/units/centaur.webp",
  [UnitType.CENTAUR_CAPTAIN]: "/assets/sprites/units/centaur_captain.webp",
  [UnitType.DWARF]: "/assets/sprites/units/dwarf.webp",
  [UnitType.BATTLE_DWARF]: "/assets/sprites/units/battle_dwarf.webp",
  [UnitType.WOOD_ELF]: "/assets/sprites/units/wood_elf.webp",
  [UnitType.GRAND_ELF]: "/assets/sprites/units/grand_elf.webp",
  [UnitType.PEGASUS]: "/assets/sprites/units/pegasus.webp",
  [UnitType.SILVER_PEGASUS]: "/assets/sprites/units/silver_pegasus.webp",
  [UnitType.DENDROID]: "/assets/sprites/units/dendroid.webp",
  [UnitType.DENDROID_SOLDIER]: "/assets/sprites/units/dendroid_soldier.webp",
  [UnitType.UNICORN]: "/assets/sprites/units/unicorn.webp",
  [UnitType.WAR_UNICORN]: "/assets/sprites/units/war_unicorn.webp",
  [UnitType.GREEN_DRAGON]: "/assets/sprites/units/green_dragon.webp",
  [UnitType.GOLD_DRAGON]: "/assets/sprites/units/gold_dragon.webp",
  [UnitType.GREMLIN]: "/assets/sprites/units/gremlin.webp",
  [UnitType.MASTER_GREMLIN]: "/assets/sprites/units/master_gremlin.webp",
  [UnitType.GARGOYLE]: "/assets/sprites/units/gargoyle.webp",
  [UnitType.OBSIDIAN_GARGOYLE]: "/assets/sprites/units/obsidian_gargoyle.webp",
  [UnitType.GOLEM]: "/assets/sprites/units/golem.webp",
  [UnitType.IRON_GOLEM]: "/assets/sprites/units/iron_golem.webp",
  [UnitType.MAGE]: "/assets/sprites/units/mage.webp",
  [UnitType.ARCH_MAGE]: "/assets/sprites/units/arch_mage.webp",
  [UnitType.GENIE]: "/assets/sprites/units/genie.webp",
  [UnitType.MASTER_GENIE]: "/assets/sprites/units/master_genie.webp",
  [UnitType.NAGA]: "/assets/sprites/units/naga.webp",
  [UnitType.NAGA_QUEEN]: "/assets/sprites/units/naga_queen.webp",
  [UnitType.GIANT]: "/assets/sprites/units/giant.webp",
  [UnitType.TITAN]: "/assets/sprites/units/titan.webp",
  [UnitType.IMP]: "/assets/sprites/units/imp.webp",
  [UnitType.FAMILIAR]: "/assets/sprites/units/familiar.webp",
  [UnitType.GOG]: "/assets/sprites/units/gog.webp",
  [UnitType.MAGOG]: "/assets/sprites/units/magog.webp",
  [UnitType.HELL_HOUND]: "/assets/sprites/units/hell_hound.webp",
  [UnitType.CERBERUS]: "/assets/sprites/units/cerberus.webp",
  [UnitType.DEMON]: "/assets/sprites/units/demon.webp",
  [UnitType.HORNED_DEMON]: "/assets/sprites/units/horned_demon.webp",
  [UnitType.PIT_FIEND]: "/assets/sprites/units/pit_fiend.webp",
  [UnitType.PIT_LORD]: "/assets/sprites/units/pit_lord.webp",
  [UnitType.EFREET]: "/assets/sprites/units/efreet.webp",
  [UnitType.EFREET_SULTAN]: "/assets/sprites/units/efreet_sultan.webp",
  [UnitType.DEVIL]: "/assets/sprites/units/devil.webp",
  [UnitType.ARCH_DEVIL]: "/assets/sprites/units/arch_devil.webp",
  [UnitType.SKELETON]: "/assets/sprites/units/skeleton.webp",
  [UnitType.SKELETON_WARRIOR]: "/assets/sprites/units/skeleton_warrior.webp",
  [UnitType.WALKING_DEAD]: "/assets/sprites/units/walking_dead.webp",
  [UnitType.ZOMBIE]: "/assets/sprites/units/zombie.webp",
  [UnitType.WIGHT]: "/assets/sprites/units/wight.webp",
  [UnitType.WRAITH]: "/assets/sprites/units/wraith.webp",
  [UnitType.VAMPIRE]: "/assets/sprites/units/vampire.webp",
  [UnitType.VAMPIRE_LORD]: "/assets/sprites/units/vampire_lord.webp",
  [UnitType.LICH]: "/assets/sprites/units/lich.webp",
  [UnitType.POWER_LICH]: "/assets/sprites/units/power_lich.webp",
  [UnitType.BLACK_KNIGHT]: "/assets/sprites/units/black_knight.webp",
  [UnitType.DREAD_KNIGHT]: "/assets/sprites/units/dread_knight.webp",
  [UnitType.BONE_DRAGON]: "/assets/sprites/units/bone_dragon.webp",
  [UnitType.GHOST_DRAGON]: "/assets/sprites/units/ghost_dragon.webp",
  [UnitType.TROGLODYTE]: "/assets/sprites/units/troglodyte.webp",
  [UnitType.INFERNAL_TROGLODYTE]: "/assets/sprites/units/infernal_troglodyte.webp",
  [UnitType.HARPY]: "/assets/sprites/units/harpy.webp",
  [UnitType.HARPY_HAG]: "/assets/sprites/units/harpy_hag.webp",
  [UnitType.BEHOLDER]: "/assets/sprites/units/beholder.webp",
  [UnitType.EVIL_EYE]: "/assets/sprites/units/evil_eye.webp",
  [UnitType.MEDUSA]: "/assets/sprites/units/medusa.webp",
  [UnitType.MEDUSA_QUEEN]: "/assets/sprites/units/medusa_queen.webp",
  [UnitType.MINOTAUR]: "/assets/sprites/units/minotaur.webp",
  [UnitType.MINOTAUR_KING]: "/assets/sprites/units/minotaur_king.webp",
  [UnitType.MANTICORE]: "/assets/sprites/units/manticore.webp",
  [UnitType.SCORPICORE]: "/assets/sprites/units/scorpicore.webp",
  [UnitType.RED_DRAGON]: "/assets/sprites/units/red_dragon.webp",
  [UnitType.BLACK_DRAGON]: "/assets/sprites/units/black_dragon.webp",
  [UnitType.GOBLIN]: "/assets/sprites/units/goblin.webp",
  [UnitType.HOBGOBLIN]: "/assets/sprites/units/hobgoblin.webp",
  [UnitType.WOLF_RIDER]: "/assets/sprites/units/wolf_rider.webp",
  [UnitType.WOLF_RAIDER]: "/assets/sprites/units/wolf_raider.webp",
  [UnitType.ORC]: "/assets/sprites/units/orc.webp",
  [UnitType.ORC_CHIEFTAIN]: "/assets/sprites/units/orc_chieftain.webp",
  [UnitType.OGRE]: "/assets/sprites/units/ogre.webp",
  [UnitType.OGRE_MAGE]: "/assets/sprites/units/ogre_mage.webp",
  [UnitType.ROC]: "/assets/sprites/units/roc.webp",
  [UnitType.THUNDERBIRD]: "/assets/sprites/units/thunderbird.webp",
  [UnitType.CYCLOPS]: "/assets/sprites/units/cyclops.webp",
  [UnitType.CYCLOPS_KING]: "/assets/sprites/units/cyclops_king.webp",
  [UnitType.BEHEMOTH]: "/assets/sprites/units/behemoth.webp",
  [UnitType.ANCIENT_BEHEMOTH]: "/assets/sprites/units/ancient_behemoth.webp",
  [UnitType.GNOLL]: "/assets/sprites/units/gnoll.webp",
  [UnitType.GNOLL_MARAUDER]: "/assets/sprites/units/gnoll_marauder.webp",
  [UnitType.LIZARDMAN]: "/assets/sprites/units/lizardman.webp",
  [UnitType.LIZARD_WARRIOR]: "/assets/sprites/units/lizard_warrior.webp",
  [UnitType.SERPENT_FLY]: "/assets/sprites/units/serpent_fly.webp",
  [UnitType.DRAGON_FLY]: "/assets/sprites/units/dragon_fly.webp",
  [UnitType.BASILISK]: "/assets/sprites/units/basilisk.webp",
  [UnitType.GREATER_BASILISK]: "/assets/sprites/units/greater_basilisk.webp",
  [UnitType.GORGON]: "/assets/sprites/units/gorgon.webp",
  [UnitType.MIGHTY_GORGON]: "/assets/sprites/units/mighty_gorgon.webp",
  [UnitType.WYVERN]: "/assets/sprites/units/wyvern.webp",
  [UnitType.WYVERN_MONARCH]: "/assets/sprites/units/wyvern_monarch.webp",
  [UnitType.HYDRA]: "/assets/sprites/units/hydra.webp",
  [UnitType.CHAOS_HYDRA]: "/assets/sprites/units/chaos_hydra.webp",
  [UnitType.PIXIE]: "/assets/sprites/units/pixie.webp",
  [UnitType.SPRITE]: "/assets/sprites/units/sprite.webp",
  [UnitType.AIR_ELEMENTAL]: "/assets/sprites/units/air_elemental.webp",
  [UnitType.STORM_ELEMENTAL]: "/assets/sprites/units/storm_elemental.webp",
  [UnitType.WATER_ELEMENTAL]: "/assets/sprites/units/water_elemental.webp",
  [UnitType.ICE_ELEMENTAL]: "/assets/sprites/units/ice_elemental.webp",
  [UnitType.FIRE_ELEMENTAL]: "/assets/sprites/units/fire_elemental.webp",
  [UnitType.ENERGY_ELEMENTAL]: "/assets/sprites/units/energy_elemental.webp",
  [UnitType.EARTH_ELEMENTAL]: "/assets/sprites/units/earth_elemental.webp",
  [UnitType.MAGMA_ELEMENTAL]: "/assets/sprites/units/magma_elemental.webp",
  [UnitType.PSYCHIC_ELEMENTAL]: "/assets/sprites/units/psychic_elemental.webp",
  [UnitType.MAGIC_ELEMENTAL]: "/assets/sprites/units/magic_elemental.webp",
  [UnitType.FIREBIRD]: "/assets/sprites/units/firebird.webp",
  [UnitType.PHOENIX]: "/assets/sprites/units/phoenix.webp",
};

export const UNIT_SPRITES = Object.values(UnitType).reduce((sprites, unitType) => {
  sprites[unitType] = UNIT_SPRITE_OVERRIDES[unitType] ?? `/assets/sprites/units/${unitType}.webp`;
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
    gold_mine: "/assets/sprites/map/gold-mine.webp",
    sawmill: "/assets/sprites/map/sawmill.webp",
    ore_pit: "/assets/sprites/map/ore-pit.webp",
    alchemist_lab: "/assets/sprites/map/alchemist-lab.webp",
    crystal_cavern: "/assets/sprites/map/crystal-cavern.webp",
    gem_pond: "/assets/sprites/map/gem-pond.webp",
    sulfur_dune: "/assets/sprites/map/sulfur-dune.webp",
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

export function getUnitSpritePath(unitType: string | undefined) {
  return UNIT_SPRITES[unitType as UnitType] ?? UNIT_SPRITES[UnitType.PIKEMAN];
}

export function getMonsterSpritePath(unitType: string | undefined) {
  return getUnitSpritePath(unitType);
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
