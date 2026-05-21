# Plan: refonte des bateaux

Objectif: remplacer le bateau statique actuel par un spritesheet anime, aligne sur le systeme des heros aventure: 8 directions, animation idle courte, animation walk pendant le deplacement, et rendu coherent sur l'eau.

Decision de design: le bateau reste un mode visuel du heros quand `object.onWater === true`. La refonte ne change pas les regles de deplacement, le pathfinding, les couts, ni la validation serveur. Elle remplace le rendu statique historique par un asset anime.

## 1. Etat actuel

- Les heros terrestres utilisent `HERO_SPRITESHEETS` dans `src/lib/rendering/phaser/assets.ts`.
- Chaque spritesheet heros a:
  - 8 directions: `s`, `sw`, `w`, `nw`, `n`, `ne`, `e`, `se`;
  - 12 colonnes par direction;
  - frames `0..3` pour idle;
  - frames `4..11` pour walk.
- Le renderer Phaser cree les animations dans `createHeroAnimations`.
- Le bateau utilise maintenant `BOAT_SPRITESHEETS` par faction.
- Les anciens SVG statiques de heros et bateau ont ete retires; les fallbacks pointent vers les spritesheets `castle`.

## 2. Format cible des assets

Ajouter un spritesheet de bateau:

- chemin recommande: `public/assets/sprites/boats/adventure.webp`;
- dimensions recommandees: `960x640`;
- frame: `80x80`;
- colonnes: `12`;
- lignes: `8`, dans le meme ordre que `HERO_DIRECTIONS`;
- frames idle: colonnes `0, 1, 2, 3`;
- frames walk: colonnes `4, 5, 6, 7, 8, 9, 10, 11`.

Animation souhaitee:

- Idle:
  - petit balancement vertical;
  - legere rotation de coque;
  - voiles ou fanion avec variation subtile;
  - pas d'impression de deplacement.
- Walk:
  - meme orientation que la direction de trajet;
  - sillage visible derriere le bateau;
  - voile plus tendue;
  - alternance de vagues/ecume pour lire le mouvement.

## 3. Generation du spritesheet

Creer `scripts/generate-boat-spritesheet.mjs` sur le modele de `scripts/generate-hero-spritesheets.mjs`.

Approche MVP:

- generer proceduralement les 8 directions avec `sharp`;
- dessiner coque, mat, voile, ombre et sillage avec des formes raster composees;
- utiliser des variations par frame:
  - offset vertical faible en idle;
  - angle/scale tres leger;
  - sillage anime uniquement en walk;
  - voile/fanion qui change de 1-2 px.
- produire un WebP lossless transparent.

Option qualite plus tard:

- partir d'une reference source dans `assets/source/sprites/boats/`;
- extraire/nettoyer les cellules comme pour les heros;
- garder le meme contrat de spritesheet pour ne pas toucher au renderer.

## 4. Centralisation des assets

Modifier `src/lib/rendering/phaser/assets.ts`:

- Ajouter un type generique si utile:
  - `AdventureSpritesheet` ou `DirectionalSpritesheet`;
  - garder `HeroSpritesheet` si une refonte plus large n'est pas utile.
- Ajouter:
  - `BOAT_SPRITESHEET`;
  - `BOAT_SPRITESHEETS` seulement si plusieurs bateaux/factions sont prevus.
- Ajouter une fonction:
  - `getBoatSpritesheet()`;
  - ou faire retourner le sheet bateau par `getHeroSpritesheet(faction, true)`.
- Inclure le path bateau dans le preload:
  - soit via une nouvelle collection `ADVENTURE_SPRITESHEETS`;
  - soit en ajoutant explicitement `BOAT_SPRITESHEET` dans `PhaserMapRenderer.preload`.
- Utiliser les spritesheets `castle` comme fallback quand une faction inconnue est demandee.

Recommandation: introduire une collection commune `DIRECTIONAL_SPRITESHEETS` pour eviter de dupliquer les boucles Phaser entre heros et bateau.

## 5. Integration Phaser

Modifier `src/lib/rendering/phaser/PhaserMapRenderer.ts`:

- Renommer ou generaliser `createHeroAnimations` en `createDirectionalAnimations`.
- Creer les animations bateau avec les memes directions et etats:
  - key: `boat-${direction}-idle`;
  - key: `boat-${direction}-walk`;
  - idle frameRate: `5`;
  - walk frameRate: `12`.
- Adapter `addHeroSprite`:
  - si `object.onWater`, creer un `Phaser.GameObjects.Sprite` avec le sheet bateau;
  - sinon garder le sheet heros par faction.
- Adapter `playHeroAnimation`:
  - choisir la cle d'animation bateau quand `renderedHero.object.onWater`;
  - garder les cles heros quand le heros est a terre.
- Conserver `heroDirections`: la direction calculee par `getHeroDirection` convient deja aux bateaux.
- Ajuster `getObjectMetrics` pour les bateaux:
  - bateau hors ville: environ `56x56` ou `60x56`;
  - offsetY proche de `10`, a valider visuellement sur tuile d'eau;
  - pas de cas `inTown` sur l'eau.

## 6. Animation secondaire

Garder `animateHeroSprite` comme couche de mouvement procedural:

- Mode `boat`:
  - conserver le flottement vertical leger;
  - reduire l'angle si le spritesheet a deja une rotation lisible;
  - ne pas modifier la scale pendant la marche.
- Pendant `walk`, le spritesheet gere le sillage et l'intention de mouvement.
- Pendant `idle`, le spritesheet donne la vie minimale et le flottement Phaser donne l'integration avec l'eau.

Point a surveiller: ne pas cumuler une animation trop forte dans les frames et dans `animateHeroSprite`, sinon le bateau aura l'air instable.

## 7. Galerie des sprites

Modifier `src/app/dev/sprites/page.tsx`:

- Ajouter le spritesheet bateau a l'onglet `Spritesheets`.
- Factoriser `HeroSheetPreview` en composant plus generique si necessaire:
  - `DirectionalSheetPreview`;
  - `DirectionalSheetCard`.
- Afficher les 8 directions avec idle/walk, comme les heros.
- Ne pas remettre l'ancien asset vectoriel `hero-boat` dans les assets statiques: le bateau est couvert par les spritesheets.

## 8. Validation

Validation technique:

- `node scripts/generate-boat-spritesheet.mjs`;
- verifier que le WebP final a les bonnes dimensions;
- `npx tsc --noEmit`;
- `npm run lint`;
- `npm run validate:phaser` si les variables de test sont disponibles.

Validation visuelle:

- ouvrir `/dev/sprites`;
- verifier les 8 directions du bateau;
- verifier idle et walk sans frames vides;
- lancer une partie avec eau;
- deplacer un heros sur l'eau;
- verifier:
  - bonne orientation a chaque segment;
  - animation walk pendant le tween;
  - retour a idle en fin de trajet;
  - profondeur correcte par rapport aux autres objets;
  - banniere joueur toujours bien positionnee.

## 9. Decoupage recommande

1. Ajouter la generation et l'asset bateau.
2. Ajouter les types/constantes de spritesheet bateau dans `assets.ts`.
3. Generaliser la creation d'animations Phaser.
4. Brancher le bateau anime dans `addHeroSprite` et `playHeroAnimation`.
5. Ajouter le preview dans `/dev/sprites`.
6. Ajuster les metriques, le flottement et la position de la banniere.
7. Lancer la validation TypeScript/lint et faire une passe visuelle.

## 10. Definition de termine

- Le bateau n'utilise plus le SVG statique pendant le rendu normal sur l'eau.
- Les 8 directions sont visibles et correspondent au trajet.
- `idle` boucle doucement quand le heros est immobile sur l'eau.
- `walk` joue pendant le deplacement.
- Le fallback statique existe encore pour eviter un rendu vide si le sheet n'est pas charge.
- Aucune regle de mouvement aventure n'a ete modifiee.
