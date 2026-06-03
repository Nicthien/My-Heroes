"use client";

import {
  AI_PERSONALITIES,
  AI_PERSONALITY_PROFILES,
  rollAiPersonality,
  type AiPersonality,
} from "@/lib/game/ai/strategy/personality";
import { buildAiContext } from "@/lib/game/ai/context";
import { chooseAiObjective } from "@/lib/game/ai/utility";
import { estimateAttackLossRatio } from "@/lib/game/ai/combat";
import type { AiGame, AiPlayer } from "@/lib/game/ai/types";
import { SURFACE_LEVEL, UNDERGROUND_LEVEL } from "@/lib/game/map-levels";
import { AdventureBuildingType, ResourceBuildingType, TerrainType, UnitType, type MapLevelId } from "@/lib/game/types";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";
import { useMemo, useState } from "react";

const DIFFICULTIES: Array<"simple" | "normal" | "hard"> = ["simple", "normal", "hard"];

export default function AiDevPage() {
  const { t } = useI18n();
  const [seed, setSeed] = useState("game-1");
  const [difficulty, setDifficulty] = useState<"simple" | "normal" | "hard">("normal");

  const samples = Array.from({ length: 8 }, (_, i) => ({
    playerId: `player-${i + 1}`,
    personality: rollAiPersonality(`${seed}:player-${i + 1}`, difficulty),
  }));

  const decisions = useMemo(() => SCENARIOS.map(runScenario), []);
  const lossDemo = useMemo(() => {
    const strong = { id: "h", attack: 5, defense: 5, armies: [{ id: "a", unitType: UnitType.PIKEMAN, count: 100, health: 1000, maxHealth: 10, position: 0 }] };
    const weak = { id: "d1", armies: [{ id: "g", unitType: UnitType.PIKEMAN, count: 10, health: 100, maxHealth: 10, position: 0 }] };
    const even = { id: "d2", armies: [{ id: "g", unitType: UnitType.PIKEMAN, count: 92, health: 920, maxHealth: 10, position: 0 }] };
    const lopsided = estimateAttackLossRatio(strong, weak);
    const evenRatio = estimateAttackLossRatio(strong, even);
    return [
      { id: "lopsided", labelKey: "devpage.ai.loss.lopsided.label" as TranslationKey, ratio: lopsided, ok: lopsided < 0.2, noteKey: "devpage.ai.loss.lopsided.note" as TranslationKey },
      { id: "even", labelKey: "devpage.ai.loss.even.label" as TranslationKey, ratio: evenRatio, ok: evenRatio > lopsided + 0.1, noteKey: "devpage.ai.loss.even.note" as TranslationKey },
    ];
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>{t("devpage.ai.title")}</h1>

      <section style={{ marginBottom: 32 }} data-testid="ai-navigation-decisions">
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>{t("devpage.ai.navTitle")}</h2>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
          {t("devpage.ai.navDescA")}<code>chooseAiObjective</code>{t("devpage.ai.navDescB")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {decisions.map((decision) => {
            const ok = decision.expected.includes(decision.objectiveType ?? "");
            return (
              <div
                key={decision.id}
                data-testid={`ai-decision-${decision.id}`}
                data-objective-type={decision.objectiveType ?? "none"}
                data-decision-ok={ok ? "true" : "false"}
                style={{ border: `1px solid ${ok ? "#3a7d44" : "#b3261e"}`, borderRadius: 8, padding: 12, background: "#fafafa" }}
              >
                <h3 style={{ fontSize: 16, marginBottom: 6 }}>
                  {ok ? "✅" : "❌"} {t(decision.labelKey)}
                </h3>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>{t(decision.descKey)}</p>
                <ul style={{ fontSize: 13, lineHeight: 1.6 }}>
                  <li>{t("devpage.ai.objectiveChosen")} <b>{decision.objectiveType ?? t("devpage.ai.none")}</b></li>
                  <li>{t("devpage.ai.target")} <code>{decision.objectiveId ?? "—"}</code></li>
                  <li>{t("devpage.ai.expected")} {decision.expected.map((e) => <code key={e} style={{ marginRight: 6 }}>{e}</code>)}</li>
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ marginBottom: 32 }} data-testid="ai-loss-awareness">
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>{t("devpage.ai.lossTitle")}</h2>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
          {t("devpage.ai.lossDescA")}<code>estimateAttackLossRatio</code>{t("devpage.ai.lossDescB")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {lossDemo.map((card) => (
            <div
              key={card.id}
              data-testid={`ai-loss-${card.id}`}
              data-loss-ratio={card.ratio.toFixed(3)}
              data-decision-ok={card.ok ? "true" : "false"}
              style={{ border: `1px solid ${card.ok ? "#3a7d44" : "#b3261e"}`, borderRadius: 8, padding: 12, background: "#fafafa" }}
            >
              <h3 style={{ fontSize: 16, marginBottom: 6 }}>{card.ok ? "✅" : "❌"} {t(card.labelKey)}</h3>
              <ul style={{ fontSize: 13, lineHeight: 1.6 }}>
                <li>{t("devpage.ai.expectedLosses")} <b>{Math.round(card.ratio * 100)}%</b></li>
                <li>{t(card.noteKey)}</li>
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>{t("devpage.ai.persoSimTitle")}</h2>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <label>
            {t("devpage.ai.seed")}{" "}
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              style={{ padding: 4, border: "1px solid #ccc" }}
            />
          </label>
          <label>
            {t("devpage.ai.difficulty")}{" "}
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as "simple" | "normal" | "hard")}
              style={{ padding: 4 }}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 600 }}>
          <thead>
            <tr style={{ background: "#f0f0f0" }}>
              <th style={cellStyle}>{t("devpage.ai.colPlayer")}</th>
              <th style={cellStyle}>{t("devpage.ai.colPersonality")}</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s) => (
              <tr key={s.playerId}>
                <td style={cellStyle}>{s.playerId}</td>
                <td style={cellStyle}>{s.personality}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>{t("devpage.ai.profilesTitle")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {AI_PERSONALITIES.map((p: AiPersonality) => {
            const profile = AI_PERSONALITY_PROFILES[p];
            return (
              <div key={p} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fafafa" }}>
                <h3 style={{ fontSize: 16, marginBottom: 8 }}>{p}</h3>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                  {t("devpage.ai.build")} {profile.buildPriority.slice(0, 4).join(" → ")}
                </p>
                <ul style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
                  {Object.entries(profile.profileOverrides).map(([key, value]) => (
                    <li key={key}>{key} : <b>{value}</b></li>
                  ))}
                </ul>
                <div style={{ fontSize: 12, color: "#666" }}>
                  <div>{t("devpage.ai.recruitHero")} ×{profile.recruitHeroBias}</div>
                  <div>{t("devpage.ai.mergeArmy")} ×{profile.mergeArmyBias}</div>
                  <div>{t("devpage.ai.primaryEnemy")} ×{profile.primaryEnemyAggressionBonus}</div>
                </div>
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <strong>{t("devpage.ai.skills")}</strong>
                  <div>Combat ×{profile.skillPreference.combat} · Eco ×{profile.skillPreference.economy} · Magie ×{profile.skillPreference.magic} · Util ×{profile.skillPreference.utility}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

const cellStyle: React.CSSProperties = {
  padding: 8,
  border: "1px solid #ddd",
  textAlign: "left",
  fontSize: 14,
};

// ---------------------------------------------------------------------------
// Deterministic AI navigation scenarios (level transitions + boats)
// ---------------------------------------------------------------------------

interface ScenarioTile {
  x: number;
  y: number;
  terrain: TerrainType;
  movementCost: number;
  isPassable: boolean;
  object?: unknown;
}

interface Scenario {
  id: string;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  expected: string[];
  activeLevel: MapLevelId;
  build: () => { game: AiGame; player: AiPlayer };
}

interface ScenarioResult {
  id: string;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  expected: string[];
  objectiveType: string | null;
  objectiveId: string | null;
}

const SIZE = 8;

function makeLayer(terrain: TerrainType, mutate?: (tile: ScenarioTile) => void): ScenarioTile[][] {
  return Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      const tile: ScenarioTile = { x, y, terrain, movementCost: 100, isPassable: true, object: undefined };
      mutate?.(tile);
      return tile;
    }),
  );
}

function makePlayer(exploredTiles: string[], hero: Record<string, unknown>, boats: unknown[] = []): AiPlayer {
  return {
    id: "p1",
    userId: null,
    isAi: true,
    aiDifficulty: "normal",
    isAlive: true,
    faction: "castle",
    gold: 0,
    wood: 0,
    ore: 0,
    mercury: 0,
    crystals: 0,
    gems: 0,
    sulfur: 0,
    exploredTiles,
    heroes: [hero],
    towns: [],
    resourceBuildings: [],
    // boats live on the game, not the player; carried through for clarity
    ...(boats.length ? {} : {}),
  } as unknown as AiPlayer;
}

function makeHero(x: number, y: number, mapLevel: MapLevelId): Record<string, unknown> {
  return {
    id: "h1",
    x,
    y,
    mapLevel,
    movement: 1560,
    attack: 1,
    defense: 0,
    morale: 0,
    luck: 0,
    armies: [{ id: "a1", unitType: UnitType.PIKEMAN, count: 20, health: 200, maxHealth: 10, position: 0 }],
  };
}

function makeGame(mapData: unknown, player: AiPlayer, boats: unknown[] = []): AiGame {
  return {
    id: "ai-dev-scenario",
    status: "ACTIVE",
    maxPlayers: 2,
    turnNumber: 3,
    currentTurnPlayerId: "p1",
    mapData,
    mapState: {},
    players: [player],
    neutralArmies: [],
    gates: [],
    boats,
    combats: [],
  } as unknown as AiGame;
}

const SCENARIOS: Scenario[] = [
  {
    id: "subterranean-gate",
    labelKey: "devpage.ai.scenario.subterraneanGate.label",
    descKey: "devpage.ai.scenario.subterraneanGate.desc",
    expected: ["level_transition"],
    activeLevel: SURFACE_LEVEL,
    build: () => {
      const surfaceTiles = makeLayer(TerrainType.GRASS, (tile) => {
        if (tile.x === 3 && tile.y === 2) {
          tile.object = {
            type: "adventure_building",
            id: "sg-surface",
            subtype: AdventureBuildingType.SUBTERRANEAN_GATE,
            targetId: "sg-under",
            targetLevel: UNDERGROUND_LEVEL,
            targetPosition: { x: 4, y: 4, level: UNDERGROUND_LEVEL },
          };
        }
      });
      const undergroundTiles = makeLayer(TerrainType.DIRT, (tile) => {
        if (tile.x === 4 && tile.y === 5) {
          tile.object = { type: "building", id: "deep-gold-mine", subtype: ResourceBuildingType.GOLD_MINE };
        }
      });
      const explored: string[] = [];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) explored.push(`surface:${x},${y}`);
      explored.push("underground:4,4", "underground:4,5", "underground:3,4", "underground:5,4");
      const player = makePlayer(explored, makeHero(2, 2, SURFACE_LEVEL));
      const map = twoLevel(surfaceTiles, undergroundTiles);
      return { game: makeGame(map, player), player };
    },
  },
  {
    id: "embark-boat",
    labelKey: "devpage.ai.scenario.embarkBoat.label",
    descKey: "devpage.ai.scenario.embarkBoat.desc",
    expected: ["embark_boat"],
    activeLevel: SURFACE_LEVEL,
    build: () => {
      const heroLand = new Set(["1,1", "1,2", "2,1", "2,2"]);
      const mineLand = new Set(["6,5", "6,6"]);
      const explored: string[] = [];
      const tiles = makeLayer(TerrainType.WATER, (tile) => {
        explored.push(`surface:${tile.x},${tile.y}`);
        const key = `${tile.x},${tile.y}`;
        if (heroLand.has(key) || mineLand.has(key)) tile.terrain = TerrainType.GRASS;
        if (tile.x === 6 && tile.y === 6) tile.object = { type: "building", id: "island-mine", subtype: ResourceBuildingType.GOLD_MINE };
      });
      const player = makePlayer(explored, makeHero(1, 1, SURFACE_LEVEL));
      const boats = [{ id: "b1", ownerId: null, heroId: null, faction: "castle", x: 3, y: 2, mapLevel: SURFACE_LEVEL }];
      return { game: makeGame({ width: SIZE, height: SIZE, tiles }, player, boats), player };
    },
  },
  {
    id: "sail",
    labelKey: "devpage.ai.scenario.sail.label",
    descKey: "devpage.ai.scenario.sail.desc",
    expected: ["sail", "disembark_boat"],
    activeLevel: SURFACE_LEVEL,
    build: () => {
      const mineLand = new Set(["6,5", "6,6"]);
      const explored: string[] = [];
      const tiles = makeLayer(TerrainType.WATER, (tile) => {
        explored.push(`surface:${tile.x},${tile.y}`);
        if (mineLand.has(`${tile.x},${tile.y}`)) tile.terrain = TerrainType.GRASS;
        if (tile.x === 6 && tile.y === 6) tile.object = { type: "building", id: "island-mine", subtype: ResourceBuildingType.GOLD_MINE };
      });
      const player = makePlayer(explored, makeHero(1, 4, SURFACE_LEVEL));
      const boats = [{ id: "b1", ownerId: "p1", heroId: "h1", faction: "castle", x: 1, y: 4, mapLevel: SURFACE_LEVEL }];
      return { game: makeGame({ width: SIZE, height: SIZE, tiles }, player, boats), player };
    },
  },
];

function twoLevel(surfaceTiles: ScenarioTile[][], undergroundTiles: ScenarioTile[][]) {
  return {
    width: SIZE,
    height: SIZE,
    tiles: surfaceTiles,
    levels: {
      surface: { id: SURFACE_LEVEL, width: SIZE, height: SIZE, tiles: surfaceTiles },
      underground: { id: UNDERGROUND_LEVEL, width: SIZE, height: SIZE, tiles: undergroundTiles },
    },
  };
}

function runScenario(scenario: Scenario): ScenarioResult {
  try {
    const { game, player } = scenario.build();
    const context = buildAiContext(game, player, scenario.activeLevel);
    const choice = chooseAiObjective(context, context.player.heroes[0], "SCOUT");
    return {
      id: scenario.id,
      labelKey: scenario.labelKey,
      descKey: scenario.descKey,
      expected: scenario.expected,
      objectiveType: choice?.objective.type ?? null,
      objectiveId: choice?.objective.id ?? null,
    };
  } catch {
    return {
      id: scenario.id,
      labelKey: scenario.labelKey,
      descKey: scenario.descKey,
      expected: scenario.expected,
      objectiveType: null,
      objectiveId: null,
    };
  }
}
