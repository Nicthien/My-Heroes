"use client";

import { Callout, GuideSection, Lead, SubBlock, translateGuideNode } from "../guidePrimitives";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { guideText } from "../guideI18n";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const { locale } = useI18n();
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-amber-400/60 bg-amber-900/40 text-sm font-black text-amber-200">
        {n}
      </span>
      <div className="space-y-1 pt-0.5">
        <div className="font-bold text-amber-200">{guideText(locale, title)}</div>
        <div className="text-sm text-amber-100/85">{translateGuideNode(locale, children)}</div>
      </div>
    </li>
  );
}

export function FirstStepsSection() {
  return (
    <GuideSection id="first-steps" title="Vos premiers pas" icon="🚀">
      <Lead>
        Vous démarrez avec <strong>une ville</strong> et <strong>un héros</strong> posté à côté.
        Voici un déroulé fiable pour vos premiers tours, sans vous tromper.
      </Lead>

      <SubBlock title="Le tout premier tour">
        <ol className="space-y-3">
          <Step n={1} title="Construisez dans votre ville">
            Cliquez sur votre ville, onglet <em>Construire</em>. Montez la chaîne de l’<strong>Hôtel de ville</strong>{" "}
            (revenu d’or), puis <strong>Caserne</strong> → <strong>Habitat palier 1</strong> pour pouvoir recruter.
          </Step>
          <Step n={2} title="Recrutez vos premières troupes">
            Onglet <em>Recruter</em> : prenez toutes les unités de palier 1 (et 2 si disponible). Une grosse
            pile d’unités faibles vaut mieux qu’aucune armée.
          </Step>
          <Step n={3} title="Transférez l’armée à votre héros">
            Donnez les troupes de la garnison à votre héros. Un héros sans armée ne peut rien attaquer.
          </Step>
          <Step n={4} title="Explorez avec votre héros">
            Cliquez sur une case visible pour tracer un chemin, re-cliquez pour confirmer le déplacement.
            Repérez les <strong>mines</strong>, le <strong>bois</strong> et les coffres autour de vous.
          </Step>
          <Step n={5} title="Capturez une mine peu gardée">
            Une <strong>scierie</strong> (bois) ou une <strong>mine d’or</strong> proche booste tout de suite
            votre économie. Vérifiez la force du gardien avant d’attaquer (voir « Le combat »).
          </Step>
          <Step n={6} title="Terminez le tour">
            Bouton <em>« Terminer le tour »</em>. Vos PM (points de mouvement) et vos revenus se rechargent
            au tour suivant.
          </Step>
        </ol>
      </SubBlock>

      <Callout kind="do" title="Les 3 priorités des 3 premiers jours">
        <ol className="ml-4 list-decimal space-y-1">
          <li>Du <strong>revenu</strong> : bâtiments d’or + une ou deux mines capturées.</li>
          <li>De l’<strong>armée</strong> : recrutez chaque semaine, ne laissez pas l’or dormir.</li>
          <li>De la <strong>vision</strong> : explorez pour trouver mines, trésors et la position des rivaux.</li>
        </ol>
      </Callout>

      <Callout kind="dont" title="Erreurs de débutant à éviter">
        <ul className="ml-4 list-disc space-y-1">
          <li>Partir explorer avec un héros <strong>sans troupes</strong>.</li>
          <li>Attaquer un gardien <strong>beaucoup plus fort</strong> que votre armée « pour voir ».</li>
          <li>Finir le tour avec une <strong>montagne d’or non dépensée</strong> et aucune unité recrutée.</li>
        </ul>
      </Callout>
    </GuideSection>
  );
}
