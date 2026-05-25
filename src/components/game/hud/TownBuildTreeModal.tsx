"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { BuildingType, type Faction, type GameState, type Player, type Town } from "@/lib/game/types";
import { canAfford, formatCost } from "@/lib/game/economy";
import {
  BASE_DWELLING_TYPES,
  UPGRADED_DWELLING_TYPES,
  hasTownBuilding,
  type TownBuildingRule,
} from "@/lib/game/town-buildings";
import { getTownBuildingSprite } from "@/lib/game/town-building-sprites";
import { buildingTypeLabel, factionLabel } from "./helpers";
import { BuildIcon } from "./icons";
import { goldText, ornateFramePolished } from "./theme";

type BuildNodeState =
  | { kind: "built"; label: "Construit"; canBuild: false }
  | { kind: "buildable"; label: "Construire"; canBuild: true }
  | { kind: "missingRequirement"; label: string; canBuild: false }
  | { kind: "capitolLimit"; label: "Limite Capitole"; canBuild: false }
  | { kind: "missingResources"; label: "Ressources insuffisantes"; canBuild: false }
  | { kind: "unavailable"; label: "Indisponible"; canBuild: false };

type BuildTreeGroup = {
  id: string;
  label: string;
  rules: TownBuildingRule[];
};

type BuildTreeNodeLayout = {
  group: BuildTreeGroup;
  rule: TownBuildingRule;
  state: BuildNodeState;
  x: number;
  y: number;
};

const NODE_WIDTH = 190;
const NODE_HEIGHT = 148;
const GROUP_GAP = 58;
const ROW_GAP = 66;
const CANVAS_PADDING_X = 44;
const CANVAS_PADDING_Y = 36;

export function TownBuildTreeModal({
  selectedTown,
  selectedTownFaction,
  rules,
  myPlayer,
  gameState,
  hasPlayerCapitol,
  canAct,
  isPending,
  isMyTown,
  onBuild,
  onClose,
}: {
  selectedTown: Town;
  selectedTownFaction: Faction;
  rules: TownBuildingRule[];
  myPlayer: Player | undefined;
  gameState: GameState;
  hasPlayerCapitol: boolean;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  onBuild: (building: BuildingType) => void;
  onClose: () => void;
}) {
  const portalTarget = typeof document === "undefined" ? null : document.body;
  const ruleByType = useMemo(() => new Map(rules.map((rule) => [rule.type, rule])), [rules]);
  const groups = useMemo(() => buildTreeGroups(rules), [rules]);
  const layout = useMemo(() => {
    return buildTreeLayout({
      groups,
      selectedTown,
      selectedTownFaction,
      myPlayer,
      gameState,
      hasPlayerCapitol,
      canAct,
      isPending,
      isMyTown,
    });
  }, [canAct, gameState, groups, hasPlayerCapitol, isMyTown, isPending, myPlayer, selectedTown, selectedTownFaction]);

  const modal = (
    <div className="fixed inset-0 z-[999] grid bg-black/75 p-0 text-amber-50 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Arbre des constructions">
      <section className={`${ornateFramePolished} flex h-full w-full flex-col overflow-hidden sm:max-h-[min(50rem,calc(100vh-2rem))] sm:w-[min(82rem,calc(100vw-2rem))]`}>
        <header className="flex items-center gap-3 border-b border-amber-700/50 bg-stone-950/90 px-4 py-3">
          <BuildTreeHeaderIcon className="h-6 w-6 shrink-0 text-amber-200" />
          <div className="min-w-0 flex-1">
            <h2 className={`truncate text-lg font-black ${goldText}`}>Arbre des constructions</h2>
            <div className="truncate text-xs text-amber-200/70">
              {selectedTown.name} - {factionLabel(selectedTownFaction)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-amber-700/50 bg-black/35 px-3 py-1 text-sm font-bold text-amber-100 transition hover:border-amber-300"
          >
            Fermer
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-stone-950/95 p-0">
          <div
            className="relative overflow-hidden bg-gradient-to-b from-stone-950 via-stone-950 to-black"
            style={{ width: layout.width, height: layout.height }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(245,158,11,0.10)_0,transparent_18rem),radial-gradient(circle_at_78%_72%,rgba(120,113,108,0.10)_0,transparent_16rem)]" />
            <BuildTreeConnections nodes={layout.nodes} ruleByType={ruleByType} />
            {layout.groups.map((group) => (
              <div
                key={group.id}
                className="absolute z-10 rounded-md border border-amber-700/45 bg-black/45 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-100/80 shadow-lg shadow-black/30"
                style={{ left: group.x, top: 14 }}
              >
                {group.label}
              </div>
            ))}
            {layout.nodes.map((node) => (
              <BuildTreeNode
                key={node.rule.type}
                rule={node.rule}
                state={node.state}
                selectedTownFaction={selectedTownFaction}
                onBuild={onBuild}
                x={node.x}
                y={node.y}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  return portalTarget ? createPortal(modal, portalTarget) : modal;
}

function BuildTreeNode({
  rule,
  state,
  selectedTownFaction,
  onBuild,
  x,
  y,
}: {
  rule: TownBuildingRule;
  state: BuildNodeState;
  selectedTownFaction: Faction;
  onBuild: (building: BuildingType) => void;
  x: number;
  y: number;
}) {
  const stateClass = getNodeStateClass(state.kind);
  const buildingSprite = getTownBuildingSprite(rule, selectedTownFaction);
  return (
    <article
      className="absolute z-10"
      style={{ left: x, top: y, width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <div className="relative h-full">
        <div
          className={`group/sprite absolute left-1/2 top-0 z-20 grid h-20 w-24 -translate-x-1/2 place-items-center rounded-md border-2 bg-black/65 shadow-[0_12px_26px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/80 ${stateClass.frame}`}
          role="img"
          aria-label={`${rule.label} : ${rule.description}`}
          tabIndex={0}
        >
          {buildingSprite ? (
            <Image
              src={buildingSprite}
              alt=""
              width={76}
              height={76}
              className={`h-[4.35rem] w-[4.35rem] object-contain drop-shadow-[0_5px_7px_rgba(0,0,0,0.55)] ${state.kind === "unavailable" || state.kind === "missingRequirement" ? "opacity-45 grayscale" : ""}`}
              unoptimized
              aria-hidden="true"
            />
          ) : (
            <BuildTreeHeaderIcon className="h-10 w-10 text-amber-200/60" />
          )}
          <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-md border border-amber-600/65 bg-stone-950/97 px-3 py-2 text-center text-[11px] font-bold leading-snug text-amber-100 opacity-0 shadow-xl shadow-black/60 transition group-hover/sprite:opacity-100 group-focus/sprite:opacity-100">
            {rule.description}
          </div>
        </div>

        <div className={`absolute left-0 right-0 top-[5.25rem] z-10 h-16 rounded-md border-2 px-2.5 py-2 shadow-[0_12px_24px_rgba(0,0,0,0.42),inset_0_0_18px_rgba(0,0,0,0.35)] ${stateClass.card}`}>
          <div className="pointer-events-none absolute inset-0 rounded-[0.3rem] bg-[linear-gradient(90deg,rgba(245,158,11,0.08),transparent_40%),radial-gradient(circle_at_20%_40%,rgba(120,113,108,0.18),transparent_28%)]" />
          {state.kind === "buildable" && (
            <span className="absolute -left-2 -top-4 grid h-7 w-7 place-items-center rounded-md border-2 border-emerald-300 bg-emerald-700 text-emerald-50 shadow-lg shadow-emerald-950/50" aria-hidden="true">
              <BuildIcon className="h-4 w-4" />
            </span>
          )}
          <div className="relative flex h-7 items-center justify-center text-center">
            <h4 className="line-clamp-2 text-sm font-black leading-tight text-amber-50 drop-shadow" title={rule.label}>{rule.label}</h4>
          </div>

          <div className="relative mt-1 flex items-center justify-between gap-2 text-[10px] font-bold text-amber-100/65">
            <span className="truncate">{formatCost(rule.cost) || "Gratuit"}</span>
            <span className={`max-w-[6.7rem] truncate text-right ${getStateTextClass(state.kind)}`} title={state.label}>
              {getShortStateLabel(state)}
            </span>
          </div>

          {state.canBuild && (
            <button
              type="button"
              onClick={() => onBuild(rule.type)}
              className="relative mt-1 h-6 w-full rounded-md border border-emerald-300/70 bg-gradient-to-b from-emerald-600 to-emerald-800 text-[11px] font-black text-emerald-50 transition hover:from-emerald-500 hover:to-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70"
            >
              Construire
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function buildTreeGroups(rules: TownBuildingRule[]): BuildTreeGroup[] {
  return [
    {
      id: "common",
      label: "Centre et communs",
      rules: orderRules(rules.filter((rule) => rule.category === "common" && !BASE_DWELLING_TYPES.includes(rule.type) && !UPGRADED_DWELLING_TYPES.includes(rule.type))),
    },
    {
      id: "mage",
      label: "Guilde des mages",
      rules: orderRules(rules.filter((rule) => rule.category === "mage_guild")),
    },
    {
      id: "dwellings",
      label: "Demeures",
      rules: orderRules(rules.filter((rule) => rule.category === "dwelling")),
    },
    {
      id: "upgrades",
      label: "Améliorations",
      rules: orderRules(rules.filter((rule) => rule.category === "dwelling_upgrade")),
    },
    {
      id: "unique",
      label: "Bâtiments uniques",
      rules: orderRules(rules.filter((rule) => rule.category === "unique")),
    },
  ].filter((group) => group.rules.length > 0);
}

function buildTreeLayout({
  groups,
  selectedTown,
  selectedTownFaction,
  myPlayer,
  gameState,
  hasPlayerCapitol,
  canAct,
  isPending,
  isMyTown,
}: {
  groups: BuildTreeGroup[];
  selectedTown: Town;
  selectedTownFaction: Faction;
  myPlayer: Player | undefined;
  gameState: GameState;
  hasPlayerCapitol: boolean;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
}) {
  const maxRows = Math.max(1, ...groups.map((group) => group.rules.length));
  const nodes: BuildTreeNodeLayout[] = [];
  const groupHeaders: Array<{ id: string; label: string; x: number }> = [];
  let x = CANVAS_PADDING_X;

  for (const group of groups) {
    const groupWidth = NODE_WIDTH;
    groupHeaders.push({ id: group.id, label: group.label, x });
    group.rules.forEach((rule, index) => {
      nodes.push({
        group,
        rule,
        state: getBuildNodeState({
          rule,
          selectedTown,
          selectedTownFaction,
          myPlayer,
          gameState,
          hasPlayerCapitol,
          canAct,
          isPending,
          isMyTown,
        }),
        x,
        y: CANVAS_PADDING_Y + 38 + index * (NODE_HEIGHT + ROW_GAP),
      });
    });
    x += groupWidth + GROUP_GAP;
  }

  return {
    groups: groupHeaders,
    nodes,
    width: Math.max(1060, x + CANVAS_PADDING_X - GROUP_GAP),
    height: CANVAS_PADDING_Y + 80 + maxRows * NODE_HEIGHT + Math.max(0, maxRows - 1) * ROW_GAP,
  };
}

function orderRules(rules: TownBuildingRule[]) {
  const indexByType = new Map(rules.map((rule, index) => [rule.type, index]));
  return [...rules].sort((a, b) => {
    if (a.requires?.includes(b.type)) return 1;
    if (b.requires?.includes(a.type)) return -1;
    return (indexByType.get(a.type) ?? 0) - (indexByType.get(b.type) ?? 0);
  });
}

function getBuildNodeState({
  rule,
  selectedTown,
  selectedTownFaction,
  myPlayer,
  gameState,
  hasPlayerCapitol,
  canAct,
  isPending,
  isMyTown,
}: {
  rule: TownBuildingRule;
  selectedTown: Town;
  selectedTownFaction: Faction;
  myPlayer: Player | undefined;
  gameState: GameState;
  hasPlayerCapitol: boolean;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
}) {
  const alreadyBuilt = selectedTown.buildings.includes(rule.type);
  if (alreadyBuilt) return { kind: "built", label: "Construit", canBuild: false } as const;

  const missingRequirement = rule.requires?.find((requirement) => !hasTownBuilding(selectedTown.buildings, requirement));
  if (missingRequirement) {
    return {
      kind: "missingRequirement",
      label: `Prérequis : ${buildingTypeLabel(missingRequirement, selectedTownFaction)}`,
      canBuild: false,
    } as const;
  }

  const blockedByCapitolLimit =
    rule.type === BuildingType.CAPITOL &&
    hasPlayerCapitol &&
    !selectedTown.buildings.includes(BuildingType.CAPITOL);
  if (blockedByCapitolLimit) return { kind: "capitolLimit", label: "Limite Capitole", canBuild: false } as const;

  const lacksResources = Boolean(myPlayer && !canAfford(myPlayer.resources, rule.cost));
  if (lacksResources) return { kind: "missingResources", label: "Ressources insuffisantes", canBuild: false } as const;

  if (!myPlayer || selectedTown.lastBuiltTurn === gameState.turnNumber || !canAct || !isMyTown || isPending) {
    return { kind: "unavailable", label: "Indisponible", canBuild: false } as const;
  }

  return { kind: "buildable", label: "Construire", canBuild: true } as const;
}

function getNodeStateClass(kind: BuildNodeState["kind"]) {
  switch (kind) {
    case "built":
      return {
        frame: "border-amber-600/70 shadow-emerald-950/20",
        card: "border-emerald-600/70 bg-stone-900/92 shadow-emerald-900/20",
      };
    case "buildable":
      return {
        frame: "border-emerald-400/85 shadow-[0_0_22px_rgba(16,185,129,0.42)]",
        card: "border-emerald-400/90 bg-stone-900/95 shadow-[0_0_24px_rgba(16,185,129,0.32)]",
      };
    case "missingResources":
      return {
        frame: "border-red-600/75 shadow-red-950/40",
        card: "border-red-700/80 bg-stone-950/90 shadow-red-950/40",
      };
    case "missingRequirement":
    case "capitolLimit":
      return {
        frame: "border-stone-700/80",
        card: "border-stone-700/90 bg-stone-950/86 opacity-75",
      };
    default:
      return {
        frame: "border-stone-700/80",
        card: "border-stone-700/90 bg-stone-950/82 opacity-70",
      };
  }
}

function getStateTextClass(kind: BuildNodeState["kind"]) {
  switch (kind) {
    case "built":
      return "text-emerald-300";
    case "buildable":
      return "text-amber-200";
    case "missingResources":
    case "missingRequirement":
    case "capitolLimit":
      return "text-red-300";
    default:
      return "text-stone-400";
  }
}

function getShortStateLabel(state: BuildNodeState) {
  if (state.kind === "missingRequirement") return "Prérequis";
  return state.label;
}

function BuildTreeConnections({
  nodes,
  ruleByType,
}: {
  nodes: BuildTreeNodeLayout[];
  ruleByType: Map<BuildingType, TownBuildingRule>;
}) {
  const nodeByType = new Map(nodes.map((node) => [node.rule.type, node]));
  const width = Math.max(...nodes.map((node) => node.x + NODE_WIDTH + CANVAS_PADDING_X));
  const height = Math.max(...nodes.map((node) => node.y + NODE_HEIGHT + CANVAS_PADDING_Y));

  return (
    <svg className="absolute inset-0 z-0" width={width} height={height} aria-hidden="true">
      <defs>
        <filter id="build-tree-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {nodes.flatMap((node) =>
        (node.rule.requires ?? [])
          .filter((requirement) => ruleByType.has(requirement))
          .map((requirement) => {
            const parent = nodeByType.get(requirement);
            if (!parent) return null;
            const startX = parent.x + NODE_WIDTH / 2;
            const startY = parent.y + NODE_HEIGHT - 8;
            const endX = node.x + NODE_WIDTH / 2;
            const endY = node.y + 8;
            const midY = startY + Math.max(24, (endY - startY) / 2);
            const path = `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`;
            return (
              <g key={`${requirement}-${node.rule.type}`}>
                <path d={path} fill="none" stroke="rgba(0,0,0,0.85)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                <path d={path} fill="none" stroke="rgba(146,64,14,0.76)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" filter="url(#build-tree-glow)" />
                <path d={path} fill="none" stroke="rgba(251,191,36,0.42)" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })
      )}
    </svg>
  );
}

function BuildTreeHeaderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v5" />
      <path d="M6 13v3" />
      <path d="M18 13v3" />
      <path d="M12 8H6v5" />
      <path d="M12 8h6v5" />
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <rect x="3" y="16" width="6" height="5" rx="1" />
      <rect x="15" y="16" width="6" height="5" rx="1" />
    </svg>
  );
}

