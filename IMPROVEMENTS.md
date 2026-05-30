# Pistes d'amélioration - My Heroes

> Bilan initial : 2026-05-19. Révision : 2026-05-31.
> Document de référence pour les travaux futurs encore ouverts.

## État de santé du socle

Dernière validation documentée :

| Vérification | Résultat |
|---|---|
| `npm run lint` | ✅ Aucun problème |
| `npx tsc --noEmit` | ✅ Aucune erreur |
| `npm run validate:combat` | ✅ Passé |
| `npm run validate:movement` | ✅ Passé |
| `npm run validate:rmg` | ✅ Passé sans warning par défaut |
| `npm run test:e2e:gameplay` | ✅ Passé |
| Migration RLS + `schema.sql` | ✅ Cohérents, validés par `supabase db reset` |

La passe du 2026-05-31 n'a pas relancé ces commandes ; elle a mis à jour le suivi documentaire après suppression des plans terminés.

## Hygiène du dépôt

- [x] `tmp-gate-sources-contact.png` supprimé.
- [x] Sprites `gate-test-*.webp` supprimés ; sprites finaux conservés : `gate.webp`, `gate-diagonal-up/down.webp`.
- [x] Snippets SQL obsolètes supprimés ; `supabase/snippets/` ajouté au `.gitignore`.
- [x] `tmp-*` ajouté au `.gitignore`.
- [x] Dépendances inutilisées supprimées : `next-auth` et `bcryptjs`.
- [x] Plans terminés supprimés : `PHASER_MIGRATION_PLAN.md`, `BOAT_REWORK_PLAN.md`, `ADVENTURE_BUILDINGS_PLAN.md`.

## Qualité du code

### Fichiers volumineux à découper

| Fichier | Lignes initiales | Lignes actuelles | Statut |
|---|---:|---:|---|
| [`src/lib/rendering/phaser/PhaserMapRenderer.ts`](src/lib/rendering/phaser/PhaserMapRenderer.ts) | 5031 | **3781** | 🟡 Modules déjà extraits ; reste la classe Phaser principale à continuer prudemment. |
| [`src/components/game/map/GameMap.tsx`](src/components/game/map/GameMap.tsx) | 2689 | **3198** | 🟡 Helpers de curseur/ciblage extraits dans `gameMapCursors.ts`; reste la logique de mouvement/interaction. |
| [`src/components/game/hud/HUD.tsx`](src/components/game/hud/HUD.tsx) | 2667 | **12** | ✅ Wrapper uniquement ; logique déplacée dans `HUDContent.tsx` (**1416** lignes). |
| [`src/components/game/combat/CombatScreen.tsx`](src/components/game/combat/CombatScreen.tsx) | 2567 | **809** | ✅ Wrapper et cycle de vie combat fortement réduits ; logique de négociation extraite. |
| [`src/app/api/games/[id]/action/route.ts`](src/app/api/games/[id]/action/route.ts) | 1638 | **2848** | 🟡 Nombreuses branches extraites ; le fichier garde encore l'orchestration du déplacement aventure et des helpers longs. |

Le découpage doit rester progressif : un fichier à la fois, une extraction à la fois, avec `npx tsc --noEmit` et le smoke Playwright adapté après chaque série de changements.

### Prochaines extractions utiles

1. Extraire davantage le déplacement aventure restant de [`route.ts`](src/app/api/games/[id]/action/route.ts), sans élargir les contrats des helpers.
2. Découper [`HUDContent.tsx`](src/components/game/hud/HUDContent.tsx) en sous-panneaux plus ciblés.
3. Continuer à sortir de [`PhaserMapRenderer.ts`](src/lib/rendering/phaser/PhaserMapRenderer.ts) les blocs qui peuvent devenir fonctions pures ou modules frères : fog of war, routes, animations héros/bateaux, rendu terrain.
4. Garder [`GameMap.tsx`](src/components/game/map/GameMap.tsx) sous surveillance : le fichier concentre encore beaucoup de logique d'interaction utilisateur.

### Tests de garde

- [`tests/e2e/smoke.spec.ts`](tests/e2e/smoke.spec.ts) couvre les pages d'auth.
- [`tests/e2e/dev-pages.spec.ts`](tests/e2e/dev-pages.spec.ts) couvre les pages `/dev/*` et plusieurs workflows HUD, combat, minimap et responsive.
- [`tests/e2e/gameplay.spec.ts`](tests/e2e/gameplay.spec.ts) couvre création, démarrage, rendu, déplacement et fin de tour sur une vraie partie.

### Typage

- [x] Dernière vérification documentée 2026-05-20 : zéro `as any` / `: any` dans `src/` (`.ts` et `.tsx`).

### Logging

Le logging n'est plus limité à quelques appels serveur : on trouve maintenant des `console.warn` / `console.error` dans le dashboard, les écrans client, les routes API et certains helpers. Le niveau reste acceptable pour le développement, mais un wrapper structuré redeviendra utile le jour où un agrégateur type Sentry, Logtail ou Datadog est branché.

## Sécurité Supabase

### RLS jeux

Statut actuel : la migration [`supabase/migrations/20260530000100_enable_game_rls.sql`](supabase/migrations/20260530000100_enable_game_rls.sql) est présente, et [`supabase/schema.sql`](supabase/schema.sql) contient le helper `public.is_game_member`, l'activation RLS des tables de jeu et les policies SELECT par appartenance à la partie.

À surveiller :

- Les writes doivent rester server-side via `createAdminClient()` et les routes protégées par `requireCurrentUser(request)`.
- Les abonnements realtime côté browser peuvent rester larges pour certaines tables, mais les policies doivent continuer à empêcher la lecture hors partie.
- Toute nouvelle table de jeu doit recevoir sa policy SELECT dans la migration et dans `schema.sql`.

## Générateur de cartes

- [x] Métrique de densité de décor corrigée pour les templates archipelago.
- [x] `npm run validate:rmg` passe sans warning bloquant dans la dernière validation documentée.
- [ ] Utiliser `npm run validate:rmg:full` avant les changements importants de génération de carte.

## Suivi ouvert

- [ ] Découpage suite de `action/route.ts`.
- [ ] Découpage de `HUDContent.tsx`.
- [ ] Découpage suite de `PhaserMapRenderer.ts` / `GameMap.tsx` / `CombatScreen.tsx`.
- [ ] Logger structuré à reconsidérer quand un agrégateur est branché.
