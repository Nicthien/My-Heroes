"use client";

import Image from "next/image";
import { type GameState, type PersistentCombat, type Player, type Resources } from "@/lib/game/types";
import { HourglassIcon } from "./theme";

const RESOURCE_ITEMS = [
  { key: "gold", label: "Or", short: "Or", src: "/assets/sprites/resources/gold.webp", text: "text-yellow-200", ring: "ring-yellow-300/50", glow: "shadow-yellow-500/25", bg: "from-yellow-300 to-amber-600" },
  { key: "wood", label: "Bois", short: "Bois", src: "/assets/sprites/resources/wood.webp", text: "text-orange-200", ring: "ring-orange-300/40", glow: "shadow-orange-700/25", bg: "from-amber-700 to-orange-950" },
  { key: "ore", label: "Minerai", short: "Min.", src: "/assets/sprites/resources/ore.webp", text: "text-slate-200", ring: "ring-slate-300/40", glow: "shadow-slate-400/20", bg: "from-slate-300 to-slate-700" },
  { key: "mercury", label: "Mercure", short: "Merc.", src: "/assets/sprites/resources/mercury.webp", text: "text-violet-200", ring: "ring-violet-300/40", glow: "shadow-violet-500/25", bg: "from-violet-300 to-fuchsia-700" },
  { key: "crystals", label: "Cristaux", short: "Crist.", src: "/assets/sprites/resources/crystals.webp", text: "text-cyan-100", ring: "ring-cyan-300/50", glow: "shadow-cyan-400/30", bg: "from-cyan-200 to-sky-700" },
  { key: "gems", label: "Gemmes", short: "Gem.", src: "/assets/sprites/resources/gems.webp", text: "text-pink-100", ring: "ring-pink-300/50", glow: "shadow-pink-400/30", bg: "from-pink-200 to-rose-700" },
  { key: "sulfur", label: "Soufre", short: "Soufre", src: "/assets/sprites/resources/sulfur.webp", text: "text-amber-100", ring: "ring-amber-300/40", glow: "shadow-amber-500/25", bg: "from-orange-300 to-yellow-700" },
] as const;

type ResourceItem = (typeof RESOURCE_ITEMS)[number];

export function ResourceBar({ resources }: { resources: Resources }) {
  return (
    <div className="grid w-[clamp(21rem,34vw,27rem)] grid-cols-[1.15fr_repeat(3,1fr)] grid-rows-2 gap-1.5 text-xs xl:text-sm">
      {RESOURCE_ITEMS.map((item) => {
        const isGold = item.key === "gold";

        return (
          <span
            key={item.key}
            title={`${item.label} : ${resources[item.key]}`}
            className={`group flex items-center rounded-lg border border-amber-700/50 bg-gradient-to-b from-stone-900 to-black shadow-[inset_0_0_0_1px_rgba(252,211,77,0.12)] transition hover:-translate-y-0.5 hover:border-amber-400/70 ${
              isGold
                ? "row-span-2 flex-col justify-center gap-1.5 px-2 py-2"
                : "min-h-[2.35rem] justify-between gap-2 px-2 py-1 xl:px-2.5"
            }`}
          >
            <ResourceIcon item={item} size={isGold ? "lg" : "sm"} />
            <span className={`font-black tabular-nums text-amber-100 drop-shadow ${isGold ? "text-lg xl:text-xl" : ""}`}>
              {resources[item.key]}
            </span>
          </span>
        );
      })}
    </div>
  );
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
  const { ratio, activeCombatCount } = getPlayerTurnProgress(player, gameState);
  const percent = Math.round(ratio * 100);
  const fill = ratio > 0.55
    ? "from-emerald-300 via-lime-300 to-amber-300"
    : ratio > 0.18
      ? "from-amber-300 via-orange-300 to-red-300"
      : "from-red-500 via-red-400 to-rose-300";
  const title = activeCombatCount > 0
    ? `Avancement du tour : ${percent}% restant, ${activeCombatCount} combat(s) actif(s)`
    : `Avancement du tour : ${percent}% restant`;

  return (
    <div
      className={`${className} overflow-hidden rounded-sm border border-amber-700/45 bg-black/65 shadow-inner shadow-black/70`}
      role="progressbar"
      aria-label={`Avancement de ${player.name}`}
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
  if (ended) {
    return (
      <span
        className="ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full border border-emerald-400/45 bg-emerald-950/55 text-emerald-300"
        title="Tour termine"
        aria-label="Tour termine"
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
      title="Tour en cours"
      aria-label="Tour en cours"
    >
      <HourglassIcon className="h-3 w-3" />
    </span>
  );
}

function getPlayerTurnProgress(player: Player, gameState: GameState) {
  if (!player.isAlive || player.hasEndedTurn) return { ratio: 0, activeCombatCount: 0 };

  const heroTotal = player.heroes.length;
  const heroRemaining = player.heroes.reduce((total, hero) => {
    if (hero.maxMovement <= 0) return total;
    return total + Math.max(0, Math.min(1, hero.movement / hero.maxMovement));
  }, 0);
  const townTotal = player.towns.length;
  const townRemaining = player.towns.filter((town) => town.lastBuiltTurn !== gameState.turnNumber).length;
  const baseTotal = heroTotal + townTotal;
  const baseRatio = baseTotal > 0
    ? Math.max(0, Math.min(1, (heroRemaining + townRemaining) / baseTotal))
    : 0;
  const activeCombatCount = (gameState.activeCombats ?? []).filter((combat) =>
    combatInvolvesPlayer(combat, player.id)
  ).length;

  return {
    ratio: baseRatio === 0 && activeCombatCount > 0 ? 0.08 : baseRatio,
    activeCombatCount,
  };
}

export function combatInvolvesPlayer(combat: PersistentCombat, playerId: string) {
  return (
    combat.attackerPlayerId === playerId ||
    combat.defenderPlayerId === playerId ||
    Boolean(combat.participants?.some((participant) => participant.playerId === playerId))
  );
}
