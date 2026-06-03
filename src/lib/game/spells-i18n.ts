import type { Locale } from "@/lib/i18n/types";
import { unitTypeToEnglishLabel } from "@/lib/i18n/gameLabels";
import type { SpellDefinition, SpellId } from "./spells";

// English effect descriptions keyed by spell id (the FR source lives in spells.ts).
const SPELL_EFFECT_EN: Record<SpellId, string> = {
  magic_arrow: "Deals damage to a target.",
  lightning_bolt: "Deals air damage to a target.",
  destroy_undead: "Deals damage to all undead.",
  chain_lightning: "Strikes up to five troops, with reduced damage on each jump.",
  titans_lightning_bolt: "Requires the Titan's Thunder artifact. Deals 600 damage to a target.",
  death_ripple: "Deals damage to all living creatures.",
  meteor_shower: "Deals earth damage in an area.",
  implosion: "Deals heavy damage to a target.",
  fire_wall: "Creates a wall that deals damage on passage.",
  fireball: "Deals fire damage in an area.",
  land_mine: "Places invisible mines on the battlefield.",
  armageddon: "Deals fire damage to all troops.",
  inferno: "Deals fire damage in a large area.",
  ice_bolt: "Deals water damage to a target.",
  frost_ring: "Deals damage around a tile without hitting the center.",
  haste: "Increases speed.",
  disrupting_ray: "Reduces defense.",
  fortune: "Increases luck.",
  precision: "Increases ranged attack.",
  protection_from_air: "Reduces damage from air spells.",
  air_shield: "Reduces ranged damage.",
  hypnotize: "Temporarily controls an enemy troop.",
  counterstrike: "Adds retaliations.",
  magic_mirror: "Can reflect enemy spells.",
  summon_air_elemental: "Summons air elementals.",
  shield: "Reduces melee damage.",
  slow: "Reduces speed.",
  stone_skin: "Increases defense.",
  quicksand: "Places sand traps.",
  animate_dead: "Revives undead.",
  anti_magic: "Protects a troop against spells.",
  earthquake: "Damages siege walls.",
  force_field: "Creates a barrier.",
  protection_from_earth: "Reduces damage from earth spells.",
  resurrection: "Revives living creatures.",
  sorrow: "Reduces morale.",
  summon_earth_elemental: "Summons earth elementals.",
  bloodlust: "Increases melee attack.",
  curse: "Forces minimum damage.",
  protection_from_fire: "Reduces damage from fire spells.",
  blind: "Prevents a troop from acting.",
  misfortune: "Reduces luck.",
  berserk: "Forces an attack against the nearest troop.",
  fire_shield: "Reflects part of melee damage.",
  frenzy: "Converts defense into attack.",
  slayer: "Increases attack against powerful creatures.",
  sacrifice: "Sacrifices a troop to revive another.",
  summon_fire_elemental: "Summons fire elementals.",
  bless: "Forces maximum damage.",
  cure: "Heals and dispels negative effects.",
  dispel: "Removes magical effects.",
  protection_from_water: "Reduces damage from water spells.",
  remove_obstacle: "Removes some battlefield obstacles.",
  weakness: "Reduces attack.",
  forgetfulness: "Prevents shooters from firing.",
  mirth: "Increases morale.",
  teleport: "Moves an allied troop.",
  clone: "Creates a temporary copy of a troop.",
  prayer: "Increases attack, defense and speed.",
  summon_water_elemental: "Summons water elementals.",
  visions: "Gives information about nearby forces.",
  view_air: "Reveals artifacts, heroes and towns depending on mastery.",
  disguise: "Hides the hero's army from opponents.",
  dimension_door: "Teleports the hero to a valid visible tile.",
  fly: "Allows flying over water and obstacles.",
  view_earth: "Reveals nearby resources, mines and terrain.",
  town_portal: "Teleports the hero to a free allied town.",
  summon_boat: "Summons a nearby empty boat.",
  scuttle_boat: "Destroys an adjacent unoccupied boat.",
  water_walk: "Allows walking on water.",
};

/** Some spell ids don't read well when title-cased; override their EN name here. */
const SPELL_LABEL_EN_OVERRIDE: Partial<Record<SpellId, string>> = {
  titans_lightning_bolt: "Titan's Lightning Bolt",
};

export function localizedSpellLabel(spell: SpellDefinition, locale: Locale): string {
  if (locale !== "en") return spell.label;
  return SPELL_LABEL_EN_OVERRIDE[spell.id] ?? unitTypeToEnglishLabel(spell.id);
}

export function localizedSpellEffect(spell: SpellDefinition, locale: Locale): string {
  return locale === "en" ? SPELL_EFFECT_EN[spell.id] ?? spell.effect : spell.effect;
}
