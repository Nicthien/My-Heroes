import { Resources, TerrainType, UnitType } from "./types";

export type AdventureObjectCategory =
  | "mine"
  | "creature_bank"
  | "dwelling"
  | "visit"
  | "treasure"
  | "artifact"
  | "transport"
  | "gate"
  | "water"
  | "service"
  | "quest"
  | "town"
  | "event";

export type AdventureVisitFrequency =
  | "once"
  | "once_per_hero"
  | "once_per_player"
  | "daily"
  | "weekly"
  | "repeatable";

export type HeroStatKey = "attack" | "defense" | "spellPower" | "knowledge";

export type AdventureEffect =
  | { type: "resource"; resources: Partial<Resources>; randomResource?: boolean }
  | { type: "stat"; stat: HeroStatKey | "choice_attack_defense" | "choice_magic"; amount: number }
  | { type: "movement"; amount: number }
  | { type: "morale"; amount: number; duration: "next_battle" | "day" }
  | { type: "luck"; amount: number; duration: "next_battle" | "day" }
  | { type: "mana"; mode: "restore" | "multiply" | "gain"; amount: number }
  | { type: "experience"; amount: number }
  | { type: "reveal"; mode: "radius" | "surface" | "water" | "all"; radius?: number }
  | { type: "skill"; skill: string; optional?: boolean }
  | { type: "spell"; spell: string }
  | { type: "artifact"; tier: "treasure" | "minor" | "major" | "relic" | "random" }
  | { type: "recruit"; unitType?: UnitType; min: number; max: number }
  | { type: "combat_reward"; reward: Partial<Resources> & { experience?: number; artifactTier?: string; recruit?: UnitType } }
  | { type: "transport"; mode: "boat" | "airship" | "teleport" | "subterranean" | "whirlpool" }
  | { type: "market"; mode: "artifacts" | "resources" | "skills" | "war_machines" | "trade" }
  | { type: "quest"; mode: "gate" | "seer" | "border" }
  | { type: "transform"; mode: "skeleton" | "remove_skill" | "sacrifice" }
  | { type: "sanctuary" }
  | { type: "message"; text: string };

export interface AdventureObjectRule {
  id: string;
  label: string;
  category: AdventureObjectCategory;
  rmgValue: number | null;
  mapLimit: number | "unlimited" | null;
  sprite: string;
  allowedTerrain: TerrainType[];
  visitFrequency: AdventureVisitFrequency;
  guarded?: boolean;
  guardianPower?: number;
  consumesOnVisit?: boolean;
  roadAllowed?: boolean;
  appearsOnRandomMap?: boolean;
  effects: AdventureEffect[];
}

const LAND = [
  TerrainType.GRASS,
  TerrainType.DIRT,
  TerrainType.FOREST,
  TerrainType.SAND,
  TerrainType.SNOW,
  TerrainType.SWAMP,
  TerrainType.MOUNTAIN,
  TerrainType.LAVA,
];
const WATER = [TerrainType.WATER];
const ANY = [...LAND, ...WATER];

function sprite(id: string) {
  return `/assets/sprites/map/adventure/${id}.svg`;
}

function rule(
  id: string,
  label: string,
  category: AdventureObjectCategory,
  rmgValue: number | null,
  effects: AdventureEffect[],
  options: Partial<Omit<AdventureObjectRule, "id" | "label" | "category" | "rmgValue" | "effects" | "sprite">> = {},
): AdventureObjectRule {
  return {
    id,
    label,
    category,
    rmgValue,
    mapLimit: options.mapLimit ?? "unlimited",
    sprite: sprite(id),
    allowedTerrain: options.allowedTerrain ?? LAND,
    visitFrequency: options.visitFrequency ?? "once",
    guarded: options.guarded,
    guardianPower: options.guardianPower,
    consumesOnVisit: options.consumesOnVisit,
    roadAllowed: options.roadAllowed,
    appearsOnRandomMap: options.appearsOnRandomMap ?? true,
    effects,
  };
}

export const ADVENTURE_OBJECT_RULES: AdventureObjectRule[] = [
  rule("abandoned_mine", "Mine abandonnee", "mine", 3500, [{ type: "resource", resources: { gold: 1000 }, randomResource: true }], { guarded: true, guardianPower: 1800, visitFrequency: "repeatable" }),
  rule("airship", "Aeronef", "transport", null, [{ type: "transport", mode: "airship" }], { allowedTerrain: LAND, mapLimit: 64, appearsOnRandomMap: false }),
  rule("airship_yard", "Chantier d'aeronefs", "transport", null, [{ type: "transport", mode: "airship" }], { visitFrequency: "repeatable" }),
  rule("altar_of_mana", "Autel de mana", "water", 100, [{ type: "mana", mode: "gain", amount: 4 }], { allowedTerrain: WATER, visitFrequency: "repeatable" }),
  rule("altar_of_sacrifice", "Autel du sacrifice", "service", 100, [{ type: "transform", mode: "sacrifice" }], { visitFrequency: "repeatable" }),
  rule("ancient_altar", "Autel ancien", "creature_bank", 20000, [{ type: "combat_reward", reward: { artifactTier: "relic" } }], { guarded: true, guardianPower: 20000 }),
  rule("ancient_lamp", "Lampe antique", "dwelling", 5000, [{ type: "recruit", unitType: UnitType.MASTER_GENIE, min: 4, max: 7 }], { consumesOnVisit: true }),
  rule("arena", "Arene", "visit", 3000, [{ type: "stat", stat: "choice_attack_defense", amount: 2 }], { visitFrequency: "once_per_hero", mapLimit: 32 }),
  rule("artifact", "Artefact", "artifact", 5000, [{ type: "artifact", tier: "random" }], { consumesOnVisit: true }),
  rule("beholders_sanctuary", "Sanctuaire des Beholders", "creature_bank", 2500, [{ type: "combat_reward", reward: { gold: 5000, artifactTier: "minor" } }], { allowedTerrain: WATER, guarded: true, guardianPower: 4500 }),
  rule("black_market", "Marche noir", "service", 8000, [{ type: "market", mode: "artifacts" }], { visitFrequency: "repeatable", mapLimit: 32 }),
  rule("black_tower", "Tour noire", "creature_bank", 1500, [{ type: "combat_reward", reward: { gold: 2500, artifactTier: "minor" } }], { guarded: true, guardianPower: 5000 }),
  rule("boat", "Bateau", "transport", null, [{ type: "transport", mode: "boat" }], { allowedTerrain: WATER, mapLimit: 64, appearsOnRandomMap: false }),
  rule("border_gate", "Porte frontiere", "gate", null, [{ type: "quest", mode: "border" }], { allowedTerrain: ANY, roadAllowed: true }),
  rule("border_guard", "Garde frontiere", "gate", null, [{ type: "quest", mode: "border" }], { allowedTerrain: ANY, roadAllowed: true, consumesOnVisit: true }),
  rule("buoy", "Bouee", "water", 100, [{ type: "morale", amount: 1, duration: "next_battle" }], { allowedTerrain: WATER, visitFrequency: "once_per_hero" }),
  rule("campfire", "Feu de camp", "treasure", 2000, [{ type: "resource", resources: { gold: 500, wood: 5 }, randomResource: true }], { consumesOnVisit: true }),
  rule("cannon_yard", "Atelier de canons", "service", 3000, [{ type: "market", mode: "war_machines" }], { visitFrequency: "repeatable" }),
  rule("cartographer", "Cartographe", "service", 10000, [{ type: "reveal", mode: "all" }], { visitFrequency: "once_per_player" }),
  rule("churchyard", "Cimetiere", "creature_bank", 1500, [{ type: "combat_reward", reward: { gold: 2500, artifactTier: "minor" } }, { type: "morale", amount: -1, duration: "next_battle" }], { guarded: true, guardianPower: 2200 }),
  rule("colosseum_of_the_magi", "Colisee des mages", "visit", 3000, [{ type: "stat", stat: "choice_magic", amount: 2 }], { visitFrequency: "once_per_hero", mapLimit: 32 }),
  rule("corpse", "Cadavre", "treasure", 500, [{ type: "artifact", tier: "treasure" }], { consumesOnVisit: true }),
  rule("cover_of_darkness", "Voile des tenebres", "visit", 500, [{ type: "message", text: "Un voile de tenebres recouvre la region pour les adversaires." }], { visitFrequency: "once_per_player" }),
  rule("creature_dwelling", "Habitat externe", "dwelling", 4000, [{ type: "recruit", min: 6, max: 14 }], { visitFrequency: "weekly" }),
  rule("crypt", "Crypte", "creature_bank", 1000, [{ type: "combat_reward", reward: { gold: 2000, artifactTier: "treasure" } }, { type: "morale", amount: -1, duration: "next_battle" }], { guarded: true, guardianPower: 2500 }),
  rule("cyclops_stockpile", "Reserve de Cyclopes", "creature_bank", 3000, [{ type: "combat_reward", reward: { wood: 6, ore: 6, mercury: 6, crystals: 6, gems: 6, sulfur: 6 } }], { guarded: true, guardianPower: 7000 }),
  rule("den_of_thieves", "Repaire des voleurs", "service", 100, [{ type: "message", text: "Les voleurs revelent le classement des royaumes." }], { visitFrequency: "repeatable" }),
  rule("derelict_ship", "Navire abandonne", "creature_bank", 4000, [{ type: "combat_reward", reward: { gold: 4000, artifactTier: "minor" } }, { type: "morale", amount: -1, duration: "next_battle" }], { allowedTerrain: WATER, guarded: true, guardianPower: 5200 }),
  rule("derrick", "Derrick", "treasure", 750, [{ type: "resource", resources: { gold: 1000 } }], { visitFrequency: "weekly" }),
  rule("dragon_fly_hive", "Ruche de Libellules", "creature_bank", 9000, [{ type: "combat_reward", reward: { recruit: UnitType.WYVERN } }], { guarded: true, guardianPower: 9000 }),
  rule("dragon_utopia", "Utopie draconique", "creature_bank", 20000, [{ type: "combat_reward", reward: { gold: 20000, artifactTier: "relic" } }], { guarded: true, guardianPower: 24000 }),
  rule("dwarven_treasury", "Tresorerie naine", "creature_bank", 2500, [{ type: "combat_reward", reward: { gold: 5000, crystals: 5 } }], { guarded: true, guardianPower: 5000 }),
  rule("event", "Evenement", "event", null, [{ type: "message", text: "Un evenement de carte se declenche." }], { appearsOnRandomMap: false, consumesOnVisit: true }),
  rule("experimental_shop", "Atelier experimental", "service", 3000, [{ type: "market", mode: "war_machines" }], { visitFrequency: "repeatable" }),
  rule("eye_of_the_magi", "Oeil des mages", "visit", 500, [{ type: "reveal", mode: "radius", radius: 12 }], { visitFrequency: "repeatable" }),
  rule("faerie_ring", "Cercle feerique", "visit", 1000, [{ type: "luck", amount: 1, duration: "next_battle" }], { visitFrequency: "once_per_hero" }),
  rule("flotsam", "Epave flottante", "treasure", 500, [{ type: "resource", resources: { wood: 5, gold: 500 }, randomResource: true }], { allowedTerrain: WATER, consumesOnVisit: true }),
  rule("fountain_of_fortune", "Fontaine de fortune", "visit", 1500, [{ type: "luck", amount: 2, duration: "next_battle" }], { visitFrequency: "once_per_hero" }),
  rule("fountain_of_youth", "Fontaine de jouvence", "visit", 500, [{ type: "movement", amount: 4 }, { type: "morale", amount: 1, duration: "next_battle" }], { visitFrequency: "once_per_hero" }),
  rule("freelancers_guild", "Guilde des mercenaires libres", "service", 100, [{ type: "transform", mode: "sacrifice" }], { visitFrequency: "repeatable" }),
  rule("garden_of_revelation", "Jardin de revelation", "visit", 1500, [{ type: "stat", stat: "knowledge", amount: 1 }], { visitFrequency: "once_per_hero" }),
  rule("garrison", "Garnison", "gate", null, [{ type: "message", text: "Une garnison bloque le passage." }], { guarded: true, guardianPower: 5000, roadAllowed: true }),
  rule("gazebo", "Kiosque", "visit", 1500, [{ type: "experience", amount: 1000 }], { visitFrequency: "once_per_hero" }),
  rule("grave", "Tombe", "treasure", 500, [{ type: "artifact", tier: "treasure" }, { type: "morale", amount: -1, duration: "next_battle" }], { consumesOnVisit: true }),
  rule("griffin_conservatory", "Conservatoire de Griffons", "creature_bank", 7000, [{ type: "combat_reward", reward: { recruit: UnitType.ANGEL } }], { guarded: true, guardianPower: 10000 }),
  rule("hermits_shack", "Cabane de l'ermite", "visit", 100, [{ type: "message", text: "L'ermite partage une rumeur utile." }], { visitFrequency: "once_per_hero" }),
  rule("hero_camp", "Camp de heros", "service", 3000, [{ type: "recruit", min: 1, max: 1 }], { visitFrequency: "weekly" }),
  rule("hill_fort", "Fort de colline", "service", 3000, [{ type: "market", mode: "war_machines" }], { visitFrequency: "repeatable" }),
  rule("hut_of_the_magi", "Hutte des mages", "visit", 500, [{ type: "reveal", mode: "radius", radius: 16 }], { visitFrequency: "repeatable" }),
  rule("idol_of_fortune", "Idole de fortune", "visit", 1500, [{ type: "luck", amount: 1, duration: "next_battle" }, { type: "morale", amount: 1, duration: "next_battle" }], { visitFrequency: "once_per_hero" }),
  rule("imp_cache", "Cache des Diablotins", "creature_bank", 1500, [{ type: "combat_reward", reward: { mercury: 4, gold: 1500 } }], { guarded: true, guardianPower: 2600 }),
  rule("ivory_tower", "Tour d'ivoire", "dwelling", 4000, [{ type: "recruit", unitType: UnitType.ARCH_MAGE, min: 4, max: 8 }], { visitFrequency: "weekly" }),
  rule("jetsam", "Debris flottants", "treasure", 500, [{ type: "resource", resources: { wood: 5, gold: 500 }, randomResource: true }], { allowedTerrain: WATER, consumesOnVisit: true }),
  rule("junkman", "Ferrailleur", "service", 1000, [{ type: "market", mode: "trade" }], { visitFrequency: "repeatable" }),
  rule("keymasters_tent", "Tente du gardien des cles", "quest", null, [{ type: "quest", mode: "border" }], { visitFrequency: "once_per_player" }),
  rule("lean_to", "Abri", "treasure", 500, [{ type: "resource", resources: { wood: 5, ore: 5 } }], { consumesOnVisit: true }),
  rule("learning_stone", "Pierre d'apprentissage", "visit", 1500, [{ type: "experience", amount: 1000 }], { visitFrequency: "once_per_hero" }),
  rule("library_of_enlightenment", "Bibliotheque de l'illumination", "visit", 10000, [{ type: "stat", stat: "attack", amount: 2 }, { type: "stat", stat: "defense", amount: 2 }, { type: "stat", stat: "spellPower", amount: 2 }, { type: "stat", stat: "knowledge", amount: 2 }], { visitFrequency: "once_per_hero" }),
  rule("lighthouse", "Phare", "water", 3500, [{ type: "movement", amount: 4 }], { allowedTerrain: WATER, visitFrequency: "repeatable" }),
  rule("magic_spring", "Source magique", "visit", 1500, [{ type: "mana", mode: "multiply", amount: 2 }], { visitFrequency: "weekly" }),
  rule("magic_well", "Puits magique", "visit", 500, [{ type: "mana", mode: "restore", amount: 1 }], { visitFrequency: "daily" }),
  rule("mansion", "Manoir", "creature_bank", 4500, [{ type: "combat_reward", reward: { gold: 4000, artifactTier: "minor" } }], { guarded: true, guardianPower: 5000 }),
  rule("market_of_time", "Marche du temps", "service", 100, [{ type: "transform", mode: "remove_skill" }], { visitFrequency: "repeatable" }),
  rule("marletto_tower", "Tour de Marletto", "visit", 1500, [{ type: "stat", stat: "defense", amount: 1 }], { visitFrequency: "once_per_hero" }),
  rule("medusa_stores", "Reserves de Meduses", "creature_bank", 3000, [{ type: "combat_reward", reward: { sulfur: 6, gold: 3000 } }], { guarded: true, guardianPower: 5200 }),
  rule("mercenary_camp", "Camp de mercenaires", "visit", 1500, [{ type: "stat", stat: "attack", amount: 1 }], { visitFrequency: "once_per_hero" }),
  rule("mermaids", "Sirene bienveillante", "water", 1000, [{ type: "luck", amount: 1, duration: "next_battle" }], { allowedTerrain: WATER, visitFrequency: "once_per_hero" }),
  rule("mineral_spring", "Source minerale", "visit", 500, [{ type: "mana", mode: "restore", amount: 1 }, { type: "luck", amount: 1, duration: "next_battle" }], { visitFrequency: "daily" }),
  rule("mystical_garden", "Jardin mystique", "treasure", 500, [{ type: "resource", resources: { gems: 5, gold: 500 }, randomResource: true }], { visitFrequency: "weekly" }),
  rule("naga_bank", "Banque des Nagas", "creature_bank", 6000, [{ type: "combat_reward", reward: { gold: 8000, gems: 8 } }], { guarded: true, guardianPower: 8500 }),
  rule("oasis", "Oasis", "visit", 1500, [{ type: "movement", amount: 8 }, { type: "morale", amount: 1, duration: "next_battle" }], { allowedTerrain: [TerrainType.SAND, TerrainType.DIRT, TerrainType.GRASS], visitFrequency: "once_per_hero" }),
  rule("obelisk", "Obelisque", "quest", 1000, [{ type: "reveal", mode: "radius", radius: 8 }], { visitFrequency: "once_per_player" }),
  rule("observation_tower", "Tour d'observation", "visit", 1000, [{ type: "reveal", mode: "radius", radius: 20 }], { visitFrequency: "once_per_player" }),
  rule("observatory", "Observatoire", "visit", 1000, [{ type: "reveal", mode: "radius", radius: 20 }], { visitFrequency: "once_per_player" }),
  rule("ocean_bottle", "Bouteille a la mer", "water", null, [{ type: "message", text: "Un message flotte dans la bouteille." }], { allowedTerrain: WATER, consumesOnVisit: true }),
  rule("pandoras_box", "Boite de Pandore", "event", 5000, [{ type: "message", text: "La boite libere son contenu." }], { guarded: true, guardianPower: 4000, consumesOnVisit: true }),
  rule("pillar_of_fire", "Pilier de feu", "visit", 1000, [{ type: "reveal", mode: "radius", radius: 10 }], { allowedTerrain: [TerrainType.LAVA, TerrainType.DIRT, TerrainType.GRASS], visitFrequency: "once_per_player" }),
  rule("pirate_cavern", "Caverne pirate", "creature_bank", 4500, [{ type: "combat_reward", reward: { gold: 5000, artifactTier: "minor" } }], { allowedTerrain: ANY, guarded: true, guardianPower: 6500 }),
  rule("prison", "Prison", "event", 5000, [{ type: "recruit", min: 1, max: 1 }], { consumesOnVisit: true }),
  rule("prospector", "Prospecteur", "service", 750, [{ type: "resource", resources: { gold: 500 } }], { visitFrequency: "weekly" }),
  rule("pyramid", "Pyramide", "creature_bank", 4500, [{ type: "spell", spell: "random_level_5" }], { allowedTerrain: [TerrainType.SAND, TerrainType.DIRT], guarded: true, guardianPower: 9000 }),
  rule("quest_gate", "Porte de quete", "quest", null, [{ type: "quest", mode: "gate" }], { roadAllowed: true }),
  rule("quest_guard", "Gardien de quete", "quest", null, [{ type: "quest", mode: "gate" }], { roadAllowed: true }),
  rule("rally_flag", "Etendard de ralliement", "visit", 1500, [{ type: "movement", amount: 4 }, { type: "morale", amount: 1, duration: "next_battle" }, { type: "luck", amount: 1, duration: "next_battle" }], { visitFrequency: "once_per_hero" }),
  rule("red_tower", "Tour rouge", "creature_bank", 1500, [{ type: "combat_reward", reward: { gold: 2500, artifactTier: "minor" } }], { guarded: true, guardianPower: 5500 }),
  rule("redwood_observatory", "Observatoire de sequoia", "visit", 1000, [{ type: "reveal", mode: "radius", radius: 20 }], { allowedTerrain: [TerrainType.FOREST, TerrainType.GRASS], visitFrequency: "once_per_player" }),
  rule("refugee_camp", "Camp de refugies", "dwelling", 4000, [{ type: "recruit", min: 1, max: 12 }], { visitFrequency: "weekly" }),
  rule("ruins", "Ruines", "creature_bank", 1500, [{ type: "combat_reward", reward: { gold: 2000, artifactTier: "treasure" } }], { guarded: true, guardianPower: 3500 }),
  rule("sanctuary", "Sanctuaire", "service", 100, [{ type: "sanctuary" }], { visitFrequency: "repeatable" }),
  rule("scholar", "Erudit", "visit", 1500, [{ type: "skill", skill: "random", optional: true }], { consumesOnVisit: true }),
  rule("school_of_magic", "Ecole de magie", "service", 1000, [{ type: "stat", stat: "choice_magic", amount: 1 }], { visitFrequency: "once_per_hero" }),
  rule("school_of_war", "Ecole de guerre", "service", 1000, [{ type: "stat", stat: "choice_attack_defense", amount: 1 }], { visitFrequency: "once_per_hero" }),
  rule("sea_barrel", "Tonneau en mer", "water", 500, [{ type: "resource", resources: { gold: 500 }, randomResource: true }], { allowedTerrain: WATER, consumesOnVisit: true }),
  rule("sea_chest", "Coffre marin", "water", 1500, [{ type: "resource", resources: { gold: 1500 } }, { type: "artifact", tier: "treasure" }], { allowedTerrain: WATER, consumesOnVisit: true }),
  rule("seafaring_academy", "Academie maritime", "water", 1000, [{ type: "skill", skill: "navigation", optional: true }], { allowedTerrain: WATER, visitFrequency: "once_per_hero" }),
  rule("seers_hut", "Hutte du voyant", "quest", null, [{ type: "quest", mode: "seer" }], { visitFrequency: "repeatable" }),
  rule("shipwreck", "Naufrage", "creature_bank", 4000, [{ type: "combat_reward", reward: { gold: 5000, artifactTier: "minor" } }, { type: "morale", amount: -1, duration: "next_battle" }], { allowedTerrain: WATER, guarded: true, guardianPower: 7000 }),
  rule("shipwreck_survivor", "Survivant d'un naufrage", "water", 1500, [{ type: "artifact", tier: "treasure" }], { allowedTerrain: WATER, consumesOnVisit: true }),
  rule("shipyard", "Chantier naval", "transport", 3000, [{ type: "transport", mode: "boat" }], { allowedTerrain: WATER, visitFrequency: "repeatable" }),
  rule("sign", "Panneau", "event", null, [{ type: "message", text: "Le panneau affiche un message." }], { appearsOnRandomMap: false, visitFrequency: "repeatable" }),
  rule("sirens", "Sirenes", "water", 1000, [{ type: "experience", amount: 1000 }], { allowedTerrain: WATER, visitFrequency: "once_per_hero" }),
  rule("skeleton_transformer", "Transformateur de squelettes", "service", 100, [{ type: "transform", mode: "skeleton" }], { visitFrequency: "repeatable" }),
  rule("spit", "Banc de sable", "water", 500, [{ type: "resource", resources: { gold: 500 }, randomResource: true }], { allowedTerrain: WATER, consumesOnVisit: true }),
  rule("stables", "Ecuries", "visit", 2000, [{ type: "movement", amount: 6 }], { visitFrequency: "weekly" }),
  rule("star_axis", "Axe stellaire", "visit", 1500, [{ type: "stat", stat: "spellPower", amount: 1 }], { visitFrequency: "once_per_hero" }),
  rule("subterranean_gate", "Porte souterraine", "transport", null, [{ type: "transport", mode: "subterranean" }], { visitFrequency: "repeatable" }),
  rule("swan_pond", "Etang aux cygnes", "visit", 1000, [{ type: "luck", amount: 2, duration: "next_battle" }, { type: "movement", amount: -2 }], { visitFrequency: "once_per_hero" }),
  rule("tavern", "Taverne", "service", 500, [{ type: "market", mode: "trade" }], { visitFrequency: "repeatable" }),
  rule("temple", "Temple", "visit", 1000, [{ type: "morale", amount: 1, duration: "next_battle" }], { visitFrequency: "weekly" }),
  rule("temple_of_loyalty", "Temple de loyaute", "service", 1000, [{ type: "morale", amount: 1, duration: "day" }], { visitFrequency: "once_per_hero" }),
  rule("temple_of_the_sea", "Temple de la mer", "water", 1000, [{ type: "morale", amount: 1, duration: "next_battle" }], { allowedTerrain: WATER, visitFrequency: "weekly" }),
  rule("town", "Ville", "town", null, [{ type: "message", text: "Une ville occupe cette position." }], { appearsOnRandomMap: false, roadAllowed: true }),
  rule("town_gate", "Portail de ville", "transport", 5000, [{ type: "transport", mode: "teleport" }], { visitFrequency: "repeatable" }),
  rule("trading_post", "Comptoir commercial", "service", 1000, [{ type: "market", mode: "resources" }], { visitFrequency: "repeatable" }),
  rule("trailblazer", "Eclaireur", "visit", 1000, [{ type: "skill", skill: "pathfinding", optional: true }], { visitFrequency: "once_per_hero" }),
  rule("trapper_lodge", "Pavillon des trappeurs", "service", 1000, [{ type: "skill", skill: "scouting", optional: true }], { allowedTerrain: [TerrainType.FOREST, TerrainType.SWAMP, TerrainType.GRASS], visitFrequency: "once_per_hero" }),
  rule("treasure_chest", "Coffre au tresor", "treasure", 1500, [{ type: "resource", resources: { gold: 1500 } }, { type: "experience", amount: 1000 }], { consumesOnVisit: true }),
  rule("tree_of_knowledge", "Arbre de connaissance", "visit", 10000, [{ type: "experience", amount: 5000 }], { visitFrequency: "once_per_hero" }),
  rule("university", "Universite", "service", 4000, [{ type: "skill", skill: "random", optional: true }], { visitFrequency: "once_per_hero" }),
  rule("vial_of_mana", "Fiole de mana", "treasure", 500, [{ type: "mana", mode: "gain", amount: 50 }], { consumesOnVisit: true }),
  rule("wagon", "Chariot", "treasure", 500, [{ type: "resource", resources: { gold: 500 }, randomResource: true }], { consumesOnVisit: true }),
  rule("war_machine_factory", "Fabrique de machines de guerre", "service", 1000, [{ type: "market", mode: "war_machines" }], { visitFrequency: "repeatable" }),
  rule("warlocks_lab", "Laboratoire du sorcier", "service", 1000, [{ type: "artifact", tier: "random" }], { visitFrequency: "repeatable" }),
  rule("warriors_tomb", "Tombe du guerrier", "treasure", 500, [{ type: "artifact", tier: "minor" }, { type: "morale", amount: -3, duration: "next_battle" }], { consumesOnVisit: true }),
  rule("water_wheel", "Moulin a eau", "treasure", 1500, [{ type: "resource", resources: { gold: 1000 } }], { visitFrequency: "weekly" }),
  rule("watering_hole", "Point d'eau", "visit", 500, [{ type: "movement", amount: 4 }, { type: "morale", amount: 1, duration: "next_battle" }], { visitFrequency: "once_per_hero" }),
  rule("watering_place", "Abreuvoir", "visit", 500, [{ type: "movement", amount: 4 }], { visitFrequency: "once_per_hero" }),
  rule("whirlpool", "Tourbillon", "water", null, [{ type: "transport", mode: "whirlpool" }], { allowedTerrain: WATER, visitFrequency: "repeatable" }),
  rule("windmill", "Moulin a vent", "treasure", 2500, [{ type: "resource", resources: { mercury: 4 }, randomResource: true }], { visitFrequency: "weekly", mapLimit: 32 }),
  rule("witch_hut", "Hutte de sorciere", "visit", 1500, [{ type: "skill", skill: "random" }], { visitFrequency: "once_per_hero", mapLimit: 32 }),
  rule("wolf_raider_picket", "Poste de pillards loups", "creature_bank", 9500, [{ type: "combat_reward", reward: { recruit: UnitType.CYCLOPS } }], { guarded: true, guardianPower: 9500 }),
];

export const ADVENTURE_OBJECT_RULE_BY_ID = Object.fromEntries(
  ADVENTURE_OBJECT_RULES.map((item) => [item.id, item]),
) as Record<string, AdventureObjectRule>;

export function getAdventureObjectRule(id: string | undefined | null) {
  return id ? ADVENTURE_OBJECT_RULE_BY_ID[id] : undefined;
}

export function getAdventureObjectLabel(id: string | undefined | null) {
  return getAdventureObjectRule(id)?.label ?? id ?? "Objet d'aventure";
}

export function isAdventureObjectConsumed(state: unknown) {
  return Boolean(state && typeof state === "object" && "consumed" in state && (state as { consumed?: unknown }).consumed);
}
