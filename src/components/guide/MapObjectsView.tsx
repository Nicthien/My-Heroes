"use client";

import { Callout, CostInline, GuideSection, GuideTable, Lead, Sprite } from "./guidePrimitives";
import { ADVENTURE_BUILDING_ROWS, RESOURCE_BUILDING_ROWS } from "./guideData";

export function MapObjectsView() {
  return (
    <>
      <GuideSection id="resource-buildings" title="Bâtiments de récolte" icon="⛏️">
        <Lead>
          Capturés sur la carte, ces bâtiments produisent une ressource <strong>chaque jour</strong>{" "}
          tant que vous les contrôlez. Un gardien les protège : plus la ressource est précieuse, plus il
          est coriace.
        </Lead>
        <GuideTable
          headers={["", "Bâtiment", "Production / jour", "Gardien (base)"]}
          align={["center", "left", "left", "center"]}
          rows={RESOURCE_BUILDING_ROWS.map((b) => [
            <Sprite key="i" src={b.sprite} alt={b.label} size={34} fallback="⛏️" />,
            <span key="l" className="font-semibold text-amber-100">{b.label}</span>,
            <CostInline key="p" cost={b.production} />,
            <span key="g" className="tabular-nums text-amber-100/80">{b.guardian}</span>,
          ])}
        />
        <Callout kind="tip" title="Priorité aux mines d’or">
          La mine d’or rapporte 1000 d’or/jour — bien plus utile en début de partie que n’importe quelle
          ressource rare. Sécurisez-la dès qu’un gardien abordable la protège.
        </Callout>
      </GuideSection>

      <GuideSection id="adventure-buildings" title="Bâtiments d’aventure" icon="🏛️">
        <Lead>
          Disséminés sur la carte, ils récompensent l’exploration : bonus permanents, vision, ressources,
          téléportation, recrutement… Beaucoup ne s’utilisent qu’une fois par héros ou par partie.
        </Lead>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ADVENTURE_BUILDING_ROWS.map((b) => (
            <div key={b.type} className="flex gap-3 rounded-lg border border-amber-800/40 bg-stone-950/50 p-3">
              <Sprite src={b.sprite} alt={b.label} size={44} fallback="🏛️" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-amber-100">{b.label}</div>
                <p className="text-xs text-amber-100/70">{b.description}</p>
              </div>
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection id="map-other" title="Autres objets de la carte" icon="🗝️">
        <ul className="ml-5 list-disc space-y-1.5 text-amber-100/90">
          <li><strong>Demeures externes</strong> — habitats indépendants des villes ; capturez-les pour recruter des créatures directement sur la carte.</li>
          <li><strong>Monstres neutres errants</strong> — gardent passages et trésors ; les vaincre rapporte ressources et parfois un artefact mineur.</li>
          <li><strong>Tas de ressources & coffres</strong> — ramassés en passant dessus.</li>
          <li><strong>Villes neutres</strong> — capturables ; une ville d’une autre faction peut être ralliée à la vôtre contre de l’or.</li>
        </ul>
        <Callout kind="warn" title="Les gardiens se renforcent chaque semaine">
          La force des monstres neutres augmente avec le temps. Plus vous attendez, plus il est coûteux
          de débloquer une mine ou un trésor gardé.
        </Callout>
      </GuideSection>
    </>
  );
}
