import { Callout, Chip, GuideSection, Lead, Sprite, SubBlock } from "./guidePrimitives";
import { ARTIFACT_COMBOS } from "./guideData";

/** End-game and special systems: Grail, King mode, town rallying, artifact combos. */
export function GameMechanicsView() {
  return (
    <>
      <GuideSection id="grail" title="Le Graal" icon="🏆">
        <Lead>
          Le <strong>Graal</strong> est l’objet le plus convoité de la carte. Enterré dans un lieu secret,
          il faut d’abord en <strong>localiser</strong> l’emplacement, puis l’y <strong>déterrer</strong>{" "}
          avec un héros.
        </Lead>
        <ul className="ml-5 list-disc space-y-1 text-amber-100/90">
          <li>Visitez les <strong>obélisques</strong> de la carte : chacun dévoile une partie de la carte au trésor.</li>
          <li>Amenez un héros sur la case exacte et <strong>creusez</strong> pour récupérer le Graal.</li>
          <li>Livré dans une ville, il permet d’ériger un <strong>bâtiment ultime</strong> qui décuple la croissance et offre de puissants bonus.</li>
        </ul>
        <Callout kind="tip" title="Un avantage décisif">
          Le Graal peut renverser une partie : sa croissance bonus (×1,5 sur tous les habitats) fait
          gonfler votre armée semaine après semaine. Cherchez les obélisques tôt.
        </Callout>
      </GuideSection>

      <GuideSection id="king-mode" title="Le Mode Roi" icon="👑">
        <Lead>
          Dans une partie en <strong>Mode Roi</strong>, chaque joueur possède une unité unique — le{" "}
          <strong>Roi</strong> — placée dans la garnison de sa ville de départ.
        </Lead>
        <ul className="ml-5 list-disc space-y-1 text-amber-100/90">
          <li>Si votre Roi est <strong>tué</strong>, vous êtes <strong>éliminé</strong> — protégez-le coûte que coûte.</li>
          <li>Le Roi garde un <strong>moral toujours positif</strong> et combat sous votre bannière.</li>
          <li>Pour vaincre un adversaire, <strong>traquez et tuez son Roi</strong>.</li>
        </ul>
        <Callout kind="warn" title="Ne sortez pas votre Roi à la légère">
          Tant qu’il reste retranché dans une ville fortifiée, votre Roi est difficile à atteindre. Ne
          l’exposez sur le terrain que si vous maîtrisez le risque.
        </Callout>
      </GuideSection>

      <GuideSection id="rally-town" title="Rallier une ville étrangère" icon="🤝">
        <Lead>
          Quand vous capturez une ville d’une <strong>autre faction</strong>, vous pouvez la{" "}
          <strong>rallier à la vôtre</strong> contre de l’or (≈ 5000) : ses habitats produiront alors{" "}
          <strong>vos</strong> créatures.
        </Lead>
        <Callout kind="info" title="Convertir ou conserver ?">
          Conserver une ville étrangère donne accès à ses créatures d’origine ; la convertir unifie votre
          armée (meilleur moral) et simplifie la logistique. À vous de juger selon votre stratégie.
        </Callout>
      </GuideSection>

      <GuideSection id="artifact-combos" title="Combinaisons d’artefacts" icon="🧩">
        <Lead>
          Certains artefacts forment des <strong>ensembles</strong> : portés tous ensemble par un même
          héros, ils débloquent des effets renforcés. Voici les ensembles existants.
        </Lead>
        <div className="space-y-4">
          {ARTIFACT_COMBOS.map((combo) => (
            <SubBlock key={combo.id} title={combo.label}>
              <div className="flex flex-wrap gap-2">
                {combo.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg border border-amber-800/40 bg-stone-950/50 px-2 py-1.5">
                    <Sprite src={m.sprite} alt={m.name} size={32} fallback="💎" />
                    <span className="text-xs text-amber-100/85">{m.name}</span>
                  </div>
                ))}
              </div>
              <Chip>{combo.members.length} pièces</Chip>
            </SubBlock>
          ))}
        </div>
      </GuideSection>
    </>
  );
}
