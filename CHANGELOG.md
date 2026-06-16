# Changelog

Toutes les modifications notables de **My Heroes** sont documentées dans ce fichier.

Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [1.2.9] - 2026-06-16

Raccourcis clavier configurables et menu d'options réorganisé en onglets.

### Ajouté

- **Raccourcis clavier** — la carte d'aventure se contrôle désormais au clavier :
  déplacement de la caméra (ZQSD/WASD et flèches), Espace pour centrer sur le héros
  ou le château sélectionné, 1 et 2 pour passer au héros / château suivant, Entrée
  pour terminer le tour, + / − pour zoomer et Échap pour ouvrir le menu.
- **Disposition FR/EN et touches personnalisables** — un nouvel onglet des options
  permet de choisir la disposition du clavier (AZERTY / QWERTY) et de réassigner
  chaque touche, avec un bouton de réinitialisation. Les raccourcis sont reconnus
  par leur position physique, donc une même configuration fonctionne sur les deux
  dispositions.

### Modifié

- **Menu d'options en onglets** — les réglages sont répartis en trois onglets
  (Son, Graphismes, Clavier) avec un contenu défilant.

## [1.2.8] - 2026-06-14

Nouvelle page d'accueil, bâtiments de ville inédits, sièges plus tactiques et fin de tour plus réactive.

### Ajouté

- **Page d'accueil enrichie** — la page de connexion présente désormais le jeu avec
  une introduction et une galerie de captures d'écran (carte d'aventure, combats,
  siège, exploration navale, bataille hivernale et quête du Graal).
- **Nouveaux bâtiments de ville** — la Cathédrale confère +1 Connaissance définitif
  au héros en visite, et la Source de mana lui restaure tous ses points de magie
  une fois par semaine.
- **Assaut de la porte en mêlée** — lors d'un siège, les attaquants peuvent charger
  la porte fermée du château au corps à corps pour l'enfoncer.

### Modifié

- **Fin de tour plus réactive** — le bouton, l'indicateur de chargement et
  l'assombrissement de l'écran réagissent instantanément au clic, sans attendre la
  réponse du serveur, et l'annulation de fin de tour reste toujours disponible.

## [1.2.7] - 2026-06-13

Retrouvez le jeu sur Facebook, itch.io, Discord et le site du studio.

### Ajouté

- **Liens communautaires** — la page de connexion et le tableau de bord affichent
  désormais des liens vers la page Facebook, la fiche itch.io, le serveur Discord
  et le site NTH Studio.

## [1.2.6] - 2026-06-11

Correctif de stabilité : quitter ou supprimer une partie ne provoque plus d'erreur.

### Corrigé

- **Erreur en quittant une partie** — la suppression d'une partie (par exemple
  lorsque le créateur quitte une partie en attente) ne déclenche plus d'erreur de
  base de données liée aux notifications temps réel.

## [1.2.5] - 2026-06-11

La ville de départ est pleinement opérationnelle dès le premier tour.

### Corrigé

- **Taverne fonctionnelle au départ** — la taverne de la ville de départ propose
  désormais des héros à recruter dès le premier tour. Son offre était auparavant
  vide jusqu'au premier changement de semaine.
- **Recrues disponibles au départ** — le bâtiment de créatures de niveau 1 est
  approvisionné de sa croissance hebdomadaire dès la création de la partie, au
  lieu d'attendre la première semaine.

## [1.2.4] - 2026-06-10

Ville de départ équipée, mini-carte plus lisible et FPS en combat.

### Ajouté

- **FPS en combat** — quand l'option « Afficher les FPS » est activée, le compteur
  d'images par seconde s'affiche aussi pendant les combats, et non plus seulement
  sur la carte d'aventure.
- **Ville de départ équipée** — la première ville démarre avec l'hôtel de ville,
  la taverne, le fort et le bâtiment de créatures de niveau 1 déjà construits, avec
  des recrues disponibles dès le premier tour.

### Modifié

- **Mini-carte** — les villes neutres restent grises (neutres) au lieu d'hériter
  de la couleur d'un joueur ennemi voisin.
- **Options** — l'aide du réglage « Qualité d'affichage » a été reformulée pour
  être plus claire.

## [1.2.3] - 2026-06-10

Optimisations de performance et avertissements anti-ralentissement (Edge).

### Ajouté

- **Avertissement de performance** — un message s'affiche (au tableau de bord et
  en jeu) lorsque le navigateur n'utilise pas l'accélération matérielle (rendu
  logiciel), avec la marche à suivre pour l'activer. Option « Ne plus afficher ».
- **Qualité d'affichage** — nouveau réglage dans les Options : Auto, Performance
  ou Qualité, pour adapter le rendu aux machines moins puissantes.
- **Affichage des FPS** — nouvelle option pour afficher le compteur d'images par
  seconde dans la barre du haut.

### Modifié

- **Rendu adaptatif** — le jeu réduit automatiquement les effets d'ambiance
  (eau, lave, brouillard) en cas de ralentissement prolongé ou de rendu logiciel
  détecté, pour préserver la fluidité.

## [1.2.2] - 2026-06-10

Tableau de bord plus compact et nouveau graphique de statistiques.

### Ajouté

- **Statistiques (admin)** — un graphique « Inscrits dans le temps » montre
  désormais le nombre d'inscriptions par jour, comme celui des parties créées.

### Modifié

- **Classement** — seuls les 5 meilleurs joueurs (par meilleur score) sont
  affichés sur le tableau de bord.
- **Mes parties** — seules les 3 parties les plus récentes sont visibles ; les
  autres restent accessibles en faisant défiler la liste.
- **Salle d'attente** — l'hôte voit désormais un message précisant d'attendre
  que les autres joueurs se connectent ou de lancer la partie avec des IA.

## [1.2.1] - 2026-06-10

Décompte des connexions pour la fenêtre de soutien.

### Corrigé

- **Soutien** — la fenêtre invitant à soutenir le jeu se base désormais sur les
  connexions réelles via le bouton « Connexion » (et non plus sur l'horodatage
  de session). Elle s'affiche bien à la troisième connexion.

## [1.2.0] - 2026-06-10

Lien vers le studio NTH Studio et classement plus équitable.

### Ajouté

- **Tableau de bord** — un lien vers le studio **NTH Studio** (nthstudio.eu)
  apparaît désormais à côté du bouton « Soutien », séparé par une petite épée.

### Modifié

- **Classement** — les joueurs ayant activé le **mode dieu** ne sont plus
  comptabilisés dans le classement, afin de préserver l'équité des scores.

## [1.1.9] - 2026-06-09

Pools de recrutement séparés pour les créatures de base et améliorées.

### Modifié

- **Ville** — un bâtiment de base et son amélioration disposent désormais de
  réserves de recrutement **distinctes** qui croissent indépendamment chaque
  semaine. Construire l'amélioration n'absorbe plus la réserve de base : une
  ville où les deux sont bâtis produit la croissance de base **et** celle de
  l'amélioration, sur deux compteurs séparés.

## [1.1.8] - 2026-06-09

Correction de l'engagement d'un héros ennemi posté devant un château.

### Corrigé

- **Combat** — lorsqu'un héros adverse est posté sur ou devant l'un de vos
  châteaux, cliquer dessus ouvre désormais correctement la fenêtre « Engager le
  combat ? » : elle ne se referme plus instantanément et votre héros n'est plus
  désélectionné, ce qui vous permet enfin d'attaquer ou de fuir.

## [1.1.7] - 2026-06-09

Descriptifs des objets de la carte au survol.

### Ajouté

- **Carte** — les bâtiments de ressources (mines, dunes, scieries…) affichent
  désormais leur production au survol, par ex. « Produit +1 soufre par jour ».
- **Carte** — les artefacts posés sur la carte indiquent désormais leur bonus au
  survol, par ex. « Pouvoir +5 ».

## [1.1.6] - 2026-06-09

Rassemblement de héros en ville et renforcement anti-triche.

### Corrigé

- **Ville** — vous pouvez de nouveau rassembler plusieurs héros (jusqu'à 5) dans
  l'une de vos villes ; un message clair s'affiche désormais lorsque la ville est
  pleine.
- **Sécurité (anti-triche)** — les informations cachées des adversaires
  (positions des héros, garnisons, combats, emplacement du Graal) ne sont plus
  accessibles côté client.

## [1.1.5] - 2026-06-09

Descriptions de recrutement plus claires et ajustement du tableau de bord.

### Modifié

- **Construction de ville** — les descriptions des demeures indiquent désormais
  quelle créature elles permettent de recruter (par ex. « palier 1 : Piquier »)
  au lieu d'afficher uniquement le numéro de palier.

### Corrigé

- **Tableau de bord** — le numéro de version ne repasse plus à la ligne sous le
  titre.

## [1.1.4] - 2026-06-09

Ajustement de la fin du tutoriel.

### Modifié

- **Tutoriel** — la dernière étape resélectionne désormais votre héros (au lieu de
  laisser la ville ouverte, ce qui prêtait à confusion) et se termine par une
  invitation à partir explorer le monde.

## [1.1.3] - 2026-06-09

Correctif de connexion du compte admin et ajustement de l'invitation au soutien.

### Corrigé

- **Compte admin par défaut** — sur une base vierge, le compte admin créé
  automatiquement n'était pas marqué comme email confirmé et restait bloqué à la
  connexion (« Confirmez votre adresse email ») même lorsque l'envoi SMTP est
  désactivé. Il est désormais créé directement confirmé.

### Modifié

- **Invitation au soutien (Ko-fi)** — la fenêtre de soutien s'affiche désormais à
  la troisième connexion (au lieu de la deuxième), puis plus jamais.
- **Icône de l'application** — nouvelle icône aux couleurs du blason My Heroes.

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
