# Plan d'optimisation

> Revision : 2026-05-31.
> Ce fichier suit les optimisations encore utiles pour le jeu actuel. Le plan ne cible plus seulement les cartes XL : une optimisation est prioritaire si elle ameliore la fluidite, la latence d'interaction, le temps de rebuild ou la stabilite memoire sur au moins un parcours joueur important.

## Objectif

Rendre le jeu regulierement fluide sans modifier les regles de jeu.

Objectifs pratiques :

- Cartes S/M/L : viser 55-60 fps pendant l'exploration, les survols, les trajets de heros et les ouvertures de panneaux.
- Cartes XL : viser une experience stable et lisible, avec moins de chutes brutales, meme si le 60 fps constant reste contraint par le nombre d'objets Phaser.
- Interactions : garder les actions visibles sous 50-100 ms quand elles ne dependent pas du reseau.
- Rebuilds : ne reconstruire que ce qui a change, quelle que soit la taille de carte.
- Memoire : eviter les pics lors des changements de carte, de fog, de combat ou de retour au tableau de bord.

## Perimetre

Inclus :

- Rendu Phaser de la carte aventure.
- Pont React -> Phaser, HUD, panneaux et pages `/dev/*` utilisees pour les smoke tests.
- Calculs purs appeles pendant les interactions visibles : chemin, tuiles atteignables, brouillard, signatures d'etat.
- Chargement et reutilisation des assets visuels/audio.
- Realtime, polling local et appels API lorsqu'ils provoquent du travail client inutile.

Exclus de ce chantier :

- Changement des regles de mouvement, brouillard, combat ou generation.
- Activation partielle de RLS.
- Remplacement visuel par des placeholders proceduraux.

## Etat actuel

Optimisations deja appliquees :

| # | Optimisation | Statut | Repere code |
|---|---|---|---|
| 1 | Desactiver le drift du fog sur grandes cartes ou appareils faibles | fait | `configureFogDrift()` dans [`PhaserMapRenderer.ts`](src/lib/rendering/phaser/PhaserMapRenderer.ts) |
| 2 | Throttle du `objectLayer.sort("depth")` pendant les deplacements | fait | [`PhaserMapRenderer.ts`](src/lib/rendering/phaser/PhaserMapRenderer.ts) |
| 3 | Eau : moins de frames de shimmer sur grandes cartes | fait | `waterShimmerFrames` dans [`PhaserMapRenderer.ts`](src/lib/rendering/phaser/PhaserMapRenderer.ts) |
| 4 | Index spatial pour le hover | fait | `getObjectsAtScreen()` / helpers de rendu |
| 5 | Batch des tuiles elevees par bandes anti-diagonales | fait | `getElevatedBandGraphics()` |
| 6 | Guard idempotent sur `renderMap` | fait | `renderMapMeasured()` |
| 7 | Signature separee terrain / objets dynamiques | fait | `renderMapMeasured()` |
| 8 | Cache des positions de tuiles avec objets | fait | `objectTilePositions` et `renderMapTileObjects()` |
| 9 | Mode grande carte : desactiver les sprites de textures top-terrain au-dela de 96 x 96 tuiles | fait | `DETAILED_TERRAIN_TEXTURE_MAX_TILE_COUNT` |
| 10 | Mesures par phase du rebuild carte | fait | `phaser.renderMap.*`, `phaser.setFog`, `phaser.frame` |
| 11 | Compteurs GameObjects par layer Phaser | fait | `phaser.objects.total`, `phaser.layer.*` dans `DevPerformancePanel` |
| 12 | Mode perf Phaser S/M/L/XL sur `/dev/map-showcase?size=...` | fait | [`src/app/dev/map-showcase/page.tsx`](src/app/dev/map-showcase/page.tsx) |
| 13 | Details de route restaures sur toutes les tailles | fait | `DETAILED_ROAD_TEXTURE_MAX_TILE_COUNT` |
| 14 | Virtualisation du decor statique sur M/L/XL | fait | `STATIC_DECOR_VIRTUALIZATION_MIN_TILE_COUNT`, `STATIC_DECOR_VIEW_PADDING` |
| 15 | Mise a jour viewport du decor differee et indexee spatialement | fait | `phaser.staticDecor.viewport`, buckets de decor statique |
| 16 | Fast-path fog carte revelee sans downgrade terrain | fait | `shouldRenderFogLayer()` |
| 17 | Scenario fog partiel et suppression du redraw fog immediat | fait | `/dev/map-showcase?size=...&fog=partial`, `phaser.fog.redrawChunks` |

Validation historique :

- `npx tsc --noEmit` : OK
- `npm run lint` : OK
- `npm run test:e2e` : OK
- `npm run test:e2e:gameplay` : OK
- `npm run validate:phaser` : non execute lors de la derniere passe, variables `PHASER_TEST_EMAIL` / `PHASER_TEST_PASSWORD` absentes

## Lecture du probleme

Le probleme initial etait visible sur XL, mais les causes ne sont pas propres aux cartes XL. Elles apparaissent plus tot des que l'etat change souvent, qu'un panneau React relance des calculs, qu'une action realtime renvoie une reference neuve, ou qu'une interaction declenche un scan complet.

Les prochains gains doivent donc etre classes par type de cout, pas seulement par taille de carte :

- **Cout par frame** : objets Phaser permanents, animations, tri de profondeur, callbacks `update`.
- **Cout de rebuild** : terrain, eau, fog chunks, objets, labels, highlights.
- **Cout d'interaction** : hover, selection, route preview, tuiles atteignables, pathfinding.
- **Cout React** : renders du HUD, panneaux lourds, selectors trop larges, images non memorisees.
- **Cout donnees** : sync serveur, polling, realtime, signatures, diff client.
- **Cout assets** : chargement, decode images, textures dupliquees, audio cree trop tot.

## Priorites

### P0 - Mesurer par scenario

Avant de changer un systeme, ajouter ou utiliser une mesure qui permet de prouver le gain.

Scenarios minimum :

| Scenario | Pages/parcours | Tailles |
|---|---|---|
| Carte generee rendue par Phaser | `/dev/map-showcase?size=...` | S, M, L, XL |
| Carte generee Phaser avec fog partiel | `/dev/map-showcase?size=...&fog=partial` | S, M, L, XL |
| Generation RMG seule / preview canvas | `/dev/rmg` | S, M, L, XL |
| Deplacement heros long | jeu ou page dev map | M, L, XL |
| Hover et selection repetes | map showcase | S, M, L |
| Ouverture HUD/town/hero panels | pages dev HUD | S/M mocked state |
| Combat lourd | page dev combat | desktop/mobile |

Mesures a suivre dans `DevPerformancePanel` :

- `phaser.frame`, fps, worst frame, dropped frames, long tasks.
- `phaser.renderMap.*`, `phaser.setFog`, `phaser.highlightTiles`, `phaser.setObjects`.
- `phaser.fog.redrawChunks`, `phaser.fog.deferredRedraw` sur les scenarios avec fog partiel.
- `findPath`, `findPathToAdjacent`, `computeReachableTiles`.
- Heap JS quand disponible.
- Gauges `phaser.objects.total` et `phaser.layer.<layerName>` : `boardLayer`, `mapLayer`, `roadLayer`, `decorLayer`, `mapObjectLayer`, `mapTileObjectLayer`, `reachableLayer`, `highlightLayer`, `spellRevealLayer`, `objectLayer`, `movementLabelLayer`, `fogLayer`, `hoverLabelLayer`.
- Gauges de virtualisation decor : `phaser.staticDecor.total`, `phaser.staticDecor.visible`, `phaser.staticDecor.buckets`.

A ajouter si le prochain chantier en a besoin :

- Nombre de textures actives et memoire texture approximative.
- Compteurs de renders React pour HUD/panneaux dev.
- Taille des payloads realtime/API et nombre d'updates appliquees par minute.

Mesure headless 2026-05-31 sur `/dev/map-showcase?size=...`, apres limitation des details de route a S, fast-path fog revele et virtualisation du decor statique :

| Taille | `phaser.objects.total` | Layer dominant | `phaser.renderMap` | Lecture |
|---|---:|---|---|---|
| S | 2 014 | `mapLayer` 1 012 | 12.4 ms avg / 23.4 ms max | Details complets conserves ; pas de fog si tout est revele. |
| M | 1 114 | `objectLayer` 612 | a re-mesurer apres rollback micro-details | Textures terrain restaurees. |
| L | 2 316 | `objectLayer` 1 616 | 15.8 ms avg / 30.1 ms max | Le decor hors camera n'est plus dans le scene graph. |
| XL | 2 654 | `objectLayer` 1 759 | 21.3 ms avg / 40.7 ms max | Rebuild initial fortement reduit sur carte revelee. |

Conclusion : les premiers leviers ont retire les sprites de detail `mapLayer`/`roadLayer` sur M+, puis la plupart des sprites de decor hors camera sur L/XL. La mise a jour du decor visible est maintenant mesuree via `phaser.staticDecor.viewport` et limitee par buckets. Sur les cartes revelees, le fog ne construit plus de chunks inutiles. Le plafond restant se deplace vers les objets visibles/necessaires dans `objectLayer` et les parcours avec fog partiel reel.

Mesure headless 2026-05-31 sur `/dev/map-showcase?size=...&fog=partial`, apres suppression du redraw fog immediat dans `renderMap` :

| Taille | `phaser.objects.total` | `fogLayer` | Fog redraw | Lecture |
|---|---:|---:|---|---|
| S | 1 876 | 18 | 28.4 ms avg / 28.4 ms max | Cout fixe acceptable. |
| M | 755 | 50 | 31.5 ms avg / 31.5 ms max | Fog partiel plus cher que le terrain. |
| L | 1 951 | 98 | 42.6 ms avg / 42.6 ms max | Prochaine cible fog : viewport/chunks visibles. |
| XL | 2 286 | 162 | a re-mesurer apres rollback du fast-path visuel | Redraw plein-map encore visible. |

### P1 - Supprimer le travail redondant

Applicable a toutes les tailles.

1. Etendre les signatures d'etat la ou les syncs serveur creent des references neuves sans changement visuel.
2. Distinguer explicitement `terrainDirty`, `fogDirty`, `objectsDirty`, `hudDirty`, `selectionDirty`.
3. Eviter de recalculer les tuiles atteignables si heros, mouvement restant, terrain et bloqueurs n'ont pas change.
4. Memoiser les previews de chemin courtes et invalider seulement sur changement de map/hero/blockers.
5. Debouncer les updates realtime/polling qui arrivent en rafale avant de toucher Phaser.

### P2 - Reduire le cout par frame Phaser

Le plafond XL vient du scene graph, mais les memes gains aident L et les machines modestes.

1. Mesurer les GameObjects par layer et identifier les layers qui grandissent avec `width * height`.
2. Remplacer les groupes statiques par des strategies moins cheres quand elles respectent le z-order iso : chunks statiques, blitter, atlas, pooling ou regroupement par bande.
3. Continuer a limiter le tri de profondeur aux moments ou un objet change reellement de profondeur.
4. Desactiver ou mettre en pause les animations hors camera : eau/lava, fog drift, effets terrain, objets idle.
5. Ajouter une culling policy explicite par famille d'objet, pas seulement une condition "grande carte".
6. Reutiliser les sprites/heros/labels via pools au lieu de destroy/recreate quand seuls les champs affiches changent.

### P3 - Rendre les rebuilds incrementaux

1. Garder le rebuild complet comme fallback sur changement structurel de carte.
2. Pour les actions courantes, appliquer des patches : objet ajoute/retire, heros deplace, fog local, highlight local.
3. Traiter le fog par chunks sales plutot que redessiner trop large.
4. Separer labels/badges de sprites quand seul le texte change.
5. Verifier que `renderMapTileObjects()` reste sparse sur toutes les tailles, pas seulement XL.

### P4 - Optimiser les interactions joueur

1. Continuer a utiliser les helpers partages de mouvement dans `src/lib/game/engine`.
2. Eviter tout scan complet dans hover, tooltip, selection et route preview.
3. Conserver une limite claire pour les recalculs de chemin pendant le pointer move.
4. Pour les calculs longs mais purs, evaluer un Web Worker seulement apres mesure.
5. Ne pas cacher la latence reseau par un optimistic update qui diverge des validations serveur.

### P5 - Optimiser React/HUD

1. Auditer les selectors et props des panneaux lourds : `HeroPanel`, town tabs, combat screen, dev panel.
2. Memoiser les sous-panneaux qui recoivent de gros objets stables.
3. Eviter qu'une mise a jour de map force un render des panneaux non visibles.
4. Garder les composants lourds dans des modules siblings plutot que grossir les orchestrateurs.
5. Tester via `/dev/*` et `tests/e2e/dev-pages.spec.ts` quand un panneau lourd change.

### P6 - Donnees, reseau et assets

1. Verifier que le browser reste en lecture via Supabase realtime/proxy et que les writes passent par les routes API existantes.
2. Reduire les updates client qui ne changent pas l'affichage courant.
3. Precharger les sprites necessaires au parcours courant, sans charger toute la bibliotheque inutilement.
4. Chercher les textures dupliquees ou images decodees plusieurs fois.
5. Garder l'audio lazy, comme `combatAudio.ts`.

## Adaptation par taille

Les seuils par taille restent utiles, mais ils doivent etre le dernier choix quand une optimisation structurelle ne suffit pas.

| Taille | Attente | Politique |
|---|---|---|
| S/M | Qualite visuelle complete | Pas de downgrade visuel pour masquer un bug de rebuild ou de React render. |
| L | Qualite complete sauf cout mesure prohibitif | Activer culling/pauses hors camera avant de retirer des details. |
| XL | Lisibilite et stabilite avant detail decoratif | Reduire details statiques couteux, animations hors camera, rebuilds complets et scene graph. |
| Appareils faibles | Fluidite avant effets | Utiliser les memes leviers que XL meme sur M/L si les mesures le justifient. |

## Decisions conservees

### Batch des tuiles elevees

Le bake plein-carte en RenderTexture aurait coute trop de VRAM sur XL. Le pivot retenu est de regrouper les `Graphics` de tuiles elevees par bande anti-diagonale `x + y`, ce qui reduit fortement le nombre de draw calls tout en gardant un z-order iso correct.

### RenderMap idempotent

Le renderer protege `renderMap()` contre les appels repetes avec une carte equivalente. C'est necessaire parce que les syncs serveur peuvent produire de nouvelles references d'etat meme quand le terrain n'a pas change.

Le polling local n'est plus a 1 s : [`src/app/game/[id]/page.tsx`](src/app/game/[id]/page.tsx) utilise 3 s en mode observateur admin, 5 s via proxy Supabase local, et 10 s sinon.

### RenderTexture

Phaser 4.1.0 ne propose plus le workflow Phaser 3 base sur `RenderTexture.draw(gameObject)`. Le bake dynamique reste donc non retenu pour l'instant. Alternatives possibles mais lourdes : `Camera.snapshot()` asynchrone, generation de textures par `Graphics.generateTexture()`, ou pipeline custom.

### Mode grande carte

Les cartes au-dela de 96 x 96 tuiles ne creent plus un sprite `Image` par texture de sommet de tuile. Les stamps sprites de detail de route sont conserves sur toutes les tailles : le rollback du 2026-05-31 evite des chemins trop discrets. Les micro-details terrain `Graphics` sont conserves sur toutes les tailles : le rollback du 2026-05-31 evite un terrain trop plat. Le decor statique bloqueur est virtualise sur M/L/XL : le renderer conserve les sprites raster autour de la camera avec une marge de securite, mais retire les sprites hors viewport du scene graph. La creation du decor visible est differee jusqu'au centrage camera ou au cycle de rendu suivant, et les mises a jour viewport consultent seulement les buckets proches. Les petites cartes conservent le rendu complet.

## Definition of done

Une optimisation est complete quand :

1. Le scenario cible est mesure avant/apres.
2. Le gain est visible dans `DevPerformancePanel` ou dans un test dedie.
3. Les regles de jeu restent identiques.
4. Les pages `/dev/*` pertinentes continuent de charger.
5. `npx tsc --noEmit`, `npm run lint` et au moins `npm run test:e2e` restent propres pour un changement significatif.

## Ordre conseille pour la prochaine passe

1. Optimiser le fog partiel par viewport/chunks visibles : eviter de redessiner les chunks hors camera au chargement.
2. Auditer `phaser.frame` vs `phaser.renderMap.*` apres reduction fog/terrain.
3. Si per-frame domine encore : virtualiser aussi certains objets statiques non interactifs ou reduire les animations hors camera.
4. Si interaction domine : caches pour reachability/path previews et throttling pointer move.
5. Si React domine : memoisation/selectors sur HUD et panneaux lourds.
