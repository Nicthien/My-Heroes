"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { BuildingType, type Faction, type GameState, type Player, type Town } from "@/lib/game/types";
import { canAfford, formatCost } from "@/lib/game/economy";
import {
  hasTownBuilding,
  type TownBuildingRule,
} from "@/lib/game/town-buildings";
import { getTownBuildingSprite } from "@/lib/game/town-building-sprites";
import { buildingTypeLabel, factionLabel } from "./helpers";
import { BuildIcon } from "./icons";
import { goldText, ornateFramePolished } from "./theme";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { localizedLabelFromId } from "@/lib/i18n/gameLabels";
import { localizedBuildingDescription } from "@/lib/game/buildings-i18n";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

type BuildNodeState =
  | { kind: "built"; label: string; canBuild: false }
  | { kind: "buildable"; label: string; canBuild: true }
  | { kind: "missingRequirement"; label: string; canBuild: false }
  | { kind: "capitolLimit"; label: string; canBuild: false }
  | { kind: "missingResources"; label: string; canBuild: false; missing: string }
  | { kind: "unavailable"; label: string; canBuild: false };

type BuildTreeNodeLayout = {
  rule: TownBuildingRule;
  state: BuildNodeState;
  x: number;
  y: number;
};

const NODE_WIDTH = 190;
const NODE_HEIGHT = 148;
const H_GAP = 28; // horizontal gap between nodes within a layer
const V_GAP = 72; // vertical gap between layers
const CANVAS_PADDING_X = 60;
const CANVAS_PADDING_Y = 40;

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

type Transform = { scale: number; x: number; y: number };

/** Pan (drag) + zoom (wheel/buttons) for the build-tree canvas. */
function usePanZoom(contentWidth: number, contentHeight: number, onBackgroundTap?: () => void) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const pan = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0, moved: false });

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || contentWidth <= 0 || contentHeight <= 0) return;
    const pad = 32;
    const scale = clampScale(Math.min(
      (vp.clientWidth - pad * 2) / contentWidth,
      (vp.clientHeight - pad * 2) / contentHeight,
      1,
    ));
    setTransform({
      scale,
      x: Math.max(pad, (vp.clientWidth - contentWidth * scale) / 2),
      y: pad,
    });
  }, [contentWidth, contentHeight]);

  useEffect(() => { fit(); }, [fit]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setTransform((t) => {
        const next = clampScale(t.scale * (e.deltaY < 0 ? 1.12 : 0.893));
        const ratio = next / t.scale;
        return { scale: next, x: mx - (mx - t.x) * ratio, y: my - (my - t.y) * ratio };
      });
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    // Let clicks on a node (and its Build button) through; pan from empty canvas.
    if ((e.target as HTMLElement).closest("[data-build-node]")) return;
    pan.current = { active: true, startX: e.clientX, startY: e.clientY, originX: transform.x, originY: transform.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pan.current.active) return;
    const dx = e.clientX - pan.current.startX;
    const dy = e.clientY - pan.current.startY;
    if (!pan.current.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) pan.current.moved = true;
    setTransform((t) => ({ ...t, x: pan.current.originX + dx, y: pan.current.originY + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const wasTap = pan.current.active && !pan.current.moved;
    pan.current.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* pointer already released */ }
    if (wasTap) onBackgroundTap?.(); // click on empty canvas clears the selection
  };

  const zoomBy = (factor: number) => setTransform((t) => {
    const vp = viewportRef.current;
    const cx = vp ? vp.clientWidth / 2 : 0;
    const cy = vp ? vp.clientHeight / 2 : 0;
    const next = clampScale(t.scale * factor);
    const ratio = next / t.scale;
    return { scale: next, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio };
  });

  return {
    viewportRef,
    transform,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    fit,
    zoomIn: () => zoomBy(1.2),
    zoomOut: () => zoomBy(1 / 1.2),
  };
}

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
  grailBuildable = false,
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
  grailBuildable?: boolean;
  onBuild: (building: BuildingType) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const portalTarget = typeof document === "undefined" ? null : document.body;
  const ruleByType = useMemo(() => new Map(rules.map((rule) => [rule.type, rule])), [rules]);
  const layout = useMemo(() => {
    return buildLayeredLayout({
      rules,
      selectedTown,
      selectedTownFaction,
      myPlayer,
      gameState,
      hasPlayerCapitol,
      canAct,
      isPending,
      isMyTown,
      grailBuildable,
      t,
      locale,
    });
  }, [canAct, gameState, rules, hasPlayerCapitol, isMyTown, isPending, grailBuildable, myPlayer, selectedTown, selectedTownFaction, t, locale]);

  // Click a building → select it and light up its construction route (all
  // prerequisites up to the roots). Click again or click empty canvas to clear.
  const [selectedType, setSelectedType] = useState<BuildingType | null>(null);
  const toggleSelect = useCallback((type: BuildingType) => {
    setSelectedType((prev) => (prev === type ? null : type));
  }, []);
  const routeTypes = useMemo(() => {
    if (!selectedType) return null;
    const set = new Set<BuildingType>();
    const visit = (type: BuildingType) => {
      if (set.has(type)) return;
      set.add(type);
      for (const req of ruleByType.get(type)?.requires ?? []) {
        if (ruleByType.has(req)) visit(req);
      }
    };
    visit(selectedType);
    return set;
  }, [selectedType, ruleByType]);

  const { viewportRef, transform, onPointerDown, onPointerMove, onPointerUp, fit, zoomIn, zoomOut } = usePanZoom(layout.width, layout.height, () => setSelectedType(null));

  const modal = (
    <div className="fixed inset-0 z-[999] grid bg-black/75 p-0 text-amber-50 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t("town.buildTree")} onContextMenu={(e) => e.preventDefault()}>
      <section className={`${ornateFramePolished} flex h-full w-full flex-col overflow-hidden sm:max-h-[min(50rem,calc(100vh-2rem))] sm:w-[min(82rem,calc(100vw-2rem))]`}>
        <header className="flex items-center gap-3 border-b border-amber-700/50 bg-stone-950/90 px-4 py-3">
          <BuildTreeHeaderIcon className="h-6 w-6 shrink-0 text-amber-200" />
          <div className="min-w-0 flex-1">
            <h2 className={`truncate text-lg font-black ${goldText}`}>{t("town.buildTree")}</h2>
            <div className="truncate text-xs text-amber-200/70">
              {selectedTown.name} - {factionLabel(selectedTownFaction, locale)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-amber-700/50 bg-black/35 px-3 py-1 text-sm font-bold text-amber-100 transition hover:border-amber-300"
          >
            {t("common.close")}
          </button>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-gradient-to-b from-stone-950 via-stone-950 to-black">
          {/* Fixed background — does not move with pan/zoom */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(245,158,11,0.10)_0,transparent_18rem),radial-gradient(circle_at_78%_72%,rgba(120,113,108,0.10)_0,transparent_16rem)]" />
          <div
            ref={viewportRef}
            className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{ width: layout.width, height: layout.height, transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
            >
              <BuildTreeConnections nodes={layout.nodes} ruleByType={ruleByType} routeTypes={routeTypes} />
              {layout.nodes.map((node) => (
                <BuildTreeNode
                  key={node.rule.type}
                  rule={node.rule}
                  state={node.state}
                  selectedTownFaction={selectedTownFaction}
                  onBuild={onBuild}
                  onSelect={toggleSelect}
                  isSelected={selectedType === node.rule.type}
                  inRoute={routeTypes?.has(node.rule.type) ?? false}
                  selectionActive={routeTypes !== null}
                  x={node.x}
                  y={node.y}
                  t={t}
                  locale={locale}
                />
              ))}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 hidden -translate-x-1/2 text-[10px] font-bold text-amber-200/50 sm:block">
            {t("buildtree.panZoomHint")}
          </div>
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-md border border-amber-700/50 bg-stone-950/90 p-1 shadow-lg shadow-black/40">
            <button type="button" onClick={zoomOut} aria-label={t("buildtree.zoomOut")} className="grid h-7 w-7 place-items-center rounded border border-amber-700/40 bg-black/40 text-lg font-black leading-none text-amber-100 transition hover:border-amber-300">−</button>
            <span className="w-12 text-center text-[11px] font-bold tabular-nums text-amber-100/80">{Math.round(transform.scale * 100)}%</span>
            <button type="button" onClick={zoomIn} aria-label={t("buildtree.zoomIn")} className="grid h-7 w-7 place-items-center rounded border border-amber-700/40 bg-black/40 text-lg font-black leading-none text-amber-100 transition hover:border-amber-300">+</button>
            <button type="button" onClick={fit} className="ml-1 rounded border border-amber-700/40 bg-black/40 px-2 py-1 text-[11px] font-bold text-amber-100 transition hover:border-amber-300">{t("buildtree.fit")}</button>
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
  onSelect,
  isSelected,
  inRoute,
  selectionActive,
  x,
  y,
  t,
  locale,
}: {
  rule: TownBuildingRule;
  state: BuildNodeState;
  selectedTownFaction: Faction;
  onBuild: (building: BuildingType) => void;
  onSelect: (building: BuildingType) => void;
  isSelected: boolean;
  inRoute: boolean;
  selectionActive: boolean;
  x: number;
  y: number;
  t: TFn;
  locale: Locale;
}) {
  const localizedName = localizedLabelFromId(rule.type, rule.label, locale);
  const stateClass = getNodeStateClass(state.kind);
  const buildingSprite = getTownBuildingSprite(rule, selectedTownFaction);
  const costLabel = formatCost(rule.cost);
  const dimmed = selectionActive && !inRoute;
  const routeRing = isSelected
    ? "ring-4 ring-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.6)]"
    : inRoute
      ? "ring-2 ring-amber-400/80"
      : "";
  return (
    <article
      data-build-node
      onClick={() => onSelect(rule.type)}
      className={`absolute z-10 cursor-pointer transition-opacity ${dimmed ? "opacity-25" : "opacity-100"}`}
      style={{ left: x, top: y, width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <div className="relative h-full">
        <div
          className={`group/sprite absolute left-1/2 top-0 z-20 grid h-20 w-24 -translate-x-1/2 place-items-center rounded-md border-2 bg-black/65 shadow-[0_12px_26px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/80 ${stateClass.frame} ${routeRing}`}
          role="img"
          aria-label={`${localizedName} : ${localizedBuildingDescription(rule.description, locale)}`}
          tabIndex={0}
        >
          {buildingSprite ? (
            <Image
              src={buildingSprite}
              alt=""
              width={76}
              height={76}
              className={`h-[4.35rem] w-[4.35rem] object-contain drop-shadow-[0_5px_7px_rgba(0,0,0,0.55)] ${state.kind === "unavailable" || state.kind === "missingRequirement" ? "opacity-45 grayscale" : ""}`}
              style={{ height: "auto" }}
              unoptimized
              aria-hidden="true"
            />
          ) : (
            <BuildTreeHeaderIcon className="h-10 w-10 text-amber-200/60" />
          )}
          <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-md border border-amber-600/65 bg-stone-950/97 px-3 py-2 text-center text-[11px] font-bold leading-snug text-amber-100 opacity-0 shadow-xl shadow-black/60 transition group-hover/sprite:opacity-100 group-focus/sprite:opacity-100">
            {localizedBuildingDescription(rule.description, locale)}
            <div className="mt-1.5 border-t border-amber-700/40 pt-1.5 text-amber-200/90">
              {costLabel ? t("buildtree.costList", { list: costLabel }) : t("buildtree.free")}
            </div>
            {state.kind === "missingResources" && state.missing && (
              <div className="mt-1 font-black text-red-300">
                {t("buildtree.missingResourcesList", { list: state.missing })}
              </div>
            )}
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
            <h4 className="line-clamp-2 text-sm font-black leading-tight text-amber-50 drop-shadow" title={localizedName}>{localizedName}</h4>
          </div>

          <div className="relative mt-1 flex items-center justify-between gap-2 text-[10px] font-bold text-amber-100/65">
            <span className="truncate" title={costLabel || t("buildtree.free")}>{costLabel || t("buildtree.free")}</span>
            <span
              className={`max-w-[6.7rem] truncate text-right ${getStateTextClass(state.kind)}`}
              title={state.kind === "missingResources" && state.missing ? t("buildtree.missingResourcesList", { list: state.missing }) : state.label}
            >
              {getShortStateLabel(state, t)}
            </span>
          </div>

          {state.canBuild && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onBuild(rule.type); }}
              className="relative mt-1 h-6 w-full rounded-md border border-emerald-300/70 bg-gradient-to-b from-emerald-600 to-emerald-800 text-[11px] font-black text-emerald-50 transition hover:from-emerald-500 hover:to-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70"
            >
              {t("build.build")}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Mermaid-style top-down layered layout: roots (no prerequisite — Tavern, Fort,
 * Mage Guild lvl 1, tier-1 dwelling, …) sit on the top row, and every building
 * is placed one row below its deepest prerequisite. A barycenter pass orders
 * each row by the average position of its parents to limit edge crossings.
 */
function buildLayeredLayout({
  rules,
  selectedTown,
  selectedTownFaction,
  myPlayer,
  gameState,
  hasPlayerCapitol,
  canAct,
  isPending,
  isMyTown,
  grailBuildable,
  t,
  locale,
}: {
  rules: TownBuildingRule[];
  selectedTown: Town;
  selectedTownFaction: Faction;
  myPlayer: Player | undefined;
  gameState: GameState;
  hasPlayerCapitol: boolean;
  canAct: boolean;
  isPending: boolean;
  isMyTown: boolean;
  grailBuildable: boolean;
  t: TFn;
  locale: Locale;
}) {
  const present = new Set(rules.map((rule) => rule.type));
  const ruleByType = new Map(rules.map((rule) => [rule.type, rule]));
  const parentsOf = (rule: TownBuildingRule) => (rule.requires ?? []).filter((req) => present.has(req));

  const depthCache = new Map<string, number>();
  const computeDepth = (type: BuildingType, stack: Set<string>): number => {
    const cached = depthCache.get(type);
    if (cached !== undefined) return cached;
    if (stack.has(type)) return 0; // defensive cycle guard
    const rule = ruleByType.get(type);
    const parents = rule ? parentsOf(rule) : [];
    if (parents.length === 0) {
      depthCache.set(type, 0);
      return 0;
    }
    stack.add(type);
    const depth = 1 + Math.max(...parents.map((p) => computeDepth(p, stack)));
    stack.delete(type);
    depthCache.set(type, depth);
    return depth;
  };

  const layers: TownBuildingRule[][] = [];
  for (const rule of rules) {
    const depth = computeDepth(rule.type, new Set());
    (layers[depth] ??= []).push(rule);
  }

  // Barycenter ordering to reduce crossing edges, layer by layer top-down.
  const orderIndex = new Map<string, number>();
  layers[0]?.forEach((rule, i) => orderIndex.set(rule.type, i));
  for (let d = 1; d < layers.length; d++) {
    const layer = layers[d];
    if (!layer) continue;
    const barycenter = (rule: TownBuildingRule) => {
      const parents = parentsOf(rule);
      if (parents.length === 0) return orderIndex.get(rule.type) ?? 0;
      return parents.reduce((sum, p) => sum + (orderIndex.get(p) ?? 0), 0) / parents.length;
    };
    layer.sort((a, b) => barycenter(a) - barycenter(b));
    layer.forEach((rule, i) => orderIndex.set(rule.type, i));
  }

  const layerWidth = (count: number) => count * NODE_WIDTH + Math.max(0, count - 1) * H_GAP;
  const maxRowWidth = Math.max(NODE_WIDTH, ...layers.map((layer) => layerWidth(layer?.length ?? 0)));

  const nodes: BuildTreeNodeLayout[] = [];
  layers.forEach((layer, depth) => {
    if (!layer) return;
    const startX = CANVAS_PADDING_X + (maxRowWidth - layerWidth(layer.length)) / 2;
    const y = CANVAS_PADDING_Y + depth * (NODE_HEIGHT + V_GAP);
    layer.forEach((rule, i) => {
      nodes.push({
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
          grailBuildable,
          t,
          locale,
        }),
        x: startX + i * (NODE_WIDTH + H_GAP),
        y,
      });
    });
  });

  return {
    nodes,
    width: maxRowWidth + CANVAS_PADDING_X * 2,
    height: CANVAS_PADDING_Y * 2 + layers.length * NODE_HEIGHT + Math.max(0, layers.length - 1) * V_GAP,
  };
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
  grailBuildable,
  t,
  locale,
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
  grailBuildable: boolean;
  t: TFn;
  locale: Locale;
}): BuildNodeState {
  const alreadyBuilt = selectedTown.buildings.includes(rule.type);
  if (alreadyBuilt) return { kind: "built", label: t("buildtree.built"), canBuild: false };

  // The Grail structure ignores the normal tree: it is only buildable while a
  // hero carrying the dug-up Grail stands in this town (and never twice/map).
  if (rule.grail && !grailBuildable) {
    return { kind: "missingRequirement", label: t("buildtree.requiresGrail"), canBuild: false };
  }

  const missingRequirement = rule.requires?.find((requirement) => !hasTownBuilding(selectedTown.buildings, requirement));
  if (missingRequirement) {
    return {
      kind: "missingRequirement",
      label: t("buildtree.requiresName", { name: buildingTypeLabel(missingRequirement, selectedTownFaction, locale) }),
      canBuild: false,
    };
  }

  const blockedByCapitolLimit =
    rule.type === BuildingType.CAPITOL &&
    hasPlayerCapitol &&
    !selectedTown.buildings.includes(BuildingType.CAPITOL);
  if (blockedByCapitolLimit) return { kind: "capitolLimit", label: t("buildtree.capitolLimit"), canBuild: false };

  if (myPlayer && !canAfford(myPlayer.resources, rule.cost)) {
    const r = myPlayer.resources;
    const c = rule.cost;
    const deficit = {
      gold: Math.max(0, (c.gold ?? 0) - r.gold),
      wood: Math.max(0, (c.wood ?? 0) - r.wood),
      ore: Math.max(0, (c.ore ?? 0) - r.ore),
      mercury: Math.max(0, (c.mercury ?? 0) - r.mercury),
      crystals: Math.max(0, (c.crystals ?? 0) - r.crystals),
      gems: Math.max(0, (c.gems ?? 0) - r.gems),
      sulfur: Math.max(0, (c.sulfur ?? 0) - r.sulfur),
    };
    return { kind: "missingResources", label: t("buildtree.missingResources"), canBuild: false, missing: formatCost(deficit) };
  }

  if (!myPlayer || selectedTown.lastBuiltTurn === gameState.turnNumber || !canAct || !isMyTown || isPending) {
    return { kind: "unavailable", label: t("buildtree.unavailable"), canBuild: false };
  }

  return { kind: "buildable", label: t("buildtree.buildable"), canBuild: true };
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

function getShortStateLabel(state: BuildNodeState, t: TFn) {
  if (state.kind === "missingRequirement") return t("buildtree.requires");
  return state.label;
}

function BuildTreeConnections({
  nodes,
  ruleByType,
  routeTypes,
}: {
  nodes: BuildTreeNodeLayout[];
  ruleByType: Map<BuildingType, TownBuildingRule>;
  routeTypes: Set<BuildingType> | null;
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
            const onRoute = !!routeTypes && routeTypes.has(node.rule.type) && routeTypes.has(requirement);
            const common = { d: path, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
            return (
              <g key={`${requirement}-${node.rule.type}`}>
                {routeTypes && onRoute ? (
                  <>
                    <path {...common} stroke="rgba(0,0,0,0.9)" strokeWidth="9" />
                    <path {...common} stroke="rgba(251,191,36,0.95)" strokeWidth="3.4" filter="url(#build-tree-glow)" />
                    <path {...common} stroke="rgba(255,240,205,0.8)" strokeWidth="1.2" />
                  </>
                ) : routeTypes ? (
                  <path {...common} stroke="rgba(120,113,108,0.22)" strokeWidth="2" />
                ) : (
                  <>
                    <path {...common} stroke="rgba(0,0,0,0.85)" strokeWidth="8" />
                    <path {...common} stroke="rgba(146,64,14,0.76)" strokeWidth="2.2" filter="url(#build-tree-glow)" />
                    <path {...common} stroke="rgba(251,191,36,0.42)" strokeWidth="0.8" />
                  </>
                )}
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

