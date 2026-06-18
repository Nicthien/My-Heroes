// In-app changelog shown from the dashboard. Mirrors the human-readable
// CHANGELOG.md at the repo root — keep both in sync when cutting a release.
// Item strings may use **bold** markers for the leading term; the modal renders
// them with <strong> (see ChangelogModal).

export type ChangelogCategory = "added" | "changed" | "fixed" | "removed";

export interface ChangelogSection {
  category: ChangelogCategory;
  items: string[];
}

export interface ChangelogRelease {
  version: string;
  /** ISO date (YYYY-MM-DD) of the release. */
  date: string;
  /** Optional one-line summary shown under the version heading. */
  summary?: string;
  sections: ChangelogSection[];
}

// Newest first.
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: "1.3.2",
    date: "2026-06-18",
    summary: "Héros caché derrière un château désormais repérable grâce à une silhouette colorée par-dessus, et nettoyage d'un toast trompeur lors d'un combat déclenché en cours de déplacement.",
    sections: [
      {
        category: "added",
        items: [
          "**Silhouette de héros à travers les structures** — quand l'un de vos héros (ou un héros adverse visible) est masqué par un château, une mine ou un bâtiment d'aventure, une silhouette teintée de sa couleur s'affiche par-dessus la structure pour qu'on puisse toujours le repérer. La détection est pixel-perfect (échantillonnage de l'alpha de la texture occluder à hauteur de pied, torse et tête), et le brouillard de guerre est respecté : aucun ennemi hors champ de vision n'est révélé.",
        ],
      },
      {
        category: "fixed",
        items: [
          "**Toast « Cliquez à nouveau » fantôme pendant un combat** — quand on confirmait un déplacement vers son propre château mais qu'un héros adverse interceptait sur le trajet, la boîte d'engagement de combat s'ouvrait par-dessus le toast jaune « Cliquez à nouveau pour entrer dans ce château » qui n'était jamais effacé, donnant l'impression que le combat portait sur le château. Le toast est maintenant effacé dès que l'interaction `COMBAT` revient du serveur.",
        ],
      },
    ],
  },
  {
    version: "1.3.1",
    date: "2026-06-18",
    summary: "Retours plus clairs après une défaite de héros et correction d'un sprite bateau fantôme, plus une console admin pour lire et répondre aux rapports de bug envoyés par e-mail.",
    sections: [
      {
        category: "added",
        items: [
          "**Console admin de rapports de bug** — un nouveau panneau dans le tableau de bord administrateur lit les e-mails marqués `[My-Heroes][BUG-REPORT]` via IMAP (activable par `USE_IMAP` et les `IMAP_*`), regroupe les conversations par expéditeur et permet de répondre directement depuis le studio. Pas activé par défaut.",
        ],
      },
      {
        category: "fixed",
        items: [
          "**Mort d'un héros mieux signalée** — quand votre héros tombe au combat, l'écran de résultat affiche désormais un message explicite qui rappelle que vous pouvez en recruter un nouveau à la taverne, la caméra recentre automatiquement sur votre château principal et celui-ci est sélectionné à la fermeture de la fenêtre.",
          "**Bateau fantôme après rachat à la taverne** — un héros qui battait en retraite d'un combat naval se transformait en sprite bateau au-dessus de son château une fois racheté à la taverne. Le lien avec le bateau est désormais coupé dès la retraite (le bateau reste flotter à l'endroit où le héros a sauté à l'eau), avec un filet de sécurité au moment du rachat pour les parties en cours.",
        ],
      },
      {
        category: "changed",
        items: [
          "**Mouvement de héros plus fluide** — sur un déplacement de plusieurs cases, le tween est désormais construit en un seul segment continu au lieu d'une succession de tweens case-par-case ; la décélération à chaque tuile (et les micro-à-coups visuels et sonores qu'elle produisait) disparaissent.",
        ],
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-06-17",
    summary: "Rencontre entre vos héros pour échanger unités et artefacts, et plusieurs précisions dans le guide de combat.",
    sections: [
      {
        category: "added",
        items: [
          "**Rencontre de héros** — cliquer sur un autre de vos héros alors qu'un héros est déjà sélectionné ouvre une fenêtre dédiée lorsque les deux sont adjacents : vous pouvez y répartir les piles d'unités entre les deux armées et échanger les artefacts équipés ou en inventaire. Si le héros visé est trop éloigné, un trajet de rapprochement est proposé et la fenêtre s'ouvre automatiquement à l'arrivée.",
        ],
      },
      {
        category: "changed",
        items: [
          "**Guide de combat enrichi** — la page « Le combat » du guide précise le calcul des dégâts (bonus/malus par point d'écart attaque/défense, bonus de défense), les pénalités des tireurs (corps-à-corps, longue portée, obstacles), les capacités spéciales de riposte (Pas de riposte, Ripostes multiples, Double attaque) et liste les autres options en combat (tactique, sort, fuite, reddition). La taille de la grille indiquée est corrigée à 13 × 10 (jusqu'à 20 pour les très grandes batailles).",
        ],
      },
    ],
  },
  {
    version: "1.2.9",
    date: "2026-06-16",
    summary: "Raccourcis clavier configurables, menu d'options en onglets, et plusieurs ajouts et rééquilibrages de jeu.",
    sections: [
      {
        category: "added",
        items: [
          "**Raccourcis clavier** — la carte d'aventure se contrôle désormais au clavier : déplacement de la caméra (ZQSD/WASD et flèches), Espace pour centrer sur le héros ou le château sélectionné, 1 et 2 pour passer au héros / château suivant, Entrée pour terminer le tour, + / − pour zoomer et Échap pour ouvrir le menu.",
          "**Disposition FR/EN et touches personnalisables** — un nouvel onglet des options permet de choisir la disposition du clavier (AZERTY / QWERTY) et de réassigner chaque touche, avec un bouton de réinitialisation. Les raccourcis sont reconnus par leur position physique, donc une même configuration fonctionne sur les deux dispositions.",
          "**Aperçu du butin et des créatures en combat** — les fenêtres d'avant et d'après-combat affichent désormais les sprites des créatures et le butin (ressources, artefacts).",
          "**Conversion de ville capturée** — une ville étrangère capturée peut être convertie à votre faction pour 5000 d'or.",
          "**Butin des monstres errants** — vaincre un monstre errant rapporte désormais des ressources et, une fois sur deux, un artefact mineur.",
          "**Recruter tout dans la garnison** — un nouveau bouton recrute d'un coup toutes les créatures disponibles dans la garnison de la ville.",
        ],
      },
      {
        category: "changed",
        items: [
          "**Menu d'options en onglets** — les réglages sont répartis en trois onglets (Son, Graphismes, Clavier) avec un contenu défilant.",
          "**Difficulté des gardiens neutres rééquilibrée** — la puissance des gardiens neutres a été revue (début de partie en difficulté moyenne, courbe aplanie), avec une escalade hebdomadaire de +25 % et des portes/gardes ajustés vers le haut de la fourchette « moyenne ».",
        ],
      },
      {
        category: "fixed",
        items: [
          "**Roi (King)** — utilise désormais ses propres statistiques, conserve un moral positif et adopte la faction de son propriétaire en combat.",
          "**Reddition contre un château neutre** — il est possible de se rendre face à un château neutre rejoint par un joueur, et la victoire est correctement créditée.",
          "**Conservatoire de griffons** — récompense désormais des griffons royaux, et non des anges.",
          "**Souterrain** — les recherches de carte sont limitées au bon niveau (héros / combat), corrigeant des incohérences sous terre.",
        ],
      },
    ],
  },
  {
    version: "1.2.8",
    date: "2026-06-14",
    summary: "Nouvelle page d'accueil, bâtiments de ville inédits, sièges plus tactiques et fin de tour plus réactive.",
    sections: [
      {
        category: "added",
        items: [
          "**Page d'accueil enrichie** — la page de connexion présente désormais le jeu avec une introduction et une galerie de captures d'écran (carte d'aventure, combats, siège, exploration navale, bataille hivernale et quête du Graal).",
          "**Nouveaux bâtiments de ville** — la Cathédrale confère +1 Connaissance définitif au héros en visite, et la Source de mana lui restaure tous ses points de magie une fois par semaine.",
          "**Assaut de la porte en mêlée** — lors d'un siège, les attaquants peuvent charger la porte fermée du château au corps à corps pour l'enfoncer.",
        ],
      },
      {
        category: "changed",
        items: [
          "**Fin de tour plus réactive** — le bouton, l'indicateur de chargement et l'assombrissement de l'écran réagissent instantanément au clic, sans attendre la réponse du serveur, et l'annulation de fin de tour reste toujours disponible.",
        ],
      },
    ],
  },
  {
    version: "1.2.7",
    date: "2026-06-13",
    summary: "Retrouvez le jeu sur Facebook, itch.io, Discord et le site du studio.",
    sections: [
      {
        category: "added",
        items: [
          "**Liens communautaires** — la page de connexion et le tableau de bord affichent désormais des liens vers la page Facebook, la fiche itch.io, le serveur Discord et le site NTH Studio.",
        ],
      },
    ],
  },
  {
    version: "1.2.6",
    date: "2026-06-11",
    summary: "Correctif de stabilité : quitter ou supprimer une partie ne provoque plus d'erreur.",
    sections: [
      {
        category: "fixed",
        items: [
          "**Erreur en quittant une partie** — la suppression d'une partie (par exemple lorsque le créateur quitte une partie en attente) ne déclenche plus d'erreur de base de données liée aux notifications temps réel.",
        ],
      },
    ],
  },
  {
    version: "1.2.5",
    date: "2026-06-11",
    summary: "La ville de départ est pleinement opérationnelle dès le premier tour.",
    sections: [
      {
        category: "fixed",
        items: [
          "**Taverne fonctionnelle au départ** — la taverne de la ville de départ propose désormais des héros à recruter dès le premier tour. Son offre était auparavant vide jusqu'au premier changement de semaine.",
          "**Recrues disponibles au départ** — le bâtiment de créatures de niveau 1 est approvisionné de sa croissance hebdomadaire dès la création de la partie, au lieu d'attendre la première semaine.",
        ],
      },
    ],
  },
  {
    version: "1.2.4",
    date: "2026-06-10",
    summary: "Ville de départ équipée, mini-carte plus lisible et FPS en combat.",
    sections: [
      {
        category: "added",
        items: [
          "**FPS en combat** — quand l'option « Afficher les FPS » est activée, le compteur d'images par seconde s'affiche aussi pendant les combats, et non plus seulement sur la carte d'aventure.",
          "**Ville de départ équipée** — la première ville démarre avec l'hôtel de ville, la taverne, le fort et le bâtiment de créatures de niveau 1 déjà construits, avec des recrues disponibles dès le premier tour.",
        ],
      },
      {
        category: "changed",
        items: [
          "**Mini-carte** — les villes neutres restent grises (neutres) au lieu d'hériter de la couleur d'un joueur ennemi voisin.",
          "**Options** — l'aide du réglage « Qualité d'affichage » a été reformulée pour être plus claire.",
        ],
      },
    ],
  },
  {
    version: "1.2.3",
    date: "2026-06-10",
    summary: "Optimisations de performance et avertissements anti-ralentissement (Edge).",
    sections: [
      {
        category: "added",
        items: [
          "**Avertissement de performance** — un message s'affiche (au tableau de bord et en jeu) lorsque le navigateur n'utilise pas l'accélération matérielle (rendu logiciel), avec la marche à suivre pour l'activer. Option « Ne plus afficher ».",
          "**Qualité d'affichage** — nouveau réglage dans les Options : Auto, Performance ou Qualité, pour adapter le rendu aux machines moins puissantes.",
          "**Affichage des FPS** — nouvelle option pour afficher le compteur d'images par seconde dans la barre du haut.",
        ],
      },
      {
        category: "changed",
        items: [
          "**Rendu adaptatif** — le jeu réduit automatiquement les effets d'ambiance (eau, lave, brouillard) en cas de ralentissement prolongé ou de rendu logiciel détecté, pour préserver la fluidité.",
        ],
      },
    ],
  },
  {
    version: "1.2.2",
    date: "2026-06-10",
    summary: "Tableau de bord plus compact et nouveau graphique de statistiques.",
    sections: [
      {
        category: "added",
        items: [
          "**Statistiques (admin)** — un graphique « Inscrits dans le temps » montre désormais le nombre d'inscriptions par jour, comme celui des parties créées.",
        ],
      },
      {
        category: "changed",
        items: [
          "**Classement** — seuls les 5 meilleurs joueurs (par meilleur score) sont affichés sur le tableau de bord.",
          "**Mes parties** — seules les 3 parties les plus récentes sont visibles ; les autres restent accessibles en faisant défiler la liste.",
          "**Salle d'attente** — l'hôte voit désormais un message précisant d'attendre que les autres joueurs se connectent ou de lancer la partie avec des IA.",
        ],
      },
    ],
  },
  {
    version: "1.2.1",
    date: "2026-06-10",
    summary: "Décompte des connexions pour la fenêtre de soutien.",
    sections: [
      {
        category: "fixed",
        items: [
          "**Soutien** — la fenêtre invitant à soutenir le jeu se base désormais sur les connexions réelles via le bouton « Connexion » (et non plus sur l'horodatage de session). Elle s'affiche bien à la troisième connexion.",
        ],
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-06-10",
    summary: "Lien vers le studio NTH Studio et classement plus équitable.",
    sections: [
      {
        category: "added",
        items: [
          "**Tableau de bord** — un lien vers le studio NTH Studio (nthstudio.eu) apparaît désormais à côté du bouton « Soutien », séparé par une petite épée.",
        ],
      },
      {
        category: "changed",
        items: [
          "**Classement** — les joueurs ayant activé le mode dieu ne sont plus comptabilisés dans le classement, afin de préserver l'équité des scores.",
        ],
      },
    ],
  },
  {
    version: "1.1.9",
    date: "2026-06-09",
    summary: "Pools de recrutement séparés pour les créatures de base et améliorées.",
    sections: [
      {
        category: "changed",
        items: [
          "**Ville** — un bâtiment de base et son amélioration disposent désormais de réserves de recrutement distinctes qui croissent indépendamment chaque semaine. Construire l'amélioration n'absorbe plus la réserve de base : une ville où les deux sont bâtis produit la croissance de base ET celle de l'amélioration, sur deux compteurs séparés.",
        ],
      },
    ],
  },
  {
    version: "1.1.8",
    date: "2026-06-09",
    summary: "Correction de l'engagement d'un héros ennemi posté devant un château.",
    sections: [
      {
        category: "fixed",
        items: [
          "**Combat** — lorsqu'un héros adverse est posté sur ou devant l'un de vos châteaux, cliquer dessus ouvre désormais correctement la fenêtre « Engager le combat ? » : elle ne se referme plus instantanément et votre héros n'est plus désélectionné, ce qui vous permet enfin d'attaquer ou de fuir.",
        ],
      },
    ],
  },
  {
    version: "1.1.7",
    date: "2026-06-09",
    summary: "Descriptifs des objets de la carte au survol.",
    sections: [
      {
        category: "added",
        items: [
          "**Carte** — les bâtiments de ressources (mines, dunes, scieries…) affichent désormais leur production au survol, par ex. « Produit +1 soufre par jour ».",
          "**Carte** — les artefacts posés sur la carte indiquent désormais leur bonus au survol, par ex. « Pouvoir +5 ».",
        ],
      },
    ],
  },
  {
    version: "1.1.6",
    date: "2026-06-09",
    summary: "Rassemblement de héros en ville et renforcement anti-triche.",
    sections: [
      {
        category: "fixed",
        items: [
          "**Ville** — vous pouvez de nouveau rassembler plusieurs héros (jusqu'à 5) dans l'une de vos villes ; un message clair s'affiche désormais lorsque la ville est pleine.",
          "**Sécurité (anti-triche)** — les informations cachées des adversaires (positions des héros, garnisons, combats, emplacement du Graal) ne sont plus accessibles côté client.",
        ],
      },
    ],
  },
  {
    version: "1.1.5",
    date: "2026-06-09",
    summary: "Descriptions de recrutement plus claires et ajustement du tableau de bord.",
    sections: [
      {
        category: "changed",
        items: [
          "**Construction de ville** — les descriptions des demeures indiquent désormais quelle créature elles permettent de recruter (par ex. « palier 1 : Piquier ») au lieu d'afficher uniquement le numéro de palier.",
        ],
      },
      {
        category: "fixed",
        items: [
          "**Tableau de bord** — le numéro de version ne repasse plus à la ligne sous le titre.",
        ],
      },
    ],
  },
  {
    version: "1.1.4",
    date: "2026-06-09",
    summary: "Ajustement de la fin du tutoriel.",
    sections: [
      {
        category: "changed",
        items: [
          "**Tutoriel** — la dernière étape resélectionne désormais votre héros (au lieu de laisser la ville ouverte, ce qui prêtait à confusion) et se termine par une invitation à partir explorer le monde.",
        ],
      },
    ],
  },
  {
    version: "1.1.2",
    date: "2026-06-09",
    summary: "Emails de confirmation d'inscription, de bienvenue et signalement de bug.",
    sections: [
      {
        category: "added",
        items: [
          "**Confirmation d'email** — lorsque l'envoi SMTP est activé (variable `USE_SMTP`), l'inscription envoie un email de confirmation et la connexion reste bloquée tant que l'adresse n'est pas validée, avec un bouton pour renvoyer le lien. Un email de bienvenue est envoyé une fois le compte confirmé.",
          "**Signaler un bug** — un bouton dédié sur le tableau de bord et dans le menu en partie permet d'envoyer un signalement à l'équipe NTH Studio ; le rapport en partie joint automatiquement le contexte (identifiant de partie, tour, faction, taille de carte…).",
          "**Emails personnalisés** — logo du jeu en en-tête et pied de page avec NTH Studio (nthstudio.eu) et un lien de soutien Ko-fi.",
        ],
      },
    ],
  },
  {
    version: "1.1.1",
    date: "2026-06-08",
    summary: "Tableau de bord d'administration enrichi de statistiques globales.",
    sections: [
      {
        category: "added",
        items: [
          "**Panneau Statistiques (admin)** — un bouton « Stats » à droite du bouton « Admin » ouvre un tableau de bord réservé aux administrateurs : totaux (utilisateurs, parties par statut, joueurs humains vs IA, combats, héros), moyennes (tours par partie, joueurs par partie), courbe des parties créées sur 30 jours, répartition des factions et classement des meilleurs joueurs.",
        ],
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-06-08",
    summary:
      "Grand alignement sur les règles de Heroes III : nouveaux terrains, terrain natif, objets de trésor, capacités d'unités et progression des héros.",
    sections: [
      {
        category: "added",
        items: [
          "**Terrains Rude & Souterrain** — deux nouveaux biomes (badland rocheux et sol de caverne) avec leurs textures peintes à la main ; le souterrain remplace la terre sur les niveaux souterrains.",
          "**Terrain natif** — une armée entièrement native à un terrain le traverse sans pénalité de mouvement (Stronghold/Rude, Donjon/Souterrain, etc.).",
          "**Coffre au trésor** — au choix, de l'or (1000/1500/2000) ou de l'expérience (1500/2250/3000) ; au moins un par zone.",
          "**Boîte de Pandore** — une seule par carte, cachée dans une zone neutre (de préférence en souterrain) et gardée par des dragons ; livre or, ressources rares, expérience et un artefact majeur.",
          "**Capacités d'unités en combat** — pas de riposte, double attaque, et ripostes multiples (griffons) sont désormais appliquées.",
          "**Montée de niveau des héros** — chaque niveau accorde un point de compétence primaire, pondéré par la classe.",
        ],
      },
      {
        category: "changed",
        items: [
          "**Croissance de créatures** — la Citadelle (×1.5) et le Château (×2) augmentent la croissance de base ; les tanières améliorées remplacent le flux de base au lieu de le cumuler.",
          "**Intelligence** augmente le mana maximum (+25/50/100 %) et **Mysticisme** régénère du mana chaque jour.",
          "Croissance hebdomadaire et recrues migrées correctement lors de l'amélioration d'une tanière.",
        ],
      },
      {
        category: "fixed",
        items: [
          "**Plafond du bonus d'attaque** ramené à ×4 (+300 %), au lieu de ×5.",
          "**Pénalité de tir** — la longue portée s'applique au-delà de 10 hexes et se cumule désormais avec l'obstacle (×0.25).",
          "**Phase « Attendre »** résolue du plus lent au plus rapide.",
          "Limite « un bâtiment par ville et par jour » désormais appliquée côté serveur.",
          "Coût du **Silo de ressources** corrigé (5000 or).",
          "La puissance des unités (auto-résolution, IA) utilise leur valeur de combat plutôt que leur prix en or.",
        ],
      },
    ],
  },
  {
    version: "1.0.1",
    date: "2026-06-06",
    sections: [
      {
        category: "added",
        items: [
          "**Sort Visions** — révèle désormais le détail du score (par catégorie) de chaque adversaire dont un héros ou une ville est à portée, pour le tour en cours ; le brouillard de guerre le re-masque au tour suivant.",
          "**Triche Mana infini** — donne aussi tous les sorts au héros sélectionné (grimoire complet, en aventure comme en combat).",
          "**Aperçu /dev/combat** — affiche désormais les machines de guerre (baliste, tente de premiers secours, charrette de munitions, et catapulte en siège), placées derrière les créatures.",
        ],
      },
      {
        category: "changed",
        items: [
          "Reformulation du libellé « Détail masqué » du panneau de score (suppression de la mention trompeuse au brouillard de guerre).",
          "Boutons du Graal (creuser / carte au trésor) déplacés dans l'onglet compétences et la barre d'onglets du héros.",
          "**Fortifications de siège** — déterminées par les bâtiments de la ville (Fort = remparts, Citadelle = +1 tour de tir, Château = 3 tours) au lieu du niveau du centre-ville.",
          "**Tente de premiers secours (combat)** — soins conformes aux règles de référence : montant aléatoire selon Premiers Secours (1-25 / 40-50 / 60-75 / 80-100), soin de n'importe quelle pile alliée sans contrainte d'adjacence, créatures uniquement, ciblage manuel à partir de la compétence.",
          "Badges d'état (chance/moral) recentrés au-dessus de la tête de l'unité.",
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-06-02",
    summary:
      "Première version stable. Le jeu est jouable de bout en bout : création de partie, exploration, économie, combats et fin de partie.",
    sections: [
      {
        category: "added",
        items: [
          "**Carte d'aventure** — génération procédurale (bruit Simplex) avec 8 terrains, niveaux d'élévation, ressources, et bâtiments économiques/d'aventure.",
          "**Déplacement & exploration** — pathfinding A* sur grille carrée (8 directions, coûts conscients des routes, blocage diagonal strict), fog of war persistant.",
          "**Économie** — villes, mines/scieries/etc., revenu par tour, recrutement d'unités, construction de bâtiments.",
          "**Héros** — niveaux, statistiques, compétences, artefacts, transfert d'armée.",
          "**Combat** — résolution automatique et combat tactique manuel sur grille hexagonale (file d'initiative par vitesse, déplacement, tir, défense, sorts).",
          "**Adversaires IA** — stratégie complète : personnalités, mémoire, postures, rôles, économie, recrutement, et tactique de combat avec sorts.",
          "**Multijoueur** — lobby, parties à plusieurs via Supabase Realtime, rejoindre un combat en renfort.",
          "**Fin de partie** — conditions de victoire sélectionnables à la création (Domination, Accumulation d'or, Limite de tours, Capture d'une ville cible), toujours doublées de la domination en filet de sécurité ; gestion du match nul, bandeau de fin de partie, score et leaderboard inter-parties.",
          "**Abandon** — un joueur peut déclarer forfait en cours de partie, libérant ses mines et déclenchant la résolution de victoire.",
          "**Authentification** — comptes email/mot de passe gérés par Supabase.",
          "**Rendu** — moteur isométrique Phaser 4 (terrain, héros animés, brouillard, routes, décor) et interface (HUD, écran de ville, écran de combat) en français.",
          "**Déploiement** — image Docker mono-conteneur pour héberger le frontend.",
        ],
      },
    ],
  },
];
