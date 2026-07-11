"use client";

import { Callout, GuideSection, GuideTable, Lead, SubBlock } from "../guidePrimitives";
import { COMBAT_ACTIONS } from "../guideData";

export function CombatSection() {
  return (
    <GuideSection id="combat" title="Le combat" icon="🎯">
      <Lead>
        Quand deux armées se rencontrent, le combat se joue sur une <strong>grille hexagonale</strong>{" "}
        (13 colonnes × 10 rangées, étendue jusqu’à 20 pour les très grandes batailles). Vos piles à
        gauche, l’ennemi à droite. Les unités agissent par ordre de{" "}
        <strong>vitesse décroissante</strong>, du plus rapide au plus lent, à chaque round.
      </Lead>

      <SubBlock title="Résolution rapide ou combat manuel">
        <p>
          Vous pouvez laisser le jeu <strong>résoudre automatiquement</strong> un combat (il le simule
          round par round, en quelques instants) ou prendre les commandes en <strong>combat manuel</strong>{" "}
          pour gagner des affrontements serrés grâce au placement et au choix des cibles.
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
          coup, et de l’écart <strong>attaque (attaquant) − défense (défenseur)</strong>. Concrètement :
        </p>
        <ul className="ml-5 list-disc space-y-1 text-amber-100/90">
          <li>Chaque point d’<strong>attaque au-dessus</strong> de la défense ennemie ajoute <strong>+5 %</strong> de dégâts (jusqu’à <strong>×4</strong>).</li>
          <li>Chaque point de <strong>défense au-dessus</strong> de votre attaque retire <strong>−2,5 %</strong> (jusqu’à <strong>×0,3</strong>).</li>
          <li>Les bonus d’<strong>attaque/défense du héros</strong> s’appliquent à toutes ses piles.</li>
          <li>Se <strong>défendre</strong> augmente la défense de <strong>+20 %</strong> pour le tour.</li>
        </ul>
      </SubBlock>

      <SubBlock title="Autres options en combat">
        <ul className="ml-5 list-disc space-y-1 text-amber-100/90">
          <li><strong>Tactique</strong> — repositionnez vos piles avant le premier round (avec la compétence Tactique).</li>
          <li><strong>Lancer un sort</strong> — depuis le livre de sorts du héros, contre du mana (voir la page Sorts).</li>
          <li><strong>Fuir</strong> — le héros quitte le combat, mais l’armée laissée derrière est perdue.</li>
          <li><strong>Se rendre</strong> — négociez la fin du combat en payant de l’or pour conserver votre armée.</li>
        </ul>
      </SubBlock>

      <Callout kind="tip" title="Tireurs : protégez-les, ciblez-les">
        Les unités à distance font énormément de dégâts <strong>sans riposte</strong>… mais frappent
        beaucoup plus faiblement au corps-à-corps. Gardez vos tireurs à l’abri, et foncez sur ceux de
        l’ennemi en priorité.
      </Callout>

      <Callout kind="do" title="Évaluez avant de frapper">
        Avant d’attaquer un monstre neutre ou un rival, comparez les forces. Le jeu vous donne une
        estimation : si elle est <em>« écrasante »</em> en votre faveur, foncez ; si elle est{" "}
        <em>« périlleuse »</em>, renforcez-vous d’abord.
      </Callout>

      <Callout kind="dont" title="Ne gaspillez pas votre élite">
        Perdre une pile de palier 7 dans un combat évitable peut vous coûter la partie. Faites le
        travail sale avec vos unités nombreuses et bon marché quand c’est possible.
      </Callout>
    </GuideSection>
  );
}
