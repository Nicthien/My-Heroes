<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Security

- Never commit secrets (passwords, tokens, API keys) to the repository.
- `.env*` files are ignored by git, except `.env.example` which serves as a template.
- Always verify that no sensitive data is present in the code before pushing.
- Supabase service role keys and database credentials must remain in `.env` (not versioned).

# API Routes

- Every route under `src/app/api/games/` must gate access with `requireCurrentUser(request)` and bail on the returned `response` if `user` is null.
- Writes go through `createAdminClient()` (Supabase service role, bypasses RLS). Do not use the browser `createClient()` server-side.
- The browser only does **reads** via Supabase realtime + the `/api/supabase/[...path]` proxy. Never add a client-side write path.
- For new game-level actions on an entity, follow the existing `if (action.type === "...")` chain in `src/app/api/games/[id]/action/route.ts` rather than creating a parallel handler file. Combat-specific actions live in the existing combat action route under `src/app/api/games/[id]/combats/[combatId]/action/route.ts`.

# Database Schema

- Source of truth for a fresh install: `supabase/schema.sql`. Source of truth for incremental changes: `supabase/migrations/`.
- After any schema change, update **both** so that fresh installs and existing databases stay aligned.
- Never write authoritative SQL in `supabase/snippets/` — that path is gitignored (Supabase Studio scratchpad) and not part of the source tree.
- Game tables currently have **no RLS** (everything goes through service-role API routes). The proposed RLS migration is drafted in `IMPROVEMENTS.md` — don't enable RLS piecemeal without applying the full set, or realtime subscriptions silently break.

# Localization

- The in-game UI is in **French** (`Or`, `Bois`, `Construire`, `Recruter`, `À vous de jouer`, etc.). Do not anglicize player-facing strings.
- Code identifiers, comments, commit messages, and developer-facing logs stay in English / standard programming convention.

# Game State

- The game state is **immutable**. `processAction()` and all server-side handlers must return a new `GameState` object — never mutate `state`, `state.players`, `state.players[i].heroes`, etc. in place. Reuse the spread/`map` patterns already present.
- This rule applies to nested arrays/objects too (towns, garrisons, armies, recruits) — shallow copies are not enough when the change is deeper than one level.

# Map Generation Design

- Before changing adventure movement, pathfinding, route costs, map road generation, or server validation for adventure movement, read `ADVENTURE_MOVEMENT_RULES.md` and use the shared helpers in `src/lib/game/engine`.
- Keep resource-producing map buildings separate from adventure buildings.
- Resource buildings use `MapObject.type === "building"` and are economic objectives: mines, sawmills, pits, labs, etc. They should be eligible for road connection so players can read the economy routes clearly.
- Adventure buildings use `MapObject.type === "adventure_building"` and reward exploration: observatories, campfires, lighthouses, Stargates, and future adventure objects. They should not be connected by generated roads.
- When placing adventure buildings, prefer tiles away from roads and never place them directly on a road tile. Small dense maps may use a fallback near roads only when needed to keep adventure density.
- Do not add adventure building positions to mining/resource road targets such as `miningPositions` or `buildSecondaryRoads`.
- Keep blocking decor visually distinct from scenic decor. A single decor kind should not sometimes block and sometimes be passable; use obstacle-specific kinds such as groves or boulder clusters for impassable decoration, and keep ordinary trees, bushes, flowers, and small rocks passable.

# Visual Assets

- For game/map visuals, create and use pixel-art sprite assets in `.webp` under `public/assets/sprites/`.
- For new game sprites, always use `imagegen` or hand-painted raster art in the same style as the existing sprites. Do not generate sprites procedurally with `sharp`, canvas scripts, SVG-to-raster conversion, or similar code-generated placeholder techniques.
- Do not use generated SVGs or rough vector placeholders for in-game objects when a sprite can be used.
- Never use SVG/vector drawings as the source for generated sprites or cursor assets. Use `imagegen` or hand-edited raster sources, then export the final `.webp`.
- If a temporary fallback is needed for resilience, keep it internal to rendering code and replace it with a real `.webp` sprite before considering the feature visually complete.

# Directional Naming

- All world-space directions use the compass alphabet from `src/lib/rendering/phaser/directions.ts`: `Direction8` (`"N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"`), with `Diagonal4` and `Cardinal4` as typed subsets. Do **not** introduce `"left"`, `"right"`, `"gauche"`, `"droite"`, `"up"`, `"down"`, lowercase compass tokens, or camelCase forms like `"northEast"`.
- Asset filenames follow the same convention: hero/boat spritesheets are direction-rowed (rows ordered as in `HERO_DIRECTIONS`), gates use `gate-N-S.webp` / `gate-E-W.webp`, terrain side textures use the `-side-SW.webp` / `-side-SE.webp` suffix (perspective: `SW` = camera-left face of the iso cube, `SE` = camera-right face).
- For wall/gate **segment orientations** (two endpoints, not a single facing direction), use the combined form: `"NW_SE"`, `"NE_SW"`, `"N_S"`, `"E_W"`. This is the `BrickWallOrientation` type in `mapRenderHelpers.ts`.
- Iso cube geometry uses **typed subsets** of the unified alphabet — `CubeFace = Diagonal4` (the 4 vertical side faces sit between cardinal vertices), `CubeCorners` keys are cardinals × `top`/`bottom` (`topN`, `topE`, …, `bottomW`). Don't "fix" these to use Direction8 — the subset choice is geometric, not stylistic.
- `roadAxis: "x" | "y"` in `MapObject` (game-state field) is **not** a direction — it names a tile-coordinate axis and stays as-is. Same for any other game-state field that refers to coordinate axes rather than headings.
- UI alignment props (e.g. `AudioSettingsButton align?: "left" | "right"`) are HTML-screen anchors, not world directions — `"left"` / `"right"` are correct there. The compass rule applies only to world/iso/map directions.

# Audio

- Sound effects live under `public/sounds/`, audio helpers under `src/lib/audio/`.
- New SFX should follow `combatAudio.ts`: lazy `Audio` instances created on first play, volume passed per call, errors swallowed (audio must never crash the game).
- Respect user preferences via `musicPreferences.ts` rather than playing sounds unconditionally.

# Local Dev Stack

- `npm run dev` starts both Supabase (`supabase start`) and Next.js — preferred for end-to-end work.
- `npm run dev:web` starts only Next.js (no DB) — sufficient for the Playwright smoke suite, which targets static auth/`/dev/*` pages.
- The browser hits Supabase via the `/api/supabase/[...path]` proxy only when the configured URL is loopback/private; otherwise the browser talks to Supabase directly. Don't break that fallback in `src/lib/supabase/browser.ts`.

# Component Layout

- Heavy screens (HUD, CombatScreen, PhaserMapScene inside `PhaserMapRenderer.ts`) are intentionally split into small sibling files. When adding code, place it next to the closest existing module rather than growing the orchestrator.
- For new HUD panels, follow `HeroPanel.tsx` / `TownXxxTab.tsx`: one component, explicit props, no global store calls except via `useGameStore.getState()` for one-shot actions.
- For new stateful behaviors, prefer a custom hook (`useDevPanel`, `useTurnNotifications`) over inlining `useState`/`useEffect` in the orchestrator.
- For rendering helpers in `src/lib/rendering/phaser/`, prefer a pure free function in a sibling module over a new method on `PhaserMapScene`. Only add a class method when it must touch scene state (`this.add`, `this.fogLayer`, refs, etc.).
- Never re-import `next-auth` or `bcryptjs`; auth flows through Supabase only.

# Testing

- Smoke tests live in `tests/e2e/` (Playwright). Run `npm run test:e2e` before considering UI changes complete.
- The Playwright suite covers auth pages plus selected `/dev/*` preview pages (HUD, combat, map showcase, sprites, RMG). When changing a heavy component, add or update the matching `/dev/*` page and `tests/e2e/dev-pages.spec.ts` so the smoke test exercises it with mocked state.
- Pure logic changes (engine, combat rules, map generator) should also pass the corresponding `npm run validate:*` script.
- `npm run lint` and `npx tsc --noEmit` must stay clean — both are zero-warning targets in this repo.
