"use client";

import Image from "next/image";
import { CREATURE_GROUPS } from "@/lib/game/creature-catalog";
import { UNIT_RULES } from "@/lib/game/units";
import type { CombatBoardUnit, UnitType } from "@/lib/game/types";
import {
  type UnitModelKind,
  UnitSilhouette,
  getUnitModel,
  getUnitPalette,
} from "@/components/game/combat/CombatScreen";

const PUBLIC_SVGS: { path: string; label: string; group: string }[] = [
  { path: "/assets/sprites/map/hero-cavalier.svg", label: "Héros cavalier", group: "Carte - factions" },
  { path: "/assets/sprites/map/town-castle.svg", label: "Ville château", group: "Carte - factions" },
  { path: "/assets/sprites/map/hero-rampart.svg", label: "Héros rempart", group: "Carte - factions" },
  { path: "/assets/sprites/map/town-rampart.svg", label: "Ville rempart", group: "Carte - factions" },
  { path: "/assets/sprites/map/hero-tower.svg", label: "Héros tour", group: "Carte - factions" },
  { path: "/assets/sprites/map/town-tower.svg", label: "Ville tour", group: "Carte - factions" },
  { path: "/assets/sprites/map/hero-inferno.svg", label: "Héros Hadès", group: "Carte - factions" },
  { path: "/assets/sprites/map/town-inferno.svg", label: "Ville Hadès", group: "Carte - factions" },
  { path: "/assets/sprites/map/hero-necropolis.svg", label: "Héros nécropole", group: "Carte - factions" },
  { path: "/assets/sprites/map/town-necropolis.svg", label: "Ville nécropole", group: "Carte - factions" },
  { path: "/assets/sprites/map/hero-dungeon.svg", label: "Héros donjon", group: "Carte - factions" },
  { path: "/assets/sprites/map/town-dungeon.svg", label: "Ville donjon", group: "Carte - factions" },
  { path: "/assets/sprites/map/hero-stronghold.svg", label: "Héros bastion", group: "Carte - factions" },
  { path: "/assets/sprites/map/town-stronghold.svg", label: "Ville bastion", group: "Carte - factions" },
  { path: "/assets/sprites/map/hero-fortress.svg", label: "Héros forteresse", group: "Carte - factions" },
  { path: "/assets/sprites/map/town-fortress.svg", label: "Ville forteresse", group: "Carte - factions" },
  { path: "/assets/sprites/map/alchemist-lab.svg", label: "Laboratoire d'alchimiste", group: "Carte" },
  { path: "/assets/sprites/map/crystal-cavern.svg", label: "Caverne de cristaux", group: "Carte" },
  { path: "/assets/sprites/map/gold-mine.svg", label: "Mine d'or", group: "Carte" },
  { path: "/assets/sprites/map/ore-pit.svg", label: "Mine de minerai", group: "Carte" },
  { path: "/assets/sprites/map/sawmill.svg", label: "Scierie", group: "Carte" },
  { path: "/assets/sprites/map/sulfur-dune.svg", label: "Dune de soufre", group: "Carte" },
  { path: "/assets/sprites/map/wall-brick.svg", label: "Mur de pierre", group: "Carte - décors" },
  { path: "/assets/sprites/map/wall-vegetal.svg", label: "Mur végétal", group: "Carte - décors" },
  { path: "/assets/sprites/map/tree-pine.svg", label: "Pin", group: "Carte - décors" },
  { path: "/assets/sprites/map/tree-oak.svg", label: "Chêne", group: "Carte - décors" },
  { path: "/assets/sprites/map/tree-dead.svg", label: "Arbre mort", group: "Carte - décors" },
  { path: "/assets/sprites/map/rock-large.svg", label: "Grand rocher", group: "Carte - décors" },
  { path: "/assets/sprites/map/rock-small.svg", label: "Petit rocher", group: "Carte - décors" },
  { path: "/assets/sprites/map/bush.svg", label: "Buisson", group: "Carte - décors" },
  { path: "/assets/sprites/map/flower.svg", label: "Fleurs", group: "Carte - décors" },
  { path: "/assets/sprites/map/grass-tuft.svg", label: "Touffe d'herbe", group: "Carte - décors" },
  { path: "/assets/sprites/resources/gold.svg", label: "Or", group: "Ressources" },
  { path: "/assets/sprites/resources/wood.svg", label: "Bois", group: "Ressources" },
  { path: "/assets/sprites/resources/ore.svg", label: "Minerai", group: "Ressources" },
  { path: "/assets/sprites/resources/mercury.svg", label: "Mercure", group: "Ressources" },
  { path: "/assets/sprites/resources/crystals.svg", label: "Cristaux", group: "Ressources" },
  { path: "/assets/sprites/resources/sulfur.svg", label: "Soufre", group: "Ressources" },
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

const FACTION_GROUPS: { label: string; units: UnitType[] }[] = CREATURE_GROUPS.map((group) => ({
  label: group.label,
  units: group.units,
}));

const MODEL_LABELS: Record<UnitModelKind, string> = {
  infantry: "Infanterie",
  archer: "Tireur",
  cavalry: "Cavalerie",
  winged: "Volant",
  large: "Colosse",
  caster: "Lanceur",
  beast: "Bête",
  undead: "Mort-vivant",
};

function UnitCard({ unitType }: { unitType: UnitType }) {
  const rule = UNIT_RULES[unitType];
  const unit = mockUnit(unitType, "attacker");
  const model = getUnitModel(unit);
  const palette = getUnitPalette(unit);
  const svgPath = `/assets/sprites/units/${unitType}.svg`;

  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3 shadow-[0_0_0_1px_rgba(252,211,77,0.12)_inset]">
      <div className="relative grid h-[148px] w-[112px] place-items-center">
        <div className="h-[122px] w-[92px]">
          <UnitSilhouette kind={model} palette={palette} ranged={rule.ranged ?? false} unitType={unitType} />
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-black text-amber-200">{rule.label}</div>
        <div className="text-[10px] uppercase tracking-wider text-stone-400">{MODEL_LABELS[model]}</div>
        <div className="mt-1 text-[10px] text-stone-500">
          Att/Déf {rule.attack}/{rule.defense} · Dégâts {rule.minDamage}-{rule.maxDamage}
        </div>
        <div className="mt-1 max-w-[124px] break-all text-[10px] leading-tight text-stone-500">
          {svgPath}
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
          Inventaire visuel : unités SVG utilisées en jeu et fichiers statiques de <code>public/</code>.
        </p>
      </header>

      <section className="mx-auto max-w-7xl">
        <h2 className="mb-3 text-xl font-black text-amber-100">Unités</h2>
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
