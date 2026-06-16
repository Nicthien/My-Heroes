# Neutral Guard Difficulty Balance

How the strength of **neutral guards** (the armies that block mines, gates, artifacts,
neutral towns and wandering monsters) is tuned. This is the reference for the difficulty
pass that flattened the curve and softened the early/mid game.

> **Scope:** everything that is fought through `createNeutralArmyStacksForTile`
> (`src/lib/game/neutral-armies.ts`) or persisted neutral stacks. **Creature banks are
> deliberately NOT covered** — see the last section.

---

## The levers (all in `src/lib/game/neutral-armies.ts`, growth in `src/lib/game/server/turns.ts`)

| # | Lever | Value | Effect |
|---|-------|-------|--------|
| 1 | `GUARD_STRENGTH_MULTIPLIER` | **4.5** (was 7.5) | Global **−40 %** on the unit count of every neutral guard. |
| 2 | `GUARD_BUDGET_ANCHOR` / `GUARD_BUDGET_COMPRESSION` | **300** / **0.40** | Sub-linear **curve compression**: budgets ≤ anchor untouched, larger ones grow by a fractional power. Flattens the spread. |
| 3 | `calculateStackCount` | `min(7, ceil(total/5))`, 1 stack if `< 4` | **Finer splitting** — ~5 units/stack, max 7 (classic army slots). |
| 4 | `NEUTRAL_WEEKLY_GROWTH` / `NEUTRAL_GROWTH_CAP` | **1.25** / **3** | Undefeated neutrals gain **+25 %/week**, compounding, capped at **×3** of base. |

> **Calibration history:** lever 1 was cut to 2.8125 (−62.5 %) with a gentle 250/0.55 curve,
> but that made the early game *too easy* (the starting hero's first gate read "Easy"). It was
> walked back to **4.5 / 300 / 0.40**: a higher multiplier lifts the early/mid game, and the
> steeper compression (lower exponent) keeps the central gate from going back to suicidal.

### How a guard's unit count is derived (`createNeutralArmyStacksForTile`)

```
budget      = max(120, floor(compressGuardBudget(guardianPower)))   // lever 2, drives tier + count
unitType    = picked from the terrain pool, biased to the lower-mid band (on compressed budget)
totalCount  = round(budget * GUARD_STRENGTH_MULTIPLIER / unit.aiValue)   // lever 1
stacks      = split totalCount into calculateStackCount(totalCount) near-equal slots   // lever 3
```

`compressGuardBudget(b) = b` if `b ≤ 300`, else `300 * (b/300) ^ 0.40`. The budget is
compressed **before** anything derives from it (tier, creature band, count), so high-end
guards ease in **both tier and number** together (and never degenerate into "1 lone elite").

---

## Current calibration — badge vs the starting hero

The combat-choice badge is `defenderPower / heroPower`. A fresh Castle hero (20 pikemen +
12 archers + 4 griffins, ~5 450 power) sees, on `jebus-cross` 2p, with the **current 4.5 /
300 / 0.40** levers:

| Guard | budget | units | ratio | Badge |
|-------|-------:|------:|------:|-------|
| Wandering monster | 100 | 7 | 0.10 | Easy |
| 🪵 Wood mine | 180 | 10 | 0.15 | Easy |
| ⛏️ Ore mine | 220 | 12 | 0.18 | Easy |
| 💰 Gold mine | 760 | 24 | 0.35 | Medium |
| 🚪 Entry gate | 1000 | 19 | 0.40 | **Medium** |
| 🗡️ Zone guardian | 1000 | 16 | 0.41 | Medium |
| 💎 Crystal mine | 1350 | 21 | 0.44 | Medium |
| 🚪 Central gate | 7800 | ~34 | ~0.91 | Hard |

Target shape: starting mines/monsters **Easy** (clearable turn 1-2), the first gate and the
gold/crystal mines **Medium** (a real fight), the central gate **Hard** (a late objective).

## Difficulty spread — before vs the −62.5 % phase

> ⚠️ The table below compares the original 7.5 basis against the **−62.5 % phase** (2.8125 /
> 250 / 0.55). The current 4.5 / 300 / 0.40 calibration sits ~1.5-1.7× above the "after"
> column here (see the badge table above for the live numbers). It is kept to show the
> shape of the flattening; the deltas are illustrative, not the current absolute values.

`Puissance` = the badge metric (`Σ unit.power × count`). Measured on `jebus-cross`, 2p, same map.

| Guard | budget | BEFORE (power) | −62.5 % phase | Δ |
|-------|-------:|---------------:|--------------:|----:|
| Wandering monster | 133 | 1 095 | **412** | −62 % |
| 🪵 Wood mine | 180 | 1 360 | **480** | −65 % |
| ⛏️ Ore mine | 220 | 1 680 | **640** | −62 % |
| 🌊 Sea patrol | 401 | 3 014 | **852** | −72 % |
| 💰 Gold mine | 760 | 5 750 | **1 273** | −78 % |
| 💎 Crystal mine | 1350 | 10 122 | **1 745** | −83 % |
| 🗡️ Zone guardian | 2227 | 16 668 | **2 178** | −87 % |
| 🚪 Gate | 4400 | 32 970 | **3 092** | −91 % |

**Curve flattened: ~30:1 → ~7:1** (weakest vs strongest guard). The compression cuts the
high end far harder than the low end — that is the point.

---

## Creatures encountered — before vs after (illustrative)

A representative guard of each type (exact type varies by terrain pool / seed).

| Guard | budget | BEFORE | AFTER |
|-------|-------:|--------|-------|
| Wandering monster | 100 | 15 troglodytes | **6 troglodytes** |
| 🪵 Wood mine | 180 | 17 pikemen | **6 pikemen** |
| ⛏️ Ore mine | 220 | 21 pikemen | **8 pikemen** |
| 🌊 Sea patrol | 240 | 32 nymphs | **12 nymphs** |
| 💰 Gold mine | 760 | 50 halberdiers | **16 pikemen** |
| 💎 Crystal mine | 1350 | 66 harpies | **21 infernal troglodytes** |
| 🗡️ Zone guardian | 1000 | 83 gnoll marauders | **17 gnoll marauders** |
| 🎁 Artifact | 1350 | 230 gremlins | **27 master gremlins** |
| 🚪 Gate | 7800 | 111 steel elves ⚔️ | **34 dwarves** |

Two visible effects: **far fewer units** (compression + global cut), and for big guards a
**lower unit tier too** (gate: steel elves → dwarves; gold mine: halberdiers → pikemen).

---

## Weekly escalation (`applyWeeklyNeutralGrowth` in `server/turns.ts`)

Undefeated neutrals harden over time. The factor is derived from `turn_number` (a week is
7 days; `isStartOfWeek(day) = day > 1 && (day-1) % 7 === 0`), with the cumulative growth
capped at ×3:

| Week | 1 | 2 | 3 | 4 | 5 | 6+ |
|------|---|---|---|---|---|----|
| Cumulative | ×1.25 | ×1.56 | ×1.95 | ×2.44 | **×3.00** | ×3.00 (frozen) |

A max-grown guard ends at ~3 × its (already reduced) base — still well below the pre-nerf
strength. From week 6 the weekly factor is 1.0, so the function early-returns (no DB work).

### Harmonised across the three storage shapes

Neutral strength lives in **three** places with different read paths; the weekly growth
keeps them in lockstep so the **displayed threat badge and the actual fight always agree**:

| Storage | Used by | Weekly growth |
|---------|---------|---------------|
| DB stacks (`neutral_army_stacks`, `gate_stacks`) + `towns.neutral_garrison` blob | preview **and** combat read these | scaled in place |
| `resource_buildings.guardian_power` (mines) | the **server's** combat source | scaled **and mirrored** into `mapData.object.guardianPower` (the badge's display source) so they can't drift |
| `mapData.object.guardianPower` (artifacts, + the mine mirror) | preview **and** combat | scaled in place; `map_data` persisted when touched |

The same single function in `createNeutralArmyStacksForTile` is what both the client preview
(`CombatChoiceModal`) and the server combat call, so levers 1–3 are automatically consistent
between badge and fight.

---

## Notes / scope boundaries

- **New games only.** Levers 1–3 apply at stack generation; in-progress games keep their
  already-seeded `neutral_army_stacks`. (Lever 4 still runs for any active game.)
- **Creature banks are NOT touched** (`src/lib/game/creature-banks.ts`,
  `targetType === "creature_bank"`). They are a *curated* system: each variant has a
  hand-authored guard matched to a fixed, often large reward (e.g. Dragon Utopia = 8+4
  dragons guarding 50 000 gold + 3 relics). Applying the procedural compression would gut
  the end-game prizes into near-free pickups, so they keep their authored balance. They get
  **no −62.5 %, no compression, no weekly growth**, by design.

## Tuning guide

| Want | Change |
|------|--------|
| Everything easier/harder globally | `GUARD_STRENGTH_MULTIPLIER` (↓ = easier) |
| Flatten the top more (gates/buildings still too hard) | `GUARD_BUDGET_COMPRESSION` ↓ toward 0.50 |
| Stop compressing earlier / let more guards keep full strength | `GUARD_BUDGET_ANCHOR` ↑ |
| Early wood/ore mines too trivial | raise the floor: bump `STARTING_MINE_SPECS` budgets (`engine/placement.ts`) or `GUARD_BUDGET_ANCHOR` |
| Faster/slower weekly hardening or a different ceiling | `NEUTRAL_WEEKLY_GROWTH` / `NEUTRAL_GROWTH_CAP` |
