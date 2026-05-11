import { create } from "zustand";
import { CombatSummary, GameState, GameAction, PersistentCombat } from "@/lib/game/types";
import { processAction } from "@/lib/game/engine";

interface GameStore {
  gameState: GameState | null;
  selectedHeroId: string | null;
  selectedTownId: string | null;
  combatMessage: string | null;
  pendingCombat: { attackerHeroId: string; targetId: string; targetType: "hero" | "monster" | "building"; destination?: { x: number; y: number }; path?: Array<{ x: number; y: number }> } | null;
  pendingJoinCombat: { combatId: string; heroId: string; side?: "attacker" | "defender" } | null;
  activeCombat: PersistentCombat | null;
  minimizedCombatIds: string[];
  lastCombatResult: CombatSummary | null;
  isCombatMode: boolean;
  isLoading: boolean;

  setGameState: (state: GameState) => void;
  setCombatMessage: (message: string | null) => void;
  setPendingCombat: (combat: GameStore["pendingCombat"]) => void;
  setPendingJoinCombat: (combat: GameStore["pendingJoinCombat"]) => void;
  setActiveCombat: (combat: PersistentCombat | null) => void;
  minimizeCombat: (combatId: string) => void;
  restoreCombat: (combat: PersistentCombat) => void;
  setCombatResult: (result: CombatSummary | null) => void;
  selectHero: (heroId: string | null) => void;
  selectTown: (townId: string | null) => void;
  dispatchAction: (action: GameAction) => void;
  setCombatMode: (isCombat: boolean) => void;
  setLoading: (loading: boolean) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  selectedHeroId: null,
  selectedTownId: null,
  combatMessage: null,
  pendingCombat: null,
  pendingJoinCombat: null,
  activeCombat: null,
  minimizedCombatIds: [],
  lastCombatResult: null,
  isCombatMode: false,
  isLoading: false,

  setGameState: (state) => set({ gameState: state }),

  setCombatMessage: (message) => set({ combatMessage: message }),
  setPendingCombat: (combat) => set({ pendingCombat: combat }),
  setPendingJoinCombat: (combat) => set({ pendingJoinCombat: combat }),
  setActiveCombat: (combat) => set({ activeCombat: combat, isCombatMode: Boolean(combat) }),
  minimizeCombat: (combatId) => set((state) => ({
    activeCombat: state.activeCombat?.id === combatId ? null : state.activeCombat,
    isCombatMode: state.activeCombat?.id === combatId ? false : state.isCombatMode,
    minimizedCombatIds: state.minimizedCombatIds.includes(combatId)
      ? state.minimizedCombatIds
      : [...state.minimizedCombatIds, combatId],
  })),
  restoreCombat: (combat) => set((state) => ({
    activeCombat: combat,
    isCombatMode: true,
    minimizedCombatIds: state.minimizedCombatIds.filter((id) => id !== combat.id),
  })),
  setCombatResult: (result) => set({ lastCombatResult: result }),

  selectHero: (heroId) =>
    set({ selectedHeroId: heroId, selectedTownId: null }),

  selectTown: (townId) =>
    set({ selectedTownId: townId, selectedHeroId: null }),

  dispatchAction: (action) => {
    const { gameState } = get();
    if (!gameState) return;
    const newState = processAction(gameState, action);
    set({ gameState: newState });
  },

  setCombatMode: (isCombat) => set({ isCombatMode: isCombat }),

  setLoading: (loading) => set({ isLoading: loading }),

  resetGame: () =>
    set({
      gameState: null,
      selectedHeroId: null,
      selectedTownId: null,
      combatMessage: null,
      pendingCombat: null,
      pendingJoinCombat: null,
      activeCombat: null,
      minimizedCombatIds: [],
      lastCombatResult: null,
      isCombatMode: false,
      isLoading: false,
    }),
}));
