import { Callout, GuideSection, GuideTable, Lead, SubBlock } from "./guidePrimitives";

/** Advanced combat mechanics: morale, luck, retaliation and sieges. */
export function AdvancedCombatView() {
  return (
    <>
      <GuideSection id="morale-luck" title="Moral & Chance" icon="🎲">
        <Lead>
          Deux jauges secondaires pimentent chaque combat. Elles vont de <strong>−3 à +3</strong> et se
          déclenchent aléatoirement, au début de l’action d’une pile.
        </Lead>

        <SubBlock title="Le Moral">
          <p>
            Un <strong>moral positif</strong> peut offrir un <strong>tour d’action bonus</strong>{" "}
            (~4 % de chance par point). Un <strong>moral négatif</strong> peut au contraire faire{" "}
            <strong>sauter le tour</strong> de la pile (~8 % par point — deux fois plus risqué). Le moral
            dépend surtout de la <strong>composition de l’armée</strong> :
          </p>
          <GuideTable
            headers={["Composition de l’armée", "Moral"]}
            align={["left", "center"]}
            rows={[
              ["Une seule faction", "+1"],
              ["Deux factions", "0"],
              ["Trois factions", "−1"],
              ["Quatre factions ou plus", "−2"],
              ["Mélange de morts-vivants et de vivants", "−1 supplémentaire"],
            ]}
          />
          <p className="text-sm text-amber-200/75">
            Les <strong>morts-vivants</strong> sont insensibles au moral (toujours 0). Combattre sur son{" "}
            <strong>terrain natif</strong> donne +1. La compétence <strong>Commandement</strong> du héros
            augmente le moral de toutes ses troupes.
          </p>
        </SubBlock>

        <SubBlock title="La Chance">
          <p>
            Une <strong>chance positive</strong> peut <strong>doubler les dégâts</strong> d’une attaque
            (~4 % de chance par point). La compétence <strong>Chance</strong> et certains artefacts
            l’augmentent. Une chance négative n’inflige jamais de dégâts réduits — elle annule seulement
            les coups de chance.
          </p>
        </SubBlock>

        <Callout kind="tip" title="Restez mono-faction quand c’est possible">
          Une armée d’une seule faction démarre à +1 de moral : des tours bonus gratuits tout au long du
          combat. Diluer son armée avec 3-4 factions différentes, c’est s’exposer à des tours sautés.
        </Callout>
      </GuideSection>

      <GuideSection id="retaliation" title="La riposte" icon="↩️">
        <Lead>
          Quand une pile en attaque une autre au <strong>corps-à-corps</strong>, la cible{" "}
          <strong>riposte</strong> une fois si elle survit — d’où l’importance de frapper fort et en
          premier.
        </Lead>
        <ul className="ml-5 list-disc space-y-1 text-amber-100/90">
          <li>Chaque pile ne riposte en général qu’<strong>une fois par round</strong>.</li>
          <li>Les <strong>tireurs</strong> qui tirent à distance ne subissent <strong>pas</strong> de riposte.</li>
          <li>Attaquer une pile qui a <strong>déjà riposté</strong> ce round-ci est sans danger.</li>
        </ul>
        <p className="text-sm text-amber-200/75">
          Certaines créatures changent la règle, selon leurs capacités : <strong>Pas de riposte</strong>{" "}
          (leur attaque ne déclenche aucune contre-attaque), <strong>Ripostes multiples</strong> (elles
          ripostent plusieurs fois par round) ou <strong>Double attaque</strong> (elles frappent deux fois
          d’affilée). Le sort <em>Aveuglement</em> empêche aussi de riposter, et <em>Contre-attaque</em>{" "}
          ajoute des ripostes.
        </p>
        <Callout kind="do" title="Provoquez la riposte avec vos unités sacrifiables">
          Faites « griller » la riposte d’un gros monstre avec une pile bon marché, puis frappez avec
          votre élite sans craindre le retour.
        </Callout>
      </GuideSection>

      <GuideSection id="sieges" title="Les sièges" icon="🏯">
        <Lead>
          Attaquer une ville fortifiée se joue derrière ses <strong>remparts</strong>. La défense est
          avantagée : à vous de percer les murs.
        </Lead>
        <ul className="ml-5 list-disc space-y-1 text-amber-100/90">
          <li><strong>Murs & porte</strong> — bloquent le passage ; la <strong>catapulte</strong> de l’assaillant les détruit tour après tour.</li>
          <li><strong>Tours de défense</strong> — tirent automatiquement sur les assaillants à chaque tour.</li>
          <li><strong>Douves</strong> — infligent des dégâts (≈25) et un malus de défense (−3) aux unités qui s’y arrêtent.</li>
          <li><strong>Unités volantes</strong> — ignorent les murs et franchissent les remparts directement.</li>
        </ul>
        <Callout kind="warn" title="Préparez le siège">
          Sans catapulte ni unités volantes ni tireurs, un assaut sur une ville bien défendue tourne vite
          au désastre. Amenez de quoi répondre aux tours et aux murs.
        </Callout>
      </GuideSection>
    </>
  );
}
