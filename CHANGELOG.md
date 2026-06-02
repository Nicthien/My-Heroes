# Changelog

Toutes les modifications notables de **My Heroes** sont documentées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [1.0.0] - 2026-06-02

Première version stable. Le jeu est jouable de bout en bout : création de
partie, exploration, économie, combats et fin de partie.

### Ajouté

- **Carte d'aventure** — génération procédurale (bruit Simplex) avec 8 terrains,
  niveaux d'élévation, ressources, et bâtiments économiques/d'aventure.
- **Déplacement & exploration** — pathfinding A* sur grille carrée (8 directions,
  coûts conscients des routes, blocage diagonal strict), fog of war persistant.
- **Économie** — villes, mines/scieries/etc., revenu par tour, recrutement
  d'unités, construction de bâtiments.
- **Héros** — niveaux, statistiques, compétences, artefacts, transfert d'armée.
- **Combat** — résolution automatique et combat tactique manuel sur grille
  hexagonale (file d'initiative par vitesse, déplacement, tir, défense, sorts).
- **Adversaires IA** — stratégie complète : personnalités, mémoire, postures,
  rôles, économie, recrutement, et tactique de combat avec sorts.
- **Multijoueur** — lobby, parties à plusieurs via Supabase Realtime, rejoindre
  un combat en renfort.
- **Fin de partie** — conditions de victoire sélectionnables à la création
  (Domination, Accumulation d'or, Limite de tours, Capture d'une ville cible),
  toujours doublées de la domination en filet de sécurité ; gestion du match nul
  (élimination mutuelle), bandeau de fin de partie, score et leaderboard
  inter-parties.
- **Abandon** — un joueur peut déclarer forfait en cours de partie (bouton
  « Abandonner »), libérant ses mines et déclenchant la résolution de victoire.
- **Authentification** — comptes email/mot de passe gérés par Supabase.
- **Rendu** — moteur isométrique Phaser 4 (terrain, héros animés, brouillard,
  routes, décor) et interface (HUD, écran de ville, écran de combat) en français.
- **Déploiement** — image Docker mono-conteneur pour héberger le frontend.

[1.0.0]: https://github.com/
