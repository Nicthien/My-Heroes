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
    version: "1.2.9",
    date: "2026-06-16",
    summary: "Raccourcis clavier configurables et menu d'options réorganisé en onglets.",
    sections: [
      {
        category: "added",
        items: [
          "**Raccourcis clavier** — la carte d'aventure se contrôle désormais au clavier : déplacement de la caméra (ZQSD/WASD et flèches), Espace pour centrer sur le héros ou le château sélectionné, 1 et 2 pour passer au héros / château suivant, Entrée pour terminer le tour, + / − pour zoomer et Échap pour ouvrir le menu.",
          "**Disposition FR/EN et touches personnalisables** — un nouvel onglet des options permet de choisir la disposition du clavier (AZERTY / QWERTY) et de réassigner chaque touche, avec un bouton de réinitialisation. Les raccourcis sont reconnus par leur position physique, donc une même configuration fonctionne sur les deux dispositions.",
        ],
      },
      {
        category: "changed",
        items: [
          "**Menu d'options en onglets** — les réglages sont répartis en trois onglets (Son, Graphismes, Clavier) avec un contenu défilant.",
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
