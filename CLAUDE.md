# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Next.js version note**: Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/` — this version has breaking API and convention changes from training data.

## Project Overview

**My Heroes** is a turn-based strategy game inspired by Heroes of Might and Magic III. Players explore procedurally-generated maps, manage resources and heroes, recruit armies, and engage in tactical combat. Built with Next.js, React, Supabase, and Phaser for isometric rendering.

## Core Commands

**Development:**
- `npm run dev` - Start development server (port 3000, starts local Supabase too)
- `npm run dev:web` - Start Next.js only (port 3000)
- `npm run build` - Build production bundle
- `npm start` - Run production server
- `npm run lint` - Run ESLint

**Testing:**
- `npm run test:e2e` - Run Playwright smoke tests (9 tests on auth + `/dev/*` preview pages, ~12s). Reuses an existing dev server on port 3000 if running, otherwise starts `next dev`.
- `npm run validate:combat` / `:movement` / `:rmg` - Pure-logic validation scripts (no UI)

**Database:**
- Apply `supabase/schema.sql` in the Supabase SQL Editor after schema changes

**Environment Setup:**
Copy `.env.example` to `.env` and configure the Supabase URL, publishable key, and service role key.

## Architecture Overview

### Directory Structure

- `src/app/` - Next.js App Router (pages and API routes)
  - `api/` - REST endpoints (auth, games, combat actions)
  - `auth/` - Login/register pages
  - `dashboard/` - Game lobby
  - `game/[id]/` - Main game interface
- `src/lib/game/` - Core game logic
  - `types.ts` - Domain types and enums (Terrain, Unit, Faction, etc.)
  - `engine/index.ts` - Map generation, pathfinding, visibility, state processing
  - `economy.ts` - Building/unit rules and resource calculations
  - `units.ts` - Unit stat tables
  - `combat/` - Combat system (auto-resolve and persistent hex grid)
- `src/lib/rendering/phaser/` - Phaser isometric renderer. `PhaserMapRenderer.ts` holds the `PhaserMapScene` class; pure helpers are split into siblings: `mapObjectLayout`, `terrainColors`, `terrainAnimation`, `terrainFaceRender`, `fogConstants`, `fogRender`, `roadConstants`, `roadGeometry`, `decorConstants`, `decorTextures`, `decorDrawing`, `boardAndWallDrawing`, `objectMetrics`, `heroSprite`, `pointMath`, `mapRenderSettings`, `mapRenderHelpers`.
- `src/lib/stores/gameStore.ts` - Zustand client state (game state, UI selections, combat UI)
- `src/lib/auth/index.ts` - Supabase auth helpers for Route Handlers
- `src/components/` - React components. The big screens are decomposed:
  - `game/hud/` - HUD orchestrator + extracted panels (`HeroPanel`, `PlayersListPanel`, 5 `TownXxxTab`), shared dialogs (`townDialogs`/`CountDialog`), hooks (`useDevPanel`, `useTurnNotifications`), and primitives (`gauges`, `icons`, `topBar`, `helpers`, `recruitHelpers`, `UnitSprite`, `DevPerformancePanel`, `MiniMap`, `SidePanel`, `theme`).
  - `game/combat/` - `CombatScreen` orchestrator + `IsoBattlefield`, `battlefieldScenery`, `battlefieldUnits`, `combatPanels`, `combatLayout`, `sceneryPresets`, `unitSvg`, `CombatFloatingPanel`.
- `tests/e2e/` - Playwright smoke tests (auth + `/dev/*` preview pages).

### Data Model (Supabase)

Relations: User → GamePlayer ↔ Hero/Town/Army/Combat; Game → Turn/Combat/NeutralArmy/ResourceBuilding

Key fields:
- GamePlayer: faction, color, resources (gold/wood/ore/mercury/crystals/sulfur), turnOrder, exploredTiles
- Hero: level, stats (attack/defense/spellPower/knowledge), position, movement/maxMovement
- Town: type (castle, etc.), position, level, buildings, garrison, availableRecruits
- ResourceBuilding: type (gold_mine, sawmill, etc.), position, guardianPower (defense strength)
- Combat: mode (AUTO or MANUAL), status, boardState (units and terrain), turnQueue, participants

### Game Engine Patterns

**Map & Movement** (src/lib/game/engine/index.ts):
- generateMap() - Simplex noise terrain with 8 types (grass, water, mountain, forest, dirt, sand, snow, swamp, lava), elevation levels, resource placement
- findPath() - A* on the adventure square grid with 8 directions, road-aware PM costs, and strict diagonal corner blocking. Read `ADVENTURE_MOVEMENT_RULES.md` before changing this.
- computeVisibleTiles() - Vision radius around heroes/towns; exploredTiles accumulate for fog of war
- calculateIncome() - Per-turn resource generation from towns and resource buildings
- processAction() - Immutable state updates for MOVE_HERO, END_TURN, etc.; advances turn order

**Combat System** (src/lib/game/combat/):
- **Auto-Resolve** - Quick winner determination by comparing total unit power
- **Manual Combat (Hex Grid)** - 13 cols × 9 rows, odd-offset hexagon coordinates
  - Units positioned as CombatBoardUnit (extends UnitStack with q/r hex coords, speed, damage range)
  - Turn queue built by speed descending; refreshed each round
  - Damage = unit damage per hit × count × multiplier(based on attack vs defense diff)
  - Movement: getHexNeighbors() returns 6 adjacent cells; pathfinding via BFS
  - Terrain obstacles (water, rock) block movement
  - Special actions: MOVE, ATTACK (melee), SHOOT (ranged), DEFEND (reduce damage), WAIT

**Rendering** (`src/lib/rendering/phaser/`):
- `PhaserMapScene` (in `PhaserMapRenderer.ts`) is the Phaser scene class — owns the layer stack, fog chunks, hero animation refs, and orchestrates updates.
- Pure helpers (no `this`) live in sibling modules — see Directory Structure above. Pattern: when adding a new draw helper, prefer a free function in the matching sibling module; only add a class method when it must touch scene state.
- Phaser dimetric projection (cartesian x,y to isometric screen coords)
- Layer stack: mapContainer (tiles) → objectContainer (heroes/towns) → highlightContainer (path) → fogContainer (unexplored/unseen)
- Elevation affects tile depth; higher elevation = lower screen position
- Fog of war: full black (never seen), semi-transparent (explored but not visible)
- MapObjectData: heroes, towns, resource buildings, combat markers rendered as Graphics or Sprites
- Camera: pan, center on tile, getTileAtScreen() for click-to-move

**Client State** (src/lib/stores/gameStore.ts):
- gameState - Full game state from server (players, map, turn, combats)
- selectedHeroId, selectedTownId - UI selection state
- activeCombat, pendingCombat, pendingJoinCombat - Combat UI state
- dispatchAction() - Dispatches GameAction through processAction()

### API Routes (src/app/api/games/)

All routes use `createAdminClient()` (Supabase service role, bypassing RLS) and gate access via `requireCurrentUser()`. There is no client direct-write path — the browser only subscribes to Supabase realtime for reads. See the RLS audit in `IMPROVEMENTS.md` for the proposed read-side hardening.

- POST /api/games - Create new game (map generation, player setup, neutral armies, resource buildings)
- GET  /api/games - List authenticated user's games
- GET  /api/games/open - List joinable PENDING games (lobby)
- GET  /api/games/[id] - Fetch a game with relations
- GET  /api/games/[id]/sync - Lightweight refresh used by realtime subscribers
- POST /api/games/[id]/join - Join existing game as new player
- POST /api/games/[id]/leave - Leave a game (resets if creator on PENDING)
- POST /api/games/[id]/start - Transition game from PENDING to ACTIVE
- POST /api/games/[id]/action - Submit a player action (move hero, build, recruit, transfer, end turn, etc.). 15 branches in `route.ts` keyed by `action.type`.
- POST /api/games/[id]/combats - Initiate combat between heroes or vs neutral army
- GET  /api/games/[id]/combats/[combatId] - Fetch a single combat
- POST /api/games/[id]/combats/[combatId]/action - Execute combat action (move, attack, defend, wait)
- POST /api/games/[id]/combats/[combatId]/join - Join ongoing combat as reinforcement

Shared helpers for `[id]/*` routes live in `src/app/api/games/[id]/shared.ts`.

## Key Design Decisions

1. **Immutable Game State** - Every action creates a new GameState object; no mutations
2. **Persistent Combats** - Combats stored in DB; multiple simultaneous combats allowed; players can join as reinforcements mid-combat
3. **Hex Grid Combat** - Odd-offset coordinates provide tactical depth vs simpler square grids
4. **Fog of War Rendering** - Separate layer combining visible and explored tiles for clear feedback
5. **Supabase Auth** - Email/password auth with Supabase-managed sessions
6. **Speed-Based Turn Queue** - Units with higher speed act first within a combat round; queue refreshed each round

## Common Development Tasks

**Adding a New Game Action:**
1. Add the type variant to the `GameAction` union (`src/lib/game/types.ts`).
2. Add the server-side handler — a new `if (action.type === "XXX") { ... }` branch in `src/app/api/games/[id]/action/route.ts`. This is the authoritative path (writes via service-role client).
3. Add the optimistic client-side case in `processAction()` (`src/lib/game/engine/index.ts`) if the UI should update before the server response.
4. Dispatch from a UI component via `useGameStore.dispatchAction()` or `fetchWithSupabaseAuth(...)` to the API route.

**Modifying Combat Rules:**
- `src/lib/game/combat/persistent.ts` - `applyDamage()`, `buildTurnQueue()`, persistence helpers
- `src/lib/game/combat/movement.ts` - hex pathfinding (`findHexPath`, `findMeleeApproach`, `getHexDistance`), `COMBAT_COLS`/`COMBAT_ROWS`
- `src/lib/game/combat/rules.ts` - `calculateCombatDamageRange`, `hasAdjacentEnemy`
- `src/lib/game/combat/environment.ts` - per-tile combat environment (terrain features, theme)
- Unit stats are looked up via `getUnitRule()` from `src/lib/game/units.ts`.

**Adjusting Map Generation:**
Edit src/lib/game/engine/index.ts:
- Terrain thresholds (elevation/moisture value ranges for each biome)
- placeResources() function for resource distribution patterns
- RESOURCE_BUILDING_RULES in src/lib/game/economy.ts for building spawn rates

**Adding UI Components:**
- Place new components in `src/components/game/` organized by domain (map, hud, combat).
- For a new HUD panel, drop a sibling file next to `HeroPanel.tsx`/`TownXxxTab.tsx`; for a stateful behavior, prefer a custom hook in the same folder (see `useDevPanel`, `useTurnNotifications`).
- For a new combat sub-view, follow `IsoBattlefield`/`battlefieldUnits` — keep `CombatScreen.tsx` as the orchestrator.
- Import game types from `@/lib/game/types.ts` and global state from `@/lib/stores/gameStore.ts`.
- Render-only previews live under `src/app/dev/*` and are covered by the Playwright smoke suite — exercise heavy components there with mocked state.

## Debugging & Inspection

- **Database state**: use the Supabase dashboard/table editor to inspect game/player/combat records live
- **Map generation**: MapData is JSON-serialized; check tile.object for resources, terrain distribution, guardian power values
- **Combat board**: CombatBoardUnit array contains position (q,r), health, speed, damage; trace buildTurnQueue() output
- **Rendering issues**: Check PhaserMapRenderer.isReady(), object depth ordering, fog/highlight containers, and browser console errors
- **Auth**: Verify Supabase session via `getCurrentUser()`/`requireCurrentUser()` and inspect `auth.users` plus `profiles`

## Key Dependencies

- **Next.js 16** - Framework and App Router
- **Supabase JS** (`@supabase/ssr` + `@supabase/supabase-js`) - Auth, database access, and Realtime subscriptions
- **Phaser 4** - WebGL/canvas game renderer
- **Zustand 5** - Client state management
- **Tailwind CSS 4** - Styling
- **Simplex Noise** - Procedural terrain generation
- **Playwright** (dev) - E2E smoke tests
- **Sharp** (dev/scripts) - Sprite generation

> Auth is handled entirely through Supabase. `next-auth` and `bcryptjs` are **not** used — don't add them back.
