"use client";

import { useSession } from "@/lib/auth/client";
import { getCurrentCombatPlayerId } from "@/lib/game/combat/persistent";
import { findActiveCombatTruce } from "@/lib/game/combat/truce";
import { PersistentCombat } from "@/lib/game/types";
import { useGameStore } from "@/lib/stores/gameStore";
import {
  goldText,
  ornateFrame,
} from "../hud/theme";
import CollapsiblePanel from "../hud/CollapsiblePanel";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/translate";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

export default function ActiveCombatsPanel() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const gameState = useGameStore((state) => state.gameState);
  const myPlayer = gameState?.players.find((player) => player.userId === session?.user?.id);
  const combats = (gameState?.activeCombats ?? []).filter((combat) =>
    myPlayer?.isAlive === false || combat.visibility !== "joinable_summary"
  );
  if (combats.length === 0) return null;

  return (
    <CollapsiblePanel
      title={t("combat.combatsTitle", { n: combats.length })}
      className={ornateFrame}
      expandedClassName="shrink-0 overflow-hidden"
      collapsedClassName="shrink-0 overflow-hidden"
      bodyClassName="max-h-32 space-y-1 overflow-y-auto overscroll-contain px-2 py-2"
    >
      <ActiveCombatsList />
    </CollapsiblePanel>
  );
}

export function ActiveCombatsList() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const gameState = useGameStore((state) => state.gameState);
  const restoreCombat = useGameStore((state) => state.restoreCombat);
  const focusTile = useGameStore.getState().focusTile;
  const myPlayer = gameState?.players.find((player) => player.userId === session?.user?.id);
  const combats = (gameState?.activeCombats ?? []).filter((combat) =>
    myPlayer?.isAlive === false || combat.visibility !== "joinable_summary"
  );

  if (combats.length === 0) {
    return <div className="rounded-lg border border-amber-700/20 bg-black/30 px-3 py-3 text-center text-sm font-semibold text-amber-200/60">{t("combat.noActive")}</div>;
  }

  return (
    <>
      {combats.map((combat) => (
        <CombatRow
          key={combat.id}
          combat={combat}
          turnNumber={gameState?.turnNumber ?? 0}
          myPlayerId={myPlayer?.id}
          onOpen={() => restoreCombat(combat)}
          onFocus={() => focusTile(combat.position.x, combat.position.y)}
          t={t}
        />
      ))}
    </>
  );
}

function CombatRow({
  combat,
  turnNumber,
  myPlayerId,
  onOpen,
  onFocus,
  t,
}: {
  combat: PersistentCombat;
  turnNumber: number;
  myPlayerId?: string;
  onOpen: () => void;
  onFocus: () => void;
  t: TFn;
}) {
  const isParticipant = Boolean(
    myPlayerId &&
    (combat.attackerPlayerId === myPlayerId ||
      combat.defenderPlayerId === myPlayerId ||
      combat.participants?.some((participant) => participant.playerId === myPlayerId))
  );
  const currentPlayerId = getCurrentCombatPlayerId(combat.boardState, combat.currentUnitId, combat.currentPlayerId);
  const isMyTurn = currentPlayerId === myPlayerId;
  const activeTruce = findActiveCombatTruce(combat.truces, turnNumber);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-700/20 bg-black/30 px-2 py-1.5 transition hover:border-amber-500/50 hover:bg-amber-900/15">
      <button
        onClick={onFocus}
        className="min-w-0 flex-1 text-left"
      >
        <div className={`truncate text-sm font-bold ${goldText}`}>
          {t("combat.combatAt", { x: combat.position.x, y: combat.position.y })}
        </div>
        <div
          className={`truncate text-[11px] uppercase tracking-wider ${
            activeTruce
              ? "text-sky-300"
              : isMyTurn
              ? "text-emerald-300"
              : isParticipant
              ? "text-amber-200/70"
              : "text-amber-200/50"
          }`}
        >
          {activeTruce ? t("combat.truce") : isMyTurn ? t("combat.yourTurn") : isParticipant ? t("hud.waiting") : t("combat.observable")}
        </div>
      </button>
      <button
        className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-wider shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition ${
          activeTruce
            ? "cursor-default border-sky-400/60 bg-gradient-to-b from-sky-800 to-sky-950 text-sky-50"
            : "border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 text-amber-50 hover:from-amber-500 hover:to-amber-700"
        }`}
        onClick={onOpen}
      >
        {activeTruce ? t("combat.truce") : t("combat.open")}
      </button>
    </div>
  );
}
