// Keyboard shortcut preferences persisted in localStorage. Mirrors the pattern
// used by `displayPreferences.ts` / `audio/musicPreferences.ts`: getters/setters
// plus a custom window event so any listener (the shortcuts hook, the options
// dialog) can sync live.
//
// Bindings are stored as physical `KeyboardEvent.code` values (e.g. "KeyW"),
// NOT layout-dependent `key` characters. This is the whole trick that makes a
// single config work on both AZERTY and QWERTY: the physical key at QWERTY's
// "W" position (code "KeyW") is labelled "Z" on a French AZERTY keyboard, so the
// default ZQSD camera cluster on FR and WASD on EN are the *same* physical keys.
// The layout setting therefore only changes how we *render* a code to the user.

export const KEYBOARD_BINDINGS_KEY = "my-heroes:keyboard:bindings";
export const KEYBOARD_LAYOUT_KEY = "my-heroes:keyboard:layout";
export const KEYBOARD_PREFERENCE_EVENT = "my-heroes:keyboard-preference-change";

export type KeyboardLayout = "fr" | "en";

export type ShortcutAction =
  | "cameraUp"
  | "cameraDown"
  | "cameraLeft"
  | "cameraRight"
  | "centerSelection"
  | "cycleHero"
  | "cycleTown"
  | "endTurn"
  | "zoomIn"
  | "zoomOut"
  | "toggleMenu";

export type ShortcutBindings = Record<ShortcutAction, string>;

// Display order in the options panel.
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  "cameraUp",
  "cameraDown",
  "cameraLeft",
  "cameraRight",
  "centerSelection",
  "cycleHero",
  "cycleTown",
  "endTurn",
  "zoomIn",
  "zoomOut",
  "toggleMenu",
];

// Default bindings are identical for both layouts because they are physical
// codes: KeyW/KeyA/KeyS/KeyD = ZQSD on AZERTY, WASD on QWERTY.
const DEFAULT_BINDINGS: ShortcutBindings = {
  cameraUp: "KeyW",
  cameraLeft: "KeyA",
  cameraDown: "KeyS",
  cameraRight: "KeyD",
  centerSelection: "Space",
  cycleHero: "Digit1",
  cycleTown: "Digit2",
  endTurn: "Enter",
  zoomIn: "Equal",
  zoomOut: "Minus",
  toggleMenu: "Escape",
};

export function getDefaultBindings(): ShortcutBindings {
  return { ...DEFAULT_BINDINGS };
}

function isLayout(value: unknown): value is KeyboardLayout {
  return value === "fr" || value === "en";
}

function detectLayout(): KeyboardLayout {
  if (typeof navigator === "undefined") return "fr";
  const lang = navigator.language?.toLowerCase() ?? "";
  return lang.startsWith("fr") ? "fr" : "en";
}

export function getSavedLayout(): KeyboardLayout {
  if (typeof window === "undefined") return "fr";
  const raw = window.localStorage.getItem(KEYBOARD_LAYOUT_KEY);
  return isLayout(raw) ? raw : detectLayout();
}

export function saveLayout(layout: KeyboardLayout) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEYBOARD_LAYOUT_KEY, layout);
  window.dispatchEvent(new CustomEvent(KEYBOARD_PREFERENCE_EVENT));
}

export function getSavedBindings(): ShortcutBindings {
  if (typeof window === "undefined") return getDefaultBindings();
  const raw = window.localStorage.getItem(KEYBOARD_BINDINGS_KEY);
  if (!raw) return getDefaultBindings();
  try {
    const parsed = JSON.parse(raw) as Partial<Record<ShortcutAction, unknown>>;
    // Merge over defaults so a new action added in a later version still has a
    // binding even if the stored object predates it.
    const merged = getDefaultBindings();
    for (const action of SHORTCUT_ACTIONS) {
      const value = parsed?.[action];
      if (typeof value === "string" && value.length > 0) merged[action] = value;
    }
    return merged;
  } catch {
    return getDefaultBindings();
  }
}

export function saveBindings(bindings: ShortcutBindings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEYBOARD_BINDINGS_KEY, JSON.stringify(bindings));
  window.dispatchEvent(new CustomEvent(KEYBOARD_PREFERENCE_EVENT));
}

export function resetBindings(): ShortcutBindings {
  const defaults = getDefaultBindings();
  saveBindings(defaults);
  return defaults;
}

// --- Display helpers -------------------------------------------------------

// Physical letter codes that differ between QWERTY and AZERTY. We only list the
// keys whose printed legend changes; everything else renders the same on both.
const AZERTY_LETTER_LABELS: Record<string, string> = {
  KeyQ: "A",
  KeyW: "Z",
  KeyA: "Q",
  KeyZ: "W",
  KeyM: ",",
};

// Named / symbol keys whose label is the same regardless of layout, with a
// French rendering for a few.
function namedKeyLabel(code: string, layout: KeyboardLayout): string | null {
  switch (code) {
    case "Space":
      return layout === "fr" ? "Espace" : "Space";
    case "Enter":
    case "NumpadEnter":
      return layout === "fr" ? "Entrée" : "Enter";
    case "Escape":
      return layout === "fr" ? "Échap" : "Esc";
    case "Tab":
      return "Tab";
    case "ArrowUp":
      return "↑";
    case "ArrowDown":
      return "↓";
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    case "Equal":
    case "NumpadAdd":
      return "+";
    case "Minus":
    case "NumpadSubtract":
      return "−";
    case "Backquote":
      return "`";
    default:
      return null;
  }
}

/**
 * Human-readable label for a `KeyboardEvent.code`, respecting the selected
 * layout for the letter keys that differ between AZERTY and QWERTY.
 */
export function keyCodeLabel(code: string, layout: KeyboardLayout): string {
  if (!code) return "—";
  const named = namedKeyLabel(code, layout);
  if (named) return named;
  if (layout === "fr" && code in AZERTY_LETTER_LABELS) return AZERTY_LETTER_LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return code.slice(6);
  return code;
}
