# Migration Phaser

## Statut

La migration du renderer de carte vers Phaser est terminee.

- Phaser est le renderer unique de `GameMap`.
- L'ancien renderer Pixi, le fallback Pixi et la dependance `pixi.js` ont ete supprimes.
- `MapRenderer` reste l'interface commune entre React et le renderer.
- Le renderer Phaser est charge dynamiquement cote client pour eviter les problemes SSR.
- Le rendu couvre carte isometrique, elevation, brouillard, ressources, monstres, villes, heros, batiments, combats, bannieres et badges de gardiens.
- Les interactions principales passent par Phaser : selection d'objet, selection de tuile, camera, surbrillances, chemin et deplacement.
- La logique de jeu reste dans React, Zustand, les API Next.js et `src/lib/game`.

## Architecture Actuelle

- `src/components/game/map/GameMap.tsx` orchestre les interactions joueur et les appels API.
- `src/lib/rendering/mapRenderer.ts` definit le contrat du renderer.
- `src/lib/rendering/phaser/PhaserMapRenderer.ts` implemente le rendu Phaser.
- `src/lib/rendering/phaser/iso.ts` contient les conversions carte/ecran.
- `src/lib/rendering/phaser/assets.ts` centralise les sprites publics.
- `src/lib/stores/gameStore.ts` reste la source de verite UI cote client.
- Les actions persistantes passent par `/api/games/[id]/action` et `/api/games/[id]/combats`.

## Validation Automatique

Le script `npm run validate:phaser` lance un smoke test Playwright qui :

- se connecte avec `PHASER_TEST_EMAIL` et `PHASER_TEST_PASSWORD`;
- cree une partie;
- demarre la partie;
- verifie qu'un canvas Phaser est rendu;
- verifie l'absence d'erreurs console/page;
- confirme un deplacement par clic sur la carte;
- verifie que le mouvement du heros baisse;
- termine le tour et verifie le retour UI.

Commande :

```bash
PHASER_TEST_EMAIL="..." PHASER_TEST_PASSWORD="..." npm run validate:phaser
```

## Checklist De Validation Manuelle

Ces points restent utiles avant un tag ou une release :

- ouvrir une partie existante;
- selectionner heros, ville, batiment et combat actif;
- deplacer un heros sur plusieurs terrains;
- confirmer un chemin partiel quand le deplacement depasse le mouvement disponible;
- capturer un batiment neutre sans gardiens;
- attaquer un batiment avec gardiens;
- attaquer un monstre;
- ouvrir un combat manuel;
- rejoindre un combat existant avec un second heros;
- terminer un tour puis recharger la page;
- verifier le rendu sur viewport mobile/tablette si la cible tactile est conservee.

## Backlog Phaser

Les prochains travaux ne sont plus bloquants pour la migration, mais ameliorent l'experience :

- hover de tuile avec feedback discret;
- zoom controle et limites de camera;
- inertie ou lissage de camera;
- animation du heros le long du chemin;
- feedback visuel de capture et de combat;
- transitions de brouillard;
- atlas ou PNG optimises pour remplacer les SVG si certains navigateurs affichent des artefacts;
- test visuel mobile avec screenshot.

## Definition De Termine

La migration renderer est consideree terminee quand ces commandes passent :

```bash
npx tsc --noEmit
npm run lint
npm run build
PHASER_TEST_EMAIL="..." PHASER_TEST_PASSWORD="..." npm run validate:phaser
```

Etat actuel : ces validations sont attendues comme garde finale avant commit.
