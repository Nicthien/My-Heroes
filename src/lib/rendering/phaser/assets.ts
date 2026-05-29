import { RoadType, TerrainType, UnitType } from "@/lib/game/types";
import { EXTERNAL_DWELLING_UNIT_TYPES } from "@/lib/game/external-dwellings";
import { ARTIFACTS } from "@/lib/game/artifacts";
import type { Diagonal4, Direction8 } from "@/lib/rendering/phaser/directions";

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
  gate: "/assets/sprites/map/gate.webp",
  gates: {
    N_S: "/assets/sprites/map/gate-N-S.webp",
    E_W: "/assets/sprites/map/gate-E-W.webp",
  },
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
    gold: "/assets/sprites/resources/gold.webp",
    wood: "/assets/sprites/resources/wood.webp",
    ore: "/assets/sprites/resources/ore.webp",
    mercury: "/assets/sprites/resources/mercury.webp",
    crystals: "/assets/sprites/resources/crystals.webp",
    gems: "/assets/sprites/resources/gems.webp",
    sulfur: "/assets/sprites/resources/sulfur.webp",
  } as Record<string, string>,
  artifacts: Object.fromEntries(
    ARTIFACTS.map((artifact) => [artifact.id, `/assets/sprites/artifacts/${artifact.id}.webp`]),
  ) as Record<string, string>,
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
    observatory: "/assets/sprites/map/adventure-observatory.webp",
    campfire: "/assets/sprites/map/adventure-campfire.webp",
    lighthouse: "/assets/sprites/map/adventure-lighthouse.webp",
    stargate: "/assets/sprites/map/adventure-stargate.webp",
    subterranean_gate: "/assets/sprites/map/adventure-subterranean-gate.webp",
    arena: "/assets/sprites/map/adventure-arena.webp",
    mercenary_camp: "/assets/sprites/map/adventure-mercenary-camp.webp",
    marletto_tower: "/assets/sprites/map/adventure-marletto-tower.webp",
    star_axis: "/assets/sprites/map/adventure-star-axis.webp",
    garden_of_revelation: "/assets/sprites/map/adventure-garden-of-revelation.webp",
    learning_stone: "/assets/sprites/map/adventure-learning-stone.webp",
    school_of_war: "/assets/sprites/map/adventure-school-of-war.webp",
    school_of_magic: "/assets/sprites/map/adventure-school-of-magic.webp",
    library_of_enlightenment: "/assets/sprites/map/adventure-library-of-enlightenment.webp",
    cartographer: "/assets/sprites/map/adventure-cartographer.webp",
    redwood_observatory: "/assets/sprites/map/adventure-redwood-observatory.webp",
    mystical_garden: "/assets/sprites/map/adventure-mystical-garden.webp",
    stables: "/assets/sprites/map/adventure-stables.webp",
    temple: "/assets/sprites/map/adventure-temple.webp",
    fountain_of_fortune: "/assets/sprites/map/adventure-fountain-of-fortune.webp",
    idol_of_fortune: "/assets/sprites/map/adventure-idol-of-fortune.webp",
    magic_well: "/assets/sprites/map/adventure-magic-well.webp",
    magic_shrine: "/assets/sprites/map/adventure-magic-shrine.webp",
    water_mill: "/assets/sprites/map/adventure-water-mill.webp",
    water_wheel: "/assets/sprites/map/adventure-water-wheel.webp",
    abandoned_wagon: "/assets/sprites/map/adventure-abandoned-wagon.webp",
    crate: "/assets/sprites/map/adventure-crate.webp",
    skeleton: "/assets/sprites/map/adventure-skeleton.webp",
    obelisk: "/assets/sprites/map/adventure-obelisk.webp",
    warrior_tomb: "/assets/sprites/map/adventure-warrior-tomb.webp",
    cursed_altar: "/assets/sprites/map/adventure-cursed-altar.webp",
    spell_shrine_1: "/assets/sprites/map/adventure-spell-shrine-1.webp",
    spell_shrine_2: "/assets/sprites/map/adventure-spell-shrine-2.webp",
    spell_shrine_3: "/assets/sprites/map/adventure-spell-shrine-3.webp",
    tree_of_knowledge: "/assets/sprites/map/adventure-tree-of-knowledge.webp",
    seer_hut: "/assets/sprites/map/adventure-seer-hut.webp",
    mermaid: "/assets/sprites/map/adventure-mermaid.webp",
    buoy: "/assets/sprites/map/adventure-buoy.webp",
    flotsam: "/assets/sprites/map/adventure-flotsam.webp",
    sea_chest: "/assets/sprites/map/adventure-sea-chest.webp",
    external_dwelling: "/assets/sprites/map/external-dwelling.webp",
    ancient_altar: "/assets/sprites/map/creature-bank-ancient-altar.webp",
    bandit_camp: "/assets/sprites/map/creature-bank-bandit-camp.webp",
    beholders_sanctuary: "/assets/sprites/map/creature-bank-beholders-sanctuary.webp",
    black_tower: "/assets/sprites/map/creature-bank-black-tower.webp",
    churchyard: "/assets/sprites/map/creature-bank-churchyard.webp",
    crypt: "/assets/sprites/map/creature-bank-crypt.webp",
    cyclops_stockpile: "/assets/sprites/map/creature-bank-cyclops-stockpile.webp",
    derelict_ship: "/assets/sprites/map/creature-bank-derelict-ship.webp",
    dragon_fly_hive: "/assets/sprites/map/creature-bank-dragon-fly-hive.webp",
    dragon_utopia: "/assets/sprites/map/creature-bank-dragon-utopia.webp",
    dwarven_treasury: "/assets/sprites/map/creature-bank-dwarven-treasury.webp",
    experimental_shop: "/assets/sprites/map/creature-bank-experimental-shop.webp",
    griffin_conservatory: "/assets/sprites/map/creature-bank-griffin-conservatory.webp",
    imp_cache: "/assets/sprites/map/creature-bank-imp-cache.webp",
    ivory_tower: "/assets/sprites/map/creature-bank-ivory-tower.webp",
    mansion: "/assets/sprites/map/creature-bank-mansion.webp",
    medusa_stores: "/assets/sprites/map/creature-bank-medusa-stores.webp",
    naga_bank: "/assets/sprites/map/creature-bank-naga-bank.webp",
    pirate_cavern: "/assets/sprites/map/creature-bank-pirate-cavern.webp",
    red_tower: "/assets/sprites/map/creature-bank-red-tower.webp",
    ruins: "/assets/sprites/map/creature-bank-ruins.webp",
    shipwreck: "/assets/sprites/map/creature-bank-shipwreck.webp",
    spit: "/assets/sprites/map/creature-bank-spit.webp",
    temple_of_the_sea: "/assets/sprites/map/creature-bank-temple-of-the-sea.webp",
    wolf_raider_picket: "/assets/sprites/map/creature-bank-wolf-raider-picket.webp",
  } as Record<string, string>,
  externalDwellings: Object.fromEntries(
    EXTERNAL_DWELLING_UNIT_TYPES.map((unitType) => [
      unitType,
      `/assets/sprites/map/dwellings/external-dwelling-${unitType}.webp`,
    ]),
  ) as Partial<Record<UnitType, string>>,
  decor: {
    wall_rampart: "/assets/sprites/map/wall-rampart-cube.png",
    bramble_thicket: "/assets/sprites/map/bramble-thicket.webp",
    fallen_log_barricade: "/assets/sprites/map/fallen-log-barricade.webp",
    willow_swamp_grove: "/assets/sprites/map/willow-swamp-grove.webp",
    birch_grove: "/assets/sprites/map/birch-grove.webp",
    deadwood_thicket: "/assets/sprites/map/deadwood-thicket.webp",
    flowering_hedge: "/assets/sprites/map/flowering-hedge.webp",
    grass_oak_copse: "/assets/sprites/map/grass-oak-copse.webp",
    grass_bramble_mound: "/assets/sprites/map/grass-bramble-mound.webp",
    grass_flowering_hedge: "/assets/sprites/map/grass-flowering-hedge.webp",
    grass_reed_thicket: "/assets/sprites/map/grass-reed-thicket.webp",
    grass_root_barricade: "/assets/sprites/map/grass-root-barricade.webp",
    grass_sapling_grove: "/assets/sprites/map/grass-sapling-grove.webp",
    forest_pine_grove: "/assets/sprites/map/forest-pine-grove.webp",
    forest_broadleaf_grove: "/assets/sprites/map/forest-broadleaf-grove.webp",
    forest_underwood_thicket: "/assets/sprites/map/forest-underwood-thicket.webp",
    forest_stump_ferns: "/assets/sprites/map/forest-stump-ferns.webp",
    forest_birch_pine_screen: "/assets/sprites/map/forest-birch-pine-screen.webp",
    forest_deadfall: "/assets/sprites/map/forest-deadfall.webp",
    dirt_thorn_scrub: "/assets/sprites/map/dirt-thorn-scrub.webp",
    dirt_dead_brush: "/assets/sprites/map/dirt-dead-brush.webp",
    dirt_dry_log_barrier: "/assets/sprites/map/dirt-dry-log-barrier.webp",
    dirt_root_snarl: "/assets/sprites/map/dirt-root-snarl.webp",
    dirt_cactus_brush: "/assets/sprites/map/dirt-cactus-brush.webp",
    dirt_bramble_ravine: "/assets/sprites/map/dirt-bramble-ravine.webp",
    sand_cactus_cluster: "/assets/sprites/map/sand-cactus-cluster.webp",
    sand_desert_scrub: "/assets/sprites/map/sand-desert-scrub.webp",
    sand_palm_stump: "/assets/sprites/map/sand-palm-stump.webp",
    sand_agave_barrier: "/assets/sprites/map/sand-agave-barrier.webp",
    sand_tumbleweed_heap: "/assets/sprites/map/sand-tumbleweed-heap.webp",
    sand_saltbush_clump: "/assets/sprites/map/sand-saltbush-clump.webp",
    snow_pine_grove: "/assets/sprites/map/snow-pine-grove.webp",
    snow_birch_thicket: "/assets/sprites/map/snow-birch-thicket.webp",
    snow_deadwood_barrier: "/assets/sprites/map/snow-deadwood-barrier.webp",
    snow_bramble_mound: "/assets/sprites/map/snow-bramble-mound.webp",
    snow_evergreen_drift: "/assets/sprites/map/snow-evergreen-drift.webp",
    snow_shrub_wall: "/assets/sprites/map/snow-shrub-wall.webp",
    mountain_pine_rock: "/assets/sprites/map/mountain-pine-rock.webp",
    mountain_cliff_brush: "/assets/sprites/map/mountain-cliff-brush.webp",
    mountain_deadwood: "/assets/sprites/map/mountain-deadwood.webp",
    mountain_mossy_roots: "/assets/sprites/map/mountain-mossy-roots.webp",
    mountain_fir_grove: "/assets/sprites/map/mountain-fir-grove.webp",
    mountain_rhododendron: "/assets/sprites/map/mountain-rhododendron.webp",
    swamp_willow_grove: "/assets/sprites/map/swamp-willow-grove.webp",
    swamp_mangrove_tangle: "/assets/sprites/map/swamp-mangrove-tangle.webp",
    swamp_reed_thicket: "/assets/sprites/map/swamp-reed-thicket.webp",
    swamp_cypress_cluster: "/assets/sprites/map/swamp-cypress-cluster.webp",
    swamp_bog_bramble: "/assets/sprites/map/swamp-bog-bramble.webp",
    swamp_fungus_log: "/assets/sprites/map/swamp-fungus-log.webp",
    lava_charred_thorns: "/assets/sprites/map/lava-charred-thorns.webp",
    lava_ember_roots: "/assets/sprites/map/lava-ember-roots.webp",
    lava_ash_fungus: "/assets/sprites/map/lava-ash-fungus.webp",
    lava_scorched_deadwood: "/assets/sprites/map/lava-scorched-deadwood.webp",
    lava_sulfur_shrub: "/assets/sprites/map/lava-sulfur-shrub.webp",
    lava_obsidian_bramble: "/assets/sprites/map/lava-obsidian-bramble.webp",
    underground_stalagmite_cluster: "/assets/sprites/map/underground-stalagmite-cluster.webp",
    underground_crystal_ribs: "/assets/sprites/map/underground-crystal-ribs.webp",
    underground_mushroom_thicket: "/assets/sprites/map/underground-mushroom-thicket.webp",
    underground_rubble_pillar: "/assets/sprites/map/underground-rubble-pillar.webp",
    underground_root_snarl: "/assets/sprites/map/underground-root-snarl.webp",
    massif_mountain_granite_2x2: "/assets/sprites/map/massif-mountain-granite-2x2.webp",
    massif_mountain_snowcap_2x2: "/assets/sprites/map/massif-mountain-snowcap-2x2.webp",
    massif_mountain_pine_2x2: "/assets/sprites/map/massif-mountain-pine-2x2.webp",
    massif_mountain_volcanic_2x2: "/assets/sprites/map/massif-mountain-volcanic-2x2.webp",
    massif_mountain_desert_2x2: "/assets/sprites/map/massif-mountain-desert-2x2.webp",
    massif_mountain_mossy_2x2: "/assets/sprites/map/massif-mountain-mossy-2x2.webp",
    boulder_cluster: "/assets/sprites/map/boulder-cluster.webp",
    underground_cave_wall: "/assets/sprites/map/underground-cave-wall.webp",
  } as Record<string, string>,
};

const ROAD_TEXTURE_MASKS = Array.from({ length: 16 }, (_, index) => index);

function buildRoadTextureSet(kind: RoadType | "bridge") {
  return ROAD_TEXTURE_MASKS.reduce((textures, mask) => {
    textures[mask] = `/assets/sprites/map/roads-v5/${kind}-${mask}.webp`;
    return textures;
  }, {} as Record<number, string>);
}

export const ROAD_TEXTURES = {
  dirt: buildRoadTextureSet("dirt"),
  gravel: buildRoadTextureSet("gravel"),
  paved: buildRoadTextureSet("paved"),
  bridge: buildRoadTextureSet("bridge"),
} satisfies Record<RoadType | "bridge", Record<number, string>>;

export type TerrainTopTexture = {
  path: string;
  tags: readonly string[];
};

export function getTerrainSideTexturePath(path: string, side: Extract<Diagonal4, "SW" | "SE">) {
  return path.replace(/\.webp$/, `-side-${side}.webp`);
}

export const TERRAIN_TOP_TEXTURES = {
  [TerrainType.GRASS]: [
    { path: "/assets/textures/terrain/grass/grass-clean.webp", tags: ["clean"] },
    { path: "/assets/textures/terrain/grass/grass-dense-herb.webp", tags: ["grass", "dense"] },
    { path: "/assets/textures/terrain/grass/grass-flowers.webp", tags: ["flower"] },
    { path: "/assets/textures/terrain/grass/grass-small-rocks.webp", tags: ["rock"] },
    { path: "/assets/textures/terrain/grass/grass-herb-flowers.webp", tags: ["grass", "flower"] },
    { path: "/assets/textures/terrain/grass/grass-herb-rocks.webp", tags: ["grass", "rock"] },
    { path: "/assets/textures/terrain/grass/grass-clover-moss.webp", tags: ["moss", "clover"] },
    { path: "/assets/textures/terrain/grass/grass-dirt-transition.webp", tags: ["dirt", "transition"] },
  ],
  [TerrainType.FOREST]: [
    { path: "/assets/textures/terrain/forest/forest-leafy-floor.webp", tags: ["clean", "leaf"] },
    { path: "/assets/textures/terrain/forest/forest-dead-leaves.webp", tags: ["leaf"] },
    { path: "/assets/textures/terrain/forest/forest-low-roots.webp", tags: ["root"] },
    { path: "/assets/textures/terrain/forest/forest-moss.webp", tags: ["moss"] },
    { path: "/assets/textures/terrain/forest/forest-ferns.webp", tags: ["grass", "fern"] },
    { path: "/assets/textures/terrain/forest/forest-pine-needles.webp", tags: ["needle"] },
    { path: "/assets/textures/terrain/forest/forest-rare-flowers.webp", tags: ["flower"] },
    { path: "/assets/textures/terrain/forest/forest-shaded-rocks.webp", tags: ["rock"] },
  ],
  [TerrainType.DIRT]: [
    { path: "/assets/textures/terrain/dirt/dirt-bare.webp", tags: ["clean"] },
    { path: "/assets/textures/terrain/dirt/dirt-dry.webp", tags: ["dry"] },
    { path: "/assets/textures/terrain/dirt/dirt-small-rocks.webp", tags: ["rock"] },
    { path: "/assets/textures/terrain/dirt/dirt-rare-grass.webp", tags: ["grass"] },
    { path: "/assets/textures/terrain/dirt/dirt-light-mud.webp", tags: ["mud"] },
    { path: "/assets/textures/terrain/dirt/dirt-ruts.webp", tags: ["rut"] },
    { path: "/assets/textures/terrain/dirt/dirt-dark.webp", tags: ["dark"] },
  ],
  [TerrainType.SAND]: [
    { path: "/assets/textures/terrain/sand/sand-clean.webp", tags: ["clean"] },
    { path: "/assets/textures/terrain/sand/sand-ripples.webp", tags: ["ripple"] },
    { path: "/assets/textures/terrain/sand/sand-small-rocks.webp", tags: ["rock"] },
    { path: "/assets/textures/terrain/sand/sand-shells.webp", tags: ["shell"] },
    { path: "/assets/textures/terrain/sand/sand-dry.webp", tags: ["dry"] },
    { path: "/assets/textures/terrain/sand/sand-packed.webp", tags: ["packed"] },
    { path: "/assets/textures/terrain/sand/sand-rare-grass.webp", tags: ["grass"] },
  ],
  [TerrainType.SNOW]: [
    { path: "/assets/textures/terrain/snow/snow-clean.webp", tags: ["clean"] },
    { path: "/assets/textures/terrain/snow/snow-packed.webp", tags: ["packed"] },
    { path: "/assets/textures/terrain/snow/snow-small-rocks.webp", tags: ["rock"] },
    { path: "/assets/textures/terrain/snow/snow-blue.webp", tags: ["blue"] },
    { path: "/assets/textures/terrain/snow/snow-frozen-grass.webp", tags: ["grass"] },
    { path: "/assets/textures/terrain/snow/snow-soft-tracks.webp", tags: ["track"] },
    { path: "/assets/textures/terrain/snow/snow-hard-ice.webp", tags: ["ice"] },
  ],
  [TerrainType.SWAMP]: [
    { path: "/assets/textures/terrain/swamp/swamp-green-mud.webp", tags: ["clean", "mud"] },
    { path: "/assets/textures/terrain/swamp/swamp-wet-moss.webp", tags: ["moss"] },
    { path: "/assets/textures/terrain/swamp/swamp-low-reeds.webp", tags: ["grass", "reed"] },
    { path: "/assets/textures/terrain/swamp/swamp-dark-puddles.webp", tags: ["puddle"] },
    { path: "/assets/textures/terrain/swamp/swamp-roots.webp", tags: ["root"] },
    { path: "/assets/textures/terrain/swamp/swamp-marsh-grass.webp", tags: ["grass"] },
    { path: "/assets/textures/terrain/swamp/swamp-wet-rocks.webp", tags: ["rock"] },
  ],
  [TerrainType.MOUNTAIN]: [
    { path: "/assets/textures/terrain/mountain/mountain-clean-rock.webp", tags: ["clean"] },
    { path: "/assets/textures/terrain/mountain/mountain-cracked-rock.webp", tags: ["crack"] },
    { path: "/assets/textures/terrain/mountain/mountain-small-rocks.webp", tags: ["rock"] },
    { path: "/assets/textures/terrain/mountain/mountain-rare-moss.webp", tags: ["moss", "grass"] },
    { path: "/assets/textures/terrain/mountain/mountain-dark-rock.webp", tags: ["dark"] },
    { path: "/assets/textures/terrain/mountain/mountain-light-rock.webp", tags: ["light"] },
    { path: "/assets/textures/terrain/mountain/mountain-gravel.webp", tags: ["gravel"] },
  ],
  [TerrainType.LAVA]: [
    { path: "/assets/textures/terrain/lava/lava-volcanic-rock.webp", tags: ["clean", "rock"] },
    { path: "/assets/textures/terrain/lava/lava-ash.webp", tags: ["ash"] },
    { path: "/assets/textures/terrain/lava/lava-hot-cracks.webp", tags: ["crack"] },
    { path: "/assets/textures/terrain/lava/lava-embers.webp", tags: ["ember"] },
    { path: "/assets/textures/terrain/lava/lava-black-rock.webp", tags: ["dark"] },
    { path: "/assets/textures/terrain/lava/lava-dry-flow.webp", tags: ["flow"] },
    { path: "/assets/textures/terrain/lava/lava-burnt-edge.webp", tags: ["edge"] },
  ],
} as const satisfies Partial<Record<TerrainType, readonly TerrainTopTexture[]>>;

export const TERRAIN_TEXTURE_PATHS = Object.values(TERRAIN_TOP_TEXTURES)
  .flat()
  .flatMap((texture) => [
    texture.path,
    getTerrainSideTexturePath(texture.path, "SW"),
    getTerrainSideTexturePath(texture.path, "SE"),
  ]);

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

export const HERO_DIRECTIONS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"] as const satisfies readonly Direction8[];
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
    frameWidth: 52,
    frameHeight: 52,
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
  MAP_SPRITES.gate,
  ...Object.values(MAP_SPRITES.gates),
  ...Object.values(MAP_SPRITES.towns),
  ...Object.values(MAP_SPRITES.resources),
  ...Object.values(MAP_SPRITES.artifacts),
  ...Object.values(MAP_SPRITES.buildings),
  ...Object.values(MAP_SPRITES.adventureBuildings),
  ...Object.values(MAP_SPRITES.externalDwellings),
  ...Object.values(MAP_SPRITES.decor),
  ...Object.values(ROAD_TEXTURES).flatMap((textures) => Object.values(textures)),
  ...TERRAIN_TEXTURE_PATHS,
]));
