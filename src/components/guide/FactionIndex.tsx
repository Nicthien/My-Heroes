import Link from "next/link";
import { Chip, GuideSection, Lead, Sprite } from "./guidePrimitives";
import { ALIGNMENT_LABEL, GUIDE_FACTIONS } from "./guideData";

const ALIGNMENT_COLOR: Record<string, string> = {
  good: "#38bdf8",
  evil: "#fb7185",
  barbarian: "#fb923c",
};

/** The 8 playable factions as cards, each linking to its detail page. */
export function FactionIndex() {
  return (
    <GuideSection id="factions" title="Les factions" icon="🛡️">
      <Lead>
        Huit factions jouables, chacune avec ses 7 créatures, ses bâtiments et ses héros. Cliquez sur
        une faction pour découvrir son armée complète, sa ville et ses spécialités.
      </Lead>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GUIDE_FACTIONS.map((f) => (
          <Link
            key={f.key}
            href={`/guide/factions/${f.faction}`}
            className="group flex gap-3 rounded-lg border border-amber-800/40 bg-stone-950/50 p-3 transition hover:border-amber-400/60 hover:bg-amber-950/30"
            style={{ borderColor: `${f.color}55` }}
          >
            <Sprite src={f.townSprite} alt={f.label} size={56} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true">{f.emblem}</span>
                <span className="truncate text-sm font-black text-amber-100">{f.label}</span>
              </div>
              <Chip color={ALIGNMENT_COLOR[f.alignment]}>{ALIGNMENT_LABEL[f.alignment]}</Chip>
              <p className="text-xs text-amber-100/70">{f.tagline}</p>
              <span className="inline-block text-xs font-bold text-amber-300/80 group-hover:text-amber-200">
                Découvrir →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </GuideSection>
  );
}
