import { create } from "zustand";
import { CombatSummary, GameState, GameAction, PersistentCombat, Position, type MapLevelId } from "@/lib/game/types";
import { processAction } from "@/lib/game/engine";
import { normalizeMapLevel, SURFACE_LEVEL } from "@/lib/game/map-levels";
import type { SpellId } from "@/lib/game/spells";
import type { SpellRevealHint } from "@/lib/rendering/mapRenderer";
import type { ScoreBreakdown } from "@/lib/game/score";

interface GameStore {
  gameState: GameState | null;
  gameStateVersion: number;
  selectedHeroId: string | null;
  selectedTownId: string | null;
  combatMessage: string | null;
  // Drives the Grail puzzle ("La quête du Graal") window. Opened automatically
  // when a hero visits an Obelisk, or manually from the hero panel button.
  grailPuzzleOpen: boolean;
  pendingCombat: {
    attackerHeroId: string;
    targetId: string;
    targetType: "hero" | "monster" | "building" | "town" | "gate" | "creature_bank" | "artifact";
    destination?: { x: number; y: number };
    targetPosition?: { x: number; y: number };
    path?: Array<{ x: number; y: number }>;
  } | null;
  pendingJoinCombat: { combatId: string; heroId: string; side?: "attacker" | "defender" } | null;
  pendingHeroMeet: { leftHeroId: string; rightHeroId: string } | null;
  pendingAdventureSpell: { heroId: string; spellId: SpellId; label: string } | null;
  spellRevealHighlight: { turnNumber: number; tiles: Position[]; label: string; hints?: SpellRevealHint[] } | null;
  // Rival score breakdowns revealed by the Visions spell. Valid for the turn they
  // were cast on; consumers re-hide them once gameState.turnNumber advances.
  revealedScores: { turnNumber: number; byPlayerId: Record<string, ScoreBreakdown> } | null;
  activeCombat: PersistentCombat | null;
  minimizedCombatIds: string[];
  lastCombatResult: CombatSummary | null;
  isCombatMode: boolean;
  isLoading: boolean;
  loadingProgress: number;
  loadingMessage: string;
  loadingNonce: number;
  isMovePending: boolean;
  // True from the instant the player clicks "End turn" until the server roundtrip
  // resolves. Lets the HUD button and the map night overlay react immediately
  // instead of waiting for the refreshed gameState (with hasEndedTurn) to arrive.
  endingTurn: boolean;
  devRevealMap: boolean;
  devInfiniteMana: boolean;
  devTeleportArmed: boolean;
  devGodMode: boolean;
  cameraTarget: { x: number; y: number; nonce: number } | null;
  zoomRequest: { direction: number; nonce: number } | null;
  // Continuous keyboard camera pan vector in screen pixels per frame. The map
  // renderer runs a requestAnimationFrame loop while this is non-zero. Set by
  // the keyboard-shortcuts hook from the currently-held camera keys.
  cameraPan: { dx: number; dy: number };
  adminObserverMode: boolean;
  activeMapLevel: MapLevelId;

  setGameState: (state: GameState) => void;
  setMovePending: (pending: boolean) => void;
  setEndingTurn: (ending: boolean) => void;
  focusTile: (x: number, y: number) => void;
  zoomMap: (direction: number) => void;
  setCameraPan: (dx: number, dy: number) => void;
  setCombatMessage: (message: string | null) => void;
  setGrailPuzzleOpen: (open: boolean) => void;
  setPendingCombat: (combat: GameStore["pendingCombat"]) => void;
  setPendingJoinCombat: (combat: GameStore["pendingJoinCombat"]) => void;
  setPendingHeroMeet: (meet: GameStore["pendingHeroMeet"]) => void;
  setPendingAdventureSpell: (spell: GameStore["pendingAdventureSpell"]) => void;
  setSpellRevealHighlight: (highlight: GameStore["spellRevealHighlight"]) => void;
  revealRivalScores: (turnNumber: number, scores: Record<string, ScoreBreakdown>) => void;
  setActiveCombat: (combat: PersistentCombat | null) => void;
  minimizeCombat: (combatId: string) => void;
  restoreCombat: (combat: PersistentCombat) => void;
  setCombatResult: (result: CombatSummary | null) => void;
  selectHero: (heroId: string | null) => void;
  selectTown: (townId: string | null) => void;
  dispatchAction: (action: GameAction) => void;
  setCombatMode: (isCombat: boolean) => void;
  setLoading: (loading: boolean) => void;
  beginLoading: (message?: string, progress?: number) => void;
  updateLoadingProgress: (progress: number, message?: string) => void;
  setDevRevealMap: (reveal: boolean) => void;
  setDevInfiniteMana: (enabled: boolean) => void;
  setDevTeleportArmed: (armed: boolean) => void;
  setDevGodMode: (enabled: boolean) => void;
  setAdminObserverMode: (enabled: boolean) => void;
  setActiveMapLevel: (level: MapLevelId) => void;
  resetGame: () => void;
}

function clampProgress(progress: number) {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  gameStateVersion: 0,
  selectedHeroId: null,
  selectedTownId: null,
  combatMessage: null,
  grailPuzzleOpen: false,
  pendingCombat: null,
  pendingJoinCombat: null,
  pendingHeroMeet: null,
  pendingAdventureSpell: null,
  spellRevealHighlight: null,
  revealedScores: null,
  activeCombat: null,
  minimizedCombatIds: [],
  lastCombatResult: null,
  isCombatMode: false,
  isLoading: false,
  loadingProgress: 0,
  loadingMessage: "Chargement de la partie...",
  loadingNonce: 0,
  isMovePending: false,
  endingTurn: false,
  devRevealMap: false,
  devInfiniteMana: false,
  devTeleportArmed: false,
  devGodMode: false,
  cameraTarget: null,
  zoomRequest: null,
  cameraPan: { dx: 0, dy: 0 },
  adminObserverMode: false,
  activeMapLevel: SURFACE_LEVEL,

  setGameState: (state) => set((prev) => {
    const syncedCombat = prev.activeCombat
      ? state.activeCombats?.find((combat) => combat.id === prev.activeCombat?.id) ?? prev.activeCombat
      : null;
    const openCombat = syncedCombat?.visibility === "joinable_summary" ? null : syncedCombat;

    return {
      gameState: state,
      gameStateVersion: prev.gameStateVersion + 1,
      activeCombat: openCombat,
      isCombatMode: Boolean(openCombat),
    };
  }),
  setMovePending: (pending) => set({ isMovePending: pending }),
  setEndingTurn: (ending) => set({ endingTurn: ending }),
  focusTile: (x, y) =>
    set((state) => ({
      cameraTarget: { x, y, nonce: (state.cameraTarget?.nonce ?? 0) + 1 },
    })),
  zoomMap: (direction) =>
    set((state) => ({
      zoomRequest: { direction, nonce: (state.zoomRequest?.nonce ?? 0) + 1 },
    })),
  setCameraPan: (dx, dy) =>
    set((state) =>
      // Keep object identity stable when the vector is unchanged so the renderer
      // effect doesn't restart its rAF loop on every keydown repeat.
      state.cameraPan.dx === dx && state.cameraPan.dy === dy
        ? {}
        : { cameraPan: { dx, dy } },
    ),

  setCombatMessage: (message) => set({ combatMessage: message }),
  setGrailPuzzleOpen: (open) => set({ grailPuzzleOpen: open }),
  setPendingCombat: (combat) => set({ pendingCombat: combat }),
  setPendingJoinCombat: (combat) => set({ pendingJoinCombat: combat }),
  setPendingHeroMeet: (meet) => set({ pendingHeroMeet: meet }),
  setPendingAdventureSpell: (spell) => set({ pendingAdventureSpell: spell }),
  setSpellRevealHighlight: (highlight) => set({ spellRevealHighlight: highlight }),
  revealRivalScores: (turnNumber, scores) =>
    set((state) => {
      // Merge with any reveals already made this turn; drop stale ones from a past turn.
      const base = state.revealedScores?.turnNumber === turnNumber ? state.revealedScores.byPlayerId : {};
      return { revealedScores: { turnNumber, byPlayerId: { ...base, ...scores } } };
    }),
  setActiveCombat: (combat) => {
    const openCombat = combat?.visibility === "joinable_summary" ? null : combat;
    set({ activeCombat: openCombat, isCombatMode: Boolean(openCombat) });
  },
  minimizeCombat: (combatId) => set((state) => ({
    activeCombat: state.activeCombat?.id === combatId ? null : state.activeCombat,
    isCombatMode: state.activeCombat?.id === combatId ? false : state.isCombatMode,
    minimizedCombatIds: state.minimizedCombatIds.includes(combatId)
      ? state.minimizedCombatIds
      : [...state.minimizedCombatIds, combatId],
  })),
  restoreCombat: (combat) => set((state) => ({
    activeCombat: combat.visibility === "joinable_summary" ? null : combat,
    isCombatMode: combat.visibility !== "joinable_summary",
    minimizedCombatIds: state.minimizedCombatIds.filter((id) => id !== combat.id),
  })),
  setCombatResult: (result) => set({ lastCombatResult: result }),

  selectHero: (heroId) =>
    set((state) => {
      const hero = heroId
        ? state.gameState?.players.flatMap((player) => player.heroes).find((item) => item.id === heroId)
        : null;
      return {
        selectedHeroId: heroId,
        selectedTownId: null,
        activeMapLevel: hero ? normalizeMapLevel(hero.position.level) : state.activeMapLevel,
      };
    }),

  selectTown: (townId) =>
    set((state) => {
      const town = townId
        ? state.gameState?.players.flatMap((player) => player.towns).find((item) => item.id === townId)
        : null;
      return {
        selectedTownId: townId,
        selectedHeroId: null,
        activeMapLevel: town ? normalizeMapLevel(town.position.level) : state.activeMapLevel,
      };
    }),

  dispatchAction: (action) => {
    const { gameState } = get();
    if (!gameState) return;
    const newState = processAction(gameState, action);
    set({ gameState: newState });
  },

  setCombatMode: (isCombat) => set({ isCombatMode: isCombat }),

  setLoading: (loading) => set((state) => ({
    isLoading: loading,
    loadingProgress: loading ? state.loadingProgress : 100,
  })),
  beginLoading: (message = "Chargement de la partie...", progress = 0) =>
    set((state) => ({
      isLoading: true,
      loadingMessage: message,
      loadingProgress: clampProgress(progress),
      loadingNonce: state.loadingNonce + 1,
    })),
  updateLoadingProgress: (progress, message) =>
    set((state) => ({
      loadingProgress: Math.max(state.loadingProgress, clampProgress(progress)),
      loadingMessage: message ?? state.loadingMessage,
    })),
  setDevRevealMap: (reveal) => set({ devRevealMap: reveal }),
  setDevInfiniteMana: (enabled) => set({ devInfiniteMana: enabled }),
  setDevTeleportArmed: (armed) => set({ devTeleportArmed: armed }),
  setDevGodMode: (enabled) => set({ devGodMode: enabled }),
  setAdminObserverMode: (enabled) => set({ adminObserverMode: enabled }),
  setActiveMapLevel: (level) => set({ activeMapLevel: level }),

  resetGame: () =>
    set({
      gameState: null,
      gameStateVersion: 0,
      selectedHeroId: null,
      selectedTownId: null,
      combatMessage: null,
      grailPuzzleOpen: false,
      pendingCombat: null,
      pendingJoinCombat: null,
      pendingHeroMeet: null,
      pendingAdventureSpell: null,
      spellRevealHighlight: null,
      revealedScores: null,
      activeCombat: null,
      minimizedCombatIds: [],
      lastCombatResult: null,
      isCombatMode: false,
      isLoading: false,
      loadingProgress: 0,
      loadingMessage: "Chargement de la partie...",
      loadingNonce: 0,
      isMovePending: false,
      endingTurn: false,
      devRevealMap: false,
      devInfiniteMana: false,
      devTeleportArmed: false,
      devGodMode: false,
      cameraTarget: null,
      zoomRequest: null,
      adminObserverMode: false,
      activeMapLevel: SURFACE_LEVEL,
    }),
}));
