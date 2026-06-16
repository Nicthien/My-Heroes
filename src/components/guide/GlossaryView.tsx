import { GuideSection, GuideTable, Lead } from "./guidePrimitives";

const TERMS: Array<{ term: string; def: string }> = [
  { term: "PM (points de mouvement)", def: "Réserve de déplacement quotidienne d’un héros sur la carte. Se recharge chaque jour." },
  { term: "Pile", def: "Un groupe d’unités identiques occupant un emplacement d’armée (ex. « 42 piquiers »)." },
  { term: "Palier (tier)", def: "Rang de puissance d’une créature au sein de sa faction, de 1 (basique) à 7 (élite)." },
  { term: "Croissance", def: "Nombre de nouvelles créatures produites chaque semaine par un habitat." },
  { term: "Habitat", def: "Bâtiment de ville qui débloque le recrutement d’un palier de créatures." },
  { term: "Garnison", def: "Troupes stationnées pour défendre une ville, distinctes de l’armée d’un héros de passage." },
  { term: "Gardien", def: "Armée neutre protégeant une mine, une banque ou un trésor. Doit être vaincue pour s’en emparer." },
  { term: "Riposte", def: "Contre-attaque d’une pile après avoir été frappée au corps-à-corps (en général une fois par round)." },
  { term: "Moral", def: "Jauge (−3 à +3) pouvant offrir un tour bonus (positif) ou faire sauter un tour (négatif)." },
  { term: "Chance", def: "Jauge (−3 à +3) pouvant doubler les dégâts d’une attaque (positif)." },
  { term: "Auto-résolution", def: "Résolution automatique d’un combat par comparaison de puissance, sans jouer la grille." },
  { term: "Brouillard de guerre", def: "Zones non visibles de la carte : noires si jamais explorées, grisées si vues auparavant." },
  { term: "Terrain natif", def: "Terrain de prédilection d’une faction ; une armée 100 % native en ignore la pénalité de déplacement." },
  { term: "Mana", def: "Points de magie d’un héros, dépensés pour lancer des sorts. Augmentés par la Connaissance." },
  { term: "Fortifications", def: "Fort → Citadelle → Château : défendent la ville et augmentent la croissance des habitats." },
  { term: "Graal", def: "Objet enterré à déterrer ; livré en ville, il érige un bâtiment ultime très puissant." },
  { term: "Banque de créatures", def: "Site gardé par une armée fixe et puissante, protégeant un gros butin." },
];

export function GlossaryView() {
  return (
    <GuideSection id="glossary" title="Glossaire" icon="📚">
      <Lead>Les termes clés du jeu, expliqués simplement.</Lead>
      <GuideTable
        headers={["Terme", "Définition"]}
        rows={TERMS.map((t) => [
          <span key="t" className="font-semibold text-amber-100">{t.term}</span>,
          <span key="d" className="text-sm text-amber-100/85">{t.def}</span>,
        ])}
      />
    </GuideSection>
  );
}
