"use client";

import { Callout, Chip, GuideSection, GuideTable, Lead } from "../guidePrimitives";
import { Sprite } from "../guidePrimitives";
import { RESOURCE_INFO } from "../guideData";

const KIND_COLOR: Record<string, string> = {
  Précieux: "#fbbf24",
  Commune: "#a3a3a3",
  Rare: "#a78bfa",
};

export function ResourcesSection() {
  return (
    <GuideSection id="resources" title="Les ressources" icon="💰">
      <Lead>
        Sept ressources alimentent votre royaume. L’<strong>or</strong> sert à tout ; le{" "}
        <strong>bois</strong> et le <strong>minerai</strong> sont les matériaux courants ; les quatre
        ressources rares (mercure, cristaux, gemmes, soufre) débloquent la magie et les créatures d’élite.
      </Lead>

      <GuideTable
        headers={["", "Ressource", "Type", "À quoi ça sert"]}
        align={["center", "left", "center", "left"]}
        rows={RESOURCE_INFO.map((r) => [
          <Sprite key="i" src={r.sprite} alt={r.label} size={32} className="!border-0 !bg-transparent !shadow-none" />,
          <span key="l" className="font-bold text-amber-100">{r.label}</span>,
          <Chip key="k" color={KIND_COLOR[r.kind]}>{r.kind}</Chip>,
          <span key="u">{r.usage}</span>,
        ])}
      />

      <Callout kind="info" title="Où trouver des ressources ?">
        <ul className="ml-4 list-disc space-y-1">
          <li><strong>Vos villes</strong> produisent de l’or chaque jour (via l’Hôtel de ville).</li>
          <li>Les <strong>mines et bâtiments de récolte</strong> capturés sur la carte produisent leur ressource chaque jour.</li>
          <li>Des <strong>tas de ressources</strong> et <strong>coffres</strong> sont posés sur la carte : ramassez-les en passant.</li>
          <li>Le <strong>Marché</strong> de la ville permettra d’échanger une ressource contre une autre.</li>
        </ul>
      </Callout>

      <Callout kind="tip" title="L’or avant tout">
        Au début, l’or est presque toujours le frein. Une mine d’or rapporte beaucoup plus que n’importe
        quelle ressource rare : priorisez-la dès qu’un gardien abordable la protège.
      </Callout>
    </GuideSection>
  );
}
