"use client";

import { Callout, GuideSection, Lead, SubBlock } from "../guidePrimitives";

export function ArmySection() {
  return (
    <GuideSection id="army" title="Armées & recrutement" icon="⚔️">
      <Lead>
        Une armée est composée de <strong>piles</strong> de créatures (jusqu’à 7 emplacements par
        héros). Chaque pile regroupe des unités identiques : « 42 piquiers » occupe un seul emplacement.
        Plus une pile est nombreuse, plus elle frappe fort et encaisse.
      </Lead>

      <SubBlock title="Les 7 paliers">
        <p>
          Chaque faction possède <strong>7 paliers</strong> de créatures, du plus faible (palier 1,
          nombreux et bon marché) au plus puissant (palier 7, rare et cher). Vous débloquez un palier
          en construisant l’habitat correspondant dans une ville.
        </p>
      </SubBlock>

      <SubBlock title="Croissance hebdomadaire">
        <p>
          Chaque habitat produit un nombre fixe de nouvelles créatures <strong>au début de chaque
          semaine</strong> (tous les 7 jours). Ces recrues s’accumulent dans la ville jusqu’à ce que
          vous les achetiez. Les fortifications (Citadelle, Château) et le Graal{" "}
          <strong>augmentent cette croissance</strong>.
        </p>
      </SubBlock>

      <SubBlock title="Versions améliorées">
        <p>
          La plupart des créatures ont une <strong>version améliorée</strong> (ex. Piquier →
          Hallebardier) plus solide, débloquée par l’habitat amélioré. Les deux variantes ont leur
          propre file de recrutement.
        </p>
      </SubBlock>

      <SubBlock title="Machines de guerre">
        <p>
          En plus des créatures, un héros peut emmener des <strong>machines de guerre</strong> :
          baliste (tir auto), tente de premiers secours (soigne), chariot de munitions (recharge les
          tireurs) et catapulte (détruit les murs en siège).
        </p>
      </SubBlock>

      <Callout kind="do" title="Concentrez votre puissance">
        Une <strong>grosse armée sur un seul héros</strong> bat presque toujours deux armées moyennes
        séparées. Évitez d’éparpiller vos meilleures troupes sur plusieurs héros faibles.
      </Callout>

      <Callout kind="tip" title="Recrutez chaque semaine">
        Repassez par vos villes en début de semaine pour ramasser la nouvelle fournée. Des recrues qui
        s’accumulent sans être achetées, c’est de la croissance gaspillée.
      </Callout>

      <Callout kind="dont" title="Ne mélangez pas n’importe quoi">
        Mélanger des créatures d’alignements opposés (anges et démons, p. ex.) peut nuire au moral de
        votre armée. Restez cohérent avec votre faction quand c’est possible.
      </Callout>
    </GuideSection>
  );
}
