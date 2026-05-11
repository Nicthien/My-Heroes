import { create } from "zustand";
import { GameState, GameAction } from "@/lib/game/types";
import { processAction } from "@/lib/game/engine";

interface GameStore {
  gameState: GameState | null;
  selectedHeroId: string | null;
  selectedTownId: string | null;
  combatMessage: string | null;
  isCombatMode: boolean;
  isLoading: boolean;

  setGameState: (state: GameState) => void;
  setCombatMessage: (message: string | null) => void;
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
  isCombatMode: false,
  isLoading: false,

  setGameState: (state) => set({ gameState: state }),

  setCombatMessage: (message) => set({ combatMessage: message }),

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
      isCombatMode: false,
      isLoading: false,
    }),
}));
