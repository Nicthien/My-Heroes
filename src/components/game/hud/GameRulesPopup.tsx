"use client";

import type { GameState, Player, VictoryConditionType } from "@/lib/game/types";
import {
  describeVictoryCondition,
  victoryConditionLabel,
  victoryConditionRules,
} from "@/lib/game/victory";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";
import { markGameRulesSeen } from "./helpers";
import {
  CornerOrnaments,
  FleurDeLis,
  ParchmentBackground,
  goldDivider,
  goldText,
  ornateFramePolished,
} from "./theme";

const VICTORY_ICON: Record<VictoryConditionType, string> = {
  KING: "👑",
  DOMINATION: "⚔️",
  GOLD: "💰",
  TURN_LIMIT: "⏳",
  CAPTURE_TOWN: "🏰",
};

const GENERAL_RULE_KEYS: TranslationKey[] = [
  "rules.general1",
  "rules.general2",
  "rules.general3",
  "rules.general4",
  "rules.general5",
];

interface GameRulesPopupProps {
  gameState: GameState;
  myPlayer: Player;
  /** Called after the player acknowledges the rules (also persisted locally). */
  onDismiss: () => void;
}

/**
 * Welcome overlay shown once per game (per seat) when a player first enters an
 * ACTIVE game. It explains the turn-based basics plus the rules specific to the
 * selected victory condition ("game type"), then never reappears for that seat.
 */
export function GameRulesPopup({ gameState, myPlayer, onDismiss }: GameRulesPopupProps) {
  const { t, locale } = useI18n();

  const condition = gameState.victoryCondition ?? { type: "DOMINATION" };
  const icon = VICTORY_ICON[condition.type] ?? "⚔️";
  const objectiveTips = victoryConditionRules(condition, locale);

  const dismiss = () => {
    markGameRulesSeen(gameState.id, myPlayer.id);
    onDismiss();
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[75] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      data-testid="game-rules-popup"
    >
      <div className={`relative ${ornateFramePolished} flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden`}>
        <CornerOrnaments />
        <ParchmentBackground />

        <div className="relative flex flex-col items-center px-6 pt-6 text-center">
          <div className="flex items-center gap-2 text-amber-300">
            <FleurDeLis className="h-4 w-4" />
            <FleurDeLis className="h-4 w-4" />
          </div>
          <h2 className={`mt-2 text-2xl font-black uppercase tracking-[0.18em] ${goldText}`}>
            {t("rules.title")}
          </h2>
        </div>

        <div className="relative flex-1 overflow-y-auto px-6 py-5">
          {/* Objective */}
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-amber-100">
              <span className="text-xl">{icon}</span>
              {t("rules.objectiveHeading", { mode: victoryConditionLabel(condition.type, locale) })}
            </div>
            <p className="mt-1 text-sm font-semibold text-amber-200/90">
              {describeVictoryCondition(condition, locale)}
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {objectiveTips.map((tip) => (
                <li key={tip} className="flex gap-2 text-[0.82rem] leading-snug text-amber-100/80">
                  <span className="mt-0.5 shrink-0 text-amber-400">◆</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={`my-4 ${goldDivider}`} />

          {/* General gameplay */}
          <div className={`mb-2 text-xs font-black uppercase tracking-[0.18em] ${goldText}`}>
            {t("rules.howToPlayHeading")}
          </div>
          <ul className="flex flex-col gap-2">
            {GENERAL_RULE_KEYS.map((key) => (
              <li key={key} className="flex gap-2 text-[0.85rem] leading-snug text-amber-100/85">
                <span className="mt-0.5 shrink-0 text-amber-400">◆</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex justify-center border-t border-amber-700/30 px-6 py-4">
          <button
            onClick={dismiss}
            data-testid="game-rules-dismiss"
            className="rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-8 py-2 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700"
          >
            {t("rules.gotIt")}
          </button>
        </div>
      </div>
    </div>
  );
}
