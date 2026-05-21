# Pistes d'amélioration — My Heroes

> Bilan initial : 2026-05-19. Révision : 2026-05-20.
> Document de référence pour des travaux futurs.

## État de santé du socle

| Vérification | Résultat |
|---|---|
| `npm run lint` (ESLint) | ✅ Aucun problème |
| `tsc --noEmit` (TypeScript) | ✅ Aucune erreur |
| `npm run validate:combat` | ✅ Passé |
| `npm run validate:movement` | ✅ Passé |
| `npm run validate:rmg` | ✅ Passé (1 warning non-bloquant) |
| Migration `add_gates.sql` vs `schema.sql` | ✅ Cohérents |

Socle sain. Les points ci-dessous sont des améliorations, pas des régressions.

---

## 🔴 Priorité haute — Hygiène du dépôt

- [x] `tmp-gate-sources-contact.png` — supprimé
- [x] Sprites `gate-test-*.webp` (4 fichiers) — supprimés (sprites finaux conservés : `gate.webp`, `gate-diagonal-up/down.webp`)
- [x] `supabase/snippets/Untitled query 662.sql` — supprimé (doublon de la migration `20260519000100_add_gates.sql`)
- [x] `tmp-*` ajouté au `.gitignore`.
- [x] 3 snippets SQL obsolètes supprimés (`Untitled query 137/304/985.sql` — leur contenu est déjà dans `schema.sql`). `supabase/snippets/` ajouté au `.gitignore`.
- [x] **Dépendances inutilisées supprimées** : `next-auth` (^5.0.0-beta.31) et `bcryptjs` (^3.0.3) — aucune référence dans le code. Le projet utilise `@supabase/ssr` pour l'auth.

---

## 🟠 Priorité moyenne — Qualité du code

### Fichiers volumineux à découper

| Fichier | Lignes initiales | Lignes actuelles | Statut |
|---|---:|---:|---|
| [`src/lib/rendering/phaser/PhaserMapRenderer.ts`](src/lib/rendering/phaser/PhaserMapRenderer.ts) | 5031 | **3031** | ✅ **-40%** — 17 modules extraits dont **decorDrawing** et **boardAndWallDrawing** (méthodes de classe pures extraites en free functions). |
| [`src/components/game/map/GameMap.tsx`](src/components/game/map/GameMap.tsx) | 2689 | 2689 | À faire — extraire la logique d'interaction |
| [`src/components/game/hud/HUD.tsx`](src/components/game/hud/HUD.tsx) | 2667 | **857** | ✅ **-68%** — 16 modules extraits dont **5 onglets Town** (Summary, Build, Recruit, Tavern, Garrison) + dialogues count partagés + hooks dev/notifications + HeroPanel/PlayersListPanel. |
| [`src/components/game/combat/CombatScreen.tsx`](src/components/game/combat/CombatScreen.tsx) | 2567 | **377** | ✅ **-85%** — 8 modules extraits (unitSvg, sceneryPresets, combatLayout, battlefieldScenery, combatPanels, CombatFloatingPanel, battlefieldUnits, IsoBattlefield). Reste : seulement le wrapper CombatScreen avec son hook de cycle de vie. |
| [`src/app/api/games/[id]/action/route.ts`](src/app/api/games/[id]/action/route.ts) | 1638 | 1638 | À faire — extraire un handler par type d'action (`if (action.type === "X")` × 15, structure idéale pour split mécanique) |

**Prérequis avant tout découpage** : ✅ Suite Playwright en place (`npm run test:e2e`, **9 tests**, ~12s d'exécution).
- [`tests/e2e/smoke.spec.ts`](tests/e2e/smoke.spec.ts) — 4 tests sur les pages d'auth (rendu + navigation).
- [`tests/e2e/dev-pages.spec.ts`](tests/e2e/dev-pages.spec.ts) — 5 tests sur les pages `/dev/*` qui couvrent **les composants lourds** : HUD, CombatScreen, PhaserMapRenderer, assets sprites, RMG engine. Ces pages utilisent un mock state, donc pas besoin de Supabase pour les tester.

**Chemin recommandé** :
1. ✅ Suite Playwright minimale (smoke auth + dev pages) — 2026-05-20.
2. **Étendre** la suite avec des scénarios gameplay end-to-end : create game (vs IA), move hero, recruit unit, end turn, combat auto-resolve. Nécessite Supabase local démarré (`supabase start`) et un seeding de profil de test.
3. Avec la suite gameplay verte, attaquer le découpage **un fichier à la fois**, **une extraction à la fois**, avec validation Playwright + `tsc` après chaque extraction.
4. Commencer par [`action/route.ts`](src/app/api/games/[id]/action/route.ts) (structure la plus claire à découper — 15 if-branches mécaniquement extractibles).

### Typage

- [x] ✅ Vérifié 2026-05-20 : zéro `as any` / `: any` dans `src/` (.ts et .tsx). Typage propre.

### Logging

- **Décision 2026-05-20 : pas de wrapper pour l'instant.** 4 sites d'appel au total (3 `console.error` dans [`action/route.ts`](src/app/api/games/[id]/action/route.ts) + 1 `console.warn` dans [`combats/route.ts`](src/app/api/games/[id]/combats/route.ts)), tous avec contexte structuré déjà fourni. Un wrapper serait de la cérémonie. À reconsidérer le jour où un agrégateur de logs (Sentry, Logtail, Datadog) est branché.

### Lint

- [x] Variable `idx` non utilisée dans [`scripts/process-gate-sprite.mjs`](scripts/process-gate-sprite.mjs) — corrigée.

---

## 🟡 Observations / surveillance

### Sécurité Supabase (RLS) — audit 2026-05-20

**État actuel** :
- Seule `profiles` a RLS activé.
- Toutes les routes API utilisent `createAdminClient()` (service-role, bypass RLS) — les writes sont donc gatées par `requireCurrentUser()` ✅
- Le client browser utilise la clé publishable pour des **subscriptions realtime** sur 10 tables :
  `games`, `game_players`, `heroes`, `armies`, `towns`, `resource_buildings`, `gates`, `gate_stacks`, `combats`, `combat_participants`.

**Vulnérabilité identifiée** : sans RLS, n'importe qui avec la clé `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` peut s'abonner via le realtime à **toutes les parties en cours** et observer en temps réel les mouvements, recrutements, combats. Les filtres `game_id=eq.${gameId}` côté client (voir [`src/app/game/[id]/page.tsx`](src/app/game/[id]/page.tsx) ligne 137-146) ne sont pas une protection : un attaquant qui crée son propre client peut omettre le filtre. Plusieurs canaux n'ont même pas de filtre `game_id` (`heroes`, `armies`, `towns`, `gate_stacks`, `combat_participants`).

**Sévérité** : moyenne. Pas de risque de prise de contrôle (les writes restent gatés), mais fuite d'information stratégique entre joueurs.

**Solution proposée** — activer RLS + policies par appartenance à la partie. Migration SQL prête (à appliquer hors session, avec test en env de dev d'abord) :

```sql
-- 1. Helper: l'utilisateur participe-t-il à cette partie ?
create or replace function public.is_game_member(p_game_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.game_players
    where game_id = p_game_id and user_id = auth.uid()
  );
$$;

-- 2. Activer RLS sur toutes les tables de jeu
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.heroes enable row level security;
alter table public.armies enable row level security;
alter table public.towns enable row level security;
alter table public.resource_buildings enable row level security;
alter table public.gates enable row level security;
alter table public.gate_stacks enable row level security;
alter table public.combats enable row level security;
alter table public.combat_participants enable row level security;
alter table public.neutral_armies enable row level security;
alter table public.neutral_army_stacks enable row level security;
alter table public.turns enable row level security;

-- 3. Policies SELECT (lecture seule via clé anon + realtime)
create policy "games visibles aux participants" on public.games for select to authenticated
  using (is_game_member(id));

create policy "game_players visibles aux co-joueurs" on public.game_players for select to authenticated
  using (is_game_member(game_id));

create policy "heroes visibles aux co-joueurs" on public.heroes for select to authenticated
  using (exists (select 1 from public.game_players gp where gp.id = heroes.game_player_id and is_game_member(gp.game_id)));

create policy "armies visibles aux co-joueurs" on public.armies for select to authenticated
  using (exists (select 1 from public.heroes h join public.game_players gp on gp.id = h.game_player_id where h.id = armies.hero_id and is_game_member(gp.game_id)));

create policy "towns visibles aux co-joueurs" on public.towns for select to authenticated
  using (exists (select 1 from public.game_players gp where gp.id = towns.game_player_id and is_game_member(gp.game_id)));

create policy "resource_buildings visibles aux co-joueurs" on public.resource_buildings for select to authenticated
  using (is_game_member(game_id));

create policy "gates visibles aux co-joueurs" on public.gates for select to authenticated
  using (is_game_member(game_id));

create policy "gate_stacks visibles aux co-joueurs" on public.gate_stacks for select to authenticated
  using (exists (select 1 from public.gates g where g.id = gate_stacks.gate_id and is_game_member(g.game_id)));

create policy "combats visibles aux co-joueurs" on public.combats for select to authenticated
  using (is_game_member(game_id));

create policy "combat_participants visibles aux co-joueurs" on public.combat_participants for select to authenticated
  using (exists (select 1 from public.combats c where c.id = combat_participants.combat_id and is_game_member(c.game_id)));

create policy "neutral_armies visibles aux co-joueurs" on public.neutral_armies for select to authenticated
  using (is_game_member(game_id));

create policy "neutral_army_stacks visibles aux co-joueurs" on public.neutral_army_stacks for select to authenticated
  using (exists (select 1 from public.neutral_armies na where na.id = neutral_army_stacks.neutral_army_id and is_game_member(na.game_id)));

create policy "turns visibles aux co-joueurs" on public.turns for select to authenticated
  using (is_game_member(game_id));

-- Note: aucune policy INSERT/UPDATE/DELETE n'est créée — tous les writes restent réservés au service-role (API routes).
-- Note: le client `games/open` (lobby) doit également filtrer côté serveur — vérifier que l'écran de lobby ne dépend pas d'un SELECT public sur `games`.
```

**Étapes de rollout** :
1. Appliquer en env de dev (`supabase db reset` après ajout de la migration).
2. Tester :
   - Création de partie, jeu normal d'un user (doit fonctionner)
   - Avec un second user authentifié, vérifier qu'il ne reçoit PAS les realtime d'une partie qu'il n'a pas rejointe (DevTools → Network → WS)
   - Vérifier que le lobby (`/api/games/open`) liste toujours les parties joignables (probablement via API server-side, OK)
3. Tester le rejoin d'une partie en cours.
4. Si OK, appliquer en prod hors heures de pointe ; rollback = `alter table … disable row level security`.

**Bloquant pour appliquer** : nécessite un Supabase dev disponible et une session de test manuelle (~30 min). Ne pas appliquer en aveugle.

### Warnings du générateur de cartes (RMG)

- ✅ Métrique de densité de décor corrigée pour les templates archipelago (mesurée contre la surface terrestre, plus contre la surface totale).
- 3 warnings restants sur `jebus-cross` (seeds 36) : densité de décor + low adventure building count. Non-bloquant, à investiguer si le gameplay sur ces seeds pose problème.
- Progrès : 12 warnings (2026-05-19) → 3 warnings (post-fix).

---

## Suivi

- [x] Hygiène dépôt
- [x] Nettoyage des `any` (déjà propre)
- [x] Réglage seuil décor RMG (archipelago — métrique corrigée)
- [x] Audit RLS Supabase (SQL prêt à appliquer après test dev)
- [x] Prérequis avant découpage : suite Playwright (auth + dev pages, 9 tests) — `npm run test:e2e`
- [x] **Découpage HUD.tsx** : 2667 → 1690 lignes (-37%) sur 7 extractions
- [x] **Découpage PhaserMapRenderer.ts** : 5031 → 3662 lignes (-27%) sur 11 extractions (constantes + helpers purs + drawing helpers)
- [ ] Découpage `HUDContent` (le sous-composant principal de HUD, ~1600 lignes) — nécessite refactor en sous-panneaux
- [ ] Découpage suite de `PhaserMapScene` (la classe principale, ~4500 lignes) — extraire fog of war, road rendering, hero animation, terrain rendering en modules dédiés
- [ ] Étendre Playwright avec scénarios gameplay end-to-end (create game IA, move hero, end turn, combat)
- [ ] Découpage `action/route.ts` (le plus mécanique une fois les tests en place)
- [ ] Découpage `PhaserMapRenderer.ts` / `GameMap.tsx` / `HUD.tsx` / `CombatScreen.tsx`
- [ ] Appliquer la migration RLS (après test dev manuel)
- [ ] Investiguer warnings `jebus-cross` seed 36 (décor + adventure buildings)
- [ ] (Reporté) Logger structuré : à reconsidérer quand un agrégateur est branché
