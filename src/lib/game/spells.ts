export type SpellSchool = "air" | "earth" | "fire" | "water" | "all";
export type SpellContext = "combat" | "adventure";
export type SpellKind = "damage" | "buff" | "debuff" | "utility";

export type SpellId =
  | "magic_arrow"
  | "lightning_bolt"
  | "destroy_undead"
  | "chain_lightning"
  | "titans_lightning_bolt"
  | "death_ripple"
  | "meteor_shower"
  | "implosion"
  | "fire_wall"
  | "fireball"
  | "land_mine"
  | "armageddon"
  | "inferno"
  | "ice_bolt"
  | "frost_ring"
  | "haste"
  | "disrupting_ray"
  | "fortune"
  | "precision"
  | "protection_from_air"
  | "air_shield"
  | "hypnotize"
  | "counterstrike"
  | "magic_mirror"
  | "summon_air_elemental"
  | "shield"
  | "slow"
  | "stone_skin"
  | "quicksand"
  | "animate_dead"
  | "anti_magic"
  | "earthquake"
  | "force_field"
  | "protection_from_earth"
  | "resurrection"
  | "sorrow"
  | "summon_earth_elemental"
  | "bloodlust"
  | "curse"
  | "protection_from_fire"
  | "blind"
  | "misfortune"
  | "berserk"
  | "fire_shield"
  | "frenzy"
  | "slayer"
  | "sacrifice"
  | "summon_fire_elemental"
  | "bless"
  | "cure"
  | "dispel"
  | "protection_from_water"
  | "remove_obstacle"
  | "weakness"
  | "forgetfulness"
  | "mirth"
  | "teleport"
  | "clone"
  | "prayer"
  | "summon_water_elemental"
  | "visions"
  | "view_air"
  | "disguise"
  | "dimension_door"
  | "fly"
  | "view_earth"
  | "town_portal"
  | "summon_boat"
  | "scuttle_boat"
  | "water_walk";

export interface SpellDamageFormula {
  base: [number, number, number];
  multiplier: number;
}

export interface SpellDefinition {
  id: SpellId;
  label: string;
  school: SpellSchool;
  context: SpellContext;
  level: number;
  cost: { standard: number; expert: number };
  kind: SpellKind;
  implemented: boolean;
  effect: string;
  damage?: SpellDamageFormula;
}

const damage = (base: [number, number, number], multiplier: number): SpellDamageFormula => ({ base, multiplier });

export const SPELLS: SpellDefinition[] = [
  { id: "magic_arrow", label: "Fleche magique", school: "all", context: "combat", level: 1, cost: { standard: 5, expert: 4 }, kind: "damage", implemented: true, effect: "Inflige des degats a une cible.", damage: damage([10, 20, 30], 10) },
  { id: "lightning_bolt", label: "Eclair", school: "air", context: "combat", level: 2, cost: { standard: 10, expert: 8 }, kind: "damage", implemented: true, effect: "Inflige des degats d'air a une cible.", damage: damage([10, 20, 50], 25) },
  { id: "destroy_undead", label: "Detruire les morts-vivants", school: "air", context: "combat", level: 3, cost: { standard: 15, expert: 12 }, kind: "damage", implemented: true, effect: "Inflige des degats a tous les morts-vivants.", damage: damage([10, 20, 50], 10) },
  { id: "chain_lightning", label: "Chaine d'eclairs", school: "air", context: "combat", level: 4, cost: { standard: 24, expert: 20 }, kind: "damage", implemented: true, effect: "Frappe jusqu'a cinq troupes, degats reduits a chaque saut.", damage: damage([25, 50, 100], 40) },
  { id: "titans_lightning_bolt", label: "Eclair de Titan", school: "air", context: "combat", level: 5, cost: { standard: 0, expert: 0 }, kind: "damage", implemented: false, effect: "Necessite l'artefact Tonnerre des Titans.", damage: damage([600, 600, 600], 0) },
  { id: "death_ripple", label: "Onde de mort", school: "earth", context: "combat", level: 2, cost: { standard: 10, expert: 8 }, kind: "damage", implemented: true, effect: "Inflige des degats a toutes les creatures vivantes.", damage: damage([10, 20, 30], 5) },
  { id: "meteor_shower", label: "Pluie de meteores", school: "earth", context: "combat", level: 4, cost: { standard: 16, expert: 12 }, kind: "damage", implemented: true, effect: "Inflige des degats de terre dans une zone.", damage: damage([25, 50, 100], 25) },
  { id: "implosion", label: "Implosion", school: "earth", context: "combat", level: 5, cost: { standard: 30, expert: 25 }, kind: "damage", implemented: true, effect: "Inflige de lourds degats a une cible.", damage: damage([100, 200, 300], 75) },
  { id: "fire_wall", label: "Mur de feu", school: "fire", context: "combat", level: 2, cost: { standard: 8, expert: 6 }, kind: "damage", implemented: false, effect: "Cree un mur infligeant des degats au passage.", damage: damage([10, 20, 50], 15) },
  { id: "fireball", label: "Boule de feu", school: "fire", context: "combat", level: 3, cost: { standard: 15, expert: 12 }, kind: "damage", implemented: true, effect: "Inflige des degats de feu dans une zone.", damage: damage([15, 30, 60], 10) },
  { id: "land_mine", label: "Mine terrestre", school: "fire", context: "combat", level: 3, cost: { standard: 18, expert: 15 }, kind: "damage", implemented: false, effect: "Place des mines invisibles sur le champ de bataille.", damage: damage([25, 50, 100], 10) },
  { id: "armageddon", label: "Armageddon", school: "fire", context: "combat", level: 4, cost: { standard: 24, expert: 20 }, kind: "damage", implemented: true, effect: "Inflige des degats de feu a toutes les troupes.", damage: damage([30, 60, 120], 50) },
  { id: "inferno", label: "Inferno", school: "fire", context: "combat", level: 4, cost: { standard: 16, expert: 12 }, kind: "damage", implemented: true, effect: "Inflige des degats de feu dans une grande zone.", damage: damage([20, 40, 80], 10) },
  { id: "ice_bolt", label: "Eclair de froid", school: "water", context: "combat", level: 2, cost: { standard: 8, expert: 6 }, kind: "damage", implemented: true, effect: "Inflige des degats d'eau a une cible.", damage: damage([10, 20, 50], 20) },
  { id: "frost_ring", label: "Anneau de froid", school: "water", context: "combat", level: 3, cost: { standard: 12, expert: 9 }, kind: "damage", implemented: true, effect: "Inflige des degats autour d'une case sans toucher le centre.", damage: damage([15, 30, 60], 10) },

  { id: "haste", label: "Hate", school: "air", context: "combat", level: 1, cost: { standard: 6, expert: 5 }, kind: "buff", implemented: false, effect: "Augmente la vitesse." },
  { id: "disrupting_ray", label: "Rayon affaiblissant", school: "air", context: "combat", level: 2, cost: { standard: 10, expert: 8 }, kind: "debuff", implemented: false, effect: "Reduit la defense." },
  { id: "fortune", label: "Fortune", school: "air", context: "combat", level: 2, cost: { standard: 7, expert: 5 }, kind: "buff", implemented: false, effect: "Augmente la chance." },
  { id: "precision", label: "Precision", school: "air", context: "combat", level: 2, cost: { standard: 8, expert: 6 }, kind: "buff", implemented: false, effect: "Augmente l'attaque a distance." },
  { id: "protection_from_air", label: "Protection contre l'air", school: "air", context: "combat", level: 2, cost: { standard: 7, expert: 5 }, kind: "buff", implemented: false, effect: "Reduit les degats des sorts d'air." },
  { id: "air_shield", label: "Bouclier d'air", school: "air", context: "combat", level: 3, cost: { standard: 12, expert: 9 }, kind: "buff", implemented: false, effect: "Reduit les degats a distance." },
  { id: "hypnotize", label: "Hypnose", school: "air", context: "combat", level: 3, cost: { standard: 18, expert: 15 }, kind: "debuff", implemented: false, effect: "Controle temporairement une troupe ennemie." },
  { id: "counterstrike", label: "Contre-attaque", school: "air", context: "combat", level: 4, cost: { standard: 24, expert: 20 }, kind: "buff", implemented: false, effect: "Ajoute des ripostes." },
  { id: "magic_mirror", label: "Miroir magique", school: "air", context: "combat", level: 5, cost: { standard: 25, expert: 20 }, kind: "buff", implemented: false, effect: "Peut reflechir les sorts ennemis." },
  { id: "summon_air_elemental", label: "Invocation d'elementaires d'air", school: "air", context: "combat", level: 5, cost: { standard: 25, expert: 20 }, kind: "utility", implemented: false, effect: "Invoque des elementaires d'air." },

  { id: "shield", label: "Bouclier", school: "earth", context: "combat", level: 1, cost: { standard: 5, expert: 4 }, kind: "buff", implemented: false, effect: "Reduit les degats au corps-a-corps." },
  { id: "slow", label: "Lenteur", school: "earth", context: "combat", level: 1, cost: { standard: 6, expert: 5 }, kind: "debuff", implemented: false, effect: "Reduit la vitesse." },
  { id: "stone_skin", label: "Peau de pierre", school: "earth", context: "combat", level: 1, cost: { standard: 5, expert: 4 }, kind: "buff", implemented: false, effect: "Augmente la defense." },
  { id: "quicksand", label: "Sables mouvants", school: "earth", context: "combat", level: 2, cost: { standard: 8, expert: 6 }, kind: "utility", implemented: false, effect: "Place des pieges de sable." },
  { id: "animate_dead", label: "Animation des morts", school: "earth", context: "combat", level: 3, cost: { standard: 15, expert: 12 }, kind: "utility", implemented: false, effect: "Ranime des morts-vivants." },
  { id: "anti_magic", label: "Anti-magie", school: "earth", context: "combat", level: 3, cost: { standard: 15, expert: 12 }, kind: "buff", implemented: false, effect: "Protege une troupe contre les sorts." },
  { id: "earthquake", label: "Tremblement de terre", school: "earth", context: "combat", level: 3, cost: { standard: 20, expert: 17 }, kind: "utility", implemented: false, effect: "Endommage les murs de siege." },
  { id: "force_field", label: "Champ de force", school: "earth", context: "combat", level: 3, cost: { standard: 12, expert: 9 }, kind: "utility", implemented: false, effect: "Cree une barriere." },
  { id: "protection_from_earth", label: "Protection contre la terre", school: "earth", context: "combat", level: 3, cost: { standard: 12, expert: 9 }, kind: "buff", implemented: false, effect: "Reduit les degats des sorts de terre." },
  { id: "resurrection", label: "Resurrection", school: "earth", context: "combat", level: 4, cost: { standard: 20, expert: 16 }, kind: "utility", implemented: false, effect: "Ranime des creatures vivantes." },
  { id: "sorrow", label: "Tristesse", school: "earth", context: "combat", level: 4, cost: { standard: 16, expert: 12 }, kind: "debuff", implemented: false, effect: "Reduit le moral." },
  { id: "summon_earth_elemental", label: "Invocation d'elementaires de terre", school: "earth", context: "combat", level: 5, cost: { standard: 25, expert: 20 }, kind: "utility", implemented: false, effect: "Invoque des elementaires de terre." },

  { id: "bloodlust", label: "Soif de sang", school: "fire", context: "combat", level: 1, cost: { standard: 5, expert: 4 }, kind: "buff", implemented: false, effect: "Augmente l'attaque au corps-a-corps." },
  { id: "curse", label: "Malediction", school: "fire", context: "combat", level: 1, cost: { standard: 6, expert: 5 }, kind: "debuff", implemented: false, effect: "Force les degats minimum." },
  { id: "protection_from_fire", label: "Protection contre le feu", school: "fire", context: "combat", level: 1, cost: { standard: 5, expert: 4 }, kind: "buff", implemented: false, effect: "Reduit les degats des sorts de feu." },
  { id: "blind", label: "Aveuglement", school: "fire", context: "combat", level: 2, cost: { standard: 10, expert: 8 }, kind: "debuff", implemented: false, effect: "Empêche une troupe d'agir." },
  { id: "misfortune", label: "Infortune", school: "fire", context: "combat", level: 3, cost: { standard: 12, expert: 9 }, kind: "debuff", implemented: false, effect: "Reduit la chance." },
  { id: "berserk", label: "Berserk", school: "fire", context: "combat", level: 4, cost: { standard: 20, expert: 16 }, kind: "debuff", implemented: false, effect: "Force une attaque contre la troupe la plus proche." },
  { id: "fire_shield", label: "Bouclier de feu", school: "fire", context: "combat", level: 4, cost: { standard: 16, expert: 12 }, kind: "buff", implemented: false, effect: "Renvoie une part des degats de melee." },
  { id: "frenzy", label: "Frenesie", school: "fire", context: "combat", level: 4, cost: { standard: 16, expert: 12 }, kind: "buff", implemented: false, effect: "Convertit la defense en attaque." },
  { id: "slayer", label: "Tueur", school: "fire", context: "combat", level: 4, cost: { standard: 16, expert: 12 }, kind: "buff", implemented: false, effect: "Augmente l'attaque contre les creatures puissantes." },
  { id: "sacrifice", label: "Sacrifice", school: "fire", context: "combat", level: 5, cost: { standard: 25, expert: 20 }, kind: "utility", implemented: false, effect: "Sacrifie une troupe pour en ranimer une autre." },
  { id: "summon_fire_elemental", label: "Invocation d'elementaires de feu", school: "fire", context: "combat", level: 5, cost: { standard: 25, expert: 20 }, kind: "utility", implemented: false, effect: "Invoque des elementaires de feu." },

  { id: "bless", label: "Benediction", school: "water", context: "combat", level: 1, cost: { standard: 5, expert: 4 }, kind: "buff", implemented: false, effect: "Force les degats maximum." },
  { id: "cure", label: "Soin", school: "water", context: "combat", level: 1, cost: { standard: 6, expert: 5 }, kind: "utility", implemented: false, effect: "Soigne et dissipe les effets negatifs." },
  { id: "dispel", label: "Dissipation", school: "water", context: "combat", level: 1, cost: { standard: 5, expert: 4 }, kind: "utility", implemented: false, effect: "Retire les effets magiques." },
  { id: "protection_from_water", label: "Protection contre l'eau", school: "water", context: "combat", level: 1, cost: { standard: 5, expert: 4 }, kind: "buff", implemented: false, effect: "Reduit les degats des sorts d'eau." },
  { id: "remove_obstacle", label: "Retrait d'obstacle", school: "water", context: "combat", level: 2, cost: { standard: 7, expert: 5 }, kind: "utility", implemented: false, effect: "Retire certains obstacles du champ de bataille." },
  { id: "weakness", label: "Faiblesse", school: "water", context: "combat", level: 2, cost: { standard: 8, expert: 6 }, kind: "debuff", implemented: false, effect: "Reduit l'attaque." },
  { id: "forgetfulness", label: "Oubli", school: "water", context: "combat", level: 3, cost: { standard: 12, expert: 9 }, kind: "debuff", implemented: false, effect: "Empêche les tireurs de tirer." },
  { id: "mirth", label: "Joie", school: "water", context: "combat", level: 3, cost: { standard: 12, expert: 9 }, kind: "buff", implemented: false, effect: "Augmente le moral." },
  { id: "teleport", label: "Teleportation", school: "water", context: "combat", level: 3, cost: { standard: 15, expert: 12 }, kind: "utility", implemented: false, effect: "Deplace une troupe alliee." },
  { id: "clone", label: "Clone", school: "water", context: "combat", level: 4, cost: { standard: 24, expert: 20 }, kind: "utility", implemented: false, effect: "Cree une copie temporaire d'une troupe." },
  { id: "prayer", label: "Priere", school: "water", context: "combat", level: 4, cost: { standard: 16, expert: 12 }, kind: "buff", implemented: false, effect: "Augmente attaque, defense et vitesse." },
  { id: "summon_water_elemental", label: "Invocation d'elementaires d'eau", school: "water", context: "combat", level: 5, cost: { standard: 25, expert: 20 }, kind: "utility", implemented: false, effect: "Invoque des elementaires d'eau." },

  { id: "visions", label: "Visions", school: "all", context: "adventure", level: 2, cost: { standard: 4, expert: 2 }, kind: "utility", implemented: true, effect: "Donne des informations sur les forces proches." },
  { id: "view_air", label: "Vue de l'air", school: "air", context: "adventure", level: 1, cost: { standard: 2, expert: 1 }, kind: "utility", implemented: true, effect: "Revele les artefacts, heros et villes selon la maitrise." },
  { id: "disguise", label: "Deguisement", school: "air", context: "adventure", level: 2, cost: { standard: 4, expert: 2 }, kind: "utility", implemented: false, effect: "Masque l'armee du heros aux adversaires." },
  { id: "dimension_door", label: "Porte dimensionnelle", school: "air", context: "adventure", level: 5, cost: { standard: 25, expert: 20 }, kind: "utility", implemented: true, effect: "Teleporte le heros vers une case valide visible." },
  { id: "fly", label: "Vol", school: "air", context: "adventure", level: 5, cost: { standard: 20, expert: 15 }, kind: "utility", implemented: false, effect: "Permet de survoler l'eau et les obstacles." },
  { id: "view_earth", label: "Vue de la terre", school: "earth", context: "adventure", level: 1, cost: { standard: 2, expert: 1 }, kind: "utility", implemented: true, effect: "Revele ressources, mines et terrain proche." },
  { id: "town_portal", label: "Portail de ville", school: "earth", context: "adventure", level: 4, cost: { standard: 16, expert: 12 }, kind: "utility", implemented: true, effect: "Teleporte le heros vers une ville alliee libre." },
  { id: "summon_boat", label: "Invocation de bateau", school: "water", context: "adventure", level: 1, cost: { standard: 8, expert: 7 }, kind: "utility", implemented: true, effect: "Invoque un bateau vide proche." },
  { id: "scuttle_boat", label: "Sabordage", school: "water", context: "adventure", level: 2, cost: { standard: 8, expert: 6 }, kind: "utility", implemented: true, effect: "Detruit un bateau inoccupe adjacent." },
  { id: "water_walk", label: "Marche sur l'eau", school: "water", context: "adventure", level: 4, cost: { standard: 12, expert: 8 }, kind: "utility", implemented: false, effect: "Permet de marcher sur l'eau." },
];

export const SPELLS_BY_ID = Object.fromEntries(SPELLS.map((spell) => [spell.id, spell])) as Record<SpellId, SpellDefinition>;

export function getSpell(id: string): SpellDefinition | null {
  return SPELLS_BY_ID[id as SpellId] ?? null;
}

export function getHeroMaxMana(hero: { stats?: { knowledge?: number }; knowledge?: number }) {
  const knowledge = Number(hero.stats?.knowledge ?? hero.knowledge ?? 0);
  return Math.max(0, knowledge * 10);
}

export function getHeroMana(hero: { mana?: number | null; stats?: { knowledge?: number }; knowledge?: number }) {
  const maxMana = getHeroMaxMana(hero);
  const raw = hero.mana;
  if (!Number.isFinite(raw)) return maxMana;
  return Math.max(0, Math.min(maxMana, Number(raw)));
}

export function heroKnowsSpell(hero: { knownSpellIds?: string[] | null; knownSpells?: string[] | null }, spellId: string) {
  const known = hero.knownSpellIds ?? hero.knownSpells;
  return Array.isArray(known) && known.includes(spellId);
}

export function getSpellCost(spell: SpellDefinition) {
  return spell.cost.standard;
}

export function calculateSpellDamage(spell: SpellDefinition, spellPower: number, masteryIndex = 0) {
  if (!spell.damage) return 0;
  const base = spell.damage.base[Math.max(0, Math.min(2, masteryIndex))];
  return Math.floor(base + Math.max(0, spellPower) * spell.damage.multiplier);
}

export function spellRequiresAdventureTarget(spell: SpellDefinition) {
  return spell.context === "adventure" && spell.id === "dimension_door";
}

export function spellRequiresCombatTarget(spell: SpellDefinition) {
  if (spell.context !== "combat") return false;
  return !["armageddon", "death_ripple", "destroy_undead"].includes(spell.id);
}
