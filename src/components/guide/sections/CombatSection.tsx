"use client";

import { Callout, GuideSection, GuideTable, Lead, SubBlock } from "../guidePrimitives";
import { COMBAT_ACTIONS } from "../guideData";

export function CombatSection() {
  return (
    <GuideSection id="combat" title="Le combat" icon="🎯">
      <Lead>
        Quand deux armées se rencontrent, le combat se joue sur une <strong>grille hexagonale</strong>{" "}
        (13 × 9 cases). Vos piles à gauche, l’ennemi à droite. Les unités agissent par ordre de{" "}
        <strong>vitesse décroissante</strong>, du plus rapide au plus lent, à chaque round.
      </Lead>

      <SubBlock title="Résolution rapide ou combat manuel">
        <p>
          Vous pouvez laisser le jeu <strong>résoudre automatiquement</strong> un combat (comparaison
          de puissance, rapide) ou prendre les commandes en <strong>combat manuel</strong> pour gagner
          des affrontements serrés grâce au placement et au choix des cibles.
        </p>
      </SubBlock>

      <SubBlock title="Les actions d’une unité">
        <GuideTable
          headers={["", "Action", "Effet"]}
          align={["center", "left", "left"]}
          rows={COMBAT_ACTIONS.map((a) => [
            <span key="i" className="text-lg" aria-hidden="true">{a.icon}</span>,
            <span key="n" className="font-bold text-amber-100">{a.name}</span>,
            <span key="d" className="text-sm">{a.desc}</span>,
          ])}
        />
      </SubBlock>

      <SubBlock title="Comment sont calculés les dégâts ?">
        <p>
          Les dégâts dépendent du <strong>nombre d’unités</strong> dans la pile, de leurs dégâts par
          coup, et de l’écart <strong>attaque (attaquant) − défense (défenseur)</strong> : plus votre
          attaque dépasse la défense ennemie, plus vous frappez fort (et inversement). Les bonus
          d’attaque/défense de votre héros s’appliquent à toutes ses piles.
        </p>
      </SubBlock>

      <Callout kind="tip" title="Tireurs : protégez-les, ciblez-les">
        Les unités à distance font énormément de dégâts <strong>sans riposte</strong>… mais frappent
        beaucoup plus faiblement au corps-à-corps. Gardez vos tireurs à l’abri, et foncez sur ceux de
        l’ennemi en priorité.
      </Callout>

      <Callout kind="do" title="Évaluez avant de frapper">
        Avant d’attaquer un monstre neutre ou un rival, comparez les forces. Le jeu vous donne une
        estimation : si elle est <em>« écrasante »</em> en votre faveur, foncez ; si elle est
        <em>« périlleuse »</em>, renforcez-vous d’abord.
      </Callout>

      <Callout kind="dont" title="Ne gaspillez pas votre élite">
        Perdre une pile de palier 7 dans un combat évitable peut vous coûter la partie. Faites le
        travail sale avec vos unités nombreuses et bon marché quand c’est possible.
      </Callout>
    </GuideSection>
  );
}
