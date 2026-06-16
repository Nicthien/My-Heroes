import { Callout, GuideSection, GuideTable, Lead, SubBlock } from "./guidePrimitives";
import { SKILL_ROWS } from "./guideData";

/** Reference of every secondary skill, split into graduated and fixed-effect skills. */
export function SkillsView() {
  const tiered = SKILL_ROWS.filter((s) => !s.flat);
  const flat = SKILL_ROWS.filter((s) => s.flat);

  return (
    <GuideSection id="skills" title="Compétences" icon="🎓">
      <Lead>
        En montant de niveau, un héros apprend des <strong>compétences secondaires</strong> (8 au
        maximum). Chacune se développe sur trois paliers : <strong>Base</strong>, <strong>Avancé</strong>{" "}
        puis <strong>Expert</strong>. Elles façonnent le style de jeu : économie, magie, puissance
        militaire ou mobilité.
      </Lead>

      <SubBlock title="Compétences graduées">
        <GuideTable
          headers={["Compétence", "Base", "Avancé", "Expert"]}
          rows={tiered.map((s) => [
            <span key="l" className="font-semibold text-amber-100">{s.label}</span>,
            <span key="b" className="text-sm text-amber-100/80">{s.basic}</span>,
            <span key="a" className="text-sm text-amber-100/80">{s.advanced}</span>,
            <span key="e" className="text-sm text-amber-100/80">{s.expert}</span>,
          ])}
        />
      </SubBlock>

      <SubBlock title="Compétences à effet unique">
        <GuideTable
          headers={["Compétence", "Effet"]}
          rows={flat.map((s) => [
            <span key="l" className="font-semibold text-amber-100">{s.label}</span>,
            <span key="d" className="text-sm text-amber-100/80">{s.basic}</span>,
          ])}
        />
      </SubBlock>

      <Callout kind="tip" title="Choisir ses compétences">
        Les choix de compétences sont proposés aléatoirement aux montées de niveau. Visez la cohérence :
        un héros guerrier profite d’<strong>Attaque</strong>, <strong>Armurerie</strong> et{" "}
        <strong>Tactique</strong> ; un héros magicien de <strong>Sagesse</strong>,{" "}
        <strong>Intelligence</strong> et des écoles de magie.
      </Callout>
    </GuideSection>
  );
}
