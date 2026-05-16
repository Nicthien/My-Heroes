import { create } from "zustand";
import { CombatSummary, GameState, GameAction, PersistentCombat } from "@/lib/game/types";
import { processAction } from "@/lib/game/engine";

interface GameStore {
  gameState: GameState | null;
  gameStateVersion: number;
  selectedHeroId: string | null;
  selectedTownId: string | null;
  combatMessage: string | null;
  pendingCombat: { attackerHeroId: string; targetId: string; targetType: "hero" | "monster" | "building" | "town"; destination?: { x: number; y: number }; path?: Array<{ x: number; y: number }> } | null;
  pendingJoinCombat: { combatId: string; heroId: string; side?: "attacker" | "defender" } | null;
  activeCombat: PersistentCombat | null;
  minimizedCombatIds: string[];
  lastCombatResult: CombatSummary | null;
  isCombatMode: boolean;
  isLoading: boolean;
  isMovePending: boolean;
  devRevealMap: boolean;
  cameraTarget: { x: number; y: number; nonce: number } | null;
  zoomRequest: { direction: number; nonce: number } | null;

  setGameState: (state: GameState) => void;
  setMovePending: (pending: boolean) => void;
  focusTile: (x: number, y: number) => void;
  zoomMap: (direction: number) => void;
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
  setDevRevealMap: (reveal: boolean) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  gameStateVersion: 0,
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
  isMovePending: false,
  devRevealMap: false,
  cameraTarget: null,
  zoomRequest: null,

  setGameState: (state) => set((prev) => {
    const syncedCombat = prev.activeCombat
      ? state.activeCombats?.find((combat) => combat.id === prev.activeCombat?.id) ?? prev.activeCombat
      : null;

    return {
      gameState: state,
      gameStateVersion: prev.gameStateVersion + 1,
      activeCombat: syncedCombat,
      isCombatMode: Boolean(syncedCombat),
    };
  }),
  setMovePending: (pending) => set({ isMovePending: pending }),
  focusTile: (x, y) =>
    set((state) => ({
      cameraTarget: { x, y, nonce: (state.cameraTarget?.nonce ?? 0) + 1 },
    })),
  zoomMap: (direction) =>
    set((state) => ({
      zoomRequest: { direction, nonce: (state.zoomRequest?.nonce ?? 0) + 1 },
    })),

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
  setDevRevealMap: (reveal) => set({ devRevealMap: reveal }),

  resetGame: () =>
    set({
      gameState: null,
      gameStateVersion: 0,
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
      isMovePending: false,
      devRevealMap: false,
      cameraTarget: null,
      zoomRequest: null,
    }),
}));
