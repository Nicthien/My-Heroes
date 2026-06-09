# Changelog

Toutes les modifications notables de **My Heroes** sont documentées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [1.1.2] - 2026-06-09

Emails de confirmation d'inscription, de bienvenue et signalement de bug.

### Ajouté

- **Confirmation d'email** — lorsque l'envoi SMTP est activé (variable
  `USE_SMTP`), l'inscription envoie un email de confirmation et la connexion
  reste bloquée tant que l'adresse n'est pas validée, avec un bouton pour
  renvoyer le lien. Un email de bienvenue est envoyé une fois le compte confirmé.
- **Signaler un bug** — un bouton dédié sur le tableau de bord et dans le menu en
  partie permet d'envoyer un signalement à l'équipe NTH Studio
  (`contact@nthstudio.eu`, sujet `[My-Heroes][BUG-REPORT]`) ; le rapport en
  partie joint automatiquement le contexte (identifiant de partie, tour, faction,
  taille de carte…).
- **Emails personnalisés** — logo du jeu en en-tête et pied de page avec NTH
  Studio (nthstudio.eu) et un lien de soutien Ko-fi.

## [1.1.1] - 2026-06-08

Tableau de bord d'administration enrichi de statistiques globales.

### Ajouté

- **Panneau Statistiques (admin)** — un bouton « Stats » à droite du bouton
  « Admin » ouvre un tableau de bord réservé aux administrateurs : totaux
  (utilisateurs, parties par statut, joueurs humains vs IA, combats, héros),
  moyennes (tours par partie, tours par partie terminée, joueurs par partie),
  courbe des parties créées sur 30 jours, répartition des factions, parties par
  statut et classement des meilleurs joueurs. Graphiques en SVG/CSS, sans
  dépendance supplémentaire.

## [1.1.0] - 2026-06-08

Grand alignement sur les règles de Heroes III : nouveaux terrains, terrain natif,
objets de trésor, capacités d'unités et progression des héros.

### Ajouté

- **Terrains Rude & Souterrain** — deux nouveaux biomes (badland rocheux et sol de
  caverne) avec leurs textures peintes à la main ; le souterrain remplace la terre
  sur les niveaux souterrains.
- **Terrain natif** — une armée entièrement native à un terrain le traverse sans
  pénalité de mouvement (Stronghold/Rude, Donjon/Souterrain, etc.).
- **Coffre au trésor** — au choix, de l'or (1000/1500/2000) ou de l'expérience
  (1500/2250/3000) ; au moins un par zone.
- **Boîte de Pandore** — une seule par carte, cachée dans une zone neutre (de
  préférence en souterrain) et gardée par des dragons ; livre or, ressources rares,
  expérience et un artefact majeur.
- **Capacités d'unités en combat** — pas de riposte, double attaque, et ripostes
  multiples (griffons) sont désormais appliquées.
- **Montée de niveau des héros** — chaque niveau accorde un point de compétence
  primaire, pondéré par la classe (mécanique centrale de HoMM3).

### Modifié

- **Croissance de créatures** — la Citadelle (×1.5) et le Château (×2) augmentent la
  croissance de base ; les tanières améliorées remplacent le flux de base au lieu de
  le cumuler.
- **Intelligence** augmente le mana maximum (+25/50/100 %) et **Mysticisme** régénère
  du mana chaque jour.
- Croissance hebdomadaire et recrues migrées correctement lors de l'amélioration
  d'une tanière.

### Corrigé

- **Plafond du bonus d'attaque** ramené à ×4 (+300 %) conforme à HoMM3, au lieu de ×5.
- **Pénalité de tir** — la longue portée s'applique au-delà de 10 hexes et se cumule
  désormais avec l'obstacle (×0.25).
- **Phase « Attendre »** résolue du plus lent au plus rapide.
- Limite « un bâtiment par ville et par jour » désormais appliquée côté serveur.
- Coût du **Silo de ressources** corrigé (5000 or).
- La puissance des unités (auto-résolution, IA) utilise leur valeur de combat plutôt
  que leur prix en or.

## [1.0.1] - 2026-06-06

### Ajouté

- **Sort Visions** — révèle désormais le détail du score (par catégorie) de
  chaque adversaire dont un héros ou une ville est à portée, pour le tour en
  cours ; le brouillard de guerre le re-masque au tour suivant.
- **Triche Mana infini** — donne aussi tous les sorts au héros sélectionné
  (grimoire complet, en aventure comme en combat).
- **Aperçu `/dev/combat`** — affiche désormais les machines de guerre (baliste,
  tente de premiers secours, charrette de munitions, et catapulte en siège),
  placées derrière les créatures.

### Modifié

- Reformulation du libellé « Détail masqué » du panneau de score (suppression
  de la mention trompeuse au brouillard de guerre).
- Boutons du Graal (creuser / carte au trésor) déplacés dans l'onglet
  compétences et la barre d'onglets du héros.
- **Fortifications de siège** — déterminées par les bâtiments de la ville
  (Fort = remparts, Citadelle = +1 tour de tir, Château = 3 tours) au lieu du
  niveau du centre-ville.
- **Tente de premiers secours (combat)** — soins conformes aux règles de
  référence : montant aléatoire selon Premiers Secours (1-25 / 40-50 / 60-75 /
  80-100), soin de n'importe quelle pile alliée sans contrainte d'adjacence,
  créatures uniquement, ciblage manuel à partir de la compétence.
- Badges d'état (chance/moral) recentrés au-dessus de la tête de l'unité.

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

[1.1.1]: https://github.com/Nicthien/My-Heroes/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Nicthien/My-Heroes/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/Nicthien/My-Heroes/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/
