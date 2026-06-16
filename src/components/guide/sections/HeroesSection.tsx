"use client";

import { Callout, GuideSection, GuideTable, Lead, SubBlock } from "../guidePrimitives";
import { MOVEMENT_BY_SPEED } from "../guideData";

export function HeroesSection() {
  return (
    <GuideSection id="heroes" title="Les héros" icon="🦸">
      <Lead>
        Les héros sont vos chefs de guerre : ils transportent l’armée, explorent la carte, ramassent
        les trésors et mènent les combats. Sans héros sur le terrain, vous ne pouvez ni conquérir ni
        défendre activement.
      </Lead>

      <SubBlock title="Les statistiques d’un héros">
        <ul className="ml-5 list-disc space-y-1 text-amber-100/90">
          <li><strong>Attaque</strong> — augmente les dégâts infligés par toutes ses créatures.</li>
          <li><strong>Défense</strong> — réduit les dégâts subis par toutes ses créatures.</li>
          <li><strong>Pouvoir magique</strong> — renforce l’effet de ses sorts.</li>
          <li><strong>Connaissance</strong> — augmente sa réserve de points de magie.</li>
        </ul>
        <p>Le héros monte en niveau après les combats et améliore ces statistiques au fil du temps.</p>
      </SubBlock>

      <SubBlock title="Déplacement (points de mouvement)">
        <p>
          Chaque jour, un héros dispose de <strong>points de mouvement (PM)</strong>. Se déplacer coûte
          des PM selon le terrain (voir « Carte d’aventure »). La réserve quotidienne dépend de la{" "}
          <strong>créature la plus lente</strong> de son armée : une armée rapide va plus loin.
        </p>
        <GuideTable
          headers={["Vitesse de l’unité la plus lente", "PM par jour"]}
          align={["center", "center"]}
          rows={MOVEMENT_BY_SPEED.map((m) => [m.speed, m.pm.toLocaleString("fr-FR")])}
        />
        <p className="text-sm text-amber-200/70">
          Une armée vide se déplace à 2000 PM/jour.
        </p>
      </SubBlock>

      <SubBlock title="Vision">
        <p>
          Héros et villes éclairent une zone de <strong>5 cases</strong> autour d’eux. Les cases déjà
          vues restent connues (mais figées dans le brouillard) ; les cases jamais explorées restent
          dans le noir total.
        </p>
      </SubBlock>

      <Callout kind="tip" title="Découpez vos déplacements">
        Bougez d’abord vos héros, ramassez ressources et coffres, <em>puis</em> construisez et recrutez :
        ce que vous trouvez en chemin (or, bois) peut changer ce que vous pouvez vous offrir ce tour-ci.
      </Callout>

      <Callout kind="dont" title="Ne laissez pas un héros isolé">
        Un héros chargé d’armée et de trésors, seul près d’un rival, est une cible de choix. Gardez une
        ligne de retraite vers une ville fortifiée.
      </Callout>
    </GuideSection>
  );
}
