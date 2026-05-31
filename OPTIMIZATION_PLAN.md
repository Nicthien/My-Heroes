# Optimisation du rendu carte

> Révision : 2026-05-31.
> Ce fichier garde uniquement le suivi encore utile pour le renderer Phaser actuel.

## Objectif

Améliorer le rendu des grandes cartes, en particulier XL (144 x 144 = 20 736 tuiles), sans modifier les règles de jeu.

Objectif historique : passer d'environ 10 fps à 50-60 fps. Plusieurs optimisations ont été appliquées, mais le 60 fps stable sur XL reste limité par le nombre de GameObjects Phaser encore présents dans la scène.

## État actuel

Optimisations implémentées :

| # | Optimisation | Statut | Repère code |
|---|---|---|---|
| 1 | Désactiver le drift du fog sur grandes cartes | ✅ | `configureFogDrift()` dans [`PhaserMapRenderer.ts`](src/lib/rendering/phaser/PhaserMapRenderer.ts) |
| 2 | Throttle du `objectLayer.sort("depth")` pendant les déplacements | ✅ | [`PhaserMapRenderer.ts`](src/lib/rendering/phaser/PhaserMapRenderer.ts) |
| 3 | Eau : moins de frames de shimmer sur grandes cartes | ✅ | `waterShimmerFrames` dans [`PhaserMapRenderer.ts`](src/lib/rendering/phaser/PhaserMapRenderer.ts) |
| 4 | Index spatial pour le hover | ✅ | `getObjectsAtScreen()` / helpers de rendu |
| 5 | Batch des tuiles élevées par bandes anti-diagonales | ✅ | `getElevatedBandGraphics()` vers la ligne 1594 |
| 6 | Guard idempotent sur `renderMap` | ✅ | `renderMapMeasured()` vers la ligne 364 |
| 7 | Signature séparée terrain / objets dynamiques | ✅ | `renderMapMeasured()` |
| 8 | Cache des positions de tuiles avec objets | ✅ | `objectTilePositions` et `renderMapTileObjects()` |
| 9 | Mode grande carte : désactiver les sprites de textures top-terrain au-delà de 96 x 96 tuiles | ✅ | `DETAILED_TERRAIN_TEXTURE_MAX_TILE_COUNT` |
| 10 | Mesures par phase du rebuild carte | ✅ | `phaser.renderMap.terrain`, `.water`, `.tileObjects`, `.fogChunks`, `.objects`, `.fogRedraw` |

Validation historique :

- `npx tsc --noEmit` ✅
- `npx eslint` ✅
- `npm run test:e2e` ✅

Validation 2026-05-31 après optimisation grande carte :

- `npx tsc --noEmit` ✅
- `npm run lint` ✅
- `npm run test:e2e` ✅ 49 passed, 1 skipped
- `npm run test:e2e:gameplay` ✅
- `npm run validate:phaser` ⏸️ non exécuté : variables `PHASER_TEST_EMAIL` / `PHASER_TEST_PASSWORD` absentes

## Décisions conservées

### Batch des tuiles élevées

Le bake plein-carte en RenderTexture aurait coûté trop de VRAM sur XL. Le pivot retenu est de regrouper les `Graphics` de tuiles élevées par bande anti-diagonale `x + y`, ce qui réduit fortement le nombre de draw calls tout en gardant un z-order iso correct.

### RenderMap idempotent

Le renderer protège maintenant `renderMap()` contre les appels répétés avec une carte équivalente. C'était nécessaire parce que les syncs serveur produisent régulièrement de nouvelles références d'état, même quand le terrain n'a pas changé.

Le polling local n'est plus à 1 s : [`src/app/game/[id]/page.tsx`](src/app/game/[id]/page.tsx) utilise maintenant 3 s en mode observateur admin, 5 s via proxy Supabase local, et 10 s sinon.

### RenderTexture

Phaser 4.1.0 ne propose plus le workflow Phaser 3 basé sur `RenderTexture.draw(gameObject)`. Le bake dynamique reste donc non retenu pour l'instant. Alternatives possibles mais lourdes : `Camera.snapshot()` asynchrone, génération de textures par `Graphics.generateTexture()`, ou pipeline custom.

### Mode grande carte

Les cartes au-delà de 96 x 96 tuiles ne créent plus un sprite `Image` par texture de sommet de tuile. Le renderer garde les couleurs, routes, décors, objets, fog, eau et lava, mais évite des milliers de GameObjects statiques. Les petites et moyennes cartes conservent les textures détaillées.

## Bottleneck restant

Le coût per-frame de Phaser reste le principal plafond : les grandes cartes gardent beaucoup de sprites et containers permanents, donc la traversée du scene graph pèse même quand `renderMap()` ne reconstruit plus la carte.

Pistes restantes, par ordre de plausibilité :

1. Réduire le nombre de GameObjects persistants avec `TileSprite`, `Blitter` ou une stratégie de chunks statiques.
2. Continuer à sortir certains éléments visuels des grandes cartes quand ils ne changent pas souvent.
3. Utiliser les nouvelles mesures par phase pour décider si le prochain chantier doit cibler `terrain`, `fog` ou `objects`.
4. Garder une option qualité/performance pour les très grandes cartes si le coût visuel reste trop élevé.

## Règles pour la suite

- Ne pas modifier les règles de mouvement, de brouillard ou de génération depuis ce chantier : uniquement le rendu.
- Tester les changements sur `/dev/rmg?size=XL`.
- Surveiller `phaser.frame`, `phaser.renderMap`, `phaser.setFog` et le nombre de tâches par seconde dans `DevPerformancePanel`.
- Lancer `npx tsc --noEmit`, `npm run lint` et au moins `npm run test:e2e` après une optimisation significative.
