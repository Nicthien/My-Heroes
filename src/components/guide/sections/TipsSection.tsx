"use client";

import { Callout, GuideSection, Lead, SubBlock } from "../guidePrimitives";

export function TipsSection() {
  return (
    <GuideSection id="tips" title="Conseils & erreurs à éviter" icon="🏆">
      <Lead>
        De quoi transformer vos premières parties hésitantes en victoires. À garder en tête à chaque tour.
      </Lead>

      <SubBlock title="Les 7 règles d’or du débutant">
        <Callout kind="do" title="À faire">
          <ol className="ml-4 list-decimal space-y-1.5">
            <li><strong>Construisez l’or d’abord.</strong> La chaîne de l’Hôtel de ville est votre priorité absolue au tour 1.</li>
            <li><strong>Recrutez chaque semaine.</strong> Repassez par vos villes ; ne laissez pas les recrues s’accumuler.</li>
            <li><strong>Concentrez votre armée</strong> sur un héros principal plutôt que de la disperser.</li>
            <li><strong>Capturez les mines tôt</strong>, surtout les mines d’or — l’économie décide la partie.</li>
            <li><strong>Explorez activement</strong> : vision, trésors et repérage des rivaux.</li>
            <li><strong>Fortifiez</strong> vos villes : elles défendent <em>et</em> font grossir l’armée.</li>
            <li><strong>Comparez les forces</strong> avant chaque combat ; renforcez-vous si c’est risqué.</li>
          </ol>
        </Callout>
      </SubBlock>

      <SubBlock title="Les pièges classiques">
        <Callout kind="dont" title="À éviter">
          <ul className="ml-4 list-disc space-y-1.5">
            <li>Finir le tour avec un <strong>gros tas d’or non dépensé</strong>.</li>
            <li>Envoyer un héros explorer <strong>sans armée</strong>.</li>
            <li>Attaquer un gardien <strong>nettement plus fort</strong> que vous « pour tenter ».</li>
            <li>Laisser un héros chargé <strong>seul et exposé</strong> près d’un rival.</li>
            <li>Oublier de <strong>fortifier</strong> une ville frontière menacée.</li>
            <li>Sacrifier des <strong>unités d’élite</strong> dans un combat évitable.</li>
          </ul>
        </Callout>
      </SubBlock>

      <Callout kind="tip" title="La mentalité gagnante">
        L’économie alimente l’armée, l’armée prend le territoire, le territoire renforce l’économie.
        Chaque tour, demandez-vous : <em>« Est-ce que je fais grossir au moins une de ces trois choses ? »</em>
      </Callout>

      <Callout kind="info" title="Et après ?">
        Une fois ces bases acquises, explorez les systèmes plus fins : compétences et sorts des héros,
        artefacts, terrains natifs, ralliement de villes étrangères. Bon jeu, héros !
      </Callout>
    </GuideSection>
  );
}
