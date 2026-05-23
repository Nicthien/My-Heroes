import { Faction, HeroClass, HeroStats, UnitType } from "./types";

export interface HeroTemplate {
  id: string;
  name: string;
  class: HeroClass;
  faction: Faction;
  specialty: string;
}

export interface TavernOffer {
  templateId: string;
  name: string;
  class: HeroClass;
  faction: Faction;
  specialty: string;
}

export const HERO_RECRUIT_COST_GOLD = 2500;
export const MAX_HEROES_PER_PLAYER = 8;
export const TAVERN_OFFER_SIZE = 2;

export const CLASS_STARTING_STATS: Record<HeroClass, HeroStats> = {
  [HeroClass.KNIGHT]: { attack: 2, defense: 2, spellPower: 1, knowledge: 1, morale: 0, luck: 0 },
  [HeroClass.CLERIC]: { attack: 1, defense: 0, spellPower: 2, knowledge: 2, morale: 0, luck: 0 },
  [HeroClass.RANGER]: { attack: 1, defense: 3, spellPower: 1, knowledge: 1, morale: 0, luck: 0 },
  [HeroClass.DRUID]: { attack: 0, defense: 2, spellPower: 1, knowledge: 2, morale: 0, luck: 0 },
  [HeroClass.ALCHEMIST]: { attack: 1, defense: 1, spellPower: 2, knowledge: 2, morale: 0, luck: 0 },
  [HeroClass.WIZARD]: { attack: 0, defense: 0, spellPower: 2, knowledge: 3, morale: 0, luck: 0 },
  [HeroClass.DEMONIAC]: { attack: 2, defense: 2, spellPower: 1, knowledge: 1, morale: 0, luck: 0 },
  [HeroClass.HERETIC]: { attack: 1, defense: 1, spellPower: 2, knowledge: 2, morale: 0, luck: 0 },
  [HeroClass.DEATH_KNIGHT]: { attack: 1, defense: 2, spellPower: 2, knowledge: 1, morale: 0, luck: 0 },
  [HeroClass.NECROMANCER]: { attack: 1, defense: 0, spellPower: 2, knowledge: 2, morale: 0, luck: 0 },
  [HeroClass.OVERLORD]: { attack: 2, defense: 2, spellPower: 1, knowledge: 1, morale: 0, luck: 0 },
  [HeroClass.WARLOCK]: { attack: 0, defense: 0, spellPower: 3, knowledge: 2, morale: 0, luck: 0 },
  [HeroClass.BARBARIAN]: { attack: 4, defense: 0, spellPower: 1, knowledge: 1, morale: 0, luck: 0 },
  [HeroClass.BATTLE_MAGE]: { attack: 2, defense: 1, spellPower: 1, knowledge: 1, morale: 0, luck: 0 },
  [HeroClass.BEASTMASTER]: { attack: 1, defense: 2, spellPower: 1, knowledge: 1, morale: 0, luck: 0 },
  [HeroClass.WITCH]: { attack: 0, defense: 1, spellPower: 2, knowledge: 2, morale: 0, luck: 0 },
  [HeroClass.PLANESWALKER]: { attack: 2, defense: 2, spellPower: 1, knowledge: 1, morale: 0, luck: 0 },
  [HeroClass.ELEMENTALIST]: { attack: 0, defense: 0, spellPower: 3, knowledge: 3, morale: 0, luck: 0 },
};

export const FACTION_STARTING_UNIT: Record<Faction, { unitType: UnitType; min: number; max: number }> = {
  [Faction.CASTLE]: { unitType: UnitType.PIKEMAN, min: 20, max: 30 },
  [Faction.RAMPART]: { unitType: UnitType.CENTAUR, min: 20, max: 30 },
  [Faction.TOWER]: { unitType: UnitType.GREMLIN, min: 15, max: 25 },
  [Faction.INFERNO]: { unitType: UnitType.IMP, min: 25, max: 35 },
  [Faction.NECROPOLIS]: { unitType: UnitType.SKELETON, min: 20, max: 30 },
  [Faction.DUNGEON]: { unitType: UnitType.TROGLODYTE, min: 25, max: 35 },
  [Faction.STRONGHOLD]: { unitType: UnitType.GOBLIN, min: 20, max: 30 },
  [Faction.FORTRESS]: { unitType: UnitType.GNOLL, min: 15, max: 25 },
  [Faction.CONFLUX]: { unitType: UnitType.PIXIE, min: 20, max: 30 },
};

export const HERO_ROSTER: HeroTemplate[] = [
  // Castle - Knights
  { id: "orrin", name: "Orrin", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Tir à l'arc" },
  { id: "valeska", name: "Valeska", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Archers" },
  { id: "edric", name: "Edric", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Griffons" },
  { id: "sylvia", name: "Sylvia", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Navigation" },
  { id: "lord_haart", name: "Lord Haart", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Domaines" },
  { id: "sorsha", name: "Sorsha", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Épéistes" },
  { id: "christian", name: "Christian", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Baliste" },
  { id: "tyris", name: "Tyris", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Cavaliers" },
  { id: "beatrice", name: "Beatrice", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Éclaireurs" },
  // Castle - Clerics
  { id: "adela", name: "Adela", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Bénédiction" },
  { id: "cuthbert", name: "Cuthbert", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Faiblesse" },
  { id: "adelaide", name: "Adelaide", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Anneau de glace" },
  { id: "ingham", name: "Ingham", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Moines" },
  { id: "sanya", name: "Sanya", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Œil d'aigle" },
  { id: "loynis", name: "Loynis", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Prière" },
  { id: "caitlin", name: "Caitlin", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Or" },
  { id: "rion", name: "Rion", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Premiers secours" },

  // Rampart - Rangers
  { id: "mephala", name: "Mephala", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Armurier" },
  { id: "ufretin", name: "Ufretin", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Nains" },
  { id: "jenova", name: "Jenova", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Or" },
  { id: "ryland", name: "Ryland", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Dendroïdes" },
  { id: "thorgrim", name: "Thorgrim", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Résistance" },
  { id: "ivor", name: "Ivor", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Elfes" },
  { id: "clancy", name: "Clancy", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Licornes" },
  { id: "kyrre", name: "Kyrre", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Logistique" },
  // Rampart - Druids
  { id: "coronius", name: "Coronius", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Pourfendeur" },
  { id: "uland", name: "Uland", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Soin" },
  { id: "elleshar", name: "Elleshar", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Intelligence" },
  { id: "gem", name: "Gem", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Premiers secours" },
  { id: "malcom", name: "Malcom", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Œil d'aigle" },
  { id: "melodia", name: "Melodia", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Chance" },
  { id: "alagar", name: "Alagar", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Trait de glace" },
  { id: "aeris", name: "Aeris", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Pégases" },

  // Tower - Alchemists
  { id: "piquedram", name: "Piquedram", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Gargouilles" },
  { id: "thane", name: "Thane", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Génies" },
  { id: "josephine", name: "Josephine", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Golems" },
  { id: "neela", name: "Neela", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Armurier" },
  { id: "torosar", name: "Torosar", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Baliste" },
  { id: "fafner", name: "Fafner", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Nagas" },
  { id: "rissa", name: "Rissa", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Mercure" },
  { id: "iona", name: "Iona", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Génies" },
  // Tower - Wizards
  { id: "astral", name: "Astral", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Hypnose" },
  { id: "halon", name: "Halon", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Mysticisme" },
  { id: "serena", name: "Serena", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Œil d'aigle" },
  { id: "daremyth", name: "Daremyth", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Chance" },
  { id: "theodorus", name: "Theodorus", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Mages" },
  { id: "solmyr", name: "Solmyr", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Foudre en chaîne" },
  { id: "aine", name: "Aine", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Or" },
  { id: "cyra", name: "Cyra", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Hâte" },

  // Inferno - Demoniacs
  { id: "fiona", name: "Fiona", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Chiens de l'enfer" },
  { id: "rashka", name: "Rashka", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Efreets" },
  { id: "marius", name: "Marius", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Démons" },
  { id: "ignatius", name: "Ignatius", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Diablotins" },
  { id: "octavia", name: "Octavia", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Or" },
  { id: "calh", name: "Calh", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Gogs" },
  { id: "pyre", name: "Pyre", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Baliste" },
  { id: "nymus", name: "Nymus", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Diables des fosses" },
  // Inferno - Heretics
  { id: "ayden", name: "Ayden", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Intelligence" },
  { id: "xyron", name: "Xyron", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Inferno" },
  { id: "axsis", name: "Axsis", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Mysticisme" },
  { id: "olema", name: "Olema", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Faiblesse" },
  { id: "calid", name: "Calid", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Soufre" },
  { id: "ash", name: "Ash", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Soif de sang" },
  { id: "zydar", name: "Zydar", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Sorcellerie" },
  { id: "xarfax", name: "Xarfax", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Boule de feu" },

  // Necropolis - Death Knights
  { id: "straker", name: "Straker", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Morts-vivants" },
  { id: "vokial", name: "Vokial", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Vampires" },
  { id: "moandor", name: "Moandor", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Liches" },
  { id: "charna", name: "Charna", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Spectres" },
  { id: "tamika", name: "Tamika", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Chevaliers noirs" },
  { id: "isra", name: "Isra", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Nécromancie" },
  { id: "clavius", name: "Clavius", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Or" },
  { id: "galthran", name: "Galthran", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Squelettes" },
  { id: "ranloo", name: "Ranloo", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Baliste" },
  { id: "haart_lich", name: "Haart le Liche", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Chevaliers noirs" },
  // Necropolis - Necromancers
  { id: "septienna", name: "Septienna", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Vague mortelle" },
  { id: "aislinn", name: "Aislinn", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Pluie de météores" },
  { id: "sandro", name: "Sandro", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Sorcellerie" },
  { id: "nimbus", name: "Nimbus", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Œil d'aigle" },
  { id: "thant", name: "Thant", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Animation des morts" },
  { id: "xsi", name: "Xsi", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Œil d'aigle" },
  { id: "vidomina", name: "Vidomina", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Nécromancie" },
  { id: "nagash", name: "Nagash", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Liches" },

  // Dungeon - Overlords
  { id: "lorelei", name: "Lorelei", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Harpies" },
  { id: "arlach", name: "Arlach", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Baliste" },
  { id: "dace", name: "Dace", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Minotaures" },
  { id: "ajit", name: "Ajit", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Beholders" },
  { id: "damacon", name: "Damacon", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Or" },
  { id: "gunnar", name: "Gunnar", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Logistique" },
  { id: "synca", name: "Synca", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Manticores" },
  { id: "shakti", name: "Shakti", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Troglodytes" },
  { id: "mutare", name: "Mutare", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Dragons" },
  // Dungeon - Warlocks
  { id: "alamar", name: "Alamar", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Résurrection" },
  { id: "jaegar", name: "Jaegar", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Mysticisme" },
  { id: "malekith", name: "Malekith", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Sorcellerie" },
  { id: "jeddite", name: "Jeddite", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Résurrection" },
  { id: "geon", name: "Geon", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Œil d'aigle" },
  { id: "deemer", name: "Deemer", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Pluie de météores" },
  { id: "sephinroth", name: "Sephinroth", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Cristaux" },

  // Stronghold - Barbarians
  { id: "yog", name: "Yog", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Cyclopes" },
  { id: "gurnisson", name: "Gurnisson", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Baliste" },
  { id: "jabarkas", name: "Jabarkas", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Orcs" },
  { id: "shiva", name: "Shiva", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Rocs" },
  { id: "gretchin", name: "Gretchin", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Gobelins" },
  { id: "krellion", name: "Krellion", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Ogres" },
  { id: "crag_hack", name: "Crag Hack", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Offensive" },
  { id: "tyraxor", name: "Tyraxor", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Chevaucheurs de loups" },
  { id: "boragus", name: "Boragus", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Ogres" },
  { id: "kilgor", name: "Kilgor", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Béhémoths" },
  // Stronghold - Battle Mages
  { id: "gird", name: "Gird", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Sorcellerie" },
  { id: "vey", name: "Vey", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Ogres" },
  { id: "dessa", name: "Dessa", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Logistique" },
  { id: "terek", name: "Terek", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Hâte" },
  { id: "zubin", name: "Zubin", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Précision" },
  { id: "gundula", name: "Gundula", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Offensive" },
  { id: "oris", name: "Oris", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Œil d'aigle" },
  { id: "saurug", name: "Saurug", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Gemmes" },

  // Fortress - Beastmasters
  { id: "bron", name: "Bron", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Basilics" },
  { id: "drakon", name: "Drakon", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Gnolls" },
  { id: "wystan", name: "Wystan", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Hommes-lézards" },
  { id: "tazar", name: "Tazar", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Armurier" },
  { id: "alkin", name: "Alkin", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Gorgones" },
  { id: "korbac", name: "Korbac", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Mouches serpents" },
  { id: "gerwulf", name: "Gerwulf", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Baliste" },
  { id: "broghild", name: "Broghild", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Wyvernes" },
  // Fortress - Witches
  { id: "mirlanda", name: "Mirlanda", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Faiblesse" },
  { id: "rosic", name: "Rosic", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Mysticisme" },
  { id: "voy", name: "Voy", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Navigation" },
  { id: "kinkeria", name: "Kinkeria", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Apprentissage" },
  { id: "verdish", name: "Verdish", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Premiers secours" },
  { id: "merist", name: "Merist", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Peau de pierre" },
  { id: "styg", name: "Styg", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Sorcellerie" },
  { id: "andra", name: "Andra", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Intelligence" },
  { id: "tiva", name: "Tiva", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Œil d'aigle" },
  { id: "adrienne", name: "Adrienne", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Magie du feu" },
  // Conflux - Planeswalkers
  { id: "pasis", name: "Pasis", class: HeroClass.PLANESWALKER, faction: Faction.CONFLUX, specialty: "Élémentaires psychiques" },
  { id: "thunar", name: "Thunar", class: HeroClass.PLANESWALKER, faction: Faction.CONFLUX, specialty: "Élémentaires de terre" },
  { id: "ignissa", name: "Ignissa", class: HeroClass.PLANESWALKER, faction: Faction.CONFLUX, specialty: "Élémentaires de feu" },
  { id: "lacus", name: "Lacus", class: HeroClass.PLANESWALKER, faction: Faction.CONFLUX, specialty: "Élémentaires d'eau" },
  { id: "monere", name: "Monere", class: HeroClass.PLANESWALKER, faction: Faction.CONFLUX, specialty: "Élémentaires psychiques" },
  { id: "erdamon", name: "Erdamon", class: HeroClass.PLANESWALKER, faction: Faction.CONFLUX, specialty: "Élémentaires de terre" },
  { id: "fiur", name: "Fiur", class: HeroClass.PLANESWALKER, faction: Faction.CONFLUX, specialty: "Élémentaires de feu" },
  { id: "kalt", name: "Kalt", class: HeroClass.PLANESWALKER, faction: Faction.CONFLUX, specialty: "Élémentaires d'eau" },
  // Conflux - Elementalists
  { id: "luna", name: "Luna", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Mur de feu" },
  { id: "brissa", name: "Brissa", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Hâte" },
  { id: "ciele", name: "Ciele", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Flèche magique" },
  { id: "labetha", name: "Labetha", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Peau de pierre" },
  { id: "inteus", name: "Inteus", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Soif de sang" },
  { id: "aenain", name: "Aenain", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Rayon perturbateur" },
  { id: "gelare", name: "Gelare", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Or" },
  { id: "grindan", name: "Grindan", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Or" },
];

const HERO_BY_ID = new Map(HERO_ROSTER.map((h) => [h.id, h]));

export function getHeroTemplate(id: string): HeroTemplate | undefined {
  return HERO_BY_ID.get(id);
}

export function getRecruitedHeroTemplateIds(
  heroes: Array<{ name?: string | null; class?: string | null; specialty?: string | null }>
): string[] {
  return heroes
    .map((hero) =>
      HERO_ROSTER.find(
        (template) =>
          template.name === hero.name &&
          template.class === hero.class &&
          template.specialty === hero.specialty
      )?.id
    )
    .filter((id): id is string => Boolean(id));
}

export function toTavernOffer(template: HeroTemplate): TavernOffer {
  return {
    templateId: template.id,
    name: template.name,
    class: template.class,
    faction: template.faction,
    specialty: template.specialty,
  };
}

export function pickTavernOffer(
  townFaction: Faction,
  excludeTemplateIds: string[] = [],
  size: number = TAVERN_OFFER_SIZE
): TavernOffer[] {
  const exclude = new Set(excludeTemplateIds);
  const offer: TavernOffer[] = [];

  const factionPool = HERO_ROSTER.filter((h) => h.faction === townFaction && !exclude.has(h.id));
  if (factionPool.length > 0) {
    const pick = factionPool[Math.floor(Math.random() * factionPool.length)];
    offer.push(toTavernOffer(pick));
    exclude.add(pick.id);
  }

  while (offer.length < size) {
    const remaining = HERO_ROSTER.filter((h) => !exclude.has(h.id));
    if (remaining.length === 0) break;
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    offer.push(toTavernOffer(pick));
    exclude.add(pick.id);
  }

  return offer;
}

export function startingArmyForFaction(faction: Faction): { unitType: UnitType; count: number } {
  const rule = FACTION_STARTING_UNIT[faction];
  const count = rule.min + Math.floor(Math.random() * (rule.max - rule.min + 1));
  return { unitType: rule.unitType, count };
}
