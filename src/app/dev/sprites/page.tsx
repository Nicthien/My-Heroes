"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { CREATURE_GROUPS } from "@/lib/game/creature-catalog";
import { UNIT_RULES } from "@/lib/game/units";
import type { CombatBoardUnit, UnitType } from "@/lib/game/types";
import { BOAT_SPRITESHEETS, HERO_DIRECTIONS, HERO_SPRITESHEETS, type DirectionalSpritesheet, type HeroDirection } from "@/lib/rendering/phaser/assets";
import {
  type UnitModelKind,
  UnitSilhouette,
  getUnitModel,
  getUnitPalette,
} from "@/components/game/combat/CombatScreen";

type StaticSpriteAsset = {
  path: string;
  label: string;
  group: string;
};

const PUBLIC_STATIC_ASSETS: StaticSpriteAsset[] = [
  { path: "/assets/sprites/map/town-castle.webp", label: "Ville château", group: "Factions" },
  { path: "/assets/sprites/map/town-rampart.webp", label: "Ville rempart", group: "Factions" },
  { path: "/assets/sprites/map/town-tower.webp", label: "Ville tour", group: "Factions" },
  { path: "/assets/sprites/map/town-inferno.webp", label: "Ville Hadès", group: "Factions" },
  { path: "/assets/sprites/map/town-necropolis.webp", label: "Ville nécropole", group: "Factions" },
  { path: "/assets/sprites/map/town-dungeon.webp", label: "Ville donjon", group: "Factions" },
  { path: "/assets/sprites/map/town-stronghold.webp", label: "Ville bastion", group: "Factions" },
  { path: "/assets/sprites/map/town-fortress.webp", label: "Ville forteresse", group: "Factions" },
  { path: "/assets/sprites/map/town-conflux.webp", label: "Ville conflux", group: "Factions" },
  { path: "/assets/sprites/map/alchemist-lab.svg", label: "Laboratoire d'alchimiste", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/crystal-cavern.svg", label: "Caverne de cristaux", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/gem-pond.svg", label: "Bassin de gemmes", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/gold-mine.svg", label: "Mine d'or", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/ore-pit.svg", label: "Mine de minerai", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/sawmill.svg", label: "Scierie", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/sulfur-dune.svg", label: "Dune de soufre", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/adventure-observatory.svg", label: "Observatoire", group: "Aventures" },
  { path: "/assets/sprites/map/adventure-campfire.svg", label: "Feu de camp", group: "Aventures" },
  { path: "/assets/sprites/map/adventure-lighthouse.svg", label: "Phare", group: "Aventures" },
  { path: "/assets/sprites/map/adventure-stargate.svg", label: "Stargate", group: "Aventures" },
  { path: "/assets/sprites/map/wall-brick.svg", label: "Mur de pierre", group: "Obstacles" },
  { path: "/assets/sprites/map/wall-vegetal.svg", label: "Mur végétal", group: "Obstacles" },
  { path: "/assets/sprites/map/tree-pine.svg", label: "Pin", group: "Décors" },
  { path: "/assets/sprites/map/tree-oak.svg", label: "Chêne", group: "Décors" },
  { path: "/assets/sprites/map/tree-dead.svg", label: "Arbre mort", group: "Décors" },
  { path: "/assets/sprites/map/rock-large.svg", label: "Grand rocher", group: "Décors" },
  { path: "/assets/sprites/map/rock-small.svg", label: "Petit rocher", group: "Décors" },
  { path: "/assets/sprites/map/bush.svg", label: "Buisson", group: "Décors" },
  { path: "/assets/sprites/map/flower.svg", label: "Fleurs", group: "Décors" },
  { path: "/assets/sprites/map/grass-tuft.svg", label: "Touffe d'herbe", group: "Décors" },
  { path: "/assets/sprites/map/grove-pine.svg", label: "Bosquet de pins", group: "Obstacles" },
  { path: "/assets/sprites/map/grove-oak.svg", label: "Bosquet de chenes", group: "Obstacles" },
  { path: "/assets/sprites/map/grove-dead.svg", label: "Bosquet mort", group: "Obstacles" },
  { path: "/assets/sprites/map/boulder-cluster.svg", label: "Amas de rochers", group: "Obstacles" },
  { path: "/assets/sprites/resources/gold.svg", label: "Or", group: "Ressources" },
  { path: "/assets/sprites/resources/wood.svg", label: "Bois", group: "Ressources" },
  { path: "/assets/sprites/resources/ore.svg", label: "Minerai", group: "Ressources" },
  { path: "/assets/sprites/resources/mercury.svg", label: "Mercure", group: "Ressources" },
  { path: "/assets/sprites/resources/crystals.svg", label: "Cristaux", group: "Ressources" },
  { path: "/assets/sprites/resources/gems.svg", label: "Gemmes", group: "Ressources" },
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

const HERO_SHEET_ENTRIES = Object.values(HERO_SPRITESHEETS);
const BOAT_SHEET_ENTRIES = Object.values(BOAT_SPRITESHEETS);
type GalleryTab = "units" | "spritesheets" | "svg" | "webp";

const UNIT_COUNT = FACTION_GROUPS.reduce((total, group) => total + group.units.length, 0);
const SPRITESHEET_COUNT = HERO_SHEET_ENTRIES.length + BOAT_SHEET_ENTRIES.length;
const PUBLIC_SVGS = PUBLIC_STATIC_ASSETS.filter((entry) => entry.path.endsWith(".svg"));
const PUBLIC_WEBPS = PUBLIC_STATIC_ASSETS.filter((entry) => entry.path.endsWith(".webp"));

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

function StaticSpriteCard({ path, label }: { path: string; label: string }) {
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

function HeroSheetPreview({
  sheet,
  direction,
  state,
}: {
  sheet: DirectionalSpritesheet;
  direction: HeroDirection;
  state: "idle" | "walk";
}) {
  const [tick, setTick] = useState(0);
  const directionIndex = HERO_DIRECTIONS.indexOf(direction);
  const frames = state === "idle" ? [0, 1, 2, 3, 2, 1] : [4, 5, 6, 7, 8, 9, 10, 11];
  const frame = frames[tick % frames.length];
  const previewSize = 52;
  const previewScale = previewSize / sheet.frameWidth;

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), state === "idle" ? 180 : 90);
    return () => window.clearInterval(interval);
  }, [state]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="h-[52px] w-[52px]"
        style={{
          backgroundImage: `url(${sheet.path})`,
          backgroundPosition: `-${frame * sheet.frameWidth * previewScale}px -${directionIndex * sheet.frameHeight * previewScale}px`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${sheet.frameWidth * sheet.columns * previewScale}px ${sheet.frameHeight * HERO_DIRECTIONS.length * previewScale}px`,
        }}
      />
      <span className="text-[10px] uppercase tracking-wider text-stone-500">{state}</span>
    </div>
  );
}

function DirectionalSheetCard({ alt, label, sheet }: { alt: string; label: string; sheet: DirectionalSpritesheet }) {
  return (
    <div className="rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <div className="mb-2 text-sm font-bold uppercase tracking-wider text-amber-200">{label}</div>
          <Image
            src={sheet.path}
            alt={alt}
            width={240}
            height={160}
            className="rounded border border-stone-700 bg-stone-950"
            unoptimized
          />
          <div className="mt-1 max-w-[240px] break-all text-[10px] text-stone-500">{sheet.path}</div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {HERO_DIRECTIONS.map((direction) => (
            <div key={direction} className="rounded border border-stone-800 bg-stone-950/60 p-2">
              <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-amber-300">{direction}</div>
              <div className="grid grid-cols-2 gap-2">
                <HeroSheetPreview sheet={sheet} direction={direction} state="idle" />
                <HeroSheetPreview sheet={sheet} direction={direction} state="walk" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "h-10 rounded border px-4 text-sm font-black uppercase tracking-wider transition",
        active
          ? "border-amber-400 bg-amber-400/15 text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.18)_inset]"
          : "border-stone-700 bg-stone-900/70 text-stone-400 hover:border-amber-700/70 hover:text-amber-200",
      ].join(" ")}
    >
      {label}
      <span className="ml-2 font-mono text-[11px] text-stone-500">{count}</span>
    </button>
  );
}

function CollapsibleGroup({
  children,
  count,
  defaultOpen = true,
  subtitle,
  title,
}: {
  children: ReactNode;
  count: number;
  defaultOpen?: boolean;
  subtitle?: string;
  title: string;
}) {
  return (
    <details className="border-t border-stone-800 py-4 last:border-b" open={defaultOpen}>
      <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-3 rounded px-2 py-2 hover:bg-stone-900/70">
        <span className="grid h-7 w-7 place-items-center rounded border border-stone-700 bg-stone-900 text-sm font-black text-amber-300">
          &rsaquo;
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black uppercase tracking-[0.18em] text-amber-200">{title}</span>
          {subtitle ? <span className="mt-0.5 block truncate text-xs text-stone-500">{subtitle}</span> : null}
        </span>
        <span className="rounded border border-stone-700 bg-stone-950 px-2 py-1 font-mono text-xs text-stone-400">
          {count}
        </span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function UnitsTab() {
  return (
    <section>
      {FACTION_GROUPS.map((group, index) => (
        <CollapsibleGroup
          key={group.label}
          count={group.units.length}
          defaultOpen={index < 2}
          title={group.label}
          subtitle="Unités SVG"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
            {group.units.map((unitType) => (
              <UnitCard key={unitType} unitType={unitType} />
            ))}
          </div>
        </CollapsibleGroup>
      ))}
    </section>
  );
}

function SpritesheetsTab() {
  return (
    <section>
      <CollapsibleGroup count={HERO_SHEET_ENTRIES.length} title="Héros aventure" subtitle="Spritesheets animés : idle et marche par direction">
        <div className="grid gap-4">
          {HERO_SHEET_ENTRIES.map((sheet) => (
            <DirectionalSheetCard key={sheet.faction} alt={`Spritesheet heros ${sheet.faction}`} label={sheet.faction} sheet={sheet} />
          ))}
        </div>
      </CollapsibleGroup>
      <CollapsibleGroup count={BOAT_SHEET_ENTRIES.length} title="Bateaux aventure" subtitle="Galions complets par faction : idle et navigation par direction">
        <div className="grid gap-4">
          {BOAT_SHEET_ENTRIES.map((sheet) => (
            <DirectionalSheetCard key={sheet.faction} alt={`Spritesheet bateau ${sheet.faction}`} label={`bateau ${sheet.faction}`} sheet={sheet} />
          ))}
        </div>
      </CollapsibleGroup>
    </section>
  );
}

function StaticSpriteTab({ assets, fileGroups }: { assets: StaticSpriteAsset[]; fileGroups: string[] }) {
  return (
    <section>
      {fileGroups.map((group, index) => {
        const entries = assets.filter((entry) => entry.group === group);
        return (
          <CollapsibleGroup key={group} count={entries.length} defaultOpen={index < 2} title={group}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {entries.map((entry) => (
                <StaticSpriteCard key={entry.path} path={entry.path} label={entry.label} />
              ))}
            </div>
          </CollapsibleGroup>
        );
      })}
    </section>
  );
}

export default function SpritesGalleryPage() {
  const [activeTab, setActiveTab] = useState<GalleryTab>("units");
  const svgGroups = Array.from(new Set(PUBLIC_SVGS.map((entry) => entry.group)));
  const webpGroups = Array.from(new Set(PUBLIC_WEBPS.map((entry) => entry.group)));

  return (
    <div className="h-screen overflow-y-auto bg-[#151712] px-4 py-6 text-stone-100 sm:px-8 sm:py-10">
      <header className="sticky top-0 z-10 mx-auto max-w-7xl border-b border-stone-800 bg-[#151712]/95 pb-4 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-amber-200">Galerie des sprites</h1>
            <p className="mt-1 text-sm text-stone-400">
              Inventaire visuel : unités SVG, spritesheets et fichiers statiques de <code>public/</code>.
            </p>
          </div>
          <nav aria-label="Types de ressources" className="flex flex-wrap gap-2">
            <TabButton active={activeTab === "units"} count={UNIT_COUNT} label="Unités SVG" onClick={() => setActiveTab("units")} />
            <TabButton active={activeTab === "spritesheets"} count={SPRITESHEET_COUNT} label="Spritesheets" onClick={() => setActiveTab("spritesheets")} />
            <TabButton active={activeTab === "svg"} count={PUBLIC_SVGS.length} label="SVG carte" onClick={() => setActiveTab("svg")} />
            <TabButton active={activeTab === "webp"} count={PUBLIC_WEBPS.length} label="WebP carte" onClick={() => setActiveTab("webp")} />
          </nav>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-7xl">
        {activeTab === "units" ? <UnitsTab /> : null}
        {activeTab === "spritesheets" ? <SpritesheetsTab /> : null}
        {activeTab === "svg" ? <StaticSpriteTab assets={PUBLIC_SVGS} fileGroups={svgGroups} /> : null}
        {activeTab === "webp" ? <StaticSpriteTab assets={PUBLIC_WEBPS} fileGroups={webpGroups} /> : null}
      </main>
    </div>
  );
}
