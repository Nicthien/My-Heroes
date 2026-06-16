"use client";

import { Callout, GuideSection, GuideTable, Lead, SubBlock } from "../guidePrimitives";
import { TERRAIN_COSTS } from "../guideData";

export function AdventureSection() {
  return (
    <GuideSection id="adventure" title="La carte d’aventure" icon="🗺️">
      <Lead>
        La carte est une grille où vos héros se déplacent dans <strong>8 directions</strong>. Chaque
        case a un coût en points de mouvement selon son terrain. Bien lire la carte, c’est gagner du
        temps et des ressources.
      </Lead>

      <SubBlock title="Coût des terrains et des routes">
        <p>
          Les <strong>routes</strong> remplacent le coût du terrain : se déplacer dessus est bien plus
          rapide. Un déplacement en <strong>diagonale</strong> coûte ~41 % de plus qu’en ligne droite.
        </p>
        <GuideTable
          headers={["Surface", "Coût (PM)", "Remarque"]}
          align={["left", "center", "left"]}
          rows={TERRAIN_COSTS.map((t) => [
            <span key="s" className="font-bold text-amber-100">{t.surface}</span>,
            <span key="c" className="tabular-nums">{t.cost}</span>,
            <span key="n" className="text-sm text-amber-100/75">{t.note ?? ""}</span>,
          ])}
        />
        <p className="text-sm text-amber-200/70">
          Certaines armées sont « natives » d’un terrain (ex. les souterrains pour le Royaume
          Sous-Roche) et en ignorent la pénalité.
        </p>
      </SubBlock>

      <SubBlock title="Ce qu’on trouve sur la carte">
        <ul className="ml-5 list-disc space-y-1 text-amber-100/90">
          <li><strong>Mines & bâtiments de récolte</strong> — capturez-les pour un revenu quotidien.</li>
          <li><strong>Ressources & coffres</strong> — ramassez-les en passant dessus.</li>
          <li><strong>Monstres neutres</strong> — gardent souvent un trésor ou un lieu ; ils peuvent lâcher ressources et artefacts.</li>
          <li><strong>Villes neutres</strong> — capturables ; une ville étrangère peut être ralliée à votre faction contre de l’or.</li>
          <li><strong>Bâtiments d’aventure</strong> — observatoires, feux de camp, phares… récompensent l’exploration (vision, bonus, or).</li>
        </ul>
      </SubBlock>

      <Callout kind="do" title="Empruntez les routes">
        Les routes coûtent 2 à 5 fois moins de PM que le terrain brut. Pour couvrir de longues distances,
        suivez le réseau routier — il relie souvent vos villes aux mines.
      </Callout>

      <Callout kind="warn" title="Les gardiens se renforcent avec le temps">
        Les monstres neutres deviennent plus coûteux à battre au fil des semaines. Sécurisez les mines
        proches <strong>tôt</strong>, tant que leurs gardiens sont abordables.
      </Callout>
    </GuideSection>
  );
}
