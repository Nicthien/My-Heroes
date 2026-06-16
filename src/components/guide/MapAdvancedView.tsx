import { Callout, GuideSection, GuideTable, Lead } from "./guidePrimitives";
import { CREATURE_BANK_ROWS } from "./guideData";

/** Advanced map systems: creature banks, map levels, navigation, native terrain. */
export function MapAdvancedView() {
  return (
    <>
      <GuideSection id="creature-banks" title="Banques de créatures" icon="🏴‍☠️">
        <Lead>
          Les banques sont des sites gardés par une armée <strong>puissante et fixe</strong>, qui
          protègent un <strong>gros butin</strong> (or, ressources, artefacts, créatures, expérience).
          Risquées mais très rentables — réservez-les à une armée solide.
        </Lead>
        <GuideTable
          headers={["Banque", "Description", "Gardiens", "Butin"]}
          align={["left", "left", "center", "left"]}
          rows={CREATURE_BANK_ROWS.map((b) => [
            <span key="l" className="font-semibold text-amber-100">{b.label}</span>,
            <span key="d" className="text-sm text-amber-100/75">{b.description}</span>,
            <span key="g" className="whitespace-nowrap tabular-nums text-amber-100/85">
              {b.guardMin.toLocaleString("fr-FR")}–{b.guardMax.toLocaleString("fr-FR")}
            </span>,
            <span key="r" className="text-xs text-emerald-200/80">{b.rewards}</span>,
          ])}
        />
        <Callout kind="warn" title="Estimez la garde avant de foncer">
          La colonne « Gardiens » indique la puissance des défenseurs selon la variante (de la plus
          faible à la plus forte). Le butin augmente avec la difficulté.
        </Callout>
      </GuideSection>

      <GuideSection id="underground" title="Souterrain & niveaux de carte" icon="🕳️">
        <Lead>
          Le monde possède deux étages : la <strong>surface</strong> et le <strong>souterrain</strong>.
          On passe de l’un à l’autre par les <strong>entrées souterraines</strong> (deux entrées liées se
          répondent).
        </Lead>
        <ul className="ml-5 list-disc space-y-1 text-amber-100/90">
          <li>Le souterrain cache souvent mines, banques et raccourcis stratégiques.</li>
          <li>Les <strong>portails stellaires</strong> téléportent un héros d’un portail à son jumeau, même très loin.</li>
          <li>La vision et le brouillard de guerre sont gérés séparément par étage.</li>
        </ul>
      </GuideSection>

      <GuideSection id="navigation" title="Navigation" icon="⛵">
        <Lead>
          L’eau est infranchissable à pied : il faut un <strong>bateau</strong>. Construisez un{" "}
          <strong>chantier naval</strong> dans une ville côtière (ou trouvez un bateau sur la carte),
          puis embarquez votre héros.
        </Lead>
        <ul className="ml-5 list-disc space-y-1 text-amber-100/90">
          <li>Un héros <strong>embarque</strong> en entrant sur un bateau et <strong>débarque</strong> sur une côte libre.</li>
          <li>Le déplacement maritime consomme des points de mouvement comme sur terre.</li>
          <li>Chaque faction possède son propre modèle de bateau.</li>
        </ul>
      </GuideSection>

      <GuideSection id="native-terrain" title="Terrains natifs" icon="🌍">
        <Lead>
          Chaque faction a un <strong>terrain de prédilection</strong>. Quand <strong>toutes</strong> les
          créatures d’une armée y sont natives, la pénalité de déplacement de ce terrain est{" "}
          <strong>annulée</strong> (coût ramené à la base) — et le moral y gagne +1 en combat.
        </Lead>
        <Callout kind="tip" title="Jouez sur votre terrain">
          Une armée homogène se déplace plus vite et combat mieux sur son terrain natif. C’est un
          avantage défensif naturel autour de vos villes.
        </Callout>
      </GuideSection>
    </>
  );
}
