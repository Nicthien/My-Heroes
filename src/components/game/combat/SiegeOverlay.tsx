"use client";

import Image from "next/image";
import type { CombatBoardUnit } from "@/lib/game/types";
import { isGateEffectivelyOpen, type SiegeState } from "@/lib/game/combat/siege";
import { getIsoPosition, TILE_WIDTH, UNIT_HEIGHT } from "./combatLayout";

type TowerShot = { towerId?: string; towerIndex: number; targetQ: number; targetR: number };

const SIEGE_SPRITES = {
  wall: "/assets/sprites/map/wall-rampart-cube.png",
  gate: "/assets/sprites/map/gate-N-S.webp",
  tower: {
    2: "/assets/sprites/siege/tower-castle-intact.webp",
    1: "/assets/sprites/siege/tower-castle-intact.webp",
    0: "/assets/sprites/siege/tower-castle-destroyed.webp",
  },
} as const;

const SIEGE_DEPTH_BASE = 7800;
const SIEGE_DEPTH_KIND_OFFSET = {
  wall: 0,
  gate: 10,
  tower: 20,
} as const;
const TOWER_OFFSET_X = -57;
const TOWER_OFFSET_Y = -138;
const DESTROYED_TOWER_OFFSET_Y = -70;
const TOWER_DEPTH_OFFSET_Y = -126;
const DESTROYED_TOWER_DEPTH_OFFSET_Y = -58;
const GATE_SIZE = 156;
const GATE_OFFSET_X = -22;
const GATE_OFFSET_Y = -67;
const GATE_DEPTH_OFFSET_Y = -42;

function getTowerVisualCell(tower: SiegeState["towers"][number]) {
  if (tower.id.includes("upper")) return { q: tower.cell.q + 1, r: 3 };
  if (tower.id.includes("lower")) return { q: tower.cell.q + 1, r: 7 };
  return null;
}

function getSiegeDepth(top: number, kind: keyof typeof SIEGE_DEPTH_KIND_OFFSET) {
  return SIEGE_DEPTH_BASE + Math.round(top * 10) + SIEGE_DEPTH_KIND_OFFSET[kind];
}

export function SiegeOverlay({
  siege,
  units,
  lastTowerShots,
  round,
}: {
  siege?: SiegeState | null;
  units: CombatBoardUnit[];
  lastTowerShots: TowerShot[];
  round: number;
}) {
  if (!siege) return null;
  const gateOpen = isGateEffectivelyOpen(siege, units);

  return (
    <div data-testid="siege-overlay" className="contents" aria-hidden="true">
      {siege.towers.flatMap((tower) => {
        const cell = getTowerVisualCell(tower);
        if (!cell) return [];
        const { x, y } = getIsoPosition(cell.q, cell.r);
        const destroyed = tower.hp <= 0;
        const height = destroyed ? 90 : 150;
        const top = y + UNIT_HEIGHT + (destroyed ? DESTROYED_TOWER_OFFSET_Y : TOWER_OFFSET_Y);
        const depthY = y + UNIT_HEIGHT + (destroyed ? DESTROYED_TOWER_DEPTH_OFFSET_Y : TOWER_DEPTH_OFFSET_Y);
        return [
          <span
            key={tower.id}
            data-testid={`siege-tower-${tower.id}`}
            data-siege-depth-y={depthY}
            className="pointer-events-none absolute block"
            style={{
              left: x + TOWER_OFFSET_X,
              top,
              width: TILE_WIDTH + 18,
              height,
              zIndex: getSiegeDepth(depthY, "tower"),
            }}
            aria-hidden="true"
          >
            <Image src={SIEGE_SPRITES.tower[tower.hp]} alt="" fill unoptimized sizes={`${TILE_WIDTH + 28}px`} className="object-contain drop-shadow-[3px_6px_5px_rgba(0,0,0,0.58)]" />
          </span>
        ];
      })}

      {siege.walls.flatMap((wall) =>
        wall.hp <= 0
          ? []
          : wall.cells.map((cell) => {
              const { x, y } = getIsoPosition(cell.q, cell.r);
              const top = y + UNIT_HEIGHT - 34;
              return (
                <span
                  key={`${wall.id}-${cell.q}-${cell.r}`}
                  data-testid={`siege-wall-${wall.id}-${cell.q}-${cell.r}`}
                  data-siege-depth-y={top}
                  className="pointer-events-none absolute block"
                  style={{
                    left: x + 7,
                    top,
                    width: 78,
                    height: 96,
                    zIndex: getSiegeDepth(top, "wall"),
                  }}
                  aria-hidden="true"
                >
                  <Image src={SIEGE_SPRITES.wall} alt="" fill unoptimized sizes="78px" className="object-contain drop-shadow-[3px_6px_5px_rgba(0,0,0,0.55)]" />
                </span>
              );
            })
      )}

      {!gateOpen && siege.gate.hp > 0 && (() => {
        const { x, y } = getIsoPosition(siege.gate.cell.q, siege.gate.cell.r);
        const top = y + UNIT_HEIGHT + GATE_OFFSET_Y;
        const depthY = y + UNIT_HEIGHT + GATE_DEPTH_OFFSET_Y;
        return (
          <span
            key="siege-gate"
            data-testid="siege-gate"
            data-siege-depth-y={depthY}
            className="pointer-events-none absolute block"
            style={{
              left: x + GATE_OFFSET_X,
              top,
              width: GATE_SIZE,
              height: GATE_SIZE,
              zIndex: getSiegeDepth(depthY, "gate"),
            }}
            aria-hidden="true"
          >
            <Image src={SIEGE_SPRITES.gate} alt="" fill unoptimized sizes={`${GATE_SIZE}px`} className="object-contain drop-shadow-[3px_6px_5px_rgba(0,0,0,0.55)]" />
          </span>
        );
      })()}

      {lastTowerShots.map((shot, index) => {
        const tower = siege.towers.find((item) => item.id === shot.towerId) ?? siege.towers[shot.towerIndex] ?? siege.towers[0];
        if (!tower) return null;
        const visualCell = getTowerVisualCell(tower) ?? getTowerVisualCell(siege.towers.find((item) => item.id.includes("upper")) ?? tower);
        if (!visualCell) return null;
        const from = getIsoPosition(visualCell.q, visualCell.r);
        const to = getIsoPosition(shot.targetQ, shot.targetR);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        return (
          <span
            key={`tower-shot-${shot.towerId ?? shot.towerIndex}-${index}-${round}`}
            className="combat-projectile"
            style={{
              left: from.x + TILE_WIDTH / 2 - 7,
              top: from.y + UNIT_HEIGHT - 58,
              zIndex: Math.max(visualCell.r, shot.targetR) * 100 + 70,
              ["--proj-dx" as string]: `${dx}px`,
              ["--proj-dy" as string]: `${dy}px`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
