"use client";

import {
  CornerOrnaments,
  ParchmentBackground,
  goldText,
  ornateFramePolished,
} from "@/components/game/hud/theme";
import { factionLabel } from "./factionMeta";
import { FactionSelect } from "./FactionSelect";
import { useI18n } from "@/lib/i18n/I18nProvider";

export interface JoinableGamePlayer {
  color: string;
  faction: string;
  isAi?: boolean;
  aiName?: string | null;
  user?: { name: string | null; email?: string | null };
}

export interface JoinableGame {
  id: string;
  name: string;
  maxPlayers: number;
  players: JoinableGamePlayer[];
}

export interface JoinGameWizardProps {
  step: 1 | 2;
  onStepChange: (step: 1 | 2) => void;
  selectedFaction: string;
  onSelectFaction: (faction: string) => void;
  openGames: JoinableGame[];
  onJoin: (gameId: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

const SECONDARY_BUTTON =
  "rounded-md border border-amber-700/40 bg-stone-950/70 px-6 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100";

export function JoinGameWizard({
  step,
  onStepChange,
  selectedFaction,
  onSelectFaction,
  openGames,
  onJoin,
  onRefresh,
  onClose,
}: JoinGameWizardProps) {
  const { t, locale } = useI18n();
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className={`relative ${ornateFramePolished} my-auto flex w-full max-w-5xl flex-col p-4 sm:min-h-[36rem] sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <CornerOrnaments />
        <ParchmentBackground />
        <h2 className={`mb-4 text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>
          {t("join.title")} <span className="text-sm font-bold text-amber-200/60">— {t("wizard.step", { step })}</span>
        </h2>

        {step === 1 && (
          <>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-amber-200/80">{t("join.chooseFaction")}</label>
            <div className="mb-4">
              <FactionSelect selectedFaction={selectedFaction} onSelect={onSelectFaction} />
            </div>
            <div className="mt-auto flex flex-wrap items-center justify-end gap-3 pt-4">
              <button onClick={onClose} className={SECONDARY_BUTTON}>
                {t("common.cancel")}
              </button>
              <button
                onClick={() => onStepChange(2)}
                className="rounded-md border border-emerald-400/60 bg-gradient-to-b from-emerald-600 to-emerald-800 px-6 py-2 font-black uppercase tracking-wider text-emerald-50 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.3)] transition hover:from-emerald-500 hover:to-emerald-700"
              >
                {t("common.next")}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {openGames.length === 0 ? (
              <div className="py-4 text-center italic text-amber-200/50">{t("join.noOpenGames")}</div>
            ) : (
              <div className="mb-4 space-y-2">
                {openGames.map((game) => (
                  <div
                    key={game.id}
                    className="flex flex-col gap-3 rounded-md border border-amber-700/40 bg-stone-950/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="font-bold text-amber-100">{game.name}</div>
                      <div className="text-xs uppercase tracking-wider text-amber-200/60">
                        {t("wizard.playersCount", { count: game.players.length, max: game.maxPlayers })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {game.players.map((p, i) => (
                        <div
                          key={i}
                          className="h-6 w-6 rounded-full ring-2 ring-amber-300/60"
                          style={{ backgroundColor: p.color }}
                          title={`${p.isAi ? p.aiName || t("common.ai") : p.user?.name || t("common.player")} - ${factionLabel(p.faction, locale)}`}
                        />
                      ))}
                      <button
                        onClick={() => onJoin(game.id)}
                        className="rounded-md border border-emerald-400/60 bg-gradient-to-b from-emerald-600 to-emerald-800 px-4 py-1 text-sm font-black uppercase tracking-wider text-emerald-50 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.3)] transition hover:from-emerald-500 hover:to-emerald-700"
                      >
                        {t("common.join")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
              <button onClick={() => onStepChange(1)} className={SECONDARY_BUTTON}>
                {t("common.previous")}
              </button>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={onClose} className={SECONDARY_BUTTON}>
                  {t("common.cancel")}
                </button>
                <button
                  onClick={onRefresh}
                  className="rounded-md border border-amber-700/50 bg-stone-950/80 px-6 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/80 transition hover:border-amber-400/60 hover:text-amber-100"
                >
                  {t("common.refresh")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
