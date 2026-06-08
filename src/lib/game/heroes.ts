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
  [HeroClass.CHANNELER]: { attack: 2, defense: 2, spellPower: 1, knowledge: 1, morale: 0, luck: 0 },
  [HeroClass.ELEMENTALIST]: { attack: 0, defense: 0, spellPower: 3, knowledge: 3, morale: 0, luck: 0 },
};

export type PrimaryStatKey = "attack" | "defense" | "spellPower" | "knowledge";

// Per-class primary-skill advancement probabilities for level-ups (levels 2-9).
// Order: [attack, defense, spellPower, knowledge], each row summing to 100. We keep
// the same class table at every level: it preserves class identity and avoids a
// separate high-level table.
const PRIMARY_SKILL_GROWTH: Record<HeroClass, [number, number, number, number]> = {
  [HeroClass.KNIGHT]: [35, 45, 10, 10],
  [HeroClass.CLERIC]: [20, 15, 30, 35],
  [HeroClass.RANGER]: [35, 45, 10, 10],
  [HeroClass.DRUID]: [10, 20, 35, 35],
  [HeroClass.ALCHEMIST]: [30, 30, 20, 20],
  [HeroClass.WIZARD]: [10, 10, 40, 40],
  [HeroClass.DEMONIAC]: [35, 35, 15, 15],
  [HeroClass.HERETIC]: [15, 15, 35, 35],
  [HeroClass.DEATH_KNIGHT]: [30, 25, 20, 25],
  [HeroClass.NECROMANCER]: [15, 15, 35, 35],
  [HeroClass.OVERLORD]: [35, 35, 15, 15],
  [HeroClass.WARLOCK]: [10, 10, 50, 30],
  [HeroClass.BARBARIAN]: [55, 35, 5, 5],
  [HeroClass.BATTLE_MAGE]: [30, 20, 25, 25],
  [HeroClass.BEASTMASTER]: [30, 50, 10, 10],
  [HeroClass.WITCH]: [5, 15, 40, 40],
  [HeroClass.CHANNELER]: [45, 25, 15, 15],
  [HeroClass.ELEMENTALIST]: [15, 15, 35, 35],
};

const PRIMARY_STAT_ORDER: PrimaryStatKey[] = ["attack", "defense", "spellPower", "knowledge"];

// Pick which primary skill advances on a level-up, weighted by the hero's class.
// Deterministic for a given seed so the same level-up resolves identically on retry.
export function rollPrimarySkillGain(heroClass: HeroClass, seed: string): PrimaryStatKey {
  const weights = PRIMARY_SKILL_GROWTH[heroClass] ?? PRIMARY_SKILL_GROWTH[HeroClass.KNIGHT];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const s = (Math.abs(hash | 1) * 1664525 + 1013904223) | 0;
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = ((s >>> 0) / 0xffffffff) * total;
  for (let i = 0; i < PRIMARY_STAT_ORDER.length; i++) {
    roll -= weights[i];
    if (roll < 0) return PRIMARY_STAT_ORDER[i];
  }
  return PRIMARY_STAT_ORDER[PRIMARY_STAT_ORDER.length - 1];
}

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
  // Steel Crowns - Knights
  { id: "arvian", name: "Arvian", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Tir à l'arc" },
  { id: "veloria", name: "Veloria", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Archers" },
  { id: "edran", name: "Edran", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Griffons" },
  { id: "selvara", name: "Selvara", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Navigation" },
  { id: "lord_kareth", name: "Lord Kareth", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Domaines" },
  { id: "sorene", name: "Sorene", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Épéistes" },
  { id: "corvin", name: "Corvin", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Baliste" },
  { id: "terys", name: "Terys", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Cavaliers" },
  { id: "beatrin", name: "Beatrin", class: HeroClass.KNIGHT, faction: Faction.CASTLE, specialty: "Éclaireurs" },
  // Steel Crowns - Clerics
  { id: "adelyn", name: "Adelyn", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Bénédiction" },
  { id: "cadran", name: "Cadran", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Faiblesse" },
  { id: "adelisse", name: "Adelisse", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Anneau de glace" },
  { id: "invar", name: "Invar", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Moines" },
  { id: "selya", name: "Selya", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Œil d'aigle" },
  { id: "celian", name: "Celian", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Prière" },
  { id: "cateline", name: "Cateline", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Or" },
  { id: "rionel", name: "Rionel", class: HeroClass.CLERIC, faction: Faction.CASTLE, specialty: "Premiers secours" },

  // Sylvan Pact - Rangers
  { id: "briselle", name: "Briselle", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Armurier" },
  { id: "ulfarin", name: "Ulfarin", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Nains" },
  { id: "jovina", name: "Jovina", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Or" },
  { id: "rylas", name: "Rylas", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Dendroïdes" },
  { id: "durnel", name: "Durnel", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Résistance" },
  { id: "ivaros", name: "Ivaros", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Elfes" },
  { id: "claren", name: "Claren", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Licornes" },
  { id: "sylane", name: "Sylane", class: HeroClass.RANGER, faction: Faction.RAMPART, specialty: "Logistique" },
  // Sylvan Pact - Druids
  { id: "corwyn", name: "Corwyn", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Pourfendeur" },
  { id: "uldane", name: "Uldane", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Soin" },
  { id: "elshar", name: "Elshar", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Intelligence" },
  { id: "merelle", name: "Merelle", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Premiers secours" },
  { id: "malcor", name: "Malcor", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Œil d'aigle" },
  { id: "meliane", name: "Meliane", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Chance" },
  { id: "avar", name: "Avar", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Trait de glace" },
  { id: "aerwyn", name: "Aerwyn", class: HeroClass.DRUID, faction: Faction.RAMPART, specialty: "Pégases" },

  // Azure Circle - Alchemists
  { id: "bronzac", name: "Bronzac", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Gargouilles" },
  { id: "thalen", name: "Thalen", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Génies" },
  { id: "josiane", name: "Josiane", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Golems" },
  { id: "neria", name: "Neria", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Armurier" },
  { id: "torvoss", name: "Torvoss", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Baliste" },
  { id: "odran", name: "Odran", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Nagas" },
  { id: "rilsa", name: "Rilsa", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Mercure" },
  { id: "ilyona", name: "Ilyona", class: HeroClass.ALCHEMIST, faction: Faction.TOWER, specialty: "Génies" },
  // Azure Circle - Wizards
  { id: "astren", name: "Astren", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Hypnose" },
  { id: "haldor", name: "Haldor", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Mysticisme" },
  { id: "serenna", name: "Serenna", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Œil d'aigle" },
  { id: "daromyr", name: "Daromyr", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Chance" },
  { id: "theovar", name: "Theovar", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Mages" },
  { id: "asterion", name: "Asterion", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Foudre en chaîne" },
  { id: "ayla", name: "Ayla", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Or" },
  { id: "cyrane", name: "Cyrane", class: HeroClass.WIZARD, faction: Faction.TOWER, specialty: "Hâte" },

  // Profane Embers - Demoniacs
  { id: "virella", name: "Virella", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Chiens de l'enfer" },
  { id: "raskor", name: "Raskor", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Efreets" },
  { id: "marvuk", name: "Marvuk", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Démons" },
  { id: "ignar", name: "Ignar", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Diablotins" },
  { id: "octavelle", name: "Octavelle", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Or" },
  { id: "kahl", name: "Kahl", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Gogs" },
  { id: "pyron", name: "Pyron", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Baliste" },
  { id: "nymor", name: "Nymor", class: HeroClass.DEMONIAC, faction: Faction.INFERNO, specialty: "Diables des fosses" },
  // Profane Embers - Heretics
  { id: "aydren", name: "Aydren", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Intelligence" },
  { id: "xavrek", name: "Xavrek", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Brasier abyssal" },
  { id: "axmar", name: "Axmar", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Mysticisme" },
  { id: "olvera", name: "Olvera", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Faiblesse" },
  { id: "caldor", name: "Caldor", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Soufre" },
  { id: "ashren", name: "Ashren", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Soif de sang" },
  { id: "zydros", name: "Zydros", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Sorcellerie" },
  { id: "xarvok", name: "Xarvok", class: HeroClass.HERETIC, faction: Faction.INFERNO, specialty: "Boule de feu" },

  // Bone Veil - Death Knights
  { id: "stravik", name: "Stravik", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Morts-vivants" },
  { id: "vorlath", name: "Vorlath", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Vampires" },
  { id: "morandar", name: "Morandar", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Liches" },
  { id: "charnel", name: "Charnel", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Spectres" },
  { id: "tamrys", name: "Tamrys", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Chevaliers noirs" },
  { id: "iskar", name: "Iskar", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Nécromancie" },
  { id: "clavren", name: "Clavren", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Or" },
  { id: "galthor", name: "Galthor", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Squelettes" },
  { id: "ralnor", name: "Ralnor", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Baliste" },
  { id: "kael_veyrn", name: "Kael Veyrn", class: HeroClass.DEATH_KNIGHT, faction: Faction.NECROPOLIS, specialty: "Chevaliers noirs" },
  // Bone Veil - Necromancers
  { id: "septira", name: "Septira", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Vague mortelle" },
  { id: "aislen", name: "Aislen", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Pluie de météores" },
  { id: "malrec", name: "Malrec", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Sorcellerie" },
  { id: "nimbren", name: "Nimbren", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Œil d'aigle" },
  { id: "tharen", name: "Tharen", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Animation des morts" },
  { id: "xyrel", name: "Xyrel", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Œil d'aigle" },
  { id: "vidora", name: "Vidora", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Nécromancie" },
  { id: "morvane", name: "Morvane", class: HeroClass.NECROMANCER, faction: Faction.NECROPOLIS, specialty: "Liches" },

  // Understone Realm - Overlords
  { id: "loreth", name: "Loreth", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Harpies" },
  { id: "arven", name: "Arven", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Baliste" },
  { id: "dakkar", name: "Dakkar", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Minotaures" },
  { id: "ajren", name: "Ajren", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Beholders" },
  { id: "damros", name: "Damros", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Or" },
  { id: "torvald", name: "Torvald", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Logistique" },
  { id: "synvar", name: "Synvar", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Manticores" },
  { id: "shadri", name: "Shadri", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Troglodytes" },
  { id: "muthera", name: "Muthera", class: HeroClass.OVERLORD, faction: Faction.DUNGEON, specialty: "Dragons" },
  // Understone Realm - Warlocks
  { id: "alvorn", name: "Alvorn", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Résurrection" },
  { id: "jaedrin", name: "Jaedrin", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Mysticisme" },
  { id: "malrith", name: "Malrith", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Sorcellerie" },
  { id: "jedran", name: "Jedran", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Résurrection" },
  { id: "geovar", name: "Geovar", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Œil d'aigle" },
  { id: "demeril", name: "Demeril", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Pluie de météores" },
  { id: "sephiron", name: "Sephiron", class: HeroClass.WARLOCK, faction: Faction.DUNGEON, specialty: "Cristaux" },

  // Red Hammers - Barbarians
  { id: "yoran", name: "Yoran", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Cyclopes" },
  { id: "gurnak", name: "Gurnak", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Baliste" },
  { id: "jabrak", name: "Jabrak", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Orcs" },
  { id: "shyra", name: "Shyra", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Rocs" },
  { id: "gretka", name: "Gretka", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Gobelins" },
  { id: "krellor", name: "Krellor", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Ogres" },
  { id: "brogar_mainfer", name: "Brogar Mainfer", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Offensive" },
  { id: "tyrokar", name: "Tyrokar", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Chevaucheurs de loups" },
  { id: "borven", name: "Borven", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Ogres" },
  { id: "kilvar", name: "Kilvar", class: HeroClass.BARBARIAN, faction: Faction.STRONGHOLD, specialty: "Béhémoths" },
  // Red Hammers - Battle Mages
  { id: "garen", name: "Garen", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Sorcellerie" },
  { id: "varyn", name: "Varyn", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Ogres" },
  { id: "dessar", name: "Dessar", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Logistique" },
  { id: "teryk", name: "Teryk", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Hâte" },
  { id: "zubran", name: "Zubran", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Précision" },
  { id: "gundar", name: "Gundar", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Offensive" },
  { id: "orvan", name: "Orvan", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Œil d'aigle" },
  { id: "sauren", name: "Sauren", class: HeroClass.BATTLE_MAGE, faction: Faction.STRONGHOLD, specialty: "Gemmes" },

  // Swamp Oaths - Beastmasters
  { id: "bronnar", name: "Bronnar", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Basilics" },
  { id: "dravon", name: "Dravon", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Gnolls" },
  { id: "wystor", name: "Wystor", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Hommes-lézards" },
  { id: "vornek", name: "Vornek", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Armurier" },
  { id: "alkor", name: "Alkor", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Gorgones" },
  { id: "korven", name: "Korven", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Mouches serpents" },
  { id: "gerwald", name: "Gerwald", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Baliste" },
  { id: "brogana", name: "Brogana", class: HeroClass.BEASTMASTER, faction: Faction.FORTRESS, specialty: "Wyvernes" },
  // Swamp Oaths - Witches
  { id: "mirava", name: "Mirava", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Faiblesse" },
  { id: "roska", name: "Roska", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Mysticisme" },
  { id: "voya", name: "Voya", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Navigation" },
  { id: "kintera", name: "Kintera", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Apprentissage" },
  { id: "verda", name: "Verda", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Premiers secours" },
  { id: "merith", name: "Merith", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Peau de pierre" },
  { id: "stava", name: "Stava", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Sorcellerie" },
  { id: "andrel", name: "Andrel", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Intelligence" },
  { id: "tivan", name: "Tivan", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Œil d'aigle" },
  { id: "adrisa", name: "Adrisa", class: HeroClass.WITCH, faction: Faction.FORTRESS, specialty: "Magie du feu" },
  // Primordial Orb - Channelers
  { id: "pasrel", name: "Pasrel", class: HeroClass.CHANNELER, faction: Faction.CONFLUX, specialty: "Élémentaires psychiques" },
  { id: "thuran", name: "Thuran", class: HeroClass.CHANNELER, faction: Faction.CONFLUX, specialty: "Élémentaires de terre" },
  { id: "ignelle", name: "Ignelle", class: HeroClass.CHANNELER, faction: Faction.CONFLUX, specialty: "Élémentaires de feu" },
  { id: "laciel", name: "Laciel", class: HeroClass.CHANNELER, faction: Faction.CONFLUX, specialty: "Élémentaires d'eau" },
  { id: "monar", name: "Monar", class: HeroClass.CHANNELER, faction: Faction.CONFLUX, specialty: "Élémentaires psychiques" },
  { id: "erdavon", name: "Erdavon", class: HeroClass.CHANNELER, faction: Faction.CONFLUX, specialty: "Élémentaires de terre" },
  { id: "fioren", name: "Fioren", class: HeroClass.CHANNELER, faction: Faction.CONFLUX, specialty: "Élémentaires de feu" },
  { id: "kalthis", name: "Kalthis", class: HeroClass.CHANNELER, faction: Faction.CONFLUX, specialty: "Élémentaires d'eau" },
  // Primordial Orb - Elementalists
  { id: "lunara", name: "Lunara", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Mur de feu" },
  { id: "brisar", name: "Brisar", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Hâte" },
  { id: "ciela", name: "Ciela", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Flèche magique" },
  { id: "laberin", name: "Laberin", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Peau de pierre" },
  { id: "intevar", name: "Intevar", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Soif de sang" },
  { id: "aenor", name: "Aenor", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Rayon perturbateur" },
  { id: "gelvar", name: "Gelvar", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Or" },
  { id: "grinar", name: "Grinar", class: HeroClass.ELEMENTALIST, faction: Faction.CONFLUX, specialty: "Or" },
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
