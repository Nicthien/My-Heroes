"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/stores/gameStore";
import {
  KEYBOARD_PREFERENCE_EVENT,
  getSavedBindings,
  type ShortcutAction,
  type ShortcutBindings,
} from "@/lib/settings/keyboardPreferences";

// Screen pixels per animation frame for keyboard camera panning. Tuned to feel
// brisk but controllable at 60fps; the renderer divides by the zoom factor.
const CAMERA_PAN_SPEED = 16;

// Arrow keys always pan the camera in addition to the (rebindable) ZQSD/WASD
// cluster, so they are matched by code here rather than through the bindings.
const ARROW_PAN: Record<string, { dx: number; dy: number }> = {
  ArrowUp: { dx: 0, dy: 1 },
  ArrowDown: { dx: 0, dy: -1 },
  ArrowLeft: { dx: 1, dy: 0 },
  ArrowRight: { dx: -1, dy: 0 },
};

// Camera direction unit vectors per camera action. dy>0 reveals north (scrollY
// decreases), dx>0 reveals west (scrollX decreases) — matches renderer.panCamera.
const CAMERA_VECTORS: Partial<Record<ShortcutAction, { dx: number; dy: number }>> = {
  cameraUp: { dx: 0, dy: 1 },
  cameraDown: { dx: 0, dy: -1 },
  cameraLeft: { dx: 1, dy: 0 },
  cameraRight: { dx: -1, dy: 0 },
};

export type KeyboardShortcutsConfig = {
  /** Master switch — false while in combat or before the game is interactive. */
  enabled: boolean;
  /** The local player's id, used to scope hero/town cycling to owned objects. */
  myPlayerId: string | null | undefined;
  /** Whether the player may currently end their turn. */
  canAct: boolean;
  /** Whether the options dialog is open (so Escape doesn't re-open it). */
  optionsOpen: boolean;
  onEndTurn: () => void;
  onOpenMenu: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

// Space/Enter natively activate a focused button or link. When one is focused we
// must not hijack those keys for end-turn / center-selection.
function isActivatableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "BUTTON" || el.tagName === "A") return true;
  const role = el.getAttribute?.("role");
  return role === "button" || role === "menuitem" || role === "tab";
}

/**
 * Installs the global adventure-map keyboard shortcuts: camera panning
 * (continuous, held-key), centering on the selection, cycling heroes/towns,
 * zoom, end turn, and opening the menu. Bindings come from
 * `keyboardPreferences` and are matched by physical `event.code` so the same
 * config works on AZERTY and QWERTY.
 */
export function useKeyboardShortcuts(config: KeyboardShortcutsConfig) {
  const { enabled, myPlayerId } = config;

  // Keep volatile values (canAct + callbacks change identity every render) in a
  // ref so the listener effect only re-binds on the stable primitives below —
  // re-binding mid-pan would drop the held-key state. Updated post-render (not
  // during render) so the keydown handler always reads the latest closure.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  useEffect(() => {
    if (!enabled) {
      useGameStore.getState().setCameraPan(0, 0);
      return;
    }

    let bindings: ShortcutBindings = getSavedBindings();
    const syncBindings = () => {
      bindings = getSavedBindings();
    };

    // Codes of camera keys currently held down, so panning is continuous and
    // diagonal moves combine cleanly.
    const heldCameraCodes = new Set<string>();

    const recomputePan = () => {
      let dx = 0;
      let dy = 0;
      for (const code of heldCameraCodes) {
        const arrow = ARROW_PAN[code];
        if (arrow) {
          dx += arrow.dx;
          dy += arrow.dy;
          continue;
        }
        for (const action of ["cameraUp", "cameraDown", "cameraLeft", "cameraRight"] as const) {
          if (bindings[action] === code) {
            const vec = CAMERA_VECTORS[action]!;
            dx += vec.dx;
            dy += vec.dy;
          }
        }
      }
      useGameStore.getState().setCameraPan(dx * CAMERA_PAN_SPEED, dy * CAMERA_PAN_SPEED);
    };

    const actionForCode = (code: string): ShortcutAction | null => {
      for (const action of Object.keys(bindings) as ShortcutAction[]) {
        if (bindings[action] === code) return action;
      }
      return null;
    };

    const isCameraCode = (code: string): boolean =>
      Boolean(ARROW_PAN[code]) ||
      bindings.cameraUp === code ||
      bindings.cameraDown === code ||
      bindings.cameraLeft === code ||
      bindings.cameraRight === code;

    const centerOnSelection = () => {
      const state = useGameStore.getState();
      const game = state.gameState;
      if (!game) return;
      if (state.selectedHeroId) {
        const hero = game.players
          .flatMap((p) => p.heroes)
          .find((h) => h.id === state.selectedHeroId);
        if (hero) state.focusTile(hero.position.x, hero.position.y);
        return;
      }
      if (state.selectedTownId) {
        const town = game.players
          .flatMap((p) => p.towns)
          .find((t) => t.id === state.selectedTownId);
        if (town) state.focusTile(town.position.x, town.position.y);
      }
    };

    const cycleHeroes = () => {
      const state = useGameStore.getState();
      const game = state.gameState;
      if (!game || !myPlayerId) return;
      const player = game.players.find((p) => p.id === myPlayerId);
      const heroes = player?.heroes ?? [];
      if (heroes.length === 0) return;
      const currentIndex = heroes.findIndex((h) => h.id === state.selectedHeroId);
      const next = heroes[(currentIndex + 1) % heroes.length];
      state.selectHero(next.id);
      state.focusTile(next.position.x, next.position.y);
    };

    const cycleTowns = () => {
      const state = useGameStore.getState();
      const game = state.gameState;
      if (!game || !myPlayerId) return;
      const player = game.players.find((p) => p.id === myPlayerId);
      const towns = player?.towns ?? [];
      if (towns.length === 0) return;
      const currentIndex = towns.findIndex((t) => t.id === state.selectedTownId);
      const next = towns[(currentIndex + 1) % towns.length];
      state.selectTown(next.id);
      state.focusTile(next.position.x, next.position.y);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const code = event.code;

      // Let a focused button/link consume Space/Enter for its own activation.
      if ((code === "Space" || code === "Enter" || code === "NumpadEnter") && isActivatableTarget(event.target)) {
        return;
      }

      // Continuous camera panning (held keys).
      if (isCameraCode(code)) {
        event.preventDefault();
        if (!event.repeat) {
          heldCameraCodes.add(code);
          recomputePan();
        }
        return;
      }

      const action = actionForCode(code);
      if (!action) return;

      // The remaining actions are one-shot — ignore auto-repeat.
      if (event.repeat) {
        event.preventDefault();
        return;
      }

      switch (action) {
        case "centerSelection":
          event.preventDefault();
          centerOnSelection();
          break;
        case "cycleHero":
          event.preventDefault();
          cycleHeroes();
          break;
        case "cycleTown":
          event.preventDefault();
          cycleTowns();
          break;
        case "zoomIn":
          event.preventDefault();
          useGameStore.getState().zoomMap(1);
          break;
        case "zoomOut":
          event.preventDefault();
          useGameStore.getState().zoomMap(-1);
          break;
        case "endTurn":
          event.preventDefault();
          if (configRef.current.canAct) configRef.current.onEndTurn();
          break;
        case "toggleMenu":
          // Only *open* the menu here; the dialog closes itself on Escape, so
          // re-toggling would immediately reopen it.
          if (!configRef.current.optionsOpen) {
            event.preventDefault();
            configRef.current.onOpenMenu();
          }
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (heldCameraCodes.delete(event.code)) recomputePan();
    };

    // If focus leaves the window mid-pan (alt-tab), clear held keys so the
    // camera doesn't drift forever.
    const handleBlur = () => {
      if (heldCameraCodes.size > 0) {
        heldCameraCodes.clear();
        recomputePan();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener(KEYBOARD_PREFERENCE_EVENT, syncBindings);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener(KEYBOARD_PREFERENCE_EVENT, syncBindings);
      useGameStore.getState().setCameraPan(0, 0);
    };
  }, [enabled, myPlayerId]);
}
