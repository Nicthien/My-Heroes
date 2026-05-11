# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Next.js version note**: Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/` — this version has breaking API and convention changes from training data.

## Project Overview

**My Heroes** is a turn-based strategy game inspired by Heroes of Might and Magic III. Players explore procedurally-generated maps, manage resources and heroes, recruit armies, and engage in tactical combat. Built with Next.js, React, PostgreSQL, Prisma ORM, and PixiJS for isometric rendering.

## Core Commands

**Development:**
- `npm run dev` - Start development server (port 3000)
- `npm run build` - Build production bundle
- `npm start` - Run production server
- `npm run lint` - Run ESLint

**Database:**
- `npx prisma migrate dev` - Create and apply migrations
- `npx prisma studio` - Open Prisma Studio GUI for database inspection
- `npx prisma generate` - Regenerate Prisma client after schema changes

**Environment Setup:**
Copy `.env.example` to `.env` and configure `DATABASE_URL` and `AUTH_SECRET`.

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
- `src/lib/rendering/isometric/` - PixiJS isometric renderer (camera, fog of war, elevation)
- `src/lib/stores/gameStore.ts` - Zustand client state (game state, UI selections, combat UI)
- `src/lib/auth/index.ts` - NextAuth.js configuration
- `src/components/` - React components (auth forms, game UI panels)

### Data Model (Prisma)

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
- findPath() - A* with terrain-based movement costs (grass=1, mountain=2.5, water=2)
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

**Rendering** (src/lib/rendering/isometric/renderer.ts):
- PixiJS dimetric projection (cartesian x,y to isometric screen coords)
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

- POST /api/games - Create new game (map generation, player setup, neutral armies, resource buildings)
- GET /api/games - List authenticated user's games
- POST /api/games/[id]/join - Join existing game as new player
- POST /api/games/[id]/start - Transition game from PENDING to ACTIVE
- POST /api/games/[id]/action - Submit player action (hero movement, unit recruitment, building, end turn)
- POST /api/games/[id]/combats - Initiate combat between heroes or vs neutral army
- POST /api/games/[id]/combats/[combatId]/action - Execute combat action (move, attack, defend, wait)
- POST /api/games/[id]/combats/[combatId]/join - Join ongoing combat as reinforcement

## Key Design Decisions

1. **Immutable Game State** - Every action creates a new GameState object; no mutations
2. **Persistent Combats** - Combats stored in DB; multiple simultaneous combats allowed; players can join as reinforcements mid-combat
3. **Hex Grid Combat** - Odd-offset coordinates provide tactical depth vs simpler square grids
4. **Fog of War Rendering** - Separate layer combining visible and explored tiles for clear feedback
5. **NextAuth Credentials Provider** - Username/password auth with JWT sessions and Prisma adapter
6. **Speed-Based Turn Queue** - Units with higher speed act first within a combat round; queue refreshed each round

## Common Development Tasks

**Adding a New Game Action:**
1. Add type variant to GameAction union (src/lib/game/types.ts)
2. Implement handler case in processAction() (src/lib/game/engine/index.ts)
3. Dispatch from UI component via useGameStore.dispatchAction()

**Modifying Combat Rules:**
Edit src/lib/game/combat/persistent.ts:
- applyDamage() for damage calculation
- buildTurnQueue() for turn order logic
- COMBAT_COLS/COMBAT_ROWS constants for board size
- getUnitRule() imported from units.ts for stat lookup

**Adjusting Map Generation:**
Edit src/lib/game/engine/index.ts:
- Terrain thresholds (elevation/moisture value ranges for each biome)
- placeResources() function for resource distribution patterns
- RESOURCE_BUILDING_RULES in src/lib/game/economy.ts for building spawn rates

**Adding UI Components:**
Place new components in src/components/game/ organized by domain (map, HUD, combat, etc.)
Import game types from @/lib/game/types.ts and state from @/lib/stores/gameStore.ts

## Debugging & Inspection

- **Database state**: `npx prisma studio` to inspect game/player/combat records live
- **Map generation**: MapData is JSON-serialized; check tile.object for resources, terrain distribution, guardian power values
- **Combat board**: CombatBoardUnit array contains position (q,r), health, speed, damage; trace buildTurnQueue() output
- **Rendering issues**: Check IsometricRenderer.isReady(), zIndex stacking (mapContainer=0, objectContainer=10, fogContainer=20)
- **Auth**: Verify NextAuth session via auth() utility; check Prisma user and session records

## Key Dependencies

- **Next.js 16** - Framework and App Router
- **NextAuth.js 5** - JWT authentication
- **Prisma 5** - ORM and migrations
- **PixiJS 8** - WebGL 2D renderer
- **Zustand 5** - Client state management
- **Tailwind CSS 4** - Styling
- **Simplex Noise** - Procedural terrain generation
- **bcryptjs** - Password hashing
