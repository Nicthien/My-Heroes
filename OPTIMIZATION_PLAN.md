# Plan d'optimisation rendu carte

Objectif : passer de **10 fps → 50-60 fps** sur carte XL (144×144 = 20 736 tuiles).

## Diagnostic

Carte XL = ~30 000 GameObjects Phaser permanents :
- 1 `Graphics` par tuile élevée (`renderElevatedTerrainTile`, ligne 1109)
- 1 sprite par texture de top de tuile (`renderTerrainTopTexture`, ligne 1237)
- 1-5 sprites par tuile de route
- 1 sprite par décor bloquant
- 4 couches `Graphics` plein-map pour le shimmer d'eau (lignes 474-495)
- Sort `objectLayer` à chaque frame pendant déplacement héros (ligne 2326)
- 2 tweens infinis sur `fogLayer` qui forcent une recomposition par frame (lignes 299-314)

## Étapes (par ROI)

| # | Étape | Gain | Effort | Statut |
|---|---|---|---|---|
| 1 | Désactiver fog drift tweens sur grandes cartes | +3 à +8 fps | trivial | ✅ |
| 2 | Throttle `objectLayer.sort("depth")` | +2 à +5 fps | trivial | ✅ |
| 3 | Eau : 1 frame statique au lieu de 4 sur grandes cartes | +5 à +15 fps | trivial | ✅ |
| 4 | Spatial index pour hover (`getObjectsAtScreen`) | élimine lag hover | faible | ✅ |
| 5 | Lazy preload des spritesheets faction | temps de chargement | faible | ⏸️ skip (pas un gain runtime) |
| 6 | Batch tuiles élevées en bandes anti-diagonales (au lieu de RT chunks) | +20 à +40 fps | moyen | ✅ |

## Pivot étape 6

Le RT-chunk bake plein-carte aurait coûté ~95-170 MB de VRAM (XL = 6912×3456 px). Analyse plus fine : les sprites Image batchent automatiquement par texture en WebGL, donc les 20k+ sprites de top-texture/route/décor ne sont pas le bottleneck. Le vrai problème = les **Graphics** par-tuile élevée (chacun est un draw call unique en WebGL).

Solution : regrouper tous les Graphics de tuiles élevées en `Graphics` partagé par bande anti-diagonale `x+y`. Pour XL : ~287 bandes max (au lieu de 5-15k Graphics par-tuile). Z-order iso correct car les tuiles dans une même anti-diagonale ne se chevauchent jamais.

Implémentation dans `getElevatedBandGraphics` ([PhaserMapRenderer.ts:1257](src/lib/rendering/phaser/PhaserMapRenderer.ts#L1257)).

## Validation

- `npx tsc --noEmit` ✅
- `npx eslint` ✅
- `npm run test:e2e` ✅ 10 passed

## 🔥 Étape 7 — Vrai bottleneck identifié après mesure utilisateur

Après mesure dans le panneau dev, le profil réel sur petite carte :
- `phaser.frame`: 25.5 ms avg / 111.5 ms max
- **`phaser.renderMap`: 89.6 ms avg / 178.7 ms max** ← appelé en boucle
- **`phaser.setFog`: 41.2 ms avg / 82.4 ms max** ← cascade de renderMap
- `phaser.setObjects`: 0.1 ms avg / 0.8 ms max
- **TÂCHES/S: 16/s (1008 ms total)** ← main thread saturé

**Diagnostic** : le polling dans [page.tsx:149](src/app/game/[id]/page.tsx#L149) déclenche `syncGame()` toutes les 1 s en local. Chaque sync produit un `gameState` avec nouvelle référence. La useEffect de [GameMap.tsx:222](src/components/game/map/GameMap.tsx#L222) appelle `renderer.renderMap()` à chaque tick — et `renderMap` finit toujours par `redrawCurrentFog()` qui rebuild tous les chunks de fog.

→ **90 ms (renderMap) + 41 ms (setFog cascade) × 1 Hz = 13 % du main thread brûlé pour rien.**

**Fix** : guard idempotent dans le renderer ([PhaserMapRenderer.ts:319](src/lib/rendering/phaser/PhaserMapRenderer.ts#L319)). On calcule une signature courte (dimensions + terrain + objets + décor + routes par tuile) au début de `renderMapMeasured`. Si elle est identique au render précédent, retour immédiat. Coût de la signature : ~5 ms sur XL, comparaison string ~1 ms. ✅

| # | Optimisation | Statut |
|---|---|---|
| 7 | Guard idempotent sur `renderMap` (signature courte) | ✅ |
| 8 | Guard à deux niveaux (terrain stable / objets dynamiques) — split du signature | ✅ |
| 9 | Cache positions tuiles avec objets — `renderMapTileObjects` skip le scan 20k | ✅ |

## Limites rencontrées

**Bake RenderTexture impossible** : Phaser 4.1.0 a retiré `RenderTexture.draw(gameObject)`. Seul `stamp(textureKey, ...)` reste. On ne peut donc plus baker dynamiquement les GameObjects dans une RT comme en Phaser 3. Alternatives connues mais lourdes à implémenter : `Camera.snapshot()` (async), génération de texture par Graphics via `generateTexture()`, ou pipeline custom.

**Bottleneck restant identifié** : `phaser.frame` ≈ 25 ms en lobby, ~46 ms en jeu actif. Le coût per-frame de Phaser (traversée du scene-graph avec 20k+ GameObjects sur XL) reste le facteur limitant pour atteindre 60 fps. Sans le bake, on est limité par l'API du renderer.

## Pistes restantes (non implémentées)

- Réduire le nombre de GameObjects via TileSprite ou Phaser.Display.Blitter (refactor important).
- Désactiver certaines features visuelles sur grandes cartes (water shimmer, decor blocking sprites).
- Augmenter `setInterval(syncGame, ...)` au-delà de 1000ms en proxy local pour réduire la pression React.

## Notes d'implémentation

- Mesure avant/après via `DevPerformancePanel` (metric `phaser.frame`).
- Conserver la lava animée et héros en sprites séparés au-dessus du bake.
- Tester sur `/dev/rmg?size=XL` après chaque étape.
- Ne PAS toucher la logique de jeu — uniquement le rendu Phaser.
