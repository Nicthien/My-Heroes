"use client";

import { Callout, CostInline, GuideSection, GuideTable, Lead, SubBlock } from "../guidePrimitives";
import { CORE_BUILDINGS, DWELLING_BUILDINGS } from "../guideData";

export function TownSection() {
  return (
    <GuideSection id="town" title="La ville & les bâtiments" icon="🏰">
      <Lead>
        Votre ville est le cœur de votre empire : elle produit de l’or, débloque le recrutement et
        vous protège. <strong>Vous ne pouvez construire qu’un bâtiment par jour et par ville</strong> —
        chaque choix compte, alors planifiez.
      </Lead>

      <SubBlock title="Ordre de construction conseillé">
        <p>
          Une ouverture sûre pour la plupart des factions :
        </p>
        <ol className="ml-5 list-decimal space-y-1 text-amber-100/90">
          <li>Chaîne de l’<strong>Hôtel de ville</strong> (le revenu d’or avant tout).</li>
          <li><strong>Caserne</strong>, puis <strong>Habitat palier 1</strong> et <strong>palier 2</strong>.</li>
          <li>Montez les <strong>fortifications</strong> (Fort → Citadelle → Château) si une attaque menace, car elles défendent <em>et</em> augmentent la croissance.</li>
          <li>Puis les <strong>habitats supérieurs</strong> au fur et à mesure que l’économie suit.</li>
        </ol>
      </SubBlock>

      <SubBlock title="Bâtiments de base">
        <GuideTable
          headers={["Bâtiment", "Coût", "Effet"]}
          rows={CORE_BUILDINGS.map((b) => [
            <span key="l" className="font-bold text-amber-100">{b.label}</span>,
            <CostInline key="c" cost={b.cost} />,
            <span key="d" className="text-sm">{b.description}</span>,
          ])}
        />
      </SubBlock>

      <SubBlock title="Habitats (recrutement par palier)">
        <p>
          Chaque habitat débloque un palier de créatures de votre faction (palier 1 = unités de base,
          palier 7 = élite). Chaque palier exige le précédent.
        </p>
        <GuideTable
          headers={["Habitat", "Coût"]}
          rows={DWELLING_BUILDINGS.map((b) => [
            <span key="l" className="font-bold text-amber-100">{b.label}</span>,
            <CostInline key="c" cost={b.cost} />,
          ])}
        />
      </SubBlock>

      <Callout kind="tip" title="Fortifications = plus de troupes">
        Le Fort, la Citadelle et le Château ne servent pas qu’à la défense : ils{" "}
        <strong>multiplient la croissance hebdomadaire</strong> de vos habitats (×1,5 puis ×2). Les
        construire tôt fait grossir votre armée chaque semaine.
      </Callout>

      <Callout kind="warn" title="Un seul bâtiment par jour">
        Inutile de garder de l’or « au cas où » : comme vous ne posez qu’un bâtiment par jour et par
        ville, dépensez le reste en troupes. De l’or qui dort, c’est de la puissance perdue.
      </Callout>
    </GuideSection>
  );
}
