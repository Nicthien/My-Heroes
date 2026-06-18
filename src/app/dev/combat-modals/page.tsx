"use client";

import { useEffect, useState } from "react";
import CombatChoiceModal from "@/components/game/combat/CombatChoiceModal";
import CombatResultModal from "@/components/game/combat/CombatResultModal";
import { AuthContext } from "@/lib/auth/client";
import { createNeutralArmyStacksForTile } from "@/lib/game/neutral-armies";
import { getMonsterReward } from "@/lib/game/monster-rewards";
import { useGameStore } from "@/lib/stores/gameStore";
import { UnitType, type CombatSummary, type GameState } from "@/lib/game/types";
import { buildMockState, mockAuthValue } from "../hud/mockState";

// A free wandering monster placed next to the mock hero (h1 @ 5,5), so both the
// pre-combat choice modal and the post-combat result modal can be previewed with
// real creature sprites + loot (resources + a minor artifact).
const MONSTER_ID = "mon-zone-dev-8-5";
const MONSTER_POS = { x: 8, y: 5 };
const MONSTER_GUARDIAN_POWER = 760;

function buildMockWithMonster(): GameState {
  const state = buildMockState();
  const tile = state.map.tiles[MONSTER_POS.y]?.[MONSTER_POS.x];
  const terrain = tile?.terrain;
  if (tile) {
    tile.object = { type: "monster", id: MONSTER_ID, subtype: "halberdier", guardianPower: MONSTER_GUARDIAN_POWER };
  }
  const stacks = createNeutralArmyStacksForTile({ x: MONSTER_POS.x, y: MONSTER_POS.y, terrain }, MONSTER_GUARDIAN_POWER, MONSTER_ID)
    .map((stack, index) => ({ id: `${MONSTER_ID}-s${index}`, ...stack }));
  return {
    ...state,
    neutralArmies: [{ id: MONSTER_ID, status: "ACTIVE", position: MONSTER_POS, stacks }],
  };
}

function buildMockResult(): CombatSummary {
  const loot = getMonsterReward(MONSTER_ID, MONSTER_GUARDIAN_POWER);
  return {
    winnerId: "h1",
    winnerPlayerId: "p1",
    attackerLosses: [{ unitType: UnitType.PIKEMAN, lost: 3 }, { unitType: UnitType.ARCHER, lost: 1 }],
    defenderLosses: [{ unitType: UnitType.HALBERDIER, lost: 16 }],
    experienceGained: 500,
    log: ["Le héros écrase la garde.", "Butin récupéré."],
    monsterLoot: loot,
  };
}

function buildMockDefeatResult(): CombatSummary {
  return {
    winnerId: "defender",
    winnerPlayerId: null,
    attackerLosses: [
      { unitType: UnitType.PIKEMAN, lost: 10 },
      { unitType: UnitType.ARCHER, lost: 6 },
    ],
    defenderLosses: [{ unitType: UnitType.HALBERDIER, lost: 4 }],
    experienceGained: 0,
    log: ["Le héros tombe sous les coups.", "L'armée est anéantie."],
    attackerDied: true,
  };
}

export default function DevCombatModalsPage() {
  const [view, setView] = useState<"choice" | "result" | "defeat">("choice");

  useEffect(() => {
    const store = useGameStore.getState();
    store.setGameState(buildMockWithMonster());
    store.selectHero("h1");
    if (view === "choice") {
      store.setCombatResult(null);
      store.setPendingCombat({
        attackerHeroId: "h1",
        targetId: MONSTER_ID,
        targetType: "monster",
        destination: { x: 7, y: 5 },
        targetPosition: MONSTER_POS,
      });
    } else if (view === "defeat") {
      store.setPendingCombat(null);
      store.setCombatResult(buildMockDefeatResult());
    } else {
      store.setPendingCombat(null);
      store.setCombatResult(buildMockResult());
    }
    return () => {
      useGameStore.getState().setPendingCombat(null);
      useGameStore.getState().setCombatResult(null);
    };
  }, [view]);

  return (
    <AuthContext.Provider value={mockAuthValue}>
      <div className="game-shell relative bg-gradient-to-br from-emerald-900 via-stone-800 to-slate-900">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 40%, #65a30d 0, transparent 40%), radial-gradient(circle at 70% 60%, #1e3a8a 0, transparent 35%)",
          }}
        />
        <div className="fixed left-3 top-3 z-[60] flex gap-2">
          {(["choice", "result", "defeat"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`rounded border px-3 py-1.5 text-sm font-bold ${
                view === id ? "border-amber-400 bg-amber-600 text-white" : "border-stone-600 bg-stone-900 text-stone-200 hover:border-amber-400"
              }`}
            >
              {id === "choice" ? "Choix du combat" : id === "result" ? "Résultat du combat" : "Défaite du héros"}
            </button>
          ))}
        </div>
        {view === "choice" ? <CombatChoiceModal /> : <CombatResultModal />}
      </div>
    </AuthContext.Provider>
  );
}
