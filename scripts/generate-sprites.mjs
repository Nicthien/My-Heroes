import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPRITES = path.join(ROOT, "public", "assets", "sprites");
const creatureCatalog = JSON.parse(
  await readFile(path.join(ROOT, "src", "lib", "game", "creature-catalog.json"), "utf8"),
);

const palettes = {
  castle: { light: "#dbeafe", main: "#315aaa", dark: "#172554", accent: "#f4c95d", skin: "#d7a273", secondary: "#8b1e2d" },
  rampart: { light: "#bbf7d0", main: "#2f6f3b", dark: "#12391f", accent: "#d6e68b", skin: "#c08a55", secondary: "#7a4f25" },
  tower: { light: "#e8fbff", main: "#5da8d8", dark: "#1e3a5f", accent: "#88e8ff", skin: "#d8b28d", secondary: "#cbd5e1" },
  inferno: { light: "#fecaca", main: "#9f1239", dark: "#2a0608", accent: "#ffca5f", skin: "#b86a45", secondary: "#ff6b1a" },
  necropolis: { light: "#e5e7eb", main: "#64748b", dark: "#17151a", accent: "#a7c7be", skin: "#d8d1bd", secondary: "#27313c" },
  dungeon: { light: "#d8b4fe", main: "#6d28d9", dark: "#17101f", accent: "#84e6ff", skin: "#b58a70", secondary: "#2d7a8b" },
  stronghold: { light: "#fed7aa", main: "#c96a2c", dark: "#30170c", accent: "#f0c06d", skin: "#b46f44", secondary: "#774127" },
  fortress: { light: "#bef264", main: "#596a3d", dark: "#202815", accent: "#d1e68a", skin: "#8a9362", secondary: "#47682f" },
  conflux: { light: "#cffafe", main: "#0e7490", dark: "#164e63", accent: "#fef08a", skin: "#c49b72", secondary: "#7c3aed" },
  cove: { light: "#bae6fd", main: "#0f766e", dark: "#134e4a", accent: "#fbbf24", skin: "#b77955", secondary: "#1e3a8a" },
  factory: { light: "#fde68a", main: "#92400e", dark: "#292524", accent: "#38bdf8", skin: "#c58c60", secondary: "#64748b" },
  bulwark: { light: "#e0f2fe", main: "#3b82f6", dark: "#1e3a8a", accent: "#d9f99d", skin: "#c49066", secondary: "#475569" },
  neutral: { light: "#f8fafc", main: "#7f1d1d", dark: "#2a0b0b", accent: "#fef3c7", skin: "#c9875a", secondary: "#3f1d1d" },
};

const units = [
  { file: "pikeman", title: "Piquier", faction: "castle", kind: "humanoid", weapon: "spear", shield: "tower", headgear: "crest", motif: "stripes", armor: "mail" },
  { file: "halberdier", title: "Hallebardier", faction: "castle", kind: "humanoid", weapon: "halberd", shield: "tower", headgear: "visor", motif: "chevron", armor: "plate" },
  { file: "archer", title: "Archer", faction: "castle", kind: "humanoid", weapon: "bow", shield: "none", headgear: "cap", motif: "quiver", armor: "leather" },
  { file: "marksman", title: "Tireur d'elite", faction: "castle", kind: "humanoid", weapon: "crossbow", shield: "none", headgear: "visor", motif: "quiver", armor: "mail" },
  { file: "griffin", title: "Griffon", faction: "castle", kind: "griffin", headgear: "none" },
  { file: "royal_griffin", title: "Griffon royal", faction: "castle", kind: "griffin", headgear: "crown", aura: "holy" },
  { file: "swordsman", title: "Epeiste", faction: "castle", kind: "humanoid", weapon: "sword", shield: "round", headgear: "visor", motif: "cross", armor: "plate" },
  { file: "crusader", title: "Croise", faction: "castle", kind: "humanoid", weapon: "greatsword", shield: "kite", headgear: "crest", motif: "cross", aura: "holy", armor: "plate" },
  { file: "monk", title: "Moine", faction: "castle", kind: "caster", weapon: "staff", shield: "none", headgear: "hood", motif: "book", robe: true, aura: "holy" },
  { file: "zealot", title: "Zelote", faction: "castle", kind: "caster", weapon: "orb", shield: "none", headgear: "halo", motif: "book", robe: true, aura: "holy" },
  { file: "cavalier", title: "Cavalier", faction: "castle", kind: "mounted", mount: "horse", weapon: "lance", shield: "kite", headgear: "crest", armor: "plate" },
  { file: "champion", title: "Champion", faction: "castle", kind: "mounted", mount: "warhorse", weapon: "lance", shield: "kite", headgear: "crown", motif: "banner", aura: "holy", armor: "plate" },
  { file: "angel", title: "Ange", faction: "castle", kind: "humanoid", weapon: "sword", shield: "none", headgear: "halo", wings: "feather", motif: "sun", aura: "holy", armor: "robe" },
  { file: "archangel", title: "Archange", faction: "castle", kind: "humanoid", weapon: "greatsword", shield: "none", headgear: "halo", wings: "double-feather", motif: "sun", aura: "holy", armor: "plate" },

  { file: "centaur", title: "Centaure", faction: "rampart", kind: "mounted", mount: "centaur", weapon: "spear", shield: "none", headgear: "cap", motif: "leaf" },
  { file: "dwarf", title: "Nain", faction: "rampart", kind: "humanoid", weapon: "axe", shield: "round", headgear: "horns", motif: "gem", stature: "stocky", armor: "mail" },
  { file: "wood_elf", title: "Elfe sylvestre", faction: "rampart", kind: "humanoid", weapon: "bow", shield: "none", headgear: "cap", motif: "leaf", armor: "leather", aura: "leaf" },
  { file: "pegasus", title: "Pegase", faction: "rampart", kind: "equine", mount: "pegasus", wings: "feather", aura: "holy" },
  { file: "dendroid", title: "Dendroide", faction: "rampart", kind: "dendroid", aura: "leaf" },
  { file: "unicorn", title: "Licorne", faction: "rampart", kind: "equine", mount: "unicorn", aura: "holy" },
  { file: "green_dragon", title: "Dragon vert", faction: "rampart", kind: "dragon", aura: "leaf" },

  { file: "gremlin", title: "Gremlin", faction: "tower", kind: "humanoid", weapon: "mace", shield: "none", headgear: "cap", motif: "bolt", stature: "small" },
  { file: "gargoyle", title: "Gargouille", faction: "tower", kind: "humanoid", weapon: "claws", shield: "none", headgear: "horns", wings: "stone", motif: "rune", armor: "stone", aura: "stone" },
  { file: "golem", title: "Golem de pierre", faction: "tower", kind: "golem", weapon: "hammer", headgear: "spikes", motif: "rune", aura: "stone" },
  { file: "mage", title: "Mage", faction: "tower", kind: "caster", weapon: "staff", shield: "none", headgear: "hood", motif: "rune", robe: true, aura: "arcane" },
  { file: "genie", title: "Genie", faction: "tower", kind: "genie", weapon: "orb", headgear: "turban", motif: "moon", aura: "arcane" },
  { file: "naga", title: "Naga", faction: "tower", kind: "serpent", weapon: "dual-swords", headgear: "crown", motif: "scale" },
  { file: "giant", title: "Geant", faction: "tower", kind: "humanoid", weapon: "hammer", shield: "none", headgear: "crown", motif: "bolt", stature: "tall", armor: "plate", aura: "arcane" },

  { file: "imp", title: "Lutin", faction: "inferno", kind: "humanoid", weapon: "claws", shield: "none", headgear: "horns", wings: "bat", motif: "flame", stature: "small", aura: "flame" },
  { file: "gog", title: "Gog", faction: "inferno", kind: "caster", weapon: "fireball", shield: "none", headgear: "horns", motif: "flame", aura: "flame" },
  { file: "hell_hound", title: "Chien des enfers", faction: "inferno", kind: "hound", aura: "flame" },
  { file: "demon", title: "Demon", faction: "inferno", kind: "humanoid", weapon: "axe", shield: "round", headgear: "horns", motif: "flame", stature: "heavy", armor: "leather", aura: "flame" },
  { file: "pit_fiend", title: "Suppot du Tartare", faction: "inferno", kind: "humanoid", weapon: "trident", shield: "none", headgear: "horns", motif: "rune", stature: "heavy", aura: "flame", extra: "chains" },
  { file: "efreet", title: "Efrit", faction: "inferno", kind: "genie", weapon: "saber", headgear: "horns", motif: "flame", aura: "flame", wings: "flame" },
  { file: "devil", title: "Diable", faction: "inferno", kind: "humanoid", weapon: "trident", shield: "none", headgear: "horns", wings: "bat", motif: "fang", stature: "tall", aura: "flame", extra: "tail" },

  { file: "skeleton", title: "Squelette", faction: "necropolis", kind: "undead", weapon: "sword", shield: "round", headgear: "skull", motif: "skull" },
  { file: "zombie", title: "Zombie", faction: "necropolis", kind: "humanoid", weapon: "club", shield: "none", headgear: "none", motif: "rags", stature: "heavy", armor: "rags", aura: "ghost" },
  { file: "wight", title: "Spectre", faction: "necropolis", kind: "ghost", weapon: "claws", headgear: "hood", motif: "moon", aura: "ghost" },
  { file: "vampire", title: "Vampire", faction: "necropolis", kind: "humanoid", weapon: "sword", shield: "none", headgear: "crown", motif: "fang", armor: "coat", aura: "ghost", extra: "cape" },
  { file: "lich", title: "Liche", faction: "necropolis", kind: "caster", weapon: "staff", shield: "none", headgear: "crown", motif: "skull", robe: true, aura: "ghost" },
  { file: "black_knight", title: "Chevalier noir", faction: "necropolis", kind: "mounted", mount: "nightmare", weapon: "greatsword", shield: "kite", headgear: "horns", motif: "moon", aura: "ghost", armor: "plate" },
  { file: "bone_dragon", title: "Dragon-os", faction: "necropolis", kind: "dragon", bone: true, aura: "ghost" },

  { file: "troglodyte", title: "Troglodyte", faction: "dungeon", kind: "humanoid", weapon: "claws", shield: "none", headgear: "spikes", motif: "eye", stature: "small" },
  { file: "harpy", title: "Harpie", faction: "dungeon", kind: "humanoid", weapon: "claws", shield: "none", headgear: "spikes", wings: "bat", motif: "claw", aura: "arcane" },
  { file: "beholder", title: "Tyrannoeil", faction: "dungeon", kind: "beholder", aura: "arcane" },
  { file: "medusa", title: "Meduse", faction: "dungeon", kind: "serpent", weapon: "bow", headgear: "snakes", motif: "scale", aura: "arcane" },
  { file: "minotaur", title: "Minotaure", faction: "dungeon", kind: "humanoid", weapon: "axe", shield: "none", headgear: "bull", motif: "fang", stature: "heavy", armor: "leather" },
  { file: "manticore", title: "Manticore", faction: "dungeon", kind: "manticore", wings: "bat" },
  { file: "red_dragon", title: "Dragon rouge", faction: "dungeon", kind: "dragon", aura: "flame" },

  { file: "goblin", title: "Gobelin", faction: "stronghold", kind: "humanoid", weapon: "dagger", shield: "none", headgear: "cap", motif: "fang", stature: "small" },
  { file: "wolf_rider", title: "Monteur de loup", faction: "stronghold", kind: "mounted", mount: "wolf", weapon: "spear", shield: "none", headgear: "cap", motif: "fang" },
  { file: "orc", title: "Orc", faction: "stronghold", kind: "humanoid", weapon: "throwing-axe", shield: "none", headgear: "horns", motif: "stripes", stature: "heavy" },
  { file: "ogre", title: "Ogre", faction: "stronghold", kind: "humanoid", weapon: "mace", shield: "none", headgear: "none", motif: "fang", stature: "heavy", armor: "leather" },
  { file: "roc", title: "Roc", faction: "stronghold", kind: "roc" },
  { file: "cyclops", title: "Cyclope", faction: "stronghold", kind: "humanoid", weapon: "boulder", shield: "none", headgear: "none", motif: "eye", stature: "tall", armor: "leather" },
  { file: "behemoth", title: "Behemoth", faction: "stronghold", kind: "behemoth", aura: "stone" },

  { file: "gnoll", title: "Gnoll", faction: "fortress", kind: "humanoid", weapon: "axe", shield: "round", headgear: "cap", motif: "claw", stature: "small" },
  { file: "lizardman", title: "Homme-lezard", faction: "fortress", kind: "humanoid", weapon: "bow", shield: "none", headgear: "spikes", motif: "scale", armor: "scale" },
  { file: "serpent_fly", title: "Mouche-dragon", faction: "fortress", kind: "serpent-fly", aura: "leaf" },
  { file: "basilisk", title: "Basilic", faction: "fortress", kind: "lizard", aura: "stone" },
  { file: "gorgon", title: "Gorgone", faction: "fortress", kind: "gorgon", aura: "stone" },
  { file: "wyvern", title: "Wyverne", faction: "fortress", kind: "dragon", wyvern: true, aura: "leaf" },
  { file: "hydra", title: "Hydre", faction: "fortress", kind: "hydra", aura: "leaf" },
];

const creatureByType = new Map(creatureCatalog.creatures.map((creature) => [creature.type, creature]));

for (const spec of units) {
  const creature = creatureByType.get(spec.file);
  if (creature) {
    spec.title = creature.label;
    spec.faction = creature.group;
  }
}

const unitSpecByFile = new Map(units.map((spec) => [spec.file, spec]));

for (const group of creatureCatalog.groups) {
  let previousSpec = null;
  for (const unitType of group.units) {
    const creature = creatureByType.get(unitType);
    if (!creature) continue;

    let spec = unitSpecByFile.get(unitType);
    if (!spec) {
      spec = inferUnitSpec(creature, previousSpec);
      units.push(spec);
      unitSpecByFile.set(unitType, spec);
    }
    previousSpec = spec;
  }
}

function motifForGroup(group) {
  return {
    castle: "cross",
    rampart: "leaf",
    tower: "rune",
    inferno: "flame",
    necropolis: "skull",
    dungeon: "eye",
    stronghold: "fang",
    fortress: "scale",
    conflux: "rune",
    cove: "wave",
    factory: "bolt",
    bulwark: "gem",
    neutral: "stripes",
  }[group] ?? "stripes";
}

function auraForGroup(group) {
  return {
    castle: "holy",
    rampart: "leaf",
    tower: "arcane",
    inferno: "flame",
    necropolis: "ghost",
    dungeon: "arcane",
    stronghold: "stone",
    fortress: "leaf",
    conflux: "arcane",
    cove: "leaf",
    factory: "stone",
    bulwark: "stone",
  }[group];
}

function creatureSearchText(creature) {
  return `${creature.type.replace(/_/g, " ")} ${creature.label}`.toLowerCase();
}

function inferUnitSpec(creature, previousSpec) {
  const label = creatureSearchText(creature);
  const spec = previousSpec && creature.upgradeLevel > 0
    ? { ...previousSpec, file: creature.type, title: creature.label, faction: creature.group }
    : {
        file: creature.type,
        title: creature.label,
        faction: creature.group,
        kind: "humanoid",
        weapon: creature.ranged ? "bow" : "sword",
        shield: "none",
        headgear: "cap",
        motif: motifForGroup(creature.group),
        armor: "leather",
      };

  spec.file = creature.type;
  spec.title = creature.label;
  spec.faction = creature.group;
  spec.motif = spec.motif ?? motifForGroup(creature.group);

  if (!previousSpec || creature.upgradeLevel === 0) {
    Object.assign(spec, inferBaseShape(creature));
  }

  if (creature.upgradeLevel > 0) {
    spec.headgear = upgradeHeadgear(spec.headgear, creature.group);
    spec.armor = spec.armor === "robe" || spec.robe ? spec.armor : "plate";
    spec.weapon = upgradeWeapon(spec.weapon);
    spec.shield = spec.shield === "round" ? "kite" : spec.shield;
    spec.aura = spec.aura ?? auraForGroup(creature.group);
    if (label.includes("royal") || label.includes("queen") || label.includes("king") || label.includes("lord")) spec.headgear = "crown";
    if (label.includes("arch") || label.includes("master") || label.includes("great")) spec.aura = spec.aura ?? "arcane";
  }

  if (creature.ranged && spec.weapon !== "fireball" && spec.weapon !== "orb" && spec.weapon !== "staff") {
    spec.weapon = creature.shots >= 24 ? "crossbow" : "bow";
  }

  return spec;
}

function inferBaseShape(creature) {
  const label = creatureSearchText(creature);
  const group = creature.group;
  const motif = motifForGroup(group);
  const aura = auraForGroup(group);
  const rangedWeapon = creature.shots >= 16 ? "crossbow" : "bow";

  if (label.includes("dragon")) return { kind: "dragon", aura, bone: label.includes("bone") || label.includes("ghost") };
  if (label.includes("hydra")) return { kind: "hydra", aura };
  if (label.includes("griffin")) return { kind: "griffin", headgear: label.includes("royal") ? "crown" : "none", aura };
  if (label.includes("phoenix") || label.includes("firebird") || label.includes("thunderbird") || label.includes("stormbird") || creature.type === "roc") return { kind: "roc", aura };
  if (label.includes("manticore") || label.includes("scorpicore")) return { kind: "manticore", wings: "bat", aura };
  if (label.includes("behemoth")) return { kind: "behemoth", aura: "stone" };
  if (label.includes("gorgon")) return { kind: "gorgon", aura: "stone" };
  if (label.includes("basilisk") || label.includes("armadillo")) return { kind: "lizard", aura: label.includes("basilisk") ? "stone" : aura };
  if (label.includes("serpent fly") || label.includes("dragon fly")) return { kind: "serpent-fly", aura: "leaf" };
  if (label.includes("hound") || label.includes("cerberus")) return { kind: "hound", aura };
  if (label.includes("golem") || label.includes("automaton") || label.includes("dreadnought") || label.includes("juggernaut")) return { kind: "golem", weapon: "hammer", headgear: "spikes", motif: "rune", aura: "stone" };
  if (label.includes("elemental")) return { kind: "caster", weapon: "orb", shield: "none", headgear: "halo", motif: "rune", robe: true, aura };
  if (label.includes("genie") || label.includes("efreet")) return { kind: "genie", weapon: label.includes("efreet") ? "saber" : "orb", headgear: label.includes("efreet") ? "horns" : "turban", motif, aura, wings: label.includes("efreet") ? "flame" : undefined };
  if (label.includes("naga") || label.includes("medusa") || label.includes("sea serpent") || label.includes("haspid") || label.includes("nix") || label.includes("sandworm") || label.includes("olgoi")) return { kind: "serpent", weapon: creature.ranged ? rangedWeapon : "dual-swords", headgear: label.includes("queen") ? "crown" : "spikes", motif: "scale", aura };
  if (label.includes("wight") || label.includes("wraith") || label.includes("fangarm")) return { kind: "ghost", weapon: "claws", headgear: "hood", motif: "moon", aura: "ghost" };
  if (label.includes("skeleton")) return { kind: "undead", weapon: "sword", shield: "round", headgear: "skull", motif: "skull", aura: "ghost" };
  if (label.includes("zombie") || label.includes("walking dead") || label.includes("mummy")) return { kind: "humanoid", weapon: "club", shield: "none", headgear: "none", motif: "rags", stature: "heavy", armor: "rags", aura: "ghost" };
  if (label.includes("vampire")) return { kind: "humanoid", weapon: "sword", shield: "none", headgear: "crown", motif: "fang", armor: "coat", aura: "ghost", extra: "cape" };
  if (label.includes("lich")) return { kind: "caster", weapon: "staff", shield: "none", headgear: "crown", motif: "skull", robe: true, aura: "ghost" };
  if (label.includes("knight") || label.includes("cavalier") || label.includes("champion") || label.includes("centaur") || label.includes("wolf") || label.includes("nomad")) return { kind: "mounted", mount: label.includes("wolf") ? "wolf" : label.includes("centaur") ? "centaur" : label.includes("knight") ? "nightmare" : "horse", weapon: label.includes("champion") ? "lance" : "spear", shield: "kite", headgear: label.includes("champion") ? "crown" : "crest", motif, armor: "plate", aura };
  if (label.includes("pegasus") || label.includes("unicorn") || label.includes("boar") || label.includes("ram") || label.includes("argali") || label.includes("mammoth")) return { kind: "equine", mount: label.includes("pegasus") ? "pegasus" : label.includes("unicorn") ? "unicorn" : "horse", wings: label.includes("pegasus") ? "feather" : undefined, aura };
  if (label.includes("pixie") || label.includes("sprite") || label.includes("nymph") || label.includes("oceanid")) return { kind: "humanoid", weapon: "orb", shield: "none", headgear: "halo", wings: "feather", motif: "rune", stature: "small", armor: "robe", aura };
  if (label.includes("angel")) return { kind: "humanoid", weapon: "sword", shield: "none", headgear: "halo", wings: "feather", motif: "sun", aura: "holy", armor: "robe" };
  if (label.includes("devil")) return { kind: "humanoid", weapon: "trident", shield: "none", headgear: "horns", wings: "bat", motif: "fang", stature: "tall", aura: "flame", extra: "tail" };
  if (label.includes("harpy")) return { kind: "humanoid", weapon: "claws", shield: "none", headgear: "spikes", wings: "bat", motif: "claw", aura };
  if (label.includes("gargoyle")) return { kind: "humanoid", weapon: "claws", shield: "none", headgear: "horns", wings: "stone", motif: "rune", armor: "stone", aura: "stone" };
  if (label.includes("dendroid")) return { kind: "dendroid", aura: "leaf" };
  if (label.includes("mage") || label.includes("monk") || label.includes("zealot") || label.includes("witch") || label.includes("sorceress") || label.includes("shaman") || label.includes("enchanter")) return { kind: "caster", weapon: creature.ranged ? rangedWeapon : "staff", shield: "none", headgear: label.includes("zealot") ? "halo" : "hood", motif: label.includes("monk") || label.includes("zealot") ? "book" : motif, robe: true, aura };
  if (creature.ranged) return { kind: "humanoid", weapon: rangedWeapon, shield: "none", headgear: label.includes("orc") ? "horns" : "cap", motif, armor: "leather", aura };
  if (label.includes("ogre") || label.includes("troll") || label.includes("yeti") || label.includes("jotunn") || label.includes("giant") || label.includes("cyclops")) return { kind: "humanoid", weapon: label.includes("cyclops") ? "boulder" : "mace", shield: "none", headgear: label.includes("giant") || label.includes("jotunn") ? "crown" : "none", motif: label.includes("cyclops") ? "eye" : motif, stature: "tall", armor: "leather", aura };
  if (label.includes("dwarf") || label.includes("halfling") || label.includes("gremlin") || label.includes("goblin") || label.includes("kobold") || label.includes("imp")) return { kind: "humanoid", weapon: creature.ranged ? rangedWeapon : "dagger", shield: "none", headgear: "cap", motif, stature: "small", aura };
  if (label.includes("minotaur")) return { kind: "humanoid", weapon: "axe", shield: "none", headgear: "bull", motif: "fang", stature: "heavy", armor: "leather", aura };
  if (label.includes("demon") || label.includes("pit")) return { kind: "humanoid", weapon: label.includes("pit") ? "trident" : "axe", shield: label.includes("demon") ? "round" : "none", headgear: "horns", motif: "flame", stature: "heavy", armor: "leather", aura: "flame", extra: label.includes("pit") ? "chains" : undefined };

  return { kind: "humanoid", weapon: creature.ranged ? rangedWeapon : "sword", shield: "none", headgear: "cap", motif, armor: "leather", aura };
}

function upgradeHeadgear(headgear, group) {
  if (headgear === "halo" || headgear === "crown") return headgear;
  if (group === "inferno" || group === "dungeon") return "horns";
  if (group === "necropolis") return "skull";
  return "visor";
}

function upgradeWeapon(weaponName) {
  return {
    bow: "crossbow",
    sword: "greatsword",
    spear: "halberd",
    mace: "hammer",
    club: "mace",
    dagger: "sword",
  }[weaponName] ?? weaponName;
}

const townSpecs = [
  { file: "town-castle", title: "Ville château", faction: "castle", architecture: "castle" },
  { file: "town-rampart", title: "Ville rempart", faction: "rampart", architecture: "rampart" },
  { file: "town-tower", title: "Ville tour", faction: "tower", architecture: "tower" },
  { file: "town-inferno", title: "Ville Hadès", faction: "inferno", architecture: "inferno" },
  { file: "town-necropolis", title: "Ville nécropole", faction: "necropolis", architecture: "necropolis" },
  { file: "town-dungeon", title: "Ville donjon", faction: "dungeon", architecture: "dungeon" },
  { file: "town-stronghold", title: "Ville bastion", faction: "stronghold", architecture: "stronghold" },
  { file: "town-fortress", title: "Ville forteresse", faction: "fortress", architecture: "fortress" },
];

const heroSpecs = [
  { file: "hero-cavalier", title: "Héros cavalier", faction: "castle", mount: "horse", weapon: "lance", shield: "kite", headgear: "crest" },
  { file: "hero-rampart", title: "Héros rempart", faction: "rampart", mount: "horse", weapon: "bow", shield: "none", headgear: "leaf" },
  { file: "hero-tower", title: "Héros tour", faction: "tower", mount: "horse", weapon: "staff", shield: "none", headgear: "turban" },
  { file: "hero-inferno", title: "Héros Hadès", faction: "inferno", mount: "nightmare", weapon: "trident", shield: "none", headgear: "horns" },
  { file: "hero-necropolis", title: "Héros nécropole", faction: "necropolis", mount: "nightmare", weapon: "scythe", shield: "kite", headgear: "skull" },
  { file: "hero-dungeon", title: "Héros donjon", faction: "dungeon", mount: "lizard", weapon: "sword", shield: "kite", headgear: "spikes" },
  { file: "hero-stronghold", title: "Héros bastion", faction: "stronghold", mount: "boar", weapon: "axe", shield: "round", headgear: "horns" },
  { file: "hero-fortress", title: "Héros forteresse", faction: "fortress", mount: "lizard", weapon: "spear", shield: "round", headgear: "crest" },
];

const resourceSpecs = [
  { file: "gold", title: "Or", kind: "gold", c1: "#ffd166", c2: "#9b6405" },
  { file: "wood", title: "Bois", kind: "wood", c1: "#8b4513", c2: "#3d1f0a" },
  { file: "ore", title: "Minerai", kind: "ore", c1: "#9ca3af", c2: "#30363d" },
  { file: "mercury", title: "Mercure", kind: "mercury", c1: "#d8d8e8", c2: "#4c1d95" },
  { file: "crystals", title: "Cristaux", kind: "crystals", c1: "#22d3ee", c2: "#075985" },
  { file: "gems", title: "Gemmes", kind: "gems", c1: "#fb7185", c2: "#881337" },
  { file: "sulfur", title: "Soufre", kind: "sulfur", c1: "#facc15", c2: "#854d0e" },
];

const buildingSpecs = [
  { file: "gold-mine", title: "Mine d'or", kind: "mine", c1: "#7a6a52", c2: "#5a4a38", accent: "#ffd700" },
  { file: "sawmill", title: "Scierie", kind: "sawmill", c1: "#8b5a28", c2: "#5a3010", accent: "#c0c8d0" },
  { file: "ore-pit", title: "Mine de minerai", kind: "pit", c1: "#706050", c2: "#504030", accent: "#e07030" },
  { file: "alchemist-lab", title: "Laboratoire d'alchimiste", kind: "lab", c1: "#4a2a6a", c2: "#2a1050", accent: "#c0c8d8" },
  { file: "crystal-cavern", title: "Caverne de cristaux", kind: "cavern", c1: "#2a4050", c2: "#1a3040", accent: "#00e8ff" },
  { file: "gem-pond", title: "Bassin de gemmes", kind: "pond", c1: "#3b1d3f", c2: "#1f1024", accent: "#f472b6" },
  { file: "sulfur-dune", title: "Dune de soufre", kind: "dune", c1: "#c8a838", c2: "#8a6a18", accent: "#f0d020" },
];

const decorSpecs = [
  { file: "wall-brick", title: "Mur de pierre", kind: "wall-brick" },
  { file: "wall-vegetal", title: "Mur végétal", kind: "wall-vegetal" },
  { file: "tree-pine", title: "Pin", kind: "tree-pine" },
  { file: "tree-oak", title: "Chêne", kind: "tree-oak" },
  { file: "tree-dead", title: "Arbre mort", kind: "tree-dead" },
  { file: "rock-large", title: "Grand rocher", kind: "rock-large" },
  { file: "rock-small", title: "Petit rocher", kind: "rock-small" },
  { file: "bush", title: "Buisson", kind: "bush" },
  { file: "flower", title: "Fleurs", kind: "flower" },
  { file: "grass-tuft", title: "Touffe d'herbe", kind: "grass-tuft" },
];

const adventureObjectSource = await readFile(path.join(ROOT, "src", "lib", "game", "adventure-objects.ts"), "utf8");
const adventureObjectSpecs = Array.from(adventureObjectSource.matchAll(/rule\("([^"]+)",\s*"([^"]+)"/g))
  .map((match) => ({ file: match[1], title: match[2], kind: adventureKind(match[1]) }));

function adventureKind(id) {
  if (id.includes("ship") || id.includes("boat") || id.includes("sea") || id.includes("water") || id.includes("whirlpool") || id.includes("buoy") || id.includes("flotsam") || id.includes("jetsam")) return "water";
  if (id.includes("gate") || id.includes("portal") || id.includes("subterranean") || id.includes("town_gate")) return "portal";
  if (id.includes("bank") || id.includes("crypt") || id.includes("utopia") || id.includes("hive") || id.includes("stockpile") || id.includes("tower")) return "bank";
  if (id.includes("school") || id.includes("university") || id.includes("library") || id.includes("scholar") || id.includes("witch")) return "knowledge";
  if (id.includes("chest") || id.includes("campfire") || id.includes("wagon") || id.includes("grave") || id.includes("corpse")) return "treasure";
  if (id.includes("fountain") || id.includes("well") || id.includes("spring") || id.includes("oasis")) return "spring";
  if (id.includes("market") || id.includes("guild") || id.includes("factory") || id.includes("yard")) return "service";
  return "landmark";
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function idFrom(file) {
  return file.replace(/[^a-z0-9]/gi, "-");
}

function svg({ title, desc, width = 96, height = 96, id, defs = "", body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc">
  <title id="${id}-title">${esc(title)}</title>
  <desc id="${id}-desc">${esc(desc)}</desc>
  ${defs}
  ${body}
</svg>
`;
}

function unitDefs(id, p) {
  return `<defs>
    <linearGradient id="${id}-body" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.light}"/>
      <stop offset="48%" stop-color="${p.main}"/>
      <stop offset="100%" stop-color="${p.dark}"/>
    </linearGradient>
    <linearGradient id="${id}-alt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.accent}"/>
      <stop offset="100%" stop-color="${p.secondary}"/>
    </linearGradient>
    <linearGradient id="${id}-steel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="55%" stop-color="#aeb8c4"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>
    <radialGradient id="${id}-glow" cx="50%" cy="48%" r="50%">
      <stop offset="0%" stop-color="${p.accent}" stop-opacity=".65"/>
      <stop offset="100%" stop-color="${p.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

function aura(spec) {
  if (!spec.aura) return "";
  const color = spec.aura === "flame" ? "#ff7a1f" : spec.aura === "holy" ? "#fff7ad" : spec.aura === "arcane" ? "#a78bfa" : spec.aura === "leaf" ? "#86efac" : spec.aura === "stone" ? "#cbd5e1" : "#a7c7be";
  return `<g opacity=".55">
    <ellipse cx="48" cy="49" rx="35" ry="40" fill="${color}" opacity=".10"/>
    <path d="M24 70 Q15 52 27 34 M72 70 Q82 52 69 34" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${spec.aura === "flame" ? "2 4" : "5 5"}" opacity=".7"/>
    ${spec.aura === "flame" ? `<path d="M22 78 C16 64 28 58 23 44 C36 55 32 66 40 78 M74 78 C80 64 68 58 73 44 C60 55 64 66 56 78" fill="${color}" opacity=".25"/>` : ""}
  </g>`;
}

function wings(spec, p, id) {
  if (!spec.wings) return "";
  const bat = spec.wings === "bat" || spec.wings === "flame";
  const stone = spec.wings === "stone";
  const fill = spec.wings === "flame" ? p.secondary : stone ? "#7b8794" : `url(#${id}-body)`;
  const opacity = spec.wings === "double-feather" ? ".96" : ".9";
  const extra = spec.wings === "double-feather"
    ? `<path d="M38 35 C25 14 11 16 7 40 C16 38 26 43 39 57 M58 35 C71 14 85 16 89 40 C80 38 70 43 57 57" fill="none" stroke="${p.accent}" stroke-width="2" opacity=".65"/>`
    : "";
  const left = bat ? "M38 38 C23 13 8 20 8 51 L22 46 L31 63 L40 53 Z" : "M39 36 C23 14 8 24 8 47 C19 47 30 52 41 64 Z";
  const right = bat ? "M58 38 C73 13 88 20 88 51 L74 46 L65 63 L56 53 Z" : "M57 36 C73 14 88 24 88 47 C77 47 66 52 55 64 Z";
  return `<g opacity="${opacity}">
    <path d="${left}" fill="${fill}" stroke="${p.dark}" stroke-width="2"/>
    <path d="${right}" fill="${fill}" stroke="${p.dark}" stroke-width="2"/>
    <path d="M14 43 Q25 40 38 50 M82 43 Q71 40 58 50" fill="none" stroke="${p.accent}" stroke-width="1.4" opacity=".65"/>
    ${extra}
  </g>`;
}

function headgear(spec, p, x = 48, y = 23) {
  switch (spec.headgear) {
    case "crest":
      return `<path d="M${x - 6} ${y - 9} Q${x} ${y - 22} ${x + 7} ${y - 9}" fill="none" stroke="${p.accent}" stroke-width="4" stroke-linecap="round"/>`;
    case "visor":
      return `<path d="M${x - 12} ${y - 2} H${x + 12} M${x - 9} ${y + 4} H${x + 9}" stroke="#111827" stroke-width="2.2" stroke-linecap="round"/>`;
    case "cap":
      return `<path d="M${x - 13} ${y - 5} Q${x} ${y - 16} ${x + 13} ${y - 5} L${x + 9} ${y - 1} Q${x} ${y - 5} ${x - 9} ${y - 1} Z" fill="${p.secondary}" stroke="${p.dark}" stroke-width="1.5"/>`;
    case "hood":
      return `<path d="M${x - 15} ${y + 2} Q${x} ${y - 20} ${x + 15} ${y + 2} Q${x} ${y - 7} ${x - 15} ${y + 2} Z" fill="${p.dark}" stroke="${p.secondary}" stroke-width="1.3"/>`;
    case "horns":
      return `<path d="M${x - 8} ${y - 7} Q${x - 22} ${y - 20} ${x - 18} ${y - 1} M${x + 8} ${y - 7} Q${x + 22} ${y - 20} ${x + 18} ${y - 1}" fill="none" stroke="#f8fafc" stroke-width="3.2" stroke-linecap="round"/>`;
    case "bull":
      return `<path d="M${x - 9} ${y - 5} Q${x - 28} ${y - 18} ${x - 21} ${y + 4} M${x + 9} ${y - 5} Q${x + 28} ${y - 18} ${x + 21} ${y + 4}" fill="none" stroke="#f7ead4" stroke-width="4" stroke-linecap="round"/>`;
    case "crown":
      return `<path d="M${x - 12} ${y - 9} L${x - 6} ${y - 20} L${x} ${y - 9} L${x + 6} ${y - 20} L${x + 12} ${y - 9} L${x + 10} ${y - 2} H${x - 10} Z" fill="${p.accent}" stroke="${p.secondary}" stroke-width="1.2"/>`;
    case "halo":
      return `<ellipse cx="${x}" cy="${y - 16}" rx="14" ry="4" fill="none" stroke="${p.accent}" stroke-width="2.5"/>`;
    case "skull":
      return `<path d="M${x - 9} ${y - 11} H${x + 9} L${x + 6} ${y - 2} H${x - 6} Z" fill="#111827" opacity=".75"/>`;
    case "spikes":
      return `<path d="M${x - 13} ${y - 5} L${x - 8} ${y - 18} L${x - 2} ${y - 5} L${x + 4} ${y - 19} L${x + 12} ${y - 5}" fill="${p.accent}" stroke="${p.dark}" stroke-width="1"/>`;
    case "turban":
      return `<path d="M${x - 14} ${y - 4} C${x - 10} ${y - 17} ${x + 10} ${y - 17} ${x + 14} ${y - 4} C${x + 6} ${y + 1} ${x - 6} ${y + 1} ${x - 14} ${y - 4} Z" fill="${p.light}" stroke="${p.dark}" stroke-width="1.5"/><circle cx="${x + 9}" cy="${y - 5}" r="3" fill="${p.accent}"/>`;
    case "snakes":
      return `<path d="M${x - 13} ${y - 5} C${x - 20} ${y - 19} ${x - 7} ${y - 18} ${x - 10} ${y - 6} M${x + 12} ${y - 5} C${x + 20} ${y - 19} ${x + 7} ${y - 18} ${x + 10} ${y - 6} M${x - 2} ${y - 10} C${x + 3} ${y - 22} ${x + 11} ${y - 16} ${x + 4} ${y - 8}" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>`;
    case "leaf":
      return `<path d="M${x - 10} ${y - 4} C${x - 16} ${y - 18} ${x - 1} ${y - 18} ${x + 5} ${y - 9} C${x - 1} ${y - 6} ${x - 5} ${y - 5} ${x - 10} ${y - 4} Z" fill="${p.accent}" stroke="${p.dark}" stroke-width="1"/>`;
    default:
      return "";
  }
}

function motif(spec, p, x = 48, y = 52, size = 1) {
  const s = size;
  switch (spec.motif) {
    case "cross":
      return `<path d="M${x} ${y - 10 * s} V${y + 10 * s} M${x - 8 * s} ${y - 2 * s} H${x + 8 * s}" stroke="${p.accent}" stroke-width="${2.4 * s}" stroke-linecap="round"/>`;
    case "chevron":
      return `<path d="M${x - 12 * s} ${y - 6 * s} L${x} ${y + 6 * s} L${x + 12 * s} ${y - 6 * s}" fill="none" stroke="${p.accent}" stroke-width="${2.2 * s}" stroke-linecap="round"/>`;
    case "leaf":
      return `<path d="M${x - 2 * s} ${y + 9 * s} C${x - 15 * s} ${y - 2 * s} ${x - 4 * s} ${y - 14 * s} ${x + 10 * s} ${y - 9 * s} C${x + 10 * s} ${y + 1 * s} ${x + 6 * s} ${y + 7 * s} ${x - 2 * s} ${y + 9 * s} Z" fill="${p.accent}" stroke="${p.secondary}" stroke-width="${0.8 * s}"/>`;
    case "quiver":
      return `<path d="M${x + 9 * s} ${y - 16 * s} L${x + 17 * s} ${y + 8 * s}" stroke="${p.secondary}" stroke-width="${4 * s}" stroke-linecap="round"/><path d="M${x + 4 * s} ${y - 18 * s} L${x + 13 * s} ${y - 11 * s} M${x + 8 * s} ${y - 20 * s} L${x + 16 * s} ${y - 13 * s}" stroke="${p.accent}" stroke-width="${1.5 * s}"/>`;
    case "book":
      return `<path d="M${x - 13 * s} ${y - 6 * s} H${x} V${y + 9 * s} H${x - 13 * s} Z M${x} ${y - 6 * s} H${x + 13 * s} V${y + 9 * s} H${x} Z" fill="#f8ead1" stroke="${p.secondary}" stroke-width="${1.4 * s}"/><path d="M${x - 9 * s} ${y - 1 * s} H${x - 3 * s} M${x + 4 * s} ${y - 1 * s} H${x + 10 * s}" stroke="${p.dark}" stroke-width="${1 * s}"/>`;
    case "rune":
      return `<path d="M${x} ${y - 11 * s} L${x + 10 * s} ${y} L${x} ${y + 11 * s} L${x - 10 * s} ${y} Z" fill="${p.accent}" stroke="${p.secondary}" stroke-width="${1 * s}"/><path d="M${x - 5 * s} ${y} H${x + 5 * s} M${x} ${y - 6 * s} V${y + 6 * s}" stroke="${p.dark}" stroke-width="${1.3 * s}"/>`;
    case "flame":
      return `<path d="M${x} ${y + 11 * s} C${x - 12 * s} ${y} ${x - 2 * s} ${y - 7 * s} ${x - 3 * s} ${y - 17 * s} C${x + 9 * s} ${y - 7 * s} ${x + 14 * s} ${y + 2 * s} ${x} ${y + 11 * s} Z" fill="${p.accent}"/>`;
    case "skull":
      return `<ellipse cx="${x}" cy="${y}" rx="${10 * s}" ry="${8 * s}" fill="${p.accent}" opacity=".95"/><circle cx="${x - 4 * s}" cy="${y}" r="${1.8 * s}" fill="#0f172a"/><circle cx="${x + 4 * s}" cy="${y}" r="${1.8 * s}" fill="#0f172a"/><path d="M${x - 3 * s} ${y + 5 * s} H${x + 3 * s}" stroke="#0f172a" stroke-width="${1 * s}"/>`;
    case "eye":
      return `<ellipse cx="${x}" cy="${y}" rx="${11 * s}" ry="${6 * s}" fill="${p.accent}"/><circle cx="${x}" cy="${y}" r="${3.5 * s}" fill="#111827"/>`;
    case "scale":
      return `<path d="M${x - 14 * s} ${y - 5 * s} Q${x - 7 * s} ${y - 13 * s} ${x} ${y - 5 * s} Q${x + 7 * s} ${y - 13 * s} ${x + 14 * s} ${y - 5 * s} M${x - 12 * s} ${y + 5 * s} Q${x - 5 * s} ${y - 3 * s} ${x + 2 * s} ${y + 5 * s} Q${x + 9 * s} ${y - 3 * s} ${x + 16 * s} ${y + 5 * s}" fill="none" stroke="${p.accent}" stroke-width="${1.8 * s}"/>`;
    case "fang":
      return `<path d="M${x - 7 * s} ${y - 8 * s} L${x - 2 * s} ${y + 10 * s} L${x + 1 * s} ${y - 6 * s} M${x + 5 * s} ${y - 8 * s} L${x + 10 * s} ${y + 10 * s} L${x + 13 * s} ${y - 6 * s}" fill="none" stroke="${p.accent}" stroke-width="${2 * s}" stroke-linecap="round"/>`;
    case "bolt":
      return `<path d="M${x + 3 * s} ${y - 13 * s} L${x - 10 * s} ${y + 2 * s} H${x} L${x - 4 * s} ${y + 13 * s} L${x + 12 * s} ${y - 4 * s} H${x + 2 * s} Z" fill="${p.accent}"/>`;
    case "moon":
      return `<path d="M${x + 7 * s} ${y - 10 * s} C${x - 9 * s} ${y - 7 * s} ${x - 10 * s} ${y + 8 * s} ${x + 6 * s} ${y + 11 * s} C${x - 2 * s} ${y + 3 * s} ${x - 1 * s} ${y - 3 * s} ${x + 7 * s} ${y - 10 * s} Z" fill="${p.accent}"/>`;
    case "sun":
      return `<circle cx="${x}" cy="${y}" r="${8 * s}" fill="${p.accent}" stroke="#fff7ad" stroke-width="${1.3 * s}"/><path d="M${x} ${y - 14 * s} V${y - 10 * s} M${x} ${y + 10 * s} V${y + 14 * s} M${x - 14 * s} ${y} H${x - 10 * s} M${x + 10 * s} ${y} H${x + 14 * s}" stroke="${p.accent}" stroke-width="${1.4 * s}"/>`;
    case "gem":
      return `<path d="M${x} ${y - 11 * s} L${x + 11 * s} ${y} L${x} ${y + 11 * s} L${x - 11 * s} ${y} Z" fill="${p.accent}" stroke="${p.secondary}" stroke-width="${1 * s}"/>`;
    case "claw":
      return `<path d="M${x - 11 * s} ${y + 7 * s} L${x - 5 * s} ${y - 8 * s} M${x} ${y + 9 * s} V${y - 10 * s} M${x + 11 * s} ${y + 7 * s} L${x + 5 * s} ${y - 8 * s}" stroke="${p.accent}" stroke-width="${2.1 * s}" stroke-linecap="round"/>`;
    case "rags":
      return `<path d="M${x - 12 * s} ${y - 8 * s} H${x + 10 * s} M${x - 9 * s} ${y} H${x + 12 * s} M${x - 11 * s} ${y + 8 * s} H${x + 7 * s}" stroke="${p.accent}" stroke-width="${1.7 * s}" stroke-linecap="round" opacity=".65"/>`;
    case "banner":
      return `<path d="M${x + 12 * s} ${y - 20 * s} V${y + 8 * s}" stroke="${p.dark}" stroke-width="${2 * s}"/><path d="M${x + 14 * s} ${y - 20 * s} L${x + 31 * s} ${y - 16 * s} L${x + 14 * s} ${y - 9 * s} Z" fill="${p.accent}" stroke="${p.secondary}" stroke-width="${1.2 * s}"/>`;
    default:
      return `<path d="M${x - 12 * s} ${y - 6 * s} H${x + 12 * s} M${x - 9 * s} ${y} H${x + 9 * s} M${x - 6 * s} ${y + 6 * s} H${x + 6 * s}" stroke="${p.accent}" stroke-width="${1.8 * s}" stroke-linecap="round"/>`;
  }
}

function weapon(spec, p, id, x = 69, y = 50) {
  switch (spec.weapon) {
    case "spear":
      return `<path d="M${x} ${y + 33} L${x - 14} ${y - 32}" stroke="#d8c29a" stroke-width="3" stroke-linecap="round"/><path d="M${x - 15} ${y - 36} L${x - 20} ${y - 24} L${x - 9} ${y - 27} Z" fill="url(#${id}-steel)" stroke="#475569" stroke-width="1"/>`;
    case "halberd":
      return `<path d="M${x} ${y + 34} L${x - 12} ${y - 33}" stroke="#d8c29a" stroke-width="3" stroke-linecap="round"/><path d="M${x - 13} ${y - 34} L${x - 18} ${y - 22} L${x - 7} ${y - 24} Z M${x - 11} ${y - 30} C${x + 2} ${y - 24} ${x - 1} ${y - 12} ${x - 12} ${y - 15}" fill="url(#${id}-steel)" stroke="#475569" stroke-width="1"/>`;
    case "bow":
      return `<path d="M${x - 10} ${y - 26} C${x + 13} ${y - 14} ${x + 13} ${y + 18} ${x - 10} ${y + 30}" fill="none" stroke="#8b5a28" stroke-width="4" stroke-linecap="round"/><path d="M${x - 10} ${y - 26} Q${x + 3} ${y + 2} ${x - 10} ${y + 30} M${x - 24} ${y + 5} H${x + 12}" stroke="#f8ead1" stroke-width="1.5"/><path d="M${x + 12} ${y + 5} L${x + 6} ${y + 1} M${x + 12} ${y + 5} L${x + 6} ${y + 9}" stroke="${p.accent}" stroke-width="1.5"/>`;
    case "crossbow":
      return `<path d="M${x - 26} ${y - 3} H${x + 11} M${x - 20} ${y - 14} Q${x - 6} ${y - 2} ${x - 20} ${y + 10} M${x - 7} ${y - 2} L${x + 11} ${y + 16}" stroke="#d8c29a" stroke-width="3" stroke-linecap="round"/><path d="M${x + 10} ${y - 3} H${x + 21}" stroke="url(#${id}-steel)" stroke-width="2"/>`;
    case "sword":
      return `<path d="M${x - 2} ${y + 29} L${x - 2} ${y - 24}" stroke="url(#${id}-steel)" stroke-width="4" stroke-linecap="round"/><path d="M${x - 8} ${y + 3} H${x + 5}" stroke="${p.accent}" stroke-width="3" stroke-linecap="round"/><path d="M${x - 2} ${y - 31} L${x - 8} ${y - 22} H${x + 4} Z" fill="url(#${id}-steel)" stroke="#475569" stroke-width="1"/>`;
    case "greatsword":
      return `<path d="M${x - 6} ${y + 34} L${x - 6} ${y - 35}" stroke="url(#${id}-steel)" stroke-width="5" stroke-linecap="round"/><path d="M${x - 17} ${y - 2} H${x + 5}" stroke="${p.accent}" stroke-width="4" stroke-linecap="round"/><path d="M${x - 6} ${y - 43} L${x - 14} ${y - 31} H${x + 2} Z" fill="url(#${id}-steel)" stroke="#475569" stroke-width="1"/>`;
    case "axe":
    case "throwing-axe":
      return `<path d="M${x - 5} ${y + 31} L${x - 9} ${y - 24}" stroke="#7a4e20" stroke-width="4" stroke-linecap="round"/><path d="M${x - 12} ${y - 28} C${x + 6} ${y - 33} ${x + 7} ${y - 10} ${x - 10} ${y - 14} Z" fill="url(#${id}-steel)" stroke="#475569" stroke-width="1.2"/><path d="M${x - 12} ${y - 27} C${x - 24} ${y - 27} ${x - 25} ${y - 10} ${x - 10} ${y - 14}" fill="url(#${id}-steel)" stroke="#475569" stroke-width="1.2"/>`;
    case "mace":
    case "club":
      return `<path d="M${x - 3} ${y + 33} L${x - 9} ${y - 17}" stroke="#7a4e20" stroke-width="5" stroke-linecap="round"/><circle cx="${x - 10}" cy="${y - 25}" r="9" fill="${spec.weapon === "club" ? "#5b3a1d" : `url(#${id}-steel)`}" stroke="${p.dark}" stroke-width="1.5"/><path d="M${x - 18} ${y - 25} H${x - 2} M${x - 10} ${y - 33} V${y - 17}" stroke="${p.accent}" stroke-width="1.4"/>`;
    case "hammer":
      return `<path d="M${x - 1} ${y + 33} L${x - 10} ${y - 19}" stroke="#7a4e20" stroke-width="5" stroke-linecap="round"/><path d="M${x - 23} ${y - 30} H${x + 4} V${y - 17} H${x - 23} Z" fill="url(#${id}-steel)" stroke="#475569" stroke-width="1.4"/>`;
    case "staff":
      return `<path d="M${x} ${y + 35} L${x - 11} ${y - 33}" stroke="#7a4e20" stroke-width="3.2" stroke-linecap="round"/><circle cx="${x - 12}" cy="${y - 38}" r="7" fill="${p.accent}" stroke="${p.light}" stroke-width="2"/><path d="M${x - 19} ${y - 38} H${x - 5} M${x - 12} ${y - 45} V${y - 31}" stroke="#fff7ad" stroke-width="1" opacity=".7"/>`;
    case "orb":
    case "fireball":
      return `<path d="M${x - 26} ${y + 4} Q${x - 9} ${y - 11} ${x + 3} ${y + 3}" fill="none" stroke="${p.light}" stroke-width="3" stroke-linecap="round"/><circle cx="${x + 8}" cy="${y - 3}" r="10" fill="url(#${id}-glow)" stroke="${p.accent}" stroke-width="2"/><path d="M${x + 2} ${y - 8} Q${x + 9} ${y - 15} ${x + 16} ${y - 7}" fill="none" stroke="#fff7ad" stroke-width="1.4" opacity=".75"/>`;
    case "trident":
      return `<path d="M${x - 4} ${y + 34} L${x - 9} ${y - 30}" stroke="#9ca3af" stroke-width="3.5" stroke-linecap="round"/><path d="M${x - 20} ${y - 30} Q${x - 9} ${y - 17} ${x + 2} ${y - 30} M${x - 9} ${y - 30} V${y - 13} M${x - 20} ${y - 30} V${y - 20} M${x + 2} ${y - 30} V${y - 20}" fill="none" stroke="${p.accent}" stroke-width="3" stroke-linecap="round"/>`;
    case "dagger":
      return `<path d="M${x - 18} ${y + 18} L${x - 3} ${y - 13}" stroke="url(#${id}-steel)" stroke-width="3" stroke-linecap="round"/><path d="M${x - 8} ${y - 20} L${x - 10} ${y - 10} L${x + 1} ${y - 14} Z" fill="url(#${id}-steel)" stroke="#475569" stroke-width="1"/>`;
    case "dual-swords":
      return `${weapon({ ...spec, weapon: "sword" }, p, id, 67, y)}<path d="M31 76 L39 23" stroke="url(#${id}-steel)" stroke-width="3.5" stroke-linecap="round"/><path d="M29 50 H43" stroke="${p.accent}" stroke-width="3"/>`;
    case "saber":
      return `<path d="M${x - 2} ${y + 26} C${x - 10} ${y + 4} ${x - 5} ${y - 21} ${x + 12} ${y - 32}" fill="none" stroke="url(#${id}-steel)" stroke-width="4" stroke-linecap="round"/><path d="M${x - 11} ${y + 2} H${x + 5}" stroke="${p.accent}" stroke-width="3"/>`;
    case "boulder":
      return `<circle cx="${x - 8}" cy="${y - 12}" r="13" fill="#78716c" stroke="#292524" stroke-width="2"/><path d="M${x - 16} ${y - 17} L${x - 4} ${y - 23} M${x - 14} ${y - 5} L${x + 1} ${y - 11}" stroke="#a8a29e" stroke-width="1.5"/>`;
    case "lance":
      return `<path d="M${x + 10} ${y + 31} L${x - 35} ${y - 27}" stroke="#d8c29a" stroke-width="4" stroke-linecap="round"/><path d="M${x - 38} ${y - 30} L${x - 45} ${y - 19} L${x - 31} ${y - 22} Z" fill="url(#${id}-steel)" stroke="#475569" stroke-width="1"/><path d="M${x - 23} ${y - 15} L${x - 8} ${y - 12} L${x - 17} ${y + 2} Z" fill="${p.secondary}" stroke="${p.accent}" stroke-width="1"/>`;
    case "scythe":
      return `<path d="M${x - 2} ${y + 34} L${x - 12} ${y - 31}" stroke="#7a4e20" stroke-width="3.5" stroke-linecap="round"/><path d="M${x - 13} ${y - 33} C${x + 10} ${y - 37} ${x + 18} ${y - 20} ${x - 4} ${y - 18}" fill="none" stroke="url(#${id}-steel)" stroke-width="4" stroke-linecap="round"/>`;
    default:
      return "";
  }
}

function shield(spec, p, id, x = 27, y = 57) {
  if (!spec.shield || spec.shield === "none") return "";
  if (spec.shield === "tower") {
    return `<path d="M${x - 9} ${y - 22} H${x + 9} L${x + 6} ${y + 19} Q${x} ${y + 25} ${x - 6} ${y + 19} Z" fill="url(#${id}-body)" stroke="${p.accent}" stroke-width="2"/><path d="M${x} ${y - 17} V${y + 15} M${x - 6} ${y - 2} H${x + 6}" stroke="${p.light}" stroke-width="1.8"/>`;
  }
  if (spec.shield === "kite") {
    return `<path d="M${x} ${y - 24} L${x + 13} ${y - 14} L${x + 10} ${y + 15} L${x} ${y + 26} L${x - 10} ${y + 15} L${x - 13} ${y - 14} Z" fill="url(#${id}-body)" stroke="${p.accent}" stroke-width="2"/><path d="M${x} ${y - 18} V${y + 17} M${x - 8} ${y - 2} H${x + 8}" stroke="${p.light}" stroke-width="1.8"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="14" fill="url(#${id}-body)" stroke="${p.accent}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="6" fill="${p.accent}" opacity=".85"/>`;
}

function humanoid(spec, p, id) {
  const small = spec.stature === "small";
  const heavy = spec.stature === "heavy";
  const tall = spec.stature === "tall";
  const stocky = spec.stature === "stocky";
  const sx = small ? 0.82 : heavy ? 1.08 : stocky ? 1.05 : 1;
  const sy = small ? 0.84 : tall ? 1.1 : stocky ? 0.9 : 1;
  const tx = small ? 8 : heavy ? -4 : 0;
  const ty = small ? 13 : tall ? -5 : stocky ? 8 : 0;
  const bodyTop = spec.robe || spec.armor === "robe" ? 34 : 37;
  const body = spec.robe || spec.armor === "robe"
    ? `<path d="M30 ${bodyTop} Q34 25 48 24 Q62 25 66 ${bodyTop} L75 84 Q48 90 21 84 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="2"/>`
    : `<path d="M30 ${bodyTop} Q33 28 48 27 Q63 28 66 ${bodyTop} L64 71 Q56 78 48 78 Q40 78 32 71 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="2"/>`;
  const legs = spec.robe || spec.armor === "robe" ? "" : `<path d="M35 71 L31 88 H42 L45 72 Z M53 72 L56 88 H67 L61 71 Z" fill="${p.dark}" stroke="${p.dark}" stroke-width="1"/><path d="M29 88 H43 M54 88 H69" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>`;
  const headFill = spec.kind === "undead" ? "#e5e7eb" : spec.armor === "stone" ? "#94a3b8" : p.skin;
  const face = spec.kind === "undead"
    ? `<ellipse cx="48" cy="20" rx="10" ry="12" fill="${headFill}" stroke="${p.dark}" stroke-width="1.5"/><ellipse cx="44" cy="20" rx="2.4" ry="3" fill="#0f172a"/><ellipse cx="52" cy="20" rx="2.4" ry="3" fill="#0f172a"/><path d="M44 28 H52 M46 24 V30 M50 24 V30" stroke="#0f172a" stroke-width="1"/>`
    : spec.robe || spec.headgear === "hood"
      ? `<path d="M38 18 Q48 10 58 18 L56 30 Q48 35 40 30 Z" fill="${p.dark}" stroke="${p.secondary}" stroke-width="1.4"/><path d="M43 23 H46 M50 23 H53" stroke="${p.accent}" stroke-width="1.8" stroke-linecap="round"/>`
      : `<path d="M37 17 Q48 9 59 17 L57 29 Q48 35 39 29 Z" fill="url(#${id}-steel)" stroke="${p.dark}" stroke-width="1.6"/><path d="M40 22 H46 M50 22 H56" stroke="#0f172a" stroke-width="1.9" stroke-linecap="round"/><path d="M42 28 H54" stroke="${p.dark}" stroke-width="1.1" opacity=".65"/>`;
  const arms = `<path d="M31 41 Q18 50 21 68 L30 65 Q28 53 35 43 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="1.5"/><path d="M65 41 Q78 50 75 68 L66 65 Q68 53 61 43 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="1.5"/>`;
  const cape = spec.extra === "cape" ? `<path d="M30 34 Q48 23 66 34 L72 85 Q48 78 24 85 Z" fill="${p.secondary}" opacity=".65" stroke="${p.dark}" stroke-width="1.2"/>` : "";
  const chains = spec.extra === "chains" ? `<path d="M31 46 C42 54 55 54 66 46 M30 61 C43 68 56 68 68 61" fill="none" stroke="#d1d5db" stroke-width="1.7" stroke-dasharray="3 3"/>` : "";
  const tail = spec.extra === "tail" ? `<path d="M65 67 C83 69 82 84 65 85 C72 79 72 73 61 71 Z" fill="${p.dark}" stroke="${p.secondary}" stroke-width="1.2"/>` : "";
  const eye = spec.file === "cyclops" ? `<circle cx="48" cy="22" r="4.2" fill="${p.accent}" stroke="#111827" stroke-width="1.2"/><circle cx="48" cy="22" r="1.8" fill="#111827"/>` : "";
  return `<g transform="translate(${tx} ${ty}) scale(${sx} ${sy})">
    ${aura(spec)}
    ${wings(spec, p, id)}
    ${cape}
    ${legs}
    ${tail}
    ${body}
    <path d="M35 40 H61 L58 62 H38 Z" fill="${p.accent}" opacity=".20"/>
    <path d="M39 43 H57 M40 49 H56 M41 55 H55" stroke="${p.light}" stroke-width="1.1" opacity=".42" stroke-linecap="round"/>
    ${motif(spec, p, 48, 53, heavy ? 1.05 : small ? 0.82 : 1)}
    ${chains}
    ${arms}
    ${shield(spec, p, id)}
    ${weapon(spec, p, id)}
    ${face}
    ${eye}
    ${headgear(spec, p, 48, 19)}
    <path d="M37 38 H59 M38 64 H58" stroke="${p.light}" stroke-width="1.4" opacity=".55" stroke-linecap="round"/>
  </g>`;
}

function caster(spec, p, id) {
  return humanoid({ ...spec, robe: true, stature: spec.stature ?? "normal" }, p, id);
}

function mounted(spec, p, id) {
  const mount = spec.mount ?? "horse";
  const mountColor = mount === "nightmare" ? "#17151a" : mount === "wolf" ? "#5b5f65" : mount === "boar" ? "#6b3f24" : mount === "lizard" ? p.main : mount === "centaur" ? "#8b5a28" : "#7b5138";
  const isCentaur = mount === "centaur";
  const ears = mount === "wolf" ? `<path d="M63 46 L60 35 L69 43 M73 46 L82 36 L80 49" fill="${p.dark}" stroke="${p.dark}" stroke-width="1"/>` : mount === "lizard" ? `<path d="M34 45 L38 35 L42 45 M46 43 L50 32 L54 45 M58 45 L62 36 L66 46" fill="${p.accent}" stroke="${p.dark}" stroke-width="1"/>` : "";
  const horn = mount === "warhorse" ? `<path d="M75 42 L82 29 L82 45 Z" fill="${p.accent}" stroke="${p.dark}" stroke-width="1"/>` : "";
  const body = isCentaur
    ? `<path d="M14 58 Q15 46 31 44 L67 45 Q78 48 76 62 Q74 73 58 75 L26 74 Q14 72 14 58 Z" fill="${mountColor}" stroke="${p.dark}" stroke-width="2"/>`
    : `<path d="M12 61 Q13 49 29 47 L67 48 Q79 51 77 63 Q75 75 59 76 L26 75 Q12 73 12 61 Z" fill="${mountColor}" stroke="${p.dark}" stroke-width="2"/>`;
  return `<g>
    ${aura(spec)}
    <ellipse cx="48" cy="87" rx="34" ry="5" fill="#000" opacity=".25"/>
    <path d="M17 68 L14 88 M30 72 L29 89 M58 72 L61 89 M72 66 L78 87" stroke="${p.dark}" stroke-width="5" stroke-linecap="round"/>
    ${body}
    <path d="M24 53 H63 Q73 55 76 61" fill="none" stroke="${p.accent}" stroke-width="2" opacity=".65"/>
    <path d="${mount === "wolf" ? "M63 47 Q76 41 83 51 L80 63 L69 65 Q62 58 63 51 Z" : mount === "lizard" ? "M62 47 Q78 43 84 54 Q78 64 67 61 Q61 55 62 47 Z" : "M65 46 Q78 42 83 52 L80 65 L70 67 Q64 60 65 52 Z"}" fill="${mountColor}" stroke="${p.dark}" stroke-width="1.6"/>
    ${ears}${horn}
    <circle cx="76" cy="54" r="1.6" fill="${mount === "nightmare" ? p.accent : "#111827"}"/>
    <path d="M13 57 Q3 61 8 73 L14 73 Q16 64 20 61 Z" fill="${p.dark}" stroke="${p.dark}" stroke-width="1"/>
    <path d="M36 28 Q37 18 48 17 Q59 18 60 29 L59 52 Q48 58 37 52 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="1.8"/>
    <path d="M38 34 H58 L56 48 H40 Z" fill="${p.accent}" opacity=".25"/>
    ${motif(spec, p, 48, 42, 0.72)}
    <path d="M39 9 Q48 2 57 9 L55 20 Q48 25 41 20 Z" fill="url(#${id}-steel)" stroke="${p.dark}" stroke-width="1.5"/>
    <path d="M42 14 H47 M50 14 H55" stroke="#0f172a" stroke-width="1.7" stroke-linecap="round"/>
    ${headgear(spec, p, 48, 11)}
    ${shield(spec, p, id, 36, 45)}
    ${weapon(spec, p, id, 70, 42)}
  </g>`;
}

function griffin(spec, p, id) {
  return `<g>
    ${aura(spec)}
    <path d="M39 47 C24 18 9 21 8 48 C19 45 30 52 40 68 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="2"/>
    <path d="M48 47 C61 16 80 20 85 46 C71 47 59 54 50 70 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="2"/>
    <path d="M16 45 Q27 44 39 55 M77 45 Q65 47 50 57" stroke="${p.accent}" stroke-width="1.6" opacity=".7"/>
    <path d="M15 67 C19 51 37 45 58 50 C73 54 78 68 69 79 C57 91 30 88 17 77 C14 74 13 70 15 67 Z" fill="#9a6428" stroke="${p.dark}" stroke-width="2"/>
    <path d="M52 51 C53 37 66 29 77 36 C85 41 81 52 68 55 C62 51 57 50 52 51 Z" fill="#f8fafc" stroke="${p.dark}" stroke-width="1.8"/>
    <path d="M73 39 C85 41 88 47 76 54 L68 50 C73 47 77 43 73 39 Z" fill="${p.accent}" stroke="${p.dark}" stroke-width="1.3"/>
    <circle cx="70" cy="43" r="1.8" fill="#111827"/>
    ${spec.headgear === "crown" ? headgear({ headgear: "crown" }, p, 62, 34) : ""}
    <path d="M23 76 L18 89 M40 79 L38 91 M62 76 L60 89" stroke="#d99b45" stroke-width="4" stroke-linecap="round"/>
    <path d="M16 90 Q22 83 29 89 M35 92 Q42 84 49 90 M57 90 Q63 84 71 89" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round"/>
    <path d="M69 72 C84 73 83 88 66 88 C73 82 76 77 66 75 Z" fill="#7c4a1e" stroke="${p.dark}" stroke-width="1.2"/>
  </g>`;
}

function equine(spec, p) {
  const unicorn = spec.mount === "unicorn";
  const pegasus = spec.mount === "pegasus";
  const bodyColor = unicorn ? "#f8fafc" : "#eef2ff";
  return `<g>
    ${aura(spec)}
    ${pegasus ? `<path d="M38 50 C23 21 10 25 9 52 C21 50 31 57 41 72 Z M50 50 C63 21 78 25 83 51 C70 50 59 57 49 72 Z" fill="#dbeafe" stroke="${p.dark}" stroke-width="1.7"/><path d="M16 49 Q27 48 39 58 M76 49 Q64 49 50 59" stroke="${p.accent}" stroke-width="1.4"/>` : ""}
    <path d="M14 67 C18 54 35 48 57 52 C73 55 81 66 74 78 C66 91 42 92 23 81 C16 77 12 72 14 67 Z" fill="${bodyColor}" stroke="${p.dark}" stroke-width="2"/>
    <path d="M57 52 C61 39 73 34 82 42 C87 47 83 55 71 57 C66 53 62 52 57 52 Z" fill="${bodyColor}" stroke="${p.dark}" stroke-width="1.6"/>
    ${unicorn ? `<path d="M73 40 L81 18 L83 44 Z" fill="${p.accent}" stroke="${p.secondary}" stroke-width="1.2"/>` : ""}
    <circle cx="75" cy="45" r="1.6" fill="#111827"/>
    <path d="M23 75 L19 90 M40 79 L38 91 M62 77 L60 91 M73 72 L78 90" stroke="#d1d5db" stroke-width="4" stroke-linecap="round"/>
    <path d="M15 91 H25 M34 92 H44 M56 92 H66 M74 91 H84" stroke="#111827" stroke-width="2" stroke-linecap="round"/>
    <path d="M17 67 C5 62 8 50 19 48" fill="none" stroke="#c7d2fe" stroke-width="4" stroke-linecap="round"/>
    <path d="M25 55 C39 44 56 46 68 55" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>
  </g>`;
}

function dragon(spec, p, id) {
  const bone = spec.bone;
  const wyvern = spec.wyvern;
  const fill = bone ? "#d1d5db" : `url(#${id}-body)`;
  const membrane = bone ? "#cbd5e1" : p.secondary;
  return `<g>
    ${aura(spec)}
    <path d="M39 45 C24 16 9 21 8 52 C21 47 32 54 42 70 Z" fill="${membrane}" stroke="${p.dark}" stroke-width="2"/>
    <path d="M54 45 C69 14 86 22 89 52 C75 47 64 54 53 70 Z" fill="${membrane}" stroke="${p.dark}" stroke-width="2"/>
    <path d="M14 51 L34 54 M22 30 L39 62 M84 51 L62 54 M76 30 L58 62" stroke="${bone ? "#64748b" : p.accent}" stroke-width="1.6" opacity=".7"/>
    <path d="M13 69 C18 52 37 46 61 52 C77 56 82 70 71 82 C58 95 32 91 17 79 C13 76 11 72 13 69 Z" fill="${fill}" stroke="${p.dark}" stroke-width="2"/>
    <path d="M56 52 C59 37 74 29 85 37 C93 43 88 55 73 58 C67 53 62 52 56 52 Z" fill="${fill}" stroke="${p.dark}" stroke-width="1.7"/>
    <path d="M73 35 L71 19 L81 34 M85 42 L93 33 L90 50" fill="${p.accent}" stroke="${p.dark}" stroke-width="1"/>
    <circle cx="75" cy="44" r="2" fill="${bone ? "#111827" : "#fef3c7"}"/>
    <path d="M24 77 L18 91 M42 81 L39 93 M65 78 L61 92" stroke="${bone ? "#e5e7eb" : p.secondary}" stroke-width="4" stroke-linecap="round"/>
    <path d="M15 92 Q21 84 28 90 M34 94 Q41 86 48 92 M57 93 Q64 85 72 91" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round"/>
    <path d="M14 70 C-2 67 1 51 17 50 C10 58 14 64 25 66 Z" fill="${fill}" stroke="${p.dark}" stroke-width="1.3"/>
    ${!wyvern ? `<path d="M70 73 C89 75 86 94 64 91 C74 84 76 78 67 76 Z" fill="${membrane}" stroke="${p.dark}" stroke-width="1.3"/>` : `<path d="M70 73 C83 77 83 88 68 90" fill="none" stroke="${p.secondary}" stroke-width="5" stroke-linecap="round"/>`}
    ${bone ? `<path d="M28 57 H62 M25 66 H68 M30 75 H63" stroke="#475569" stroke-width="1.3" opacity=".8"/>` : `<path d="M28 57 C42 54 58 56 72 65 M26 67 C40 64 55 66 69 74" fill="none" stroke="${p.accent}" stroke-width="1.2" opacity=".55"/>`}
  </g>`;
}

function hydra(spec, p) {
  const heads = [26, 36, 46, 56, 66];
  return `<g>
    ${aura(spec)}
    <path d="M13 69 C17 52 37 45 61 51 C78 55 84 69 72 82 C59 95 31 91 16 79 C12 76 11 72 13 69 Z" fill="#166534" stroke="${p.dark}" stroke-width="2"/>
    ${heads.map((x, i) => `<path d="M${x} 55 C${x - 6 + i} 39 ${x - 4} 27 ${x + 4} 17" fill="none" stroke="#15803d" stroke-width="5" stroke-linecap="round"/><path d="M${x} 18 C${x + 6} 8 ${x + 17} 11 ${x + 18} 21 C${x + 11} 27 ${x + 4} 26 ${x} 18 Z" fill="#22c55e" stroke="${p.dark}" stroke-width="1.2"/><circle cx="${x + 9}" cy="19" r="1.5" fill="#fef3c7"/><path d="M${x + 14} 14 L${x + 18} 6 M${x + 5} 13 L${x + 1} 6" stroke="${p.accent}" stroke-width="1.6" stroke-linecap="round"/>`).join("\n")}
    <path d="M25 66 C42 59 63 62 77 73" fill="none" stroke="${p.accent}" stroke-width="2" opacity=".65"/>
    <path d="M24 78 L18 92 M43 81 L40 93 M68 78 L75 91" stroke="#14532d" stroke-width="4" stroke-linecap="round"/>
  </g>`;
}

function dendroid(spec, p) {
  return `<g>
    ${aura(spec)}
    <path d="M36 84 C30 65 33 44 41 26 L55 26 C64 44 67 65 60 84 C53 92 43 92 36 84 Z" fill="#6b3f1d" stroke="#2f1b12" stroke-width="2"/>
    <path d="M43 28 C34 19 29 10 25 0 M54 28 C64 18 70 9 75 0 M49 27 C50 16 50 7 50 -3" fill="none" stroke="#4d2f18" stroke-width="6" stroke-linecap="round"/>
    <path d="M25 1 L16 14 M25 1 L35 11 M75 1 L84 14 M75 1 L64 12 M50 -2 L41 12 M50 -2 L60 12" stroke="${p.accent}" stroke-width="3" stroke-linecap="round"/>
    <path d="M35 40 C43 35 55 36 63 43 M36 56 C45 50 57 52 64 60" fill="none" stroke="#a16207" stroke-width="2"/>
    <circle cx="43" cy="40" r="2.5" fill="#fef3c7"/><circle cx="55" cy="40" r="2.5" fill="#fef3c7"/>
    <path d="M40 51 H59" stroke="#1f1408" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M35 64 C21 64 16 55 20 46 M61 64 C76 63 81 54 75 45" fill="none" stroke="#4d2f18" stroke-width="6" stroke-linecap="round"/>
    <path d="M35 84 L26 93 M60 84 L69 93 M48 86 L48 95" stroke="#3f2a14" stroke-width="5" stroke-linecap="round"/>
  </g>`;
}

function beholder(spec, p) {
  const stalks = [[29, 30, 15, 14], [39, 26, 34, 7], [49, 25, 51, 6], [58, 29, 72, 13], [64, 37, 84, 27]];
  return `<g>
    ${aura(spec)}
    ${stalks.map(([x, y, tx, ty]) => `<path d="M${x} ${y} Q${(x + tx) / 2} ${y - 18} ${tx} ${ty}" fill="none" stroke="${p.secondary}" stroke-width="4" stroke-linecap="round"/><circle cx="${tx}" cy="${ty}" r="6" fill="#f8fafc" stroke="${p.dark}" stroke-width="1.2"/><circle cx="${tx}" cy="${ty}" r="2.3" fill="${p.accent}"/>`).join("\n")}
    <ellipse cx="48" cy="56" rx="30" ry="32" fill="${p.main}" stroke="${p.dark}" stroke-width="2"/>
    <ellipse cx="48" cy="51" rx="16" ry="13" fill="#f8fafc" stroke="${p.dark}" stroke-width="1.5"/>
    <circle cx="48" cy="51" r="6.5" fill="${p.accent}"/><circle cx="48" cy="51" r="2.7" fill="#111827"/>
    <path d="M35 72 Q48 81 64 72" fill="none" stroke="#111827" stroke-width="2"/>
    <path d="M27 60 C11 54 12 41 28 37 M68 60 C85 54 84 41 68 37" fill="none" stroke="${p.secondary}" stroke-width="4" stroke-linecap="round"/>
  </g>`;
}

function serpent(spec, p, id) {
  const medusa = spec.file === "medusa";
  return `<g>
    ${aura(spec)}
    <path d="M37 68 C52 72 72 67 76 82 C62 92 39 92 27 82 C37 80 45 75 37 68 Z" fill="${p.dark}" stroke="${p.dark}" stroke-width="1.4"/>
    <path d="M24 77 C36 56 48 48 62 32 C76 48 69 68 54 79 C44 87 32 86 24 77 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="2"/>
    <path d="M37 35 Q39 23 50 22 Q61 23 62 35 L60 57 Q50 64 39 57 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="1.7"/>
    ${motif(spec, p, 49, 47, 0.8)}
    <ellipse cx="50" cy="17" rx="9" ry="9" fill="${p.skin}" stroke="${p.dark}" stroke-width="1.4"/>
    ${headgear(spec, p, 50, 15)}
    ${medusa ? `<path d="M43 18 C35 10 44 6 47 14 M57 18 C65 10 56 6 53 14" fill="none" stroke="${p.accent}" stroke-width="2"/>` : ""}
    <path d="M32 40 Q20 48 22 63 L31 61 Q31 50 39 42 Z M62 40 Q76 48 73 63 L64 61 Q64 50 56 42 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="1.4"/>
    ${weapon(spec, p, id, 73, 50)}
    <path d="M34 66 C47 61 61 64 72 72" fill="none" stroke="${p.accent}" stroke-width="1.6" opacity=".65"/>
  </g>`;
}

function genie(spec, p, id) {
  return `<g>
    ${aura(spec)}
    ${spec.wings ? wings(spec, p, id) : ""}
    <path d="M34 67 C47 69 61 68 71 78 C58 92 33 91 22 80 C32 79 41 74 34 67 Z" fill="${p.secondary}" opacity=".75"/>
    <path d="M27 78 C37 65 42 56 38 43 C44 51 55 51 62 43 C57 57 59 66 70 78 C57 84 40 84 27 78 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="1.8"/>
    <path d="M36 34 Q39 24 50 23 Q61 24 64 34 L62 54 Q50 61 38 54 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="1.7"/>
    ${motif(spec, p, 50, 45, 0.75)}
    <ellipse cx="50" cy="18" rx="9" ry="9" fill="${p.skin}" stroke="${p.dark}" stroke-width="1.4"/>
    ${headgear(spec, p, 50, 16)}
    <path d="M37 39 Q24 45 22 60 M63 39 Q76 45 78 60" fill="none" stroke="url(#${id}-body)" stroke-width="6" stroke-linecap="round"/>
    ${weapon(spec, p, id, 72, 48)}
  </g>`;
}

function hound(spec, p) {
  return `<g>
    ${aura(spec)}
    <path d="M12 68 C12 52 31 46 56 49 C75 52 84 63 78 77 C70 91 43 92 22 80 C15 76 11 72 12 68 Z" fill="${p.dark}" stroke="#090909" stroke-width="2"/>
    <path d="M58 49 C62 35 76 32 84 42 C89 48 82 57 70 58 C65 53 62 50 58 49 Z" fill="${p.main}" stroke="#090909" stroke-width="1.7"/>
    <path d="M67 41 L67 27 L76 39 M80 44 L91 36 L87 50" fill="${p.accent}" stroke="#090909" stroke-width="1"/>
    <circle cx="75" cy="47" r="2" fill="#fef08a"/>
    <path d="M71 58 L69 66 L75 62 M82 57 L84 65 L78 62" fill="#f8fafc"/>
    <path d="M20 76 L15 91 M39 80 L37 93 M67 77 L74 91" stroke="#190909" stroke-width="4" stroke-linecap="round"/>
    <path d="M12 68 C0 63 2 50 16 47" fill="none" stroke="#190909" stroke-width="4" stroke-linecap="round"/>
    <path d="M26 49 L31 37 L37 49 M45 48 L51 35 L57 49" fill="${p.accent}" opacity=".85"/>
  </g>`;
}

function lizard(spec, p) {
  return `<g>
    ${aura(spec)}
    <path d="M13 69 C14 53 33 46 58 49 C77 52 85 65 77 78 C67 93 39 92 20 81 C13 77 11 73 13 69 Z" fill="${p.main}" stroke="${p.dark}" stroke-width="2"/>
    <path d="M60 49 C65 36 80 33 88 42 C92 48 86 57 73 58 C68 53 64 50 60 49 Z" fill="${p.light}" stroke="${p.dark}" stroke-width="1.6"/>
    <path d="M27 48 L31 36 L36 49 M43 47 L48 34 L53 49 M60 49 L65 38 L70 50" fill="${p.accent}" stroke="${p.dark}" stroke-width=".8"/>
    <circle cx="77" cy="46" r="2.5" fill="#fef08a"/><circle cx="77" cy="46" r=".9" fill="#111827"/>
    <path d="M23 77 L18 91 M43 81 L40 93 M68 78 L75 91" stroke="${p.dark}" stroke-width="4" stroke-linecap="round"/>
    <path d="M75 75 C90 79 86 91 69 88 C78 84 81 78 73 76 Z" fill="${p.dark}"/>
    <path d="M24 60 C42 54 62 57 78 66" fill="none" stroke="${p.accent}" stroke-width="1.8" opacity=".65"/>
  </g>`;
}

function gorgon(spec, p) {
  return `<g>
    ${aura(spec)}
    <path d="M13 68 C15 52 33 45 57 50 C75 53 83 66 75 79 C64 94 36 91 18 81 C13 77 11 72 13 68 Z" fill="#475569" stroke="${p.dark}" stroke-width="2"/>
    <path d="M56 49 C60 34 76 32 86 43 C91 49 84 59 70 59 C65 54 61 50 56 49 Z" fill="#64748b" stroke="${p.dark}" stroke-width="1.7"/>
    <path d="M66 41 Q62 27 72 22 M79 42 Q92 31 88 22" fill="none" stroke="#e5e7eb" stroke-width="3" stroke-linecap="round"/>
    <circle cx="74" cy="47" r="2" fill="#fef08a"/>
    <path d="M28 50 C43 44 61 49 73 61" fill="none" stroke="#94a3b8" stroke-width="2"/>
    ${motif({ motif: "scale" }, p, 50, 62, 0.75)}
    <path d="M24 77 L18 91 M44 81 L41 93 M67 77 L74 91" stroke="#334155" stroke-width="4" stroke-linecap="round"/>
  </g>`;
}

function roc(spec, p, id) {
  return `<g>
    <path d="M45 46 C24 9 6 19 6 55 C20 50 34 61 45 80 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="2"/>
    <path d="M52 46 C74 9 92 19 91 55 C77 50 63 61 52 80 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="2"/>
    <path d="M13 52 Q28 50 44 63 M85 52 Q70 50 52 63" stroke="${p.accent}" stroke-width="1.7"/>
    <path d="M35 47 C37 29 59 26 68 41 C75 55 66 78 49 85 C34 76 31 61 35 47 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="2"/>
    <path d="M52 34 C62 25 78 31 80 44 C72 39 65 41 58 49 Z" fill="#fef3c7" stroke="${p.dark}" stroke-width="1.4"/>
    <path d="M73 41 L88 45 L75 50 Z" fill="${p.accent}" stroke="${p.dark}" stroke-width="1"/>
    <circle cx="69" cy="39" r="1.6" fill="#111827"/>
    <path d="M41 83 L38 93 M57 83 L62 93" stroke="#7c2d12" stroke-width="4" stroke-linecap="round"/>
  </g>`;
}

function manticore(spec, p, id) {
  return `<g>
    ${aura(spec)}
    <path d="M40 47 C23 17 9 25 10 54 C23 48 32 54 42 70 Z M55 47 C72 17 86 25 86 54 C73 48 64 54 54 70 Z" fill="${p.secondary}" stroke="${p.dark}" stroke-width="2"/>
    <path d="M14 67 C16 51 35 44 57 48 C75 52 82 66 74 80 C64 93 38 92 20 80 C15 76 12 72 14 67 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="2"/>
    <path d="M58 48 C63 35 76 31 86 42 C90 48 84 56 72 58 C66 52 62 49 58 48 Z" fill="${p.accent}" stroke="${p.dark}" stroke-width="1.5"/>
    <path d="M73 40 L78 27 M84 44 L93 35" stroke="#f8fafc" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="75" cy="46" r="1.8" fill="#111827"/>
    <path d="M22 77 L16 91 M42 81 L39 93 M67 77 L74 91" stroke="${p.secondary}" stroke-width="4" stroke-linecap="round"/>
    <path d="M73 73 C91 69 92 86 77 91 C78 82 72 78 63 79 Z" fill="${p.secondary}" stroke="${p.dark}" stroke-width="1.2"/>
    <path d="M85 72 L93 64" stroke="${p.accent}" stroke-width="3" stroke-linecap="round"/>
  </g>`;
}

function behemoth(spec, p, id) {
  return `<g>
    ${aura(spec)}
    <path d="M30 77 L25 92 H39 L42 78 Z M57 78 L62 92 H76 L68 77 Z" fill="${p.dark}" stroke="#090909" stroke-width="1"/>
    <path d="M20 42 Q25 24 47 22 Q73 25 78 47 L73 78 Q49 88 23 78 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="2.4"/>
    <path d="M28 47 C41 39 61 40 73 51" fill="none" stroke="${p.accent}" stroke-width="2" opacity=".7"/>
    <path d="M31 25 Q29 11 47 9 Q66 11 64 27 Q48 37 31 25 Z" fill="${p.light}" stroke="${p.dark}" stroke-width="2"/>
    <path d="M33 20 Q22 7 28 1 Q34 11 39 20 M60 20 Q73 7 67 1 Q61 11 55 20" fill="${p.accent}" stroke="${p.dark}" stroke-width="1"/>
    <circle cx="41" cy="24" r="2" fill="#111827"/><circle cx="54" cy="24" r="2" fill="#111827"/>
    <path d="M18 48 Q5 65 15 82 L27 77 Q24 62 31 49 Z M79 48 Q94 65 82 82 L70 77 Q74 62 66 49 Z" fill="${p.main}" stroke="${p.dark}" stroke-width="2"/>
    <path d="M12 83 Q17 74 24 81 M75 82 Q82 73 89 81" fill="none" stroke="#f8fafc" stroke-width="3" stroke-linecap="round"/>
    ${motif({ motif: "claw" }, p, 49, 56, 1)}
  </g>`;
}

function golem(spec, p, id) {
  return `<g>
    ${aura(spec)}
    <path d="M27 73 L24 90 H40 L42 73 Z M55 73 L57 90 H73 L69 73 Z" fill="#475569" stroke="${p.dark}" stroke-width="1"/>
    <path d="M22 38 L32 24 H64 L75 40 L70 75 Q48 84 25 75 Z" fill="#94a3b8" stroke="${p.dark}" stroke-width="2"/>
    <path d="M35 35 H61 L58 60 H38 Z" fill="url(#${id}-body)" opacity=".35"/>
    ${motif(spec, p, 49, 50, 0.9)}
    <path d="M32 24 L38 11 H58 L64 24 Z" fill="#cbd5e1" stroke="${p.dark}" stroke-width="2"/>
    <circle cx="42" cy="22" r="2" fill="${p.accent}"/><circle cx="54" cy="22" r="2" fill="${p.accent}"/>
    <path d="M22 42 Q9 55 16 76 L28 71 Q25 58 32 45 Z M74 42 Q88 55 80 76 L68 71 Q72 58 64 45 Z" fill="#64748b" stroke="${p.dark}" stroke-width="2"/>
    ${weapon(spec, p, id, 75, 50)}
  </g>`;
}

function ghost(spec, p, id) {
  return `<g>
    ${aura(spec)}
    <path d="M24 36 Q30 20 48 18 Q66 20 72 36 L75 83 Q68 76 61 86 Q54 75 48 88 Q41 75 34 86 Q29 76 21 83 Z" fill="url(#${id}-body)" stroke="${p.dark}" stroke-width="2" opacity=".9"/>
    <path d="M33 32 Q48 21 63 32 Q55 28 48 30 Q41 28 33 32 Z" fill="${p.dark}" opacity=".55"/>
    <ellipse cx="48" cy="24" rx="10" ry="11" fill="#d8d1bd" stroke="${p.dark}" stroke-width="1.3"/>
    <circle cx="44" cy="24" r="1.8" fill="${p.accent}"/><circle cx="52" cy="24" r="1.8" fill="${p.accent}"/>
    ${headgear(spec, p, 48, 20)}
    ${motif(spec, p, 48, 50, 0.9)}
    <path d="M29 45 Q14 54 18 70 M67 45 Q82 54 78 70" fill="none" stroke="${p.light}" stroke-width="4" stroke-linecap="round" opacity=".75"/>
  </g>`;
}

function serpentFly(spec, p) {
  return `<g>
    ${aura(spec)}
    <path d="M41 42 C13 8 1 31 21 64 C33 61 39 52 41 42 Z" fill="#67e8f9" opacity=".55" stroke="${p.dark}" stroke-width="1.4"/>
    <path d="M55 42 C83 8 95 31 75 64 C63 61 57 52 55 42 Z" fill="#67e8f9" opacity=".55" stroke="${p.dark}" stroke-width="1.4"/>
    <path d="M48 22 C60 38 61 70 48 88 C35 70 36 38 48 22 Z" fill="${p.main}" stroke="${p.dark}" stroke-width="2"/>
    <path d="M48 22 C39 17 39 5 48 1 C57 5 57 17 48 22 Z" fill="${p.light}" stroke="${p.dark}" stroke-width="1.4"/>
    <circle cx="44" cy="12" r="1.8" fill="#fef3c7"/><circle cx="52" cy="12" r="1.8" fill="#fef3c7"/>
    <path d="M43 2 L35 -7 M53 2 L61 -7" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>
    <path d="M48 38 C42 49 43 64 48 78 C53 64 54 49 48 38 Z" fill="${p.accent}" opacity=".55"/>
  </g>`;
}

function unitBody(spec, p, id) {
  switch (spec.kind) {
    case "mounted": return mounted(spec, p, id);
    case "griffin": return griffin(spec, p, id);
    case "equine": return equine(spec, p);
    case "dragon": return dragon(spec, p, id);
    case "hydra": return hydra(spec, p);
    case "dendroid": return dendroid(spec, p);
    case "beholder": return beholder(spec, p);
    case "serpent": return serpent(spec, p, id);
    case "genie": return genie(spec, p, id);
    case "hound": return hound(spec, p);
    case "lizard": return lizard(spec, p);
    case "gorgon": return gorgon(spec, p);
    case "roc": return roc(spec, p, id);
    case "manticore": return manticore(spec, p, id);
    case "behemoth": return behemoth(spec, p, id);
    case "golem": return golem(spec, p, id);
    case "ghost": return ghost(spec, p, id);
    case "serpent-fly": return serpentFly(spec, p);
    case "caster": return caster(spec, p, id);
    case "undead": return humanoid({ ...spec, kind: "undead" }, p, id);
    default: return humanoid(spec, p, id);
  }
}

function unitSvg(spec) {
  const p = palettes[spec.faction] ?? palettes.neutral;
  const id = idFrom(`unit-${spec.file}`);
  return svg({
    title: spec.title,
    desc: `Sprite d'unité ${spec.title}. Le dessin reprend la silhouette de ${spec.file.replace(/_/g, " ")}.`,
    id,
    defs: unitDefs(id, p),
    body: `<ellipse cx="49" cy="89" rx="33" ry="5" fill="#000" opacity=".28"/>
  ${unitBody(spec, p, id)}`,
  });
}

function townSvg(spec) {
  const p = palettes[spec.faction];
  const id = idFrom(spec.file);
  const extras = {
    rampart: `<path d="M20 54 C16 35 32 23 48 21 C67 19 79 34 77 52 C61 44 39 45 20 54 Z" fill="${p.main}" stroke="${p.dark}" stroke-width="2"/><path d="M31 31 C43 37 58 35 68 45" fill="none" stroke="${p.accent}" stroke-width="2"/>`,
    tower: `<path d="M48 3 L56 17 L48 31 L40 17 Z" fill="${p.accent}" stroke="#f5ffff" stroke-width="2"/><path d="M48 30 V2" stroke="${p.dark}" stroke-width="2"/>`,
    inferno: `<path d="M39 78 C38 66 48 60 45 49 C57 60 53 69 58 78 Z" fill="${p.secondary}" opacity=".8"/><path d="M28 42 L22 19 L34 38 M65 42 L73 19 L62 38" fill="${p.secondary}" stroke="${p.accent}" stroke-width="1.5"/>`,
    necropolis: `<ellipse cx="48" cy="52" rx="11" ry="10" fill="${p.accent}" stroke="${p.dark}" stroke-width="2"/><circle cx="44" cy="51" r="2" fill="${p.dark}"/><circle cx="52" cy="51" r="2" fill="${p.dark}"/><path d="M44 58 H52" stroke="${p.dark}" stroke-width="2"/>`,
    dungeon: `<path d="M48 41 L60 55 L48 70 L36 55 Z" fill="${p.main}" stroke="${p.accent}" stroke-width="2"/><path d="M23 27 L12 15 M73 27 L85 15" stroke="${p.accent}" stroke-width="3" stroke-linecap="round"/>`,
    stronghold: `<path d="M37 39 C25 38 20 28 18 14 M59 39 C72 38 77 28 79 14" fill="none" stroke="#f3dfb6" stroke-width="4" stroke-linecap="round"/><path d="M48 44 L58 57 H38 Z" fill="${p.accent}" stroke="${p.dark}" stroke-width="2"/>`,
    fortress: `<path d="M29 34 C18 48 20 62 25 74 M68 34 C79 48 77 62 72 74" fill="none" stroke="${p.secondary}" stroke-width="4" stroke-linecap="round"/><path d="M48 45 C56 52 55 62 48 69 C41 62 40 52 48 45 Z" fill="${p.accent}" stroke="${p.dark}" stroke-width="2"/>`,
    castle: `<path d="M43 47 H53 V58 H43 Z" fill="${p.main}" stroke="${p.accent}" stroke-width="2"/><path d="M48 49 V57 M44 53 H52" stroke="#fff7ad" stroke-width="1.8"/>`,
  }[spec.architecture] ?? "";
  const body = `<ellipse cx="48" cy="82" rx="38" ry="10" fill="#000" opacity=".28"/>
  ${extras}
  <path d="M19 48 H77 V78 H19 Z" fill="${p.main}" stroke="${p.dark}" stroke-width="3"/>
  <path d="M14 39 H33 V78 H14 Z M63 39 H82 V78 H63 Z" fill="${p.light}" stroke="${p.dark}" stroke-width="3" opacity=".82"/>
  <path d="M34 31 H62 V78 H34 Z" fill="${p.secondary}" stroke="${p.dark}" stroke-width="3"/>
  <path d="M13 39 L24 17 L35 39 Z M61 39 L72 17 L83 39 Z M32 31 L48 5 L64 31 Z" fill="${p.accent}" stroke="${p.dark}" stroke-width="3"/>
  <path d="M20 48 V39 H28 V48 H36 V39 H44 V48 H52 V39 H60 V48 H68 V39 H76 V48" fill="none" stroke="${p.dark}" stroke-width="3"/>
  <path d="M26 56 H34 M42 47 H51 M57 49 H66 M65 59 H75 M24 67 H35 M51 64 H64" stroke="${p.light}" stroke-width="3" stroke-linecap="round" opacity=".8"/>
  <path d="M39 78 V62 C39 53 57 53 57 62 V78 Z" fill="#18110d" stroke="#090706" stroke-width="3"/>
  <path d="M44 65 V78 M52 65 V78 M39 70 H57" stroke="${p.secondary}" stroke-width="1.8"/>`;
  return svg({ title: spec.title, desc: `Sprite de ville sur la carte, avec silhouette et détails propres à sa faction : ${spec.title}.`, id, width: 96, height: 96, body });
}

function heroSvg(spec) {
  const p = palettes[spec.faction];
  const id = idFrom(spec.file);
  return svg({
    title: spec.title,
    desc: `Sprite de héros sur la carte, avec monture et équipement de faction : ${spec.title}.`,
    id,
    width: 80,
    height: 80,
    defs: unitDefs(id, p),
    body: `<g transform="translate(-8 -13) scale(.98)">
      ${mounted({ ...spec, kind: "mounted", motif: spec.faction === "castle" ? "cross" : spec.faction === "rampart" ? "leaf" : spec.faction === "tower" ? "rune" : spec.faction === "inferno" ? "flame" : spec.faction === "necropolis" ? "skull" : spec.faction === "dungeon" ? "gem" : spec.faction === "stronghold" ? "fang" : "scale" }, p, id)}
    </g>`,
  });
}

function resourceSvg(spec) {
  const id = idFrom(`resource-${spec.file}`);
  let body = "";
  if (spec.kind === "gold") body = `<ellipse cx="24" cy="40" rx="17" ry="5" fill="#000" opacity=".25"/><ellipse cx="19" cy="30" rx="12" ry="6" fill="#d89a17" stroke="#7c4a03" stroke-width="2"/><ellipse cx="29" cy="25" rx="12" ry="6" fill="#f2c94c" stroke="#9b6405" stroke-width="2"/><ellipse cx="21" cy="18" rx="13" ry="6" fill="#ffd166" stroke="#b7791f" stroke-width="2"/><path d="M15 17 H26 M20 13 V23 M31 21 L36 16" stroke="#fff3b0" stroke-width="1.8" stroke-linecap="round"/><circle cx="33" cy="33" r="4" fill="#facc15" stroke="#9b6405" stroke-width="1.5"/>`;
  if (spec.kind === "wood") body = `<ellipse cx="24" cy="40" rx="17" ry="5" fill="#000" opacity=".25"/><path d="M11 28 H39 C44 28 44 38 39 38 H11 C6 38 6 28 11 28 Z" fill="#8b4513" stroke="#3d1f0a" stroke-width="2.5"/><path d="M8 18 H36 C41 18 41 28 36 28 H8 C3 28 3 18 8 18 Z" fill="#6f3510" stroke="#3d1f0a" stroke-width="2.5"/><circle cx="11" cy="23" r="5" fill="#b87333" stroke="#ffd0a0" stroke-width="1.7"/><circle cx="14" cy="33" r="5" fill="#c07a38" stroke="#ffd0a0" stroke-width="1.7"/><path d="M18 21 H34 M21 32 H37 M10 23 Q13 20 16 23 M13 33 Q16 30 19 33" stroke="#d69a5a" stroke-width="1.7" stroke-linecap="round"/>`;
  if (spec.kind === "ore") body = `<ellipse cx="24" cy="40" rx="17" ry="5" fill="#000" opacity=".25"/><path d="M8 35 L15 16 L27 9 L41 21 L37 38 Z" fill="#7b8794" stroke="#30363d" stroke-width="2.5"/><path d="M15 16 H28 L22 38 H8 Z" fill="#a7b0ba" opacity=".75"/><path d="M28 9 V24 L41 21 M22 38 L28 24 M15 16 L22 38" stroke="#4b5563" stroke-width="1.8"/><path d="M17 17 L25 13 M30 22 L37 20" stroke="#edf2f7" stroke-width="1.8" stroke-linecap="round"/><path d="M18 29 Q23 25 28 29 M31 33 Q34 29 38 31" fill="none" stroke="#e07030" stroke-width="1.8"/>`;
  if (spec.kind === "mercury") body = `<ellipse cx="24" cy="40" rx="15" ry="5" fill="#000" opacity=".25"/><path d="M19 8 H29 V20 H19 Z" fill="#ddd6fe" stroke="#fff" stroke-width="2"/><path d="M15 19 H33 L39 36 C40 42 8 42 9 36 Z" fill="#a855f7" stroke="#4c1d95" stroke-width="2.5"/><path d="M12 31 C19 35 29 35 37 30 L39 36 C40 42 8 42 9 36 Z" fill="#d8d8e8" opacity=".9"/><path d="M18 24 C23 26 29 26 34 24 M21 12 H27" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><circle cx="29" cy="33" r="3" fill="#f5f5ff" opacity=".9"/>`;
  if (spec.kind === "crystals") body = `<ellipse cx="24" cy="40" rx="16" ry="5" fill="#000" opacity=".25"/><path d="M24 4 L36 17 L31 39 H17 L12 17 Z" fill="#22d3ee" stroke="#075985" stroke-width="2.5"/><path d="M24 4 V39 M12 17 H36 M17 39 L24 17 L31 39" stroke="#0891b2" stroke-width="1.7"/><path d="M18 16 L24 8 L32 17" stroke="#ecfeff" stroke-width="1.8" stroke-linecap="round"/><path d="M9 25 L15 14 L20 39 H10 Z" fill="#67e8f9" stroke="#0e7490" stroke-width="2"/><path d="M38 27 L43 18 L43 39 H34 Z" fill="#0ea5e9" stroke="#075985" stroke-width="1.8"/>`;
  if (spec.kind === "gems") body = `<ellipse cx="24" cy="40" rx="16" ry="5" fill="#000" opacity=".25"/><path d="M12 17 L20 8 H32 L40 17 L34 38 H18 Z" fill="#fb7185" stroke="#881337" stroke-width="2.5" stroke-linejoin="round"/><path d="M20 8 L24 17 L32 8 M12 17 H40 M18 38 L24 17 L34 38" fill="none" stroke="#be123c" stroke-width="1.7" stroke-linejoin="round"/><path d="M18 16 L22 11 H30 L36 17" fill="none" stroke="#ffe4e6" stroke-width="1.8" stroke-linecap="round"/><path d="M8 28 L14 20 L21 38 H10 Z" fill="#f9a8d4" stroke="#9d174d" stroke-width="2" stroke-linejoin="round"/><path d="M37 27 L43 19 L42 38 H32 Z" fill="#e11d48" stroke="#881337" stroke-width="1.8" stroke-linejoin="round"/><circle cx="28" cy="24" r="3" fill="#fff1f2" opacity=".8"/>`;
  if (spec.kind === "sulfur") body = `<ellipse cx="24" cy="40" rx="16" ry="5" fill="#000" opacity=".25"/><path d="M9 32 C9 24 15 21 20 23 C23 14 35 14 38 23 C45 23 47 29 43 35 C38 43 13 43 9 32 Z" fill="#facc15" stroke="#854d0e" stroke-width="2.5"/><path d="M15 30 C22 34 33 35 41 30" stroke="#fff3b0" stroke-width="1.8" stroke-linecap="round"/><path d="M19 18 C15 13 25 11 20 5 M30 18 C27 13 37 10 31 4" stroke="#d97706" stroke-width="1.8" stroke-linecap="round" opacity=".75"/><path d="M17 22 L21 10 L25 23 M32 22 L36 12 L40 24" fill="#fff060" opacity=".5"/>`;
  return svg({ title: spec.title, desc: `Sprite de ressource ${spec.title}, avec formes et matières dédiées.`, id, width: 48, height: 48, body });
}

function buildingSvg(spec) {
  const id = idFrom(spec.file);
  const c1 = spec.c1;
  const c2 = spec.c2;
  const a = spec.accent;
  let detail = "";
  if (spec.kind === "mine") detail = `<path d="M21 54 V42 Q32 28 43 42 V54 Z" fill="#120e06"/><path d="M19 41 H45 M20 41 V55 M44 41 V55" stroke="#7a5220" stroke-width="3" stroke-linecap="round"/><ellipse cx="32" cy="51" rx="8" ry="4" fill="${a}" opacity=".65"/><circle cx="13" cy="50" r="4" fill="${a}" stroke="#c8900a" stroke-width="1"/><path d="M47 28 L56 18 M55 18 L62 12 M55 18 L49 13" stroke="#5a4a38" stroke-width="2.3" stroke-linecap="round"/>`;
  if (spec.kind === "sawmill") detail = `<rect x="10" y="31" width="29" height="22" rx="2" fill="${c1}" stroke="${c2}" stroke-width="1.5"/><path d="M8 31 L24 16 L44 31 Z" fill="#a06830" stroke="${c2}" stroke-width="1.5"/><circle cx="39" cy="35" r="13" fill="#c0c8d0" stroke="#708090" stroke-width="1.6"/><circle cx="39" cy="35" r="4" fill="#a0a8b0"/><path d="M39 22 L42 28 L36 28 Z M52 35 L46 38 V32 Z M39 48 L36 42 H42 Z M26 35 L32 32 V38 Z" fill="#506070"/><path d="M48 44 H59 V54 H48 Z" fill="#7a4a20" stroke="${c2}" stroke-width="1.2"/><ellipse cx="54" cy="44" rx="6" ry="3" fill="#9a6a38" stroke="${c2}"/>`;
  if (spec.kind === "pit") detail = `<ellipse cx="32" cy="42" rx="23" ry="12" fill="#807060" stroke="${c2}" stroke-width="1.6"/><ellipse cx="32" cy="44" rx="16" ry="8" fill="#585040" stroke="#383828" stroke-width="1"/><ellipse cx="32" cy="45" rx="10" ry="5" fill="#1a1810"/><path d="M14 42 Q19 36 25 40 M50 40 Q45 36 39 40 M16 47 Q22 42 28 45 M48 47 Q43 42 37 45" fill="none" stroke="${a}" stroke-width="2"/><path d="M20 23 L39 35 M44 23 L25 35" stroke="#5a4a38" stroke-width="2.5"/><path d="M18 20 L16 16 L23 14 L25 18 M46 20 L44 16 L51 16 L49 20" fill="#b0a090" stroke="#5a4a38" stroke-width="1"/>`;
  if (spec.kind === "lab") detail = `<rect x="18" y="38" width="28" height="18" rx="2" fill="${c1}" stroke="${c2}" stroke-width="1.4"/><rect x="22" y="22" width="20" height="18" rx="2" fill="#5a3a7a" stroke="${c2}" stroke-width="1.2"/><path d="M32 4 L24 14 H40 Z" fill="#3a1a5a" stroke="${c2}" stroke-width="1.2"/><path d="M40 43 L46 53 Q50 59 44 59 Q38 59 38 53 L44 43 Z" fill="#d0d0ff" fill-opacity=".22" stroke="#9090e0" stroke-width="1.5"/><rect x="42" y="34" width="4" height="10" rx="2" fill="#b0b0d8" stroke="#8080c0"/><ellipse cx="44" cy="55" rx="5.5" ry="3" fill="${a}"/><circle cx="45" cy="50" r="1.5" fill="none" stroke="#e8eeff"/><path d="M32 4 Q27 -1 30 -4 M34 4 Q39 -1 36 -5" fill="none" stroke="#c080ff" stroke-width="1.5" opacity=".6"/>`;
  if (spec.kind === "cavern") detail = `<path d="M10 54 L32 26 L54 54 Z" fill="${c1}" stroke="${c2}" stroke-width="1.2"/><path d="M20 56 V44 Q32 30 44 44 V56 Z" fill="#0a1418"/><ellipse cx="32" cy="52" rx="10" ry="5" fill="${a}" opacity=".25"/><path d="M32 12 L27 44 H37 Z M14 44 L10 58 H18 Z M50 44 L46 58 H54 Z M45 42 L42 55 H49 Z M18 42 L15 55 H22 Z" fill="${a}" stroke="#00a0b8" stroke-width="1"/><path d="M32 12 V44 M14 44 V58 M50 44 V58" stroke="#80ffff" stroke-width="1" opacity=".55"/><circle cx="32" cy="14" r="2" fill="#fff" opacity=".85"/>`;
  if (spec.kind === "pond") detail = `<path d="M8 48 C12 35 22 29 32 29 C43 29 54 36 56 49 C49 57 17 57 8 48 Z" fill="${c1}" stroke="${c2}" stroke-width="2"/><ellipse cx="32" cy="47" rx="20" ry="8" fill="${a}" opacity=".85" stroke="#9d174d" stroke-width="1.5"/><path d="M16 46 C23 50 40 50 49 45" fill="none" stroke="#ffe4e6" stroke-width="1.8" stroke-linecap="round" opacity=".85"/><path d="M17 30 L22 17 L28 32 Z" fill="#fb7185" stroke="#881337" stroke-width="1.5" stroke-linejoin="round"/><path d="M31 26 L38 10 L45 31 Z" fill="#f9a8d4" stroke="#9d174d" stroke-width="1.6" stroke-linejoin="round"/><path d="M45 35 L51 22 L56 41 Z" fill="#e11d48" stroke="#881337" stroke-width="1.5" stroke-linejoin="round"/><path d="M22 17 L23 31 M38 10 L38 31 M51 22 L51 41" stroke="#fff1f2" stroke-width="1" opacity=".7"/><path d="M20 53 C27 56 40 56 47 52" fill="none" stroke="#6d283d" stroke-width="2" stroke-linecap="round" opacity=".7"/>`;
  if (spec.kind === "dune") detail = `<path d="M8 54 L32 20 L56 54 Z" fill="${c1}" stroke="${c2}" stroke-width="1.2"/><path d="M22 48 Q27 42 29 46 M36 44 Q40 38 43 44 M30 52 Q32 48 35 52" fill="none" stroke="#e04800" stroke-width="1.5"/><path d="M32 10 L26 42 H38 Z M14 40 L10 54 H18 Z M50 38 L46 53 H54 Z M18 38 L15 52 H22 Z M46 36 L43 51 H50 Z" fill="${a}" stroke="#a09000" stroke-width="1"/><path d="M24 36 Q22 28 24 22 Q27 16 24 10 M40 34 Q43 26 40 20 Q37 14 40 8" fill="none" stroke="#f0f0c0" stroke-width="1.7" opacity=".55"/>`;
  const base = `<ellipse cx="32" cy="59" rx="23" ry="4" fill="#000" opacity=".25"/><ellipse cx="32" cy="54" rx="26" ry="8" fill="${c1}" stroke="${c2}" stroke-width="1.2"/>${detail}`;
  return svg({ title: spec.title, desc: `Sprite de bâtiment sur la carte, avec détails liés à la ressource : ${spec.title}.`, id, width: 64, height: 64, body: base });
}

function decorSvg(spec) {
  const id = idFrom(spec.file);
  const body = decorBody(spec.kind);
  return svg({
    title: spec.title,
    desc: `Sprite de décor de carte : ${spec.title}.`,
    id,
    width: 64,
    height: 64,
    body,
  });
}

function adventureObjectSvg(spec) {
  const id = idFrom(`adventure-${spec.file}`);
  const hue = hashText(spec.file);
  const c1 = hsl(hue, 58, 52);
  const c2 = hsl((hue + 38) % 360, 46, 28);
  const accent = hsl((hue + 165) % 360, 72, 62);
  const shadow = `<ellipse cx="32" cy="58" rx="22" ry="5" fill="#000" opacity=".25"/>`;
  const base = `<path d="M10 51 L32 37 L54 51 L32 61 Z" fill="${c2}" opacity=".75"/><path d="M15 48 L32 37 L49 48 L32 57 Z" fill="${c1}" stroke="${c2}" stroke-width="2"/>`;
  let detail = "";
  if (spec.kind === "water") {
    detail = `<path d="M11 43 C18 34 27 31 33 35 C40 30 51 35 55 44 C47 52 20 53 11 43 Z" fill="#2563eb" stroke="#0f2d68" stroke-width="2"/><path d="M17 43 C25 47 40 47 49 42" fill="none" stroke="#bae6fd" stroke-width="2" stroke-linecap="round"/><path d="M32 11 L40 35 H24 Z" fill="${accent}" stroke="${c2}" stroke-width="2"/><path d="M32 12 V35" stroke="#fff" stroke-width="1.5" opacity=".55"/>`;
  } else if (spec.kind === "portal") {
    detail = `<ellipse cx="32" cy="36" rx="15" ry="24" fill="#111827" stroke="${c2}" stroke-width="4"/><ellipse cx="32" cy="36" rx="9" ry="17" fill="${accent}" opacity=".85"/><path d="M23 17 C30 9 40 12 43 21 M20 45 C27 55 40 55 45 44" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/><circle cx="32" cy="36" r="4" fill="#fff" opacity=".65"/>`;
  } else if (spec.kind === "bank") {
    detail = `<path d="M14 51 V28 L32 12 L50 28 V51 Z" fill="${c1}" stroke="${c2}" stroke-width="2"/><path d="M20 51 V38 Q32 27 44 38 V51 Z" fill="#111827"/><path d="M18 28 H46 M24 22 H40" stroke="${accent}" stroke-width="3" stroke-linecap="round"/><path d="M19 35 H25 M39 35 H45" stroke="#fff" stroke-width="2" opacity=".5"/>`;
  } else if (spec.kind === "knowledge") {
    detail = `<path d="M17 50 V20 L31 13 L47 20 V50 Z" fill="${c1}" stroke="${c2}" stroke-width="2"/><path d="M23 45 H41 V25 H23 Z" fill="#f8fafc" stroke="${c2}" stroke-width="1.5"/><path d="M32 25 V45 M26 31 H30 M34 31 H39 M26 37 H30 M34 37 H39" stroke="${c2}" stroke-width="1.3"/><path d="M32 8 L37 18 H27 Z" fill="${accent}" stroke="${c2}" stroke-width="1.5"/>`;
  } else if (spec.kind === "treasure") {
    detail = `<path d="M16 34 H48 V51 H16 Z" fill="${c1}" stroke="${c2}" stroke-width="2"/><path d="M16 35 C18 20 46 20 48 35 Z" fill="${accent}" stroke="${c2}" stroke-width="2"/><path d="M16 39 H48 M32 24 V51" stroke="${c2}" stroke-width="2"/><rect x="28" y="38" width="8" height="7" rx="1" fill="#fef3c7" stroke="${c2}"/>`;
  } else if (spec.kind === "spring") {
    detail = `<path d="M14 49 C14 36 22 28 32 28 C43 28 51 36 51 49 C43 56 22 56 14 49 Z" fill="${c1}" stroke="${c2}" stroke-width="2"/><ellipse cx="32" cy="47" rx="14" ry="6" fill="#7dd3fc" stroke="#075985" stroke-width="1.5"/><path d="M25 30 C24 20 34 18 32 8 M36 31 C42 24 38 18 44 12" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" opacity=".75"/>`;
  } else if (spec.kind === "service") {
    detail = `<path d="M13 50 V27 L32 15 L51 27 V50 Z" fill="${c1}" stroke="${c2}" stroke-width="2"/><path d="M18 28 H46 L42 21 H22 Z" fill="${accent}" stroke="${c2}" stroke-width="1.5"/><circle cx="25" cy="39" r="5" fill="#fef3c7" stroke="${c2}"/><circle cx="39" cy="39" r="5" fill="#dbeafe" stroke="${c2}"/><path d="M25 34 V44 M20 39 H30 M36 39 H42" stroke="${c2}" stroke-width="1.4"/>`;
  } else {
    detail = `<path d="M18 51 V31 L32 11 L46 31 V51 Z" fill="${c1}" stroke="${c2}" stroke-width="2"/><path d="M25 51 V38 Q32 31 39 38 V51 Z" fill="#111827"/><circle cx="32" cy="25" r="6" fill="${accent}" stroke="${c2}" stroke-width="1.5"/><path d="M32 17 V33 M24 25 H40" stroke="#fff" stroke-width="1.4" opacity=".5"/>`;
  }
  return svg({ title: spec.title, desc: `Sprite original d'objet d'aventure : ${spec.title}.`, id, width: 64, height: 64, body: `${shadow}${base}${detail}` });
}

function hashText(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

function hsl(h, s, l) {
  return `hsl(${h} ${s}% ${l}%)`;
}

function decorBody(kind) {
  const shadow = `<ellipse cx="32" cy="58" rx="22" ry="5" fill="#000" opacity=".24"/>`;
  if (kind === "wall-brick") return `${shadow}
  <path d="M10 40 L32 28 L54 40 L32 53 Z" fill="#1a1713" opacity=".28"/>
  <path d="M12 28 L32 16 L52 28 L32 40 Z" fill="#9a8a72" stroke="#2b241d" stroke-width="2"/>
  <path d="M12 28 L32 40 L32 56 L12 43 Z" fill="#5d5245" stroke="#2b241d" stroke-width="2"/>
  <path d="M52 28 L32 40 L32 56 L52 43 Z" fill="#443b32" stroke="#2b241d" stroke-width="2"/>
  <path d="M17 31 L27 25 M28 37 L38 31 M39 25 L49 31 M15 38 H30 M34 45 H49 M32 41 V55" stroke="#2f2923" stroke-width="1.2" opacity=".55"/>
  <path d="M16 24 L22 20 L28 24 L22 28 Z M28 17 L34 13 L40 17 L34 21 Z M40 24 L46 20 L52 24 L46 28 Z" fill="#b2a181" stroke="#2b241d" stroke-width="1.5"/>`;

  if (kind === "wall-vegetal") return `${shadow}
  <path d="M10 39 L32 22 L54 39 L32 55 Z" fill="#183016" opacity=".34"/>
  <path d="M12 28 L32 13 L52 28 L32 42 Z" fill="#5e913f" stroke="#173015" stroke-width="2"/>
  <path d="M12 28 L32 42 L32 56 L12 42 Z" fill="#335f2b" stroke="#173015" stroke-width="2"/>
  <path d="M52 28 L32 42 L32 56 L52 42 Z" fill="#244c24" stroke="#173015" stroke-width="2"/>
  <ellipse cx="21" cy="25" rx="10" ry="7" fill="#79b85a"/>
  <ellipse cx="34" cy="19" rx="12" ry="8" fill="#6aa34d"/>
  <ellipse cx="45" cy="26" rx="10" ry="7" fill="#83c25f"/>
  <ellipse cx="32" cy="31" rx="17" ry="9" fill="#4f823e"/>
  <path d="M17 35 C25 28 39 28 48 35 M22 24 C30 18 39 19 45 24" fill="none" stroke="#c4e79b" stroke-width="1.4" opacity=".48"/>
  <circle cx="24" cy="23" r="2" fill="#f5d76e"/><circle cx="43" cy="28" r="1.8" fill="#f7a8c8"/>`;

  if (kind === "tree-pine") return `${shadow}
  <path d="M29 47 H35 V58 H29 Z" fill="#6f421f" stroke="#3d2410" stroke-width="1.5"/>
  <path d="M32 5 L19 28 H45 Z" fill="#1f5a2d" stroke="#0d2d18" stroke-width="2"/>
  <path d="M32 15 L15 40 H49 Z" fill="#2f7a3b" stroke="#0d2d18" stroke-width="2"/>
  <path d="M32 27 L12 52 H52 Z" fill="#3f9148" stroke="#0d2d18" stroke-width="2"/>
  <path d="M27 21 L32 12 L37 21 M23 35 L32 24 L42 36 M20 47 L32 34 L45 47" fill="none" stroke="#9bd36d" stroke-width="1.5" opacity=".5"/>`;

  if (kind === "tree-oak") return `${shadow}
  <path d="M28 38 C29 45 28 52 25 58 H39 C36 52 35 45 36 38 Z" fill="#7a4f25" stroke="#3b2410" stroke-width="1.7"/>
  <ellipse cx="25" cy="28" rx="14" ry="12" fill="#3f7d32" stroke="#173015" stroke-width="1.7"/>
  <ellipse cx="39" cy="27" rx="15" ry="13" fill="#4f913d" stroke="#173015" stroke-width="1.7"/>
  <ellipse cx="32" cy="18" rx="15" ry="12" fill="#6aa34d" stroke="#173015" stroke-width="1.7"/>
  <ellipse cx="31" cy="35" rx="18" ry="12" fill="#477f34" stroke="#173015" stroke-width="1.7"/>
  <path d="M21 26 C28 20 37 20 45 26 M24 36 C31 31 39 32 45 37" fill="none" stroke="#a7d77d" stroke-width="1.4" opacity=".45"/>`;

  if (kind === "tree-dead") return `${shadow}
  <path d="M32 58 C31 45 31 30 34 14" fill="none" stroke="#4b321d" stroke-width="6" stroke-linecap="round"/>
  <path d="M33 31 L18 18 M33 36 L48 22 M32 44 L20 38 M33 24 L42 13" fill="none" stroke="#5a3a20" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M18 18 L13 15 M48 22 L54 17 M20 38 L15 42 M42 13 L45 7" stroke="#7a4f2d" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M31 20 C34 31 33 44 31 55" fill="none" stroke="#9a6a3a" stroke-width="1.2" opacity=".45"/>`;

  if (kind === "rock-large") return `${shadow}
  <path d="M10 48 L18 25 L34 14 L52 28 L56 49 L38 57 L18 56 Z" fill="#73716a" stroke="#302d29" stroke-width="2.3"/>
  <path d="M18 25 L34 14 L31 37 L10 48 Z" fill="#9a978e" opacity=".75"/>
  <path d="M34 14 L52 28 L39 38 L31 37 Z" fill="#85817a"/>
  <path d="M31 37 L39 38 L38 57 L18 56 Z" fill="#5d5952"/>
  <path d="M20 27 L31 20 M40 29 L50 30 M20 47 L35 47" stroke="#d0ccc2" stroke-width="1.5" stroke-linecap="round" opacity=".55"/>`;

  if (kind === "rock-small") return `${shadow}
  <path d="M16 50 L24 35 L39 31 L51 43 L45 55 L27 57 Z" fill="#77736a" stroke="#302d29" stroke-width="2"/>
  <path d="M24 35 L39 31 L35 47 L16 50 Z" fill="#a09c91" opacity=".7"/>
  <path d="M35 47 L45 55 L27 57 L16 50 Z" fill="#5f5a52"/>
  <path d="M26 38 L37 35 M38 43 L48 43" stroke="#d8d3c7" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>`;

  if (kind === "bush") return `${shadow}
  <ellipse cx="21" cy="45" rx="12" ry="10" fill="#3f7d32" stroke="#183016" stroke-width="1.7"/>
  <ellipse cx="34" cy="39" rx="15" ry="13" fill="#5c9b42" stroke="#183016" stroke-width="1.7"/>
  <ellipse cx="46" cy="46" rx="12" ry="10" fill="#477f34" stroke="#183016" stroke-width="1.7"/>
  <ellipse cx="33" cy="50" rx="18" ry="9" fill="#346c2e" stroke="#183016" stroke-width="1.4"/>
  <path d="M22 42 C30 36 40 36 47 42 M21 49 C31 44 42 44 50 49" fill="none" stroke="#a7d77d" stroke-width="1.4" opacity=".5"/>`;

  if (kind === "flower") return `${shadow}
  <path d="M20 55 C20 45 23 39 28 34 M32 56 C31 44 32 37 34 30 M44 55 C43 45 40 39 36 34" fill="none" stroke="#2f7a3b" stroke-width="2" stroke-linecap="round"/>
  <g stroke="#7c2d12" stroke-width="1">
    <circle cx="28" cy="31" r="3" fill="#f9a8d4"/><circle cx="24" cy="34" r="3" fill="#f9a8d4"/><circle cx="31" cy="35" r="3" fill="#f9a8d4"/><circle cx="28" cy="34" r="2" fill="#fde047"/>
    <circle cx="35" cy="27" r="3" fill="#93c5fd"/><circle cx="31" cy="30" r="3" fill="#93c5fd"/><circle cx="38" cy="31" r="3" fill="#93c5fd"/><circle cx="35" cy="30" r="2" fill="#fde047"/>
    <circle cx="37" cy="35" r="3" fill="#fef08a"/><circle cx="41" cy="38" r="3" fill="#fef08a"/><circle cx="34" cy="39" r="3" fill="#fef08a"/><circle cx="37" cy="38" r="2" fill="#f97316"/>
  </g>
  <path d="M18 54 C24 50 28 51 32 56 M36 55 C41 50 47 51 51 55" fill="none" stroke="#6aa34d" stroke-width="1.5"/>`;

  return `${shadow}
  <path d="M18 56 C20 47 22 42 26 35 M27 57 C28 47 31 40 34 32 M37 57 C37 47 40 41 44 35 M46 56 C45 49 47 45 51 40" fill="none" stroke="#5f9f46" stroke-width="2.3" stroke-linecap="round"/>
  <path d="M22 53 C28 48 36 48 44 53 M16 57 C27 52 41 52 52 57" fill="none" stroke="#a8d56f" stroke-width="1.5" opacity=".62"/>`;
}

async function writeSvg(rel, content) {
  const target = path.join(SPRITES, rel);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

for (const spec of units) {
  await writeSvg(path.join("units", `${spec.file}.svg`), unitSvg(spec));
}

for (const spec of townSpecs) {
  await writeSvg(path.join("map", `${spec.file}.svg`), townSvg(spec));
}

for (const spec of heroSpecs) {
  await writeSvg(path.join("map", `${spec.file}.svg`), heroSvg(spec));
}

for (const spec of resourceSpecs) {
  await writeSvg(path.join("resources", `${spec.file}.svg`), resourceSvg(spec));
}

for (const spec of buildingSpecs) {
  await writeSvg(path.join("map", `${spec.file}.svg`), buildingSvg(spec));
}

for (const spec of decorSpecs) {
  await writeSvg(path.join("map", `${spec.file}.svg`), decorSvg(spec));
}

for (const spec of adventureObjectSpecs) {
  await writeSvg(path.join("map", "adventure", `${spec.file}.svg`), adventureObjectSvg(spec));
}

console.log(`${units.length + townSpecs.length + heroSpecs.length + resourceSpecs.length + buildingSpecs.length + decorSpecs.length} sprites SVG générés.`);
