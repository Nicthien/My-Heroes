"use client";

import Image from "next/image";
import { Faction, type GameState, type PersistentCombat, type Player, type Resources } from "@/lib/game/types";
import { findActiveCombatTruce } from "@/lib/game/combat/truce";
import { RESOURCE_BUILDING_RULES, getFactionBuildingRule } from "@/lib/game/economy";
import { getEstatesGold } from "@/lib/game/skills";
import { getTownGoldProduction } from "@/lib/game/town-buildings";
import { HourglassIcon, MoonIcon, SunIcon } from "./theme";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";

const RESOURCE_ITEMS = [
  { key: "gold", labelKey: "res.gold", src: "/assets/sprites/resources/gold.webp", text: "text-yellow-200", ring: "ring-yellow-300/50", glow: "shadow-yellow-500/25", bg: "from-yellow-300 to-amber-600" },
  { key: "wood", labelKey: "res.wood", src: "/assets/sprites/resources/wood.webp", text: "text-orange-200", ring: "ring-orange-300/40", glow: "shadow-orange-700/25", bg: "from-amber-700 to-orange-950" },
  { key: "ore", labelKey: "res.ore", src: "/assets/sprites/resources/ore.webp", text: "text-slate-200", ring: "ring-slate-300/40", glow: "shadow-slate-400/20", bg: "from-slate-300 to-slate-700" },
  { key: "mercury", labelKey: "res.mercury", src: "/assets/sprites/resources/mercury.webp", text: "text-violet-200", ring: "ring-violet-300/40", glow: "shadow-violet-500/25", bg: "from-violet-300 to-fuchsia-700" },
  { key: "crystals", labelKey: "res.crystals", src: "/assets/sprites/resources/crystals.webp", text: "text-cyan-100", ring: "ring-cyan-300/50", glow: "shadow-cyan-400/30", bg: "from-cyan-200 to-sky-700" },
  { key: "gems", labelKey: "res.gems", src: "/assets/sprites/resources/gems.webp", text: "text-pink-100", ring: "ring-pink-300/50", glow: "shadow-pink-400/30", bg: "from-pink-200 to-rose-700" },
  { key: "sulfur", labelKey: "res.sulfur", src: "/assets/sprites/resources/sulfur.webp", text: "text-amber-100", ring: "ring-amber-300/40", glow: "shadow-amber-500/25", bg: "from-orange-300 to-yellow-700" },
] as const satisfies ReadonlyArray<{ key: keyof Resources; labelKey: TranslationKey; src: string; text: string; ring: string; glow: string; bg: string }>;

type ResourceItem = (typeof RESOURCE_ITEMS)[number];

export function ResourceBar({ player }: { player: Player }) {
  const { t } = useI18n();
  const resources = player.resources;
  const income = getPlayerResourceIncomePerTurn(player);

  return (
    <div data-tutorial="resources" className="mobile-resource-bar grid w-[clamp(21rem,34vw,27rem)] grid-cols-[1.15fr_repeat(3,1fr)] grid-rows-2 gap-1.5 text-xs xl:text-sm">
      {RESOURCE_ITEMS.map((item) => {
        const isGold = item.key === "gold";
        const amount = resources[item.key];
        const incomeAmount = income[item.key];
        const title = t("hud.resourceTooltip", { label: t(item.labelKey), amount, income: incomeAmount });

        return (
          <span
            key={item.key}
            title={title}
            aria-label={title}
            className={`group flex items-center rounded-lg border border-amber-700/50 bg-gradient-to-b from-stone-900 to-black shadow-[inset_0_0_0_1px_rgba(252,211,77,0.12)] transition hover:-translate-y-0.5 hover:border-amber-400/70 ${
              isGold
                ? "row-span-2 flex-col justify-center gap-1.5 px-2 py-2"
                : "min-h-[2.35rem] justify-between gap-2 px-2 py-1 xl:px-2.5"
            }`}
          >
            <ResourceIcon item={item} size={isGold ? "lg" : "sm"} />
            <span className={`font-black tabular-nums text-amber-100 drop-shadow ${isGold ? "text-lg xl:text-xl" : ""}`}>
              {amount}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function getPlayerResourceIncomePerTurn(player: Player): Resources {
  const income = createEmptyResourceTotals();

  for (const building of player.resourceBuildings ?? []) {
    const rule = RESOURCE_BUILDING_RULES.find((item) => item.type === building.type);
    if (rule) addResourceProduction(income, rule.production);
  }

  let totalGoldInterestPercent = 0;
  for (const town of player.towns ?? []) {
    const buildings = town.buildings ?? [];
    const townFaction = ((town as { townType?: string }).townType ?? town.faction ?? player.faction ?? Faction.CASTLE) as Faction;
    income.gold += getTownGoldProduction(buildings);

    for (const building of buildings) {
      const rule = getFactionBuildingRule(townFaction, building);
      if (rule?.dailyProduction) addResourceProduction(income, rule.dailyProduction);
      totalGoldInterestPercent += rule?.goldInterestPercent ?? 0;
    }
  }

  if (totalGoldInterestPercent > 0) {
    income.gold += Math.floor(player.resources.gold * (totalGoldInterestPercent / 100));
  }

  for (const hero of player.heroes ?? []) {
    income.gold += getEstatesGold(hero.skills);
  }

  return income;
}

function createEmptyResourceTotals(): Resources {
  return { gold: 0, wood: 0, ore: 0, mercury: 0, crystals: 0, gems: 0, sulfur: 0 };
}

function addResourceProduction(total: Resources, production: Partial<Resources>) {
  for (const [resource, amount] of Object.entries(production)) {
    const key = resource as keyof Resources;
    total[key] += amount ?? 0;
  }
}

function ResourceIcon({ item, size = "sm" }: { item: ResourceItem; size?: "sm" | "lg" }) {
  const sizeClass = size === "lg" ? "h-8 w-8" : "h-6 w-6";
  const imageSize = size === "lg" ? 32 : 24;

  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${item.bg} ring-1 ${item.ring} shadow-inner ${sizeClass}`}
      aria-hidden="true"
    >
      <Image
        src={item.src}
        alt=""
        width={imageSize}
        height={imageSize}
        className={`${sizeClass} object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]`}
      />
    </span>
  );
}

export function PlayerProgressGauge({
  player,
  gameState,
  className = "mt-1 h-2 w-full",
}: {
  player: Player;
  gameState: GameState;
  className?: string;
}) {
  const { t } = useI18n();
  const { ratio, activeCombatCount } = getPlayerTurnProgress(player, gameState);
  const percent = Math.round(ratio * 100);
  const fill = ratio > 0.55
    ? "from-emerald-300 via-lime-300 to-amber-300"
    : ratio > 0.18
      ? "from-amber-300 via-orange-300 to-red-300"
      : "from-red-500 via-red-400 to-rose-300";
  const title = activeCombatCount > 0
    ? t("hud.turnProgressCombat", { percent, count: activeCombatCount })
    : t("hud.turnProgress", { percent });

  return (
    <div
      className={`${className} overflow-hidden rounded-sm border border-amber-700/45 bg-black/65 shadow-inner shadow-black/70`}
      role="progressbar"
      aria-label={t("hud.turnProgressOf", { name: player.name })}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      title={title}
    >
      <div
        className={`h-full bg-gradient-to-r ${fill} shadow-[0_0_10px_rgba(251,191,36,0.25)] transition-[width] duration-500 ease-out`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function TurnStatusIcon({ ended }: { ended: boolean }) {
  const { t } = useI18n();
  if (ended) {
    return (
      <span
        className="ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full border border-emerald-400/45 bg-emerald-950/55 text-emerald-300"
        title={t("hud.turnEnded")}
        aria-label={t("hud.turnEnded")}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5 L10 17 L19 7" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className="ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full border border-amber-500/45 bg-black/45 text-amber-300"
      title={t("hud.turnInProgress")}
      aria-label={t("hud.turnInProgress")}
    >
      <HourglassIcon className="h-3 w-3" />
    </span>
  );
}

/**
 * Aggregate day/night state across all living players, used to drive the sun arc
 * above the turn-status badge. The "day" runs while players still have actions
 * left and ends (night/moon) once everyone has ended their turn.
 */
export function getGlobalTurnProgress(gameState: GameState) {
  const alive = gameState.players.filter((player) => player.isAlive);
  if (alive.length === 0) return { ratio: 0, allEnded: true };

  const total = alive.reduce(
    (sum, player) => sum + getPlayerTurnProgress(player, gameState).ratio,
    0
  );
  const allEnded = alive.every((player) => player.hasEndedTurn);

  return { ratio: total / alive.length, allEnded };
}

/**
 * Sun/moon day cycle shown above the turn-status badge. The sun rises on the
 * left when the global turn begins (ratio ~1), travels along a half-circle arc
 * to its zenith (ratio ~0.5) and sets on the right (ratio ~0) as players spend
 * their turn. When every living player has ended their turn, the moon rises.
 */
// Shared width of the dome and the status banner below it, so the emblem never
// resizes between labels ("À VOUS" vs the longer "TOUR TERMINÉ" / "OBSERVATION").
export const TURN_SKY_WIDTH = 150;

// Half-dome geometry (viewBox units == container px) the celestial body travels.
const SKY_W = TURN_SKY_WIDTH;
const SKY_H = 46;
const SKY_CX = SKY_W / 2;
const SKY_CY = SKY_H - 5;
const SKY_RX = SKY_W / 2 - 12;
const SKY_RY = SKY_H - 12;

export function TurnSkyArc({
  gameState,
  faction,
}: {
  gameState: GameState;
  faction?: Faction | null;
}) {
  const { t } = useI18n();
  const { ratio, allEnded } = getGlobalTurnProgress(gameState);
  const castleSrc = `/assets/sprites/map/town-${faction ?? Faction.CASTLE}.webp`;
  const clamped = Math.max(0, Math.min(1, ratio));
  const percent = Math.round(ratio * 100);
  const label = allEnded ? t("hud.nightAllEnded") : t("hud.dayProgress", { percent });

  // Travel the elliptical arc: ratio 1 -> left horizon, 0.5 -> zenith, 0 -> right.
  // The moon simply rests at the zenith once everyone has ended their turn.
  const theta = (allEnded ? 0.5 : clamped) * Math.PI;
  const bodyX = SKY_CX + SKY_RX * Math.cos(theta);
  const bodyY = SKY_CY - SKY_RY * Math.sin(theta);
  const leftPct = (bodyX / SKY_W) * 100;
  const topPct = (bodyY / SKY_H) * 100;

  return (
    <div
      className="pointer-events-none relative h-[46px] select-none"
      style={{ width: TURN_SKY_WIDTH }}
      role="img"
      aria-label={label}
      title={label}
    >
      {/* Sky dome */}
      <div
        className={`absolute inset-0 overflow-hidden rounded-t-[999px] border-x border-t backdrop-blur-[1px] transition-colors duration-1000 ${
          allEnded
            ? "border-indigo-300/25 bg-gradient-to-b from-indigo-950/70 via-indigo-950/30 to-slate-950/10"
            : "border-amber-300/25 bg-gradient-to-b from-sky-900/30 via-amber-900/15 to-stone-950/5"
        }`}
      >
        {allEnded &&
          NIGHT_STARS.map((star, i) => (
            <span
              key={i}
              className="absolute h-[2px] w-[2px] rounded-full bg-slate-100 shadow-[0_0_3px_rgba(226,232,240,0.9)] animate-pulse"
              style={{ left: `${star.x}%`, top: `${star.y}%`, animationDelay: `${star.delay}s` }}
            />
          ))}
      </div>

      {/* Castle silhouette resting at the centre of the dome */}
      <Image
        src={castleSrc}
        alt=""
        aria-hidden
        width={48}
        height={48}
        className={`absolute bottom-[5px] left-1/2 h-[26px] w-auto -translate-x-1/2 object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] transition-[filter] duration-1000 ${
          allEnded ? "brightness-[0.65] saturate-50" : "brightness-110"
        }`}
      />

      {/* Arc track */}
      <svg viewBox={`0 0 ${SKY_W} ${SKY_H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="turn-sky-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={allEnded ? "rgba(165,180,252,0)" : "rgba(251,191,36,0)"} />
            <stop offset="50%" stopColor={allEnded ? "rgba(165,180,252,0.55)" : "rgba(251,191,36,0.6)"} />
            <stop offset="100%" stopColor={allEnded ? "rgba(165,180,252,0)" : "rgba(251,191,36,0)"} />
          </linearGradient>
        </defs>
        <path
          d={`M ${SKY_CX - SKY_RX} ${SKY_CY} A ${SKY_RX} ${SKY_RY} 0 0 1 ${SKY_CX + SKY_RX} ${SKY_CY}`}
          fill="none"
          stroke="url(#turn-sky-arc)"
          strokeWidth="1"
          strokeDasharray="2 3"
          strokeLinecap="round"
        />
      </svg>

      {/* Horizon glow */}
      <div
        className={`absolute inset-x-3 bottom-0 h-px ${
          allEnded ? "bg-indigo-300/40" : "bg-amber-300/50"
        }`}
      />

      {/* Celestial body + halo */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-700 ease-out"
        style={{ left: `${leftPct}%`, top: `${topPct}%` }}
      >
        {allEnded ? (
          <>
            <span className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-200/25 blur-lg" />
            <span className="relative grid place-items-center text-slate-100 drop-shadow-[0_0_6px_rgba(226,232,240,0.85)]">
              <MoonIcon className="h-[18px] w-[18px]" />
            </span>
          </>
        ) : (
          <>
            <span className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/25 blur-xl" />
            <span className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-200/50 blur-md" />
            <span className="relative grid place-items-center text-amber-200 drop-shadow-[0_0_8px_rgba(251,191,36,0.95)]">
              <SunIcon className="h-[18px] w-[18px]" />
            </span>
          </>
        )}
      </div>
    </div>
  );
}

const NIGHT_STARS = [
  { x: 22, y: 55, delay: 0 },
  { x: 38, y: 32, delay: 0.6 },
  { x: 52, y: 22, delay: 1.2 },
  { x: 66, y: 30, delay: 0.3 },
  { x: 80, y: 50, delay: 0.9 },
] as const;

function getPlayerTurnProgress(player: Player, gameState: GameState) {
  if (!player.isAlive || player.hasEndedTurn) return { ratio: 0, activeCombatCount: 0 };

  const baseRatio = player.turnProgressRatio ?? computeLocalTurnProgressRatio(player, gameState);
  const activeCombatCount = (gameState.activeCombats ?? []).filter((combat) =>
    combatInvolvesPlayer(combat, player.id) && !findActiveCombatTruce(combat.truces, gameState.turnNumber)
  ).length;

  return {
    ratio: baseRatio === 0 && activeCombatCount > 0 ? 0.08 : baseRatio,
    activeCombatCount,
  };
}

function computeLocalTurnProgressRatio(player: Player, gameState: GameState) {
  const movableHeroes = player.heroes.filter((hero) => hero.maxMovement > 0);
  const heroTotal = movableHeroes.length;
  const heroRemaining = movableHeroes.reduce((total, hero) => {
    return total + Math.max(0, Math.min(1, hero.movement / hero.maxMovement));
  }, 0);
  const townTotal = player.towns.length;
  const townRemaining = player.towns.filter((town) => town.lastBuiltTurn !== gameState.turnNumber).length;
  const baseTotal = heroTotal + townTotal;
  return baseTotal > 0
    ? Math.max(0, Math.min(1, (heroRemaining + townRemaining) / baseTotal))
    : 0;
}

export function combatInvolvesPlayer(combat: PersistentCombat, playerId: string) {
  return (
    combat.attackerPlayerId === playerId ||
    combat.defenderPlayerId === playerId ||
    Boolean(combat.participants?.some((participant) => participant.playerId === playerId))
  );
}
