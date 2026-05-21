# Plan: batiments d'aventure

Objectif: ajouter des batiments d'aventure disperses sur la carte pour recompenser l'exploration, avec sprites SVG detailles, generation RMG, rendu Phaser et effets persistants en jeu.

Decision de design: les batiments d'aventure sont une famille separee des batiments de ressources. Les mines et autres producteurs restent des objectifs economiques relies aux routes; les batiments d'aventure doivent etre hors des routes et pousser le joueur a sortir des chemins naturels.

## 1. Modele de donnees

- Ajouter dans `src/lib/game/types.ts`:
  - `AdventureBuildingType = "observatory" | "campfire" | "lighthouse" | "stargate"`.
  - `AdventureBuildingVisitMode = "once" | "once_per_player" | "repeatable"`.
  - `AdventureBuildingState` pour les donnees persistantes stockees dans `games.map_state`.
- Ajouter un nouveau type de `MapObject`: `adventure_building`.
  - Exemple: `{ type: "adventure_building", id, subtype: "observatory", name, pairId? }`.
  - Ne pas reutiliser `type: "building"` afin d'eviter les collisions avec les mines et la logique `resource_buildings`.
- Stocker l'etat dynamique dans `games.map_state`, qui existe deja:
  - `visitedAdventureBuildings: string[]` pour les objets consommes globalement, comme le feu de camp.
  - `playerAdventureVisits: Record<playerId, string[]>` pour les visites par joueur, comme observatoire ou phare.
  - `signaledLighthouses: Record<playerId, string[]>` pour les phares.
  - `stargatePairs: Record<stargateId, stargateId>` si les paires ne sont pas directement encodees dans `mapData`.
- Reporter une table SQL dediee `adventure_buildings` a plus tard, sauf besoin d'admin/debug avance. Pour le MVP, `map_data` porte les objets et `map_state` porte les changements.

## 2. Definitions de gameplay

Creer `src/lib/game/adventure-buildings.ts` avec un registre central:

- `ADVENTURE_BUILDING_RULES`
  - label, description courte, terrains preferes, valeur RMG, rarete, mode de visite, sprite.
- `applyAdventureBuildingEffect(...)`
  - fonction pure autant que possible, puis adapteur serveur pour les updates Supabase.

Effets initiaux:

- Observatoire
  - Mode: `once_per_player`.
  - A la visite, ajoute les tuiles dans un rayon Manhattan de 20 autour du heros a `game_players.explored_tiles`.
  - Decision produit a confirmer: aujourd'hui `explored_tiles` revele terrain et objets. Si on veut strictement "terrain seulement", il faudra separer `exploredTerrainTiles` et `exploredObjectTiles`.
- Feu de camp
  - Mode: `once`.
  - Donne 400-600 or.
  - Donne 4-6 ressources supplementaires, reparties entre `wood`, `ore`, `mercury`, `crystals`, `gems`, `sulfur`.
  - Ajoute l'id a `visitedAdventureBuildings` et retire l'objet cote client via `mapApiToGameState`.
- Phare
  - Mode: `once_per_player`.
  - Doit etre place sur une tuile terrestre proche de l'eau.
  - Ajoute l'id a `signaledLighthouses[playerId]`.
  - Au debut de chaque jour, augmente le mouvement des heros allies sur l'eau de `500 * nombreDePharesSignales`.
  - Comme le systeme actuel n'a pas encore de mouvement naval distinct, phase 1: ajouter un champ calcule ou persistant `waterMovementBonus` dans l'etat heros/joueur. Phase 2: l'utiliser dans le pathfinding quand les tuiles d'eau seront vraiment navigables par bateau/heros naval.
- Stargate
  - Mode: `repeatable`.
  - Placee par paire.
  - A la visite, teleporte le heros vers l'autre Stargate si la tuile de sortie est libre.
  - Si la sortie est occupee, chercher une tuile adjacente libre; sinon retourner une erreur claire.

## 3. SVG et assets

Ajouter quatre fichiers dans `public/assets/sprites/map/`:

- `adventure-observatory.webp`
  - Petite tour de pierre, dome cuivre/bleu nuit, lentille ou telescope, details d'etoiles.
- `adventure-campfire.webp`
  - Foyer, buches, sacoches, petites pieces/ressources visibles, flamme lisible a petite taille.
- `adventure-lighthouse.webp`
  - Tour claire, lanterne, faisceau stylise, base rocheuse/eau pour suggerer la cote.
- `adventure-stargate.webp`
  - Arche de pierre ancienne, runes, portail bleu/violet, base isometrique.

Contraintes:

- `width="96" height="96" viewBox="0 0 96 96"` comme les sprites existants.
- `role="img"` avec `title` et `desc`.
- Palette compatible avec les assets HoMM-like existants: ombres nettes, contours lisibles, details concentres dans la silhouette.
- Verifier l'affichage dans `/dev/sprites` et sur carte Phaser.

## 4. Rendu Phaser

Modifier `src/lib/rendering/phaser/assets.ts`:

- Ajouter `MAP_SPRITES.adventureBuildings`.
- Inclure ces paths dans `MAP_SPRITE_PATHS`.

Modifier `src/lib/rendering/phaser/PhaserMapRenderer.ts`:

- Dans le hover text, afficher le label depuis `ADVENTURE_BUILDING_RULES`.
- Dans `renderObjects`, rendre `object.type === "adventure_building"` avec le sprite correspondant, comme les villes/mines interactives.
- Dans les metriques d'objet, donner une taille proche des mines: environ 52x52, Stargate un peu plus haute si besoin.

Modifier `src/components/game/map/RmgMapPreview.tsx`:

- Ajouter une couleur distincte pour `adventure_building` afin que le preview RMG permette de valider la distribution.

## 5. Generation de carte

Ajouter `src/lib/game/engine/adventure-buildings.ts` ou etendre `placement.ts` avec des fonctions separees:

- `placeAdventureBuildings(ctx, zoneId, budgetOrDensity)`
- `placeStargatePairs(ctx, zones)`
- `isValidAdventureBuildingTile(tile, rule)`
- `hasObjectNearby(ctx, x, y, radius)`

Integration dans `src/lib/game/engine/index.ts`:

- Apres `buildRoads` / `buildSecondaryRoads` et avant `placeDecor`, placer les batiments d'aventure. Ainsi les routes restent reservees aux villes et mines, et le decor ne bloque pas les nouveaux objets.
- Faire varier la densite par type de zone:
  - zone joueur: peu, surtout campfire/observatory leger.
  - zone treasure: plus, dont stargates et phares si eau proche.
  - junction: utile pour stargates, avec faible densite.
- Ne pas placer sur eau, lave, mur, ville, mine, monstre ou decor bloquant.
- Ne pas placer sur une tuile avec `tile.road`.
- Eviter d'abord les tuiles adjacentes aux routes, avec un rayon minimal de 1 autour des routes pour que ces objets restent vraiment "hors chemin".
- Sur petites cartes tres denses, autoriser un fallback pres d'une route, mais jamais sur une route.
- Garder une distance minimale avec villes/mines/autres objets majeurs.
- Ne jamais ajouter les batiments d'aventure a `miningPositions`, afin que `buildSecondaryRoads` ne tente pas de les connecter.
- Stargate:
  - Toujours par paire.
  - Idealement dans deux zones differentes mais de valeur comparable.
  - Encoder `pairId` ou `targetId` dans l'objet.
- Phare:
  - Terre passable avec au moins une tuile d'eau dans un rayon 2-3.

## 6. Interaction serveur

Modifier `src/app/api/games/[id]/action/route.ts`:

- Etendre `MoveInteraction` avec:
  - `{ type: "ADVENTURE_BUILDING"; buildingType; reward?; destination; message? }`
  - `{ type: "TELEPORT"; buildingType: "stargate"; from; to }`
- Dans `findFirstMoveStop`, stopper aussi sur `adventure_building`, sauf si c'est un batiment deja consomme et supprime par `mapApiToGameState`.
- Dans le bloc `MOVE_HERO`, apres ressources/monstres/mines/villes, traiter `tile.object.type === "adventure_building"`.
- Appliquer l'effet dans une fonction dediee pour eviter de grossir la route:
  - `handleAdventureBuildingVisit({ supabase, game, gamePlayer, hero, tile, mapData, mapState })`.
- Pour le feu de camp, updater les ressources du joueur et `games.map_state`.
- Pour l'observatoire, updater `game_players.explored_tiles` avec rayon 20.
- Pour le phare, updater `games.map_state.signaledLighthouses`.
- Pour Stargate, updater la position du heros vers la sortie et recalculer exploration rayon 5 autour de l'arrivee.

Important: le cout de mouvement doit rester celui du chemin jusqu'au batiment. Pour Stargate, ne pas facturer le trajet entre les deux portails.

## 7. Reconciliation API/client

Modifier `src/lib/game/api.ts`:

- Lire `map_state.visitedAdventureBuildings`.
- Supprimer les feux de camp visites du `mapData` expose au client.
- Garder observatoires, phares et stargates visibles apres visite, sauf decision contraire.
- Respecter le brouillard actuel: les batiments non explores restent caches comme les autres objets.

Modifier `src/components/game/map/GameMap.tsx`:

- Ajouter le nouveau type d'interaction dans les types locaux.
- Afficher un feedback court apres visite:
  - Observatoire: "Terrain revele".
  - Feu de camp: montant d'or et ressources.
  - Phare: bonus de navigation actif.
  - Stargate: teleportation effectuee.
- Rafraichir l'etat apres interaction, comme les ressources/captures existantes.

## 8. Mouvement quotidien et phare

Le code actuel remet les heros a `movement: 10` dans `completePlayerTurn`.

Plan minimal:

- Ajouter une constante `BASE_DAILY_MOVEMENT = 10`.
- Ajouter `getDailyMovementForHero(player, mapState, terrainMode?)`.
- Pour la premiere version, garder `movement: 10` pour le sol.
- Ajouter le bonus phare dans un champ separe si les heros ont deja ou auront bientot un mouvement naval:
  - Option A: `heroes.water_movement` / `heroes.max_water_movement` via migration.
  - Option B: `game_players.water_movement_bonus` calcule depuis `map_state`.
- Recommandation: Option B pour l'instant, car elle evite une migration heros prematuree. Le pathfinding naval pourra consommer ce bonus plus tard.

## 9. Tests et validation

- Tests unitaires ou script `tsx` pour:
  - generation deterministe avec seed;
  - au moins quelques batiments d'aventure sur cartes medium/large;
  - aucune Stargate orpheline;
  - aucun batiment sur tuile infranchissable;
  - feu de camp consomme une seule fois;
  - observatoire ajoute bien un rayon 20;
  - phare compte une fois par joueur;
  - Stargate teleporte vers la paire.
- Mettre a jour `scripts/validate-rmg.ts` pour compter `adventure_building`.
- Lancer:
  - `npm run lint`
  - `npm run validate:rmg`
  - `npm run build`
- Verification visuelle:
  - `/dev/rmg` pour la distribution.
  - `/dev/sprites` pour les SVG.
  - Une partie locale pour les interactions.

## 10. Ordre d'implementation conseille

1. Types + registre `adventure-buildings.ts`.
2. SVG + chargement dans `assets.ts`.
3. Rendu Phaser + preview RMG.
4. Placement RMG simple pour Observatoire, Feu de camp, Phare.
5. Placement et pairage Stargate.
6. Route serveur `MOVE_HERO` et effets persistants dans `map_state`.
7. Client feedback et refresh.
8. Validation RMG + tests de comportement.
9. Ajustement densite/rarete apres essai sur plusieurs seeds.

## 11. Points de vigilance

- Ce projet utilise Next.js 16. Avant de modifier routes ou conventions Next, lire les docs pertinentes dans `node_modules/next/dist/docs/` comme demande par `AGENTS.md`.
- Ne jamais mettre de secrets dans le plan, les tests ou les fixtures.
- `explored_tiles` sert actuellement a la fois au terrain revele et aux objets visibles. L'Observatoire peut donc reveler plus que "terrain" si on ne separe pas ces concepts.
- `movementCost` est parfois lu directement au lieu de `effectiveMovementCost`; si les phares influencent le deplacement eau, il faudra aligner pathfinding client et validation serveur.
- Les objets consommables doivent etre masques via `mapApiToGameState`, pas seulement retires cote client, pour eviter les doubles collectes.
