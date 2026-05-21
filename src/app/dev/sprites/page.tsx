"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { CREATURE_GROUPS } from "@/lib/game/creature-catalog";
import { CREATURE_BANK_DEFINITIONS, CREATURE_BANK_TYPES } from "@/lib/game/creature-banks";
import { UNIT_RULES } from "@/lib/game/units";
import type { UnitRule } from "@/lib/game/units";
import type { CombatBoardUnit, UnitType } from "@/lib/game/types";
import { BOAT_SPRITESHEETS, HERO_DIRECTIONS, HERO_SPRITESHEETS, getUnitSpritePath, type DirectionalSpritesheet, type HeroDirection } from "@/lib/rendering/phaser/assets";
import {
  type UnitModelKind,
  getUnitModel,
} from "@/components/game/combat/CombatScreen";

type StaticSpriteAsset = {
  path: string;
  label: string;
  group: string;
};

type SelectedSprite = {
  path: string;
  label: string;
  detail?: string;
  width: number;
  height: number;
  unitType?: UnitType;
  unit?: {
    model: string;
    rule: UnitRule;
  };
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
  { path: "/assets/sprites/map/alchemist-lab.webp", label: "Laboratoire d'alchimiste", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/crystal-cavern.webp", label: "Caverne de cristaux", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/gem-pond.webp", label: "Bassin de gemmes", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/gold-mine.webp", label: "Mine d'or", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/ore-pit.webp", label: "Mine de minerai", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/sawmill.webp", label: "Scierie", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/sulfur-dune.webp", label: "Dune de soufre", group: "Bâtiments de ressources" },
  { path: "/assets/sprites/map/adventure-observatory.webp", label: "Observatoire", group: "Aventures" },
  { path: "/assets/sprites/map/adventure-campfire.webp", label: "Feu de camp", group: "Aventures" },
  { path: "/assets/sprites/map/adventure-lighthouse.webp", label: "Phare", group: "Aventures" },
  { path: "/assets/sprites/map/adventure-stargate.webp", label: "Stargate", group: "Aventures" },
  ...CREATURE_BANK_TYPES.map((type) => ({
    path: `/assets/sprites/map/creature-bank-${type.replace(/_/g, "-")}.webp`,
    label: CREATURE_BANK_DEFINITIONS[type].label,
    group: "Banques de creatures",
  })),
  { path: "/assets/sprites/map/wall-brick.webp", label: "Mur de pierre", group: "Obstacles" },
  { path: "/assets/sprites/map/wall-vegetal.webp", label: "Mur végétal", group: "Obstacles" },
  { path: "/assets/sprites/map/grove-pine.webp", label: "Bosquet de pins", group: "Obstacles" },
  { path: "/assets/sprites/map/grove-oak.webp", label: "Bosquet de chenes", group: "Obstacles" },
  { path: "/assets/sprites/map/grove-dead.webp", label: "Bosquet mort", group: "Obstacles" },
  { path: "/assets/sprites/map/boulder-cluster.webp", label: "Amas de rochers", group: "Obstacles" },
  { path: "/assets/sprites/map/world-edge-cliff.webp", label: "Falaise du bord du monde", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-foam.webp", label: "Ecume du bord du monde", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-mist.webp", label: "Brume du bord du monde", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-waterfall.webp", label: "Cascade du bord du monde", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-waterfall-0.webp", label: "Cascade bord du monde 1", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-waterfall-1.webp", label: "Cascade bord du monde 2", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-waterfall-2.webp", label: "Cascade bord du monde 3", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-waterfall-3.webp", label: "Cascade bord du monde 4", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-waterfall-heavy-0.webp", label: "Cascade forte bord du monde 1", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-waterfall-heavy-1.webp", label: "Cascade forte bord du monde 2", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-waterfall-heavy-2.webp", label: "Cascade forte bord du monde 3", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-waterfall-heavy-3.webp", label: "Cascade forte bord du monde 4", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-waterfall-heavy-4.webp", label: "Cascade forte bord du monde 5", group: "Environnement" },
  { path: "/assets/sprites/map/world-edge-waterfall-heavy-5.webp", label: "Cascade forte bord du monde 6", group: "Environnement" },
  { path: "/assets/sprites/map/water/water-tile-iso-0.webp", label: "Eau carte 1", group: "Environnement" },
  { path: "/assets/sprites/map/water/water-tile-iso-1.webp", label: "Eau carte 2", group: "Environnement" },
  { path: "/assets/sprites/map/water/water-tile-iso-2.webp", label: "Eau carte 3", group: "Environnement" },
  { path: "/assets/sprites/map/water/water-tile-iso-3.webp", label: "Eau carte 4", group: "Environnement" },
  { path: "/assets/sprites/map/water/water-tile-iso-4.webp", label: "Eau carte 5", group: "Environnement" },
  { path: "/assets/sprites/map/water/water-tile-iso-5.webp", label: "Eau carte 6", group: "Environnement" },
  { path: "/assets/sprites/resources/gold.webp", label: "Or", group: "Ressources" },
  { path: "/assets/sprites/resources/wood.webp", label: "Bois", group: "Ressources" },
  { path: "/assets/sprites/resources/ore.webp", label: "Minerai", group: "Ressources" },
  { path: "/assets/sprites/resources/mercury.webp", label: "Mercure", group: "Ressources" },
  { path: "/assets/sprites/resources/crystals.webp", label: "Cristaux", group: "Ressources" },
  { path: "/assets/sprites/resources/gems.webp", label: "Gemmes", group: "Ressources" },
  { path: "/assets/sprites/resources/sulfur.webp", label: "Soufre", group: "Ressources" },
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

const FACTION_GROUPS: { key: string; label: string; units: UnitType[] }[] = CREATURE_GROUPS.map((group) => ({
  key: group.key,
  label: group.label,
  units: group.units,
}));
const FEATURED_UNIT_GROUPS = new Set(["cove", "factory", "bulwark", "neutral"]);

const HERO_SHEET_ENTRIES = Object.values(HERO_SPRITESHEETS);
const BOAT_SHEET_ENTRIES = Object.values(BOAT_SPRITESHEETS);
type GalleryTab = "units" | "spritesheets" | "webp";

const UNIT_COUNT = FACTION_GROUPS.reduce((total, group) => total + group.units.length, 0);
const UNIT_TYPES = FACTION_GROUPS.flatMap((group) => group.units);
const SPRITESHEET_COUNT = HERO_SHEET_ENTRIES.length + BOAT_SHEET_ENTRIES.length;
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

function buildUnitSprite(unitType: UnitType): SelectedSprite {
  const rule = UNIT_RULES[unitType];
  const unit = mockUnit(unitType, "attacker");
  const model = getUnitModel(unit);
  const spritePath = getUnitSpritePath(unitType);

  return {
    path: spritePath,
    label: rule.label,
    detail: MODEL_LABELS[model],
    width: 480,
    height: 480,
    unitType,
    unit: {
      model: MODEL_LABELS[model],
      rule,
    },
  };
}

function UnitCard({ onSelect, unitType }: { onSelect: (sprite: SelectedSprite) => void; unitType: UnitType }) {
  const rule = UNIT_RULES[unitType];
  const unit = mockUnit(unitType, "attacker");
  const model = getUnitModel(unit);
  const spritePath = getUnitSpritePath(unitType);

  return (
    <button
      type="button"
      onClick={() => onSelect(buildUnitSprite(unitType))}
      className="flex flex-col items-center gap-2 rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3 text-left shadow-[0_0_0_1px_rgba(252,211,77,0.12)_inset] transition hover:border-amber-400/70 hover:shadow-[0_0_22px_rgba(251,191,36,0.14)] focus:outline-none focus:ring-2 focus:ring-amber-300/60"
    >
      <div className="grid h-[148px] w-[112px] place-items-center rounded bg-[linear-gradient(45deg,#1f1f1f_25%,transparent_25%),linear-gradient(-45deg,#1f1f1f_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1f1f1f_75%),linear-gradient(-45deg,transparent_75%,#1f1f1f_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0]">
        <Image
          src={spritePath}
          alt={rule.label}
          width={124}
          height={124}
          className="h-[124px] w-[124px] object-contain drop-shadow-[0_6px_5px_rgba(0,0,0,0.65)]"
          unoptimized
        />
      </div>
      <div className="text-center">
        <div className="text-sm font-black text-amber-200">{rule.label}</div>
        <div className="text-[10px] uppercase tracking-wider text-stone-400">{MODEL_LABELS[model]}</div>
        <div className="mt-1 text-[10px] text-stone-500">
          Att/Déf {rule.attack}/{rule.defense} · Dégâts {rule.minDamage}-{rule.maxDamage}
        </div>
        <div className="mt-1 max-w-[124px] break-all text-[10px] leading-tight text-stone-500">
          {spritePath}
        </div>
      </div>
    </button>
  );
}

function StaticSpriteCard({ onSelect, path, label }: { onSelect: (sprite: SelectedSprite) => void; path: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onSelect({ path, label, width: 560, height: 560 })}
      className="flex flex-col items-center gap-2 rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3 text-center transition hover:border-amber-400/70 hover:shadow-[0_0_22px_rgba(251,191,36,0.14)] focus:outline-none focus:ring-2 focus:ring-amber-300/60"
    >
      <div className="grid h-[96px] w-[96px] place-items-center rounded bg-stone-950/60">
        <Image src={path} alt={label} width={80} height={80} unoptimized />
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-amber-200">{label}</div>
        <div className="text-[10px] text-stone-500">{path}</div>
      </div>
    </button>
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

function DirectionalSheetCard({
  alt,
  label,
  onSelect,
  sheet,
}: {
  alt: string;
  label: string;
  onSelect: (sprite: SelectedSprite) => void;
  sheet: DirectionalSpritesheet;
}) {
  return (
    <div className="rounded-md border border-amber-700/40 bg-gradient-to-b from-stone-900 to-black p-3">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <div className="mb-2 text-sm font-bold uppercase tracking-wider text-amber-200">{label}</div>
          <button
            type="button"
            onClick={() =>
              onSelect({
                path: sheet.path,
                label,
                detail: `${sheet.frameWidth}x${sheet.frameHeight} par frame`,
                width: 960,
                height: 640,
              })
            }
            className="rounded border border-stone-700 bg-stone-950 transition hover:border-amber-400/70 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
          >
            <Image src={sheet.path} alt={alt} width={240} height={160} className="rounded" unoptimized />
          </button>
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

function SpriteLightbox({
  onClose,
  onNext,
  onPrevious,
  sprite,
}: {
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  sprite: SelectedSprite;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowLeft" && onPrevious) {
        onPrevious();
      } else if (event.key === "ArrowRight" && onNext) {
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNext, onPrevious]);

  const showUnitNavigation = Boolean(onPrevious && onNext);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Apercu agrandi de ${sprite.label}`}
      onClick={onClose}
    >
      <div
        className="grid max-h-[92vh] w-full max-w-5xl grid-rows-[auto_1fr_auto] gap-4 rounded-md border border-amber-500/40 bg-stone-950 p-4 shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-amber-100">{sprite.label}</h2>
            {sprite.detail ? <p className="mt-1 text-xs uppercase tracking-wider text-stone-500">{sprite.detail}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded border border-stone-700 bg-stone-900 text-xl leading-none text-stone-300 transition hover:border-amber-400/70 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
            aria-label="Fermer l'apercu"
          >
            x
          </button>
        </div>
        <div className={["grid min-h-0 gap-4 overflow-auto", sprite.unit ? "lg:grid-cols-[minmax(0,1fr)_300px]" : ""].join(" ")}>
          <div className="relative grid min-h-[280px] place-items-center rounded bg-stone-900/80 p-4">
            {showUnitNavigation ? (
              <button
                type="button"
                onClick={onPrevious}
                className="absolute left-6 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded border border-stone-700 bg-black/70 text-3xl leading-none text-amber-100 shadow-lg transition hover:border-amber-400/70 hover:bg-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
                aria-label="Unite precedente"
                title="Unite precedente"
              >
                &lsaquo;
              </button>
            ) : null}
            <Image
              src={sprite.path}
              alt={sprite.label}
              width={sprite.width}
              height={sprite.height}
              className="h-auto max-h-[64vh] w-auto max-w-full object-contain"
              unoptimized
            />
            {showUnitNavigation ? (
              <button
                type="button"
                onClick={onNext}
                className="absolute right-6 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded border border-stone-700 bg-black/70 text-3xl leading-none text-amber-100 shadow-lg transition hover:border-amber-400/70 hover:bg-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
                aria-label="Unite suivante"
                title="Unite suivante"
              >
                &rsaquo;
              </button>
            ) : null}
          </div>
          {sprite.unit ? <UnitDetails unit={sprite.unit} /> : null}
        </div>
        <div className="break-all rounded border border-stone-800 bg-black/40 px-3 py-2 font-mono text-xs text-stone-400">{sprite.path}</div>
      </div>
    </div>
  );
}

function UnitStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded border border-stone-800 bg-black/30 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-1 text-sm font-black text-amber-100">{value}</div>
    </div>
  );
}

function UnitDetails({ unit }: { unit: NonNullable<SelectedSprite["unit"]> }) {
  const { rule } = unit;

  return (
    <aside className="rounded border border-stone-800 bg-stone-950/80 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">Type</div>
          <div className="text-sm font-black text-amber-100">{unit.model}</div>
        </div>
        <div className="rounded border border-amber-700/40 bg-amber-400/10 px-2 py-1 font-mono text-xs text-amber-100">
          {rule.type}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <UnitStat label="PV" value={rule.health} />
        <UnitStat label="Deplacement" value={rule.speed} />
        <UnitStat label="Attaque" value={rule.attack} />
        <UnitStat label="Defense" value={rule.defense} />
        <UnitStat label="Degats" value={`${rule.minDamage}-${rule.maxDamage}`} />
        <UnitStat label="Puissance" value={rule.power} />
        <UnitStat label="Combat" value={rule.ranged ? "Distance" : "Melee"} />
        <UnitStat label="Tirs" value={rule.ranged ? (rule.shots ?? 0) : "-"} />
      </div>
      {rule.abilities?.length ? (
        <div className="mt-3 rounded border border-stone-800 bg-black/30 px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-wider text-stone-500">Capacites</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {rule.abilities.map((ability) => (
              <span key={ability} className="rounded border border-stone-700 bg-stone-900 px-2 py-1 text-xs font-bold text-stone-200">
                {ability}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
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

function UnitsTab({ onSelect }: { onSelect: (sprite: SelectedSprite) => void }) {
  return (
    <section>
      {FACTION_GROUPS.map((group, index) => (
        <CollapsibleGroup
          key={group.label}
          count={group.units.length}
          defaultOpen={index < 2 || FEATURED_UNIT_GROUPS.has(group.key)}
          title={group.label}
          subtitle="Unites WebP"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
            {group.units.map((unitType) => (
              <UnitCard key={unitType} onSelect={onSelect} unitType={unitType} />
            ))}
          </div>
        </CollapsibleGroup>
      ))}
    </section>
  );
}

function SpritesheetsTab({ onSelect }: { onSelect: (sprite: SelectedSprite) => void }) {
  return (
    <section>
      <CollapsibleGroup count={HERO_SHEET_ENTRIES.length} title="Héros aventure" subtitle="Spritesheets animés : idle et marche par direction">
        <div className="grid gap-4">
          {HERO_SHEET_ENTRIES.map((sheet) => (
            <DirectionalSheetCard key={sheet.faction} alt={`Spritesheet heros ${sheet.faction}`} label={sheet.faction} onSelect={onSelect} sheet={sheet} />
          ))}
        </div>
      </CollapsibleGroup>
      <CollapsibleGroup count={BOAT_SHEET_ENTRIES.length} title="Bateaux aventure" subtitle="Galions complets par faction : idle et navigation par direction">
        <div className="grid gap-4">
          {BOAT_SHEET_ENTRIES.map((sheet) => (
            <DirectionalSheetCard key={sheet.faction} alt={`Spritesheet bateau ${sheet.faction}`} label={`bateau ${sheet.faction}`} onSelect={onSelect} sheet={sheet} />
          ))}
        </div>
      </CollapsibleGroup>
    </section>
  );
}

function StaticSpriteTab({
  assets,
  fileGroups,
  onSelect,
}: {
  assets: StaticSpriteAsset[];
  fileGroups: string[];
  onSelect: (sprite: SelectedSprite) => void;
}) {
  return (
    <section>
      {fileGroups.map((group, index) => {
        const entries = assets.filter((entry) => entry.group === group);
        return (
          <CollapsibleGroup key={group} count={entries.length} defaultOpen={index < 2} title={group}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {entries.map((entry) => (
                <StaticSpriteCard key={entry.path} onSelect={onSelect} path={entry.path} label={entry.label} />
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
  const [selectedSprite, setSelectedSprite] = useState<SelectedSprite | null>(null);
  const webpGroups = Array.from(new Set(PUBLIC_WEBPS.map((entry) => entry.group)));
  const selectedUnitIndex = selectedSprite?.unitType ? UNIT_TYPES.indexOf(selectedSprite.unitType) : -1;
  const selectAdjacentUnit = (offset: number) => {
    if (selectedUnitIndex < 0) return;

    const nextIndex = (selectedUnitIndex + offset + UNIT_TYPES.length) % UNIT_TYPES.length;
    setSelectedSprite(buildUnitSprite(UNIT_TYPES[nextIndex]));
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#151712] px-4 py-6 text-stone-100 sm:px-8 sm:py-10">
      <header className="sticky top-0 z-10 mx-auto max-w-7xl border-b border-stone-800 bg-[#151712]/95 pb-4 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-amber-200">Galerie des sprites</h1>
            <p className="mt-1 text-sm text-stone-400">
              Inventaire visuel : unités WebP, spritesheets et fichiers statiques de <code>public/</code>.
            </p>
          </div>
          <nav aria-label="Types de ressources" className="flex flex-wrap gap-2">
            <TabButton active={activeTab === "units"} count={UNIT_COUNT} label="Unités" onClick={() => setActiveTab("units")} />
            <TabButton active={activeTab === "spritesheets"} count={SPRITESHEET_COUNT} label="Spritesheets" onClick={() => setActiveTab("spritesheets")} />
            <TabButton active={activeTab === "webp"} count={PUBLIC_WEBPS.length} label="WebP carte" onClick={() => setActiveTab("webp")} />
          </nav>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-7xl">
        {activeTab === "units" ? <UnitsTab onSelect={setSelectedSprite} /> : null}
        {activeTab === "spritesheets" ? <SpritesheetsTab onSelect={setSelectedSprite} /> : null}
        {activeTab === "webp" ? <StaticSpriteTab assets={PUBLIC_WEBPS} fileGroups={webpGroups} onSelect={setSelectedSprite} /> : null}
      </main>
      {selectedSprite ? (
        <SpriteLightbox
          sprite={selectedSprite}
          onClose={() => setSelectedSprite(null)}
          onPrevious={selectedUnitIndex >= 0 ? () => selectAdjacentUnit(-1) : undefined}
          onNext={selectedUnitIndex >= 0 ? () => selectAdjacentUnit(1) : undefined}
        />
      ) : null}
    </div>
  );
}
