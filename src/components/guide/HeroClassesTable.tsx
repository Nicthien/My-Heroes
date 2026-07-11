"use client";

import { GuideTable } from "./guidePrimitives";
import { HERO_CLASS_LABEL } from "./guideData";
import { CLASS_STARTING_STATS } from "@/lib/game/heroes";
import { HeroClass } from "@/lib/game/types";

/** Reference of the 18 hero classes with their starting primary statistics. */
export function HeroClassesTable() {
  const classes = Object.values(HeroClass);
  return (
    <GuideTable
      headers={["Classe", "Attaque", "Défense", "Pouvoir", "Connaissance"]}
      align={["left", "center", "center", "center", "center"]}
      rows={classes.map((c) => {
        const stats = CLASS_STARTING_STATS[c];
        return [
          <span key="n" className="font-semibold text-amber-100">{HERO_CLASS_LABEL[c]}</span>,
          stats.attack,
          stats.defense,
          stats.spellPower,
          stats.knowledge,
        ];
      })}
    />
  );
}
