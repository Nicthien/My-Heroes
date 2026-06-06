# Feature ideas

A living backlog of gameplay/feature ideas for **My Heroes**, deliberately
scoped around systems that already exist in the codebase. Impact/effort are
rough first guesses — refine when picking one up.

Legend: 🟢 low · 🟡 medium · 🔴 high (effort) — impact noted separately.

---

## 🗺️ Exploration / adventure

### Seer's Huts & quests
- **Impact:** high · **Effort:** 🟡
- Adventure objects (`MapObject.type === "adventure_building"`) that hand out a
  quest — kill a target monster, deliver an artifact, reach hero level X — for a
  reward (resources / artifact / XP).
- **Hooks:** reuses the adventure-building placement rules and the reward paths.
  Likely needs a small quest-state field on the player/hero and a new
  `GameAction` for turning in a quest.

### Treasure chests, Pandora's boxes, witch huts
- **Impact:** medium · **Effort:** 🟢
- Quick "HOMM-style" map objects: treasure chest (choose gold **or** XP),
  Pandora's box (reward or guarded surprise), witch hut (learn a hero skill).
- **Hooks:** adventure-building system + existing hero skill tables.

---

## ⚔️ Combat / armies

### Neutral creatures offer to join (diplomacy)
- **Impact:** high · **Effort:** 🟡
- Based on power ratio / a hero Diplomacy skill, a neutral army may offer to
  join instead of fighting.
- **Hooks:** existing neutral armies + combat initiation flow
  (`src/app/api/games/[id]/combats`), plus the encounter/choice modal.

### Artifact sets (collection bonuses)
- **Impact:** medium · **Effort:** 🟢🟡
- Assembling N matching artifacts grants a set bonus.
- **Hooks:** existing hero artifact system; add set metadata + bonus resolution.

---

## 💰 Economy / logistics

### Caravans & Town Portal
- **Impact:** high · **Effort:** 🟡
- Move troops between owned towns without a hero (caravans); teleport a hero to
  a town (Town Portal spell).
- **Hooks:** town garrisons, movement/PM rules (`ADVENTURE_MOVEMENT_RULES.md`),
  spellcasting system. New `GameAction`(s).

---

## 👥 Multiplayer

### Turn timer + simultaneous turns (lobby option)
- **Impact:** high · **Effort:** 🟡
- Reduce waiting: per-turn timer and/or simultaneous turns until players meet.
- **Hooks:** turn order + realtime infra; lobby/game settings.

---

## 🎬 Meta / QoL

### Game / battle replay ⭐
- **Impact:** high · **Effort:** 🟡 · **Top pick**
- A replay viewer that reconstructs a game/battle from the action log.
- **Hooks:** `game_action_logs` already records actions — the data exists, so
  this mostly leverages what's built. Standalone, high "wow" factor.

### Weekly events ("The astrologers proclaim…")
- **Impact:** medium · **Effort:** 🟢
- Random weekly modifiers (creature growth +, plague week, resource week).
- **Hooks:** turn/week tracking; small amount of code, lots of flavour.

---

## Top recommendations
1. **Game replay** — leverages `game_action_logs`, self-contained, high impact.
2. **Seer's Huts / quests** — durable exploration depth.
3. **Weekly events** — small effort, strong flavour.

---

## Notes
- Keep resource-producing buildings separate from adventure buildings
  (see `AGENTS.md` → Map Generation Design).
- New player-facing strings must be FR (with EN), via `src/lib/i18n`.
- New `GameAction`s follow the existing pattern: type in `types.ts`, authoritative
  handler in `action/route.ts`, optimistic case in `processAction()`.
