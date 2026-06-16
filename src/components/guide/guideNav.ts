/** Sidebar navigation structure for the multi-page guide (`/guide/*`). */

export interface GuideNavItem {
  href: string;
  label: string;
  icon: string;
}

export interface GuideNavGroup {
  title: string;
  items: GuideNavItem[];
}

export const GUIDE_NAV: GuideNavGroup[] = [
  {
    title: "Pour débuter",
    items: [
      { href: "/guide", label: "Accueil", icon: "📖" },
      { href: "/guide/debuter", label: "Premiers pas", icon: "🚀" },
    ],
  },
  {
    title: "Jouer",
    items: [
      { href: "/guide/ressources", label: "Ressources", icon: "💰" },
      { href: "/guide/villes", label: "Villes & bâtiments", icon: "🏰" },
      { href: "/guide/heros", label: "Héros", icon: "🦸" },
      { href: "/guide/combat", label: "Combat", icon: "🎯" },
      { href: "/guide/carte", label: "Carte & objets", icon: "🗺️" },
    ],
  },
  {
    title: "Encyclopédie",
    items: [
      { href: "/guide/factions", label: "Factions", icon: "🛡️" },
      { href: "/guide/creatures", label: "Créatures", icon: "🐉" },
      { href: "/guide/artefacts", label: "Artefacts", icon: "💎" },
      { href: "/guide/competences", label: "Compétences", icon: "🎓" },
      { href: "/guide/sorts", label: "Sorts", icon: "✨" },
    ],
  },
  {
    title: "Aller plus loin",
    items: [
      { href: "/guide/mecaniques", label: "Mécaniques de partie", icon: "👑" },
      { href: "/guide/glossaire", label: "Glossaire", icon: "📚" },
      { href: "/guide/recherche", label: "Rechercher", icon: "🔎" },
    ],
  },
];

/** Whether a nav item should be highlighted for the current pathname. */
export function isGuideNavActive(href: string, pathname: string): boolean {
  if (href === "/guide") return pathname === "/guide";
  return pathname === href || pathname.startsWith(`${href}/`);
}
