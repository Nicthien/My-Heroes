"use client";

import { Callout, GuideSection, Lead, SubBlock } from "../guidePrimitives";

export function OverviewSection() {
  return (
    <GuideSection id="overview" title="Bienvenue, héros" icon="📖">
      <Lead>
        <strong>My Heroes</strong> est un jeu de stratégie au tour par tour. Vous explorez une carte
        fantastique, développez des villes, récoltez des ressources, recrutez une armée de créatures
        et menez vos héros à la bataille. L’objectif : devenir la puissance dominante de la carte.
      </Lead>

      <SubBlock title="La boucle de jeu, en une phrase">
        <p>
          Chaque tour, vous <strong>explorez</strong> avec vos héros, <strong>récoltez</strong> de
          l’or et des matériaux, <strong>construisez</strong> dans vos villes, <strong>recrutez</strong>{" "}
          des troupes, puis <strong>combattez</strong> les monstres neutres et vos rivaux. Quand vous
          avez tout fait, vous cliquez sur <em>« Terminer le tour »</em> et le jeu passe au joueur
          suivant.
        </p>
      </SubBlock>

      <SubBlock title="Le rythme : jours et semaines">
        <p>
          Le temps avance par <strong>jours</strong> (un jour = un tour pour tout le monde). Tous les{" "}
          <strong>7 jours</strong>, une nouvelle <strong>semaine</strong> commence : vos villes
          produisent leur lot hebdomadaire de nouvelles créatures à recruter. Pensez donc en semaines :
          « Que vais-je pouvoir recruter lundi prochain ? »
        </p>
      </SubBlock>

      <SubBlock title="Comment gagne-t-on ?">
        <p>La condition de victoire est choisie à la création de la partie. Les principales :</p>
        <ul className="ml-5 list-disc space-y-1 text-amber-100/90">
          <li><strong>Domination</strong> — soyez le dernier joueur à posséder un héros ou une ville.</li>
          <li><strong>Roi</strong> — protégez votre Roi ; s’il meurt, vous perdez. Tuez celui de l’adversaire.</li>
          <li><strong>Or</strong> — soyez le premier à accumuler le seuil d’or fixé.</li>
          <li><strong>Capture de ville</strong> — emparez-vous de la ville cible indiquée sur la carte.</li>
          <li><strong>Limite de tours</strong> — au dernier tour, le meilleur score l’emporte.</li>
        </ul>
      </SubBlock>

      <Callout kind="info" title="Ce guide en bref">
        Lisez <strong>« Premiers pas »</strong> pour savoir quoi faire dès le tour 1. Les autres
        sections détaillent chaque système (ressources, villes, héros, combat…) et se terminent par une
        liste de <strong>conseils et erreurs à éviter</strong>. Pas besoin de tout lire d’un coup —
        gardez ce guide ouvert dans un onglet pendant vos premières parties.
      </Callout>
    </GuideSection>
  );
}
