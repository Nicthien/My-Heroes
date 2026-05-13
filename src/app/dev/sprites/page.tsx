"use client";

import Image from "next/image";
import { UNIT_RULES } from "@/lib/game/units";
import { CombatBoardUnit, UnitType } from "@/lib/game/types";
import {
  UnitSilhouette,
  getUnitModel,
  getUnitPalette,
} from "@/components/game/combat/CombatScreen";

const PUBLIC_SVGS: { path: string; label: string; group: string }[] = [
  { path: "/assets/sprites/map/hero-cavalier.svg", label: "Hero Cavalier", group: "Map" },
  { path: "/assets/sprites/map/town-castle.svg", label: "Town Castle", group: "Map" },
  { path: "/assets/sprites/map/hero-rampart.svg", label: "Hero Rampart", group: "Map Factions" },
  { path: "/assets/sprites/map/town-rampart.svg", label: "Town Rampart", group: "Map Factions" },
  { path: "/assets/sprites/map/hero-tower.svg", label: "Hero Tower", group: "Map Factions" },
  { path: "/assets/sprites/map/town-tower.svg", label: "Town Tower", group: "Map Factions" },
  { path: "/assets/sprites/map/hero-inferno.svg", label: "Hero Inferno", group: "Map Factions" },
  { path: "/assets/sprites/map/town-inferno.svg", label: "Town Inferno", group: "Map Factions" },
  { path: "/assets/sprites/map/hero-necropolis.svg", label: "Hero Necropolis", group: "Map Factions" },
  { path: "/assets/sprites/map/town-necropolis.svg", label: "Town Necropolis", group: "Map Factions" },
  { path: "/assets/sprites/map/hero-dungeon.svg", label: "Hero Dungeon", group: "Map Factions" },
  { path: "/assets/sprites/map/town-dungeon.svg", label: "Town Dungeon", group: "Map Factions" },
  { path: "/assets/sprites/map/hero-stronghold.svg", label: "Hero Stronghold", group: "Map Factions" },
  { path: "/assets/sprites/map/town-stronghold.svg", label: "Town Stronghold", group: "Map Factions" },
  { path: "/assets/sprites/map/hero-fortress.svg", label: "Hero Fortress", group: "Map Factions" },
  { path: "/assets/sprites/map/town-fortress.svg", label: "Town Fortress", group: "Map Factions" },
  { path: "/assets/sprites/map/monster.svg", label: "Monster", group: "Map" },
  { path: "/assets/sprites/map/alchemist-lab.svg", label: "Alchemist Lab", group: "Map" },
  { path: "/assets/sprites/map/crystal-cavern.svg", label: "Crystal Cavern", group: "Map" },
  { path: "/assets/sprites/map/gold-mine.svg", label: "Gold Mine", group: "Map" },
  { path: "/assets/sprites/map/ore-pit.svg", label: "Ore Pit", group: "Map" },
  { path: "/assets/sprites/map/sawmill.svg", label: "Sawmill", group: "Map" },
  { path: "/assets/sprites/map/sulfur-dune.svg", label: "Sulfur Dune", group: "Map" },
  { path: "/assets/sprites/resources/gold.svg", label: "Gold", group: "Ressources" },
  { path: "/assets/sprites/resources/wood.svg", label: "Wood", group: "Ressources" },
  { path: "/assets/sprites/resources/ore.svg", label: "Ore", group: "Ressources" },
  { path: "/assets/sprites/resources/mercury.svg", label: "Mercury", group: "Ressources" },
  { path: "/assets/sprites/resources/crystals.svg", label: "Crystals", group: "Ressources" },
  { path: "/assets/sprites/resources/sulfur.svg", label: "Sulfur", group: "Ressources" },
];

function mockUnit(unitType: UnitType, side: "attacker" | "defender"): CombatBoardUnit {
  const rule = UNIT_RULES[unitType];
  return {
    id: `${unitType}-${side}`,
    unitType,
    count: 1,
    side,
    q: 0,
    r: 0,
    health: rule.health,
    maxHealth: rule.health,
    position: 0,
    ownerPlayerId: "p",
    heroId: "h",
    participantId: null,
    joinsRound: 1,
    speed: rule.speed,
    minDamage: rule.minDamage,
    maxDamage: rule.maxDamage,
    ranged: rule.ranged ?? false,
    shots: rule.shots ?? 0,
    hasRetaliated: false,
    defended: false,
    waited: false,
  };
}

const FACTION_GROUPS: { label: string; units: UnitType[] }[] = [
  {
    label: "Château",
    units: [
      UnitType.PIKEMAN, UnitType.HALBERDIER, UnitType.ARCHER, UnitType.MARKSMAN,
      UnitType.GRIFFIN, UnitType.ROYAL_GRIFFIN, UnitType.SWORDSMAN, UnitType.CRUSADER,
      UnitType.MONK, UnitType.ZEALOT, UnitType.CAVALIER, UnitType.CHAMPION,
      UnitType.ANGEL, UnitType.ARCHANGEL,
    ],
  },
  {
    label: "Rempart",
    units: [
      UnitType.CENTAUR, UnitType.DWARF, UnitType.WOOD_ELF, UnitType.PEGASUS,
      UnitType.DENDROID, UnitType.UNICORN, UnitType.GREEN_DRAGON,
    ],
  },
  {
    label: "Tour",
    units: [
      UnitType.GREMLIN, UnitType.GARGOYLE, UnitType.GOLEM, UnitType.MAGE,
      UnitType.GENIE, UnitType.NAGA, UnitType.GIANT,
    ],
  },
  {
    label: "Hadès",
    units: [
      UnitType.IMP, UnitType.GOG, UnitType.HELL_HOUND, UnitType.DEMON,
      UnitType.PIT_FIEND, UnitType.EFREET, UnitType.DEVIL,
    ],
  },
  {
    label: "Nécropole",
    units: [
      UnitType.SKELETON, UnitType.ZOMBIE, UnitType.WIGHT, UnitType.VAMPIRE,
      UnitType.LICH, UnitType.BLACK_KNIGHT, UnitType.BONE_DRAGON,
    ],
  },
  {
    label: "Donjon",
    units: [
      UnitType.TROGLODYTE, UnitType.HARPY, UnitType.BEHOLDER, UnitType.MEDUSA,
      UnitType.MINOTAUR, UnitType.MANTICORE, UnitType.RED_DRAGON,
    ],
  },
  {
    label: "Bastion",
    units: [
      UnitType.GOBLIN, UnitType.WOLF_RIDER, UnitType.ORC, UnitType.OGRE,
      UnitType.ROC, UnitType.CYCLOPS, UnitType.BEHEMOTH,
    ],
  },
  {
    label: "Forteresse",
    units: [
      UnitType.GNOLL, UnitType.LIZARDMAN, UnitType.SERPENT_FLY, UnitType.BASILISK,
      UnitType.GORGON, UnitType.WYVERN, UnitType.HYDRA,
    ],
  },
];

function UnitCard({ unitType }: { unitType: UnitType }) {
  const rule = UNIT_RULES[unitType];
  const unit = mockUnit(unitType, "attacker");
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);

  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3 shadow-[0_0_0_1px_rgba(252,211,77,0.12)_inset]">
      <div className="relative grid h-[120px] w-[90px] place-items-center">
        <div className="h-[92px] w-[70px]">
          <UnitSilhouette kind={model} palette={palette} ranged={rule.ranged ?? false} />
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-black text-amber-200">{rule.label}</div>
        <div className="text-[10px] uppercase tracking-wider text-stone-400">{model}</div>
        <div className="mt-1 text-[10px] text-stone-500">
          {rule.attack}/{rule.defense} · {rule.minDamage}-{rule.maxDamage}
        </div>
      </div>
    </div>
  );
}

function FileSvgCard({ path, label }: { path: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3">
      <div className="grid h-[96px] w-[96px] place-items-center rounded bg-stone-950/60">
        <Image src={path} alt={label} width={80} height={80} unoptimized />
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-amber-200">{label}</div>
        <div className="text-[10px] text-stone-500">{path}</div>
      </div>
    </div>
  );
}

export default function SpritesGalleryPage() {
  const fileGroups = Array.from(new Set(PUBLIC_SVGS.map((entry) => entry.group)));

  return (
    <div className="h-screen overflow-y-auto bg-[#151712] px-8 py-10 text-stone-100">
      <header className="mx-auto max-w-7xl pb-6">
        <h1 className="text-3xl font-black text-amber-200">Galerie des sprites</h1>
        <p className="mt-1 text-sm text-stone-400">
          Inventaire visuel : silhouettes d&apos;unités SVG (composants) et fichiers SVG statiques de <code>public/</code>.
        </p>
      </header>

      <section className="mx-auto max-w-7xl">
        <h2 className="mb-3 text-xl font-black text-amber-100">Unités de combat (SVG inline)</h2>
        {FACTION_GROUPS.map((group) => (
          <div key={group.label} className="mb-6">
            <h3 className="mb-2 text-sm font-black uppercase tracking-[0.2em] text-amber-300/80">{group.label}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
              {group.units.map((unitType) => (
                <UnitCard key={unitType} unitType={unitType} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-10 max-w-7xl">
        <h2 className="mb-3 text-xl font-black text-amber-100">Fichiers SVG statiques</h2>
        {fileGroups.map((group) => (
          <div key={group} className="mb-6">
            <h3 className="mb-2 text-sm font-black uppercase tracking-[0.2em] text-amber-300/80">{group}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {PUBLIC_SVGS.filter((entry) => entry.group === group).map((entry) => (
                <FileSvgCard key={entry.path} path={entry.path} label={entry.label} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
