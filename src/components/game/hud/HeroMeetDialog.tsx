"use client";

import { useState } from "react";
import type { Hero, UnitStack, UnitType } from "@/lib/game/types";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { refreshGameState } from "@/lib/game/refresh";
import { useGameStore } from "@/lib/stores/gameStore";
import {
  ARTIFACT_SLOTS,
  ARTIFACTS_BY_ID,
  getArtifact,
  normalizeArtifactBag,
  type ArtifactSlot,
} from "@/lib/game/artifacts";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { getApiErrorMessage, unitTypeLabel } from "./helpers";
import { UnitSprite } from "./UnitSprite";

type Side = "left" | "right";

export function HeroMeetDialog({
  leftHero,
  rightHero,
  ownerFaction,
  onClose,
}: {
  leftHero: Hero;
  rightHero: Hero;
  ownerFaction?: string;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const { data: session } = useSession();
  const gameState = useGameStore((state) => state.gameState);
  const setGameState = useGameStore((state) => state.setGameState);
  const setCombatMessage = useGameStore((state) => state.setCombatMessage);
  const devRevealMap = useGameStore((state) => state.devRevealMap);
  const [pending, setPending] = useState(false);
  const [unitTransfer, setUnitTransfer] = useState<
    | { side: Side; stackId: string; unitType: UnitType; max: number; count: number }
    | null
  >(null);

  if (!gameState) return null;

  async function dispatch(body: Record<string, unknown>) {
    if (!gameState) return;
    setPending(true);
    try {
      const response = await fetchWithSupabaseAuth(`/api/games/${gameState.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setCombatMessage(await getApiErrorMessage(response, t("hud.transferFailed"), locale));
        return;
      }
      const refreshed = await refreshGameState(gameState.id, session?.user?.id, { revealMap: devRevealMap });
      if (refreshed) setGameState(refreshed);
    } finally {
      setPending(false);
    }
  }

  async function transferUnit(side: Side, unitType: UnitType, count: number) {
    const fromHero = side === "left" ? leftHero : rightHero;
    const toHero = side === "left" ? rightHero : leftHero;
    await dispatch({
      type: "TRANSFER_HERO_TO_HERO",
      fromHeroId: fromHero.id,
      toHeroId: toHero.id,
      unitType,
      count,
    });
    setUnitTransfer(null);
  }

  async function transferArtifact(side: Side, artifactId: string) {
    const fromHero = side === "left" ? leftHero : rightHero;
    const toHero = side === "left" ? rightHero : leftHero;
    await dispatch({
      type: "TRANSFER_ARTIFACT",
      fromHeroId: fromHero.id,
      toHeroId: toHero.id,
      artifactId,
    });
  }

  async function unequip(side: Side, slot: ArtifactSlot) {
    const hero = side === "left" ? leftHero : rightHero;
    await dispatch({ type: "UNEQUIP_ARTIFACT", heroId: hero.id, slot });
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border-2 border-amber-500/60 bg-gradient-to-b from-stone-900 to-black shadow-2xl shadow-black/80">
        <div className="flex items-center justify-between border-b-2 border-amber-700/50 bg-gradient-to-r from-amber-950/60 via-stone-900/40 to-amber-950/60 px-5 py-3">
          <div className="text-base font-black uppercase tracking-wider text-amber-100">
            {t("heroMeet.title")}
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-md border border-amber-700/60 text-amber-200 transition hover:border-amber-300 hover:text-amber-50"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
          <HeroColumn
            hero={leftHero}
            otherHero={rightHero}
            side="left"
            ownerFaction={ownerFaction}
            pending={pending}
            unitTransfer={unitTransfer}
            setUnitTransfer={setUnitTransfer}
            onTransferUnit={transferUnit}
            onTransferArtifact={transferArtifact}
            onUnequip={unequip}
            t={t}
            locale={locale}
          />
          <HeroColumn
            hero={rightHero}
            otherHero={leftHero}
            side="right"
            ownerFaction={ownerFaction}
            pending={pending}
            unitTransfer={unitTransfer}
            setUnitTransfer={setUnitTransfer}
            onTransferUnit={transferUnit}
            onTransferArtifact={transferArtifact}
            onUnequip={unequip}
            t={t}
            locale={locale}
          />
        </div>

        <div className="border-t-2 border-amber-700/50 bg-stone-950/80 px-5 py-3 text-right">
          <button
            type="button"
            className="rounded-md border border-amber-500/60 bg-gradient-to-b from-amber-700 to-amber-900 px-4 py-2 text-sm font-black uppercase tracking-wider text-amber-50 shadow-inner shadow-black/40 transition hover:from-amber-600 hover:to-amber-800"
            onClick={onClose}
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

type ColumnProps = {
  hero: Hero;
  otherHero: Hero;
  side: Side;
  ownerFaction?: string;
  pending: boolean;
  unitTransfer:
    | { side: Side; stackId: string; unitType: UnitType; max: number; count: number }
    | null;
  setUnitTransfer: (
    next:
      | { side: Side; stackId: string; unitType: UnitType; max: number; count: number }
      | null,
  ) => void;
  onTransferUnit: (side: Side, unitType: UnitType, count: number) => Promise<void>;
  onTransferArtifact: (side: Side, artifactId: string) => Promise<void>;
  onUnequip: (side: Side, slot: ArtifactSlot) => Promise<void>;
  t: ReturnType<typeof useI18n>["t"];
  locale: ReturnType<typeof useI18n>["locale"];
};

function HeroColumn({
  hero,
  side,
  ownerFaction,
  pending,
  unitTransfer,
  setUnitTransfer,
  onTransferUnit,
  onTransferArtifact,
  onUnequip,
  t,
  locale,
}: ColumnProps) {
  const bag = normalizeArtifactBag(hero.artifacts);
  const arrow = side === "left" ? "→" : "←";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-700/40 bg-stone-900/60 p-3 shadow-inner shadow-black/40">
      <div className="border-b border-amber-700/30 pb-2">
        <div className="text-sm font-black text-amber-100">{hero.name}</div>
        <div className="text-[11px] text-amber-200/60">
          {t("hero.levelXp", { level: hero.level, xp: hero.experience })}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-300/80">
          {t("heroMeet.army")}
        </div>
        {hero.armies.length === 0 ? (
          <div className="rounded-md border border-amber-900/40 bg-black/40 px-2 py-1.5 text-[11px] text-amber-200/60">
            {t("garrison.heroNoUnits")}
          </div>
        ) : (
          <div className="space-y-1.5">
            {hero.armies.map((stack) => (
              <UnitRow
                key={stack.id}
                stack={stack}
                ownerFaction={ownerFaction}
                arrow={arrow}
                disabled={pending}
                editing={
                  unitTransfer?.side === side && unitTransfer.stackId === stack.id
                    ? unitTransfer
                    : null
                }
                onOpenEdit={() =>
                  setUnitTransfer({
                    side,
                    stackId: stack.id,
                    unitType: stack.unitType,
                    max: stack.count,
                    count: stack.count,
                  })
                }
                onCloseEdit={() => setUnitTransfer(null)}
                onChangeCount={(next) =>
                  setUnitTransfer({
                    side,
                    stackId: stack.id,
                    unitType: stack.unitType,
                    max: stack.count,
                    count: next,
                  })
                }
                onConfirm={() => onTransferUnit(side, stack.unitType, unitTransfer?.count ?? 1)}
                t={t}
                locale={locale}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-300/80">
          {t("hero.tabArtifacts")}
        </div>
        <div className="grid grid-cols-6 gap-1">
          {ARTIFACT_SLOTS.map((slot) => {
            const artifactId = bag.equipment[slot];
            const artifact = artifactId ? getArtifact(artifactId) : null;
            return (
              <button
                key={slot}
                type="button"
                disabled={!artifactId || pending}
                onClick={() => artifactId && onUnequip(side, slot)}
                className={`grid h-10 w-full place-items-center rounded border text-[10px] ${
                  artifact
                    ? "border-amber-500/55 bg-amber-950/35 text-amber-100 hover:border-amber-300/80"
                    : "border-amber-900/40 bg-black/30 text-amber-200/30"
                }`}
                title={artifact?.name ?? ""}
              >
                {artifact ? <ArtifactSmall artifactId={artifact.id} /> : "—"}
              </button>
            );
          })}
        </div>
        <div className="mt-2 space-y-1">
          {bag.inventory.length === 0 ? (
            <div className="rounded-md border border-amber-900/40 bg-black/30 px-2 py-1 text-[11px] text-amber-200/55">
              {t("hero.inventoryEmpty")}
            </div>
          ) : (
            bag.inventory.map((artifactId, index) => {
              const artifact = ARTIFACTS_BY_ID[artifactId];
              if (!artifact) return null;
              return (
                <div
                  key={`${artifactId}-${index}`}
                  className="flex items-center gap-1.5 rounded-md border border-amber-700/35 bg-black/45 px-2 py-1 text-xs"
                >
                  <ArtifactSmall artifactId={artifactId} />
                  <span className="min-w-0 flex-1 truncate text-amber-100" title={artifact.name}>
                    {artifact.name}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded border border-sky-500/45 bg-sky-950/50 px-2 py-0.5 font-black text-sky-100 transition hover:border-sky-300 disabled:opacity-40"
                    onClick={() => onTransferArtifact(side, artifactId)}
                    title={t("heroMeet.giveToOther")}
                  >
                    {arrow}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function UnitRow({
  stack,
  ownerFaction,
  arrow,
  disabled,
  editing,
  onOpenEdit,
  onCloseEdit,
  onChangeCount,
  onConfirm,
  t,
  locale,
}: {
  stack: UnitStack;
  ownerFaction?: string;
  arrow: string;
  disabled: boolean;
  editing:
    | { side: Side; stackId: string; unitType: UnitType; max: number; count: number }
    | null;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  onChangeCount: (next: number) => void;
  onConfirm: () => void;
  t: ReturnType<typeof useI18n>["t"];
  locale: ReturnType<typeof useI18n>["locale"];
}) {
  return (
    <div className="rounded-md border border-amber-700/35 bg-gradient-to-b from-stone-900/75 to-black/55 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UnitSprite unitType={stack.unitType} faction={ownerFaction} describe />
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-amber-100">
              {unitTypeLabel(stack.unitType, locale)}
            </div>
            <div className="text-[11px] text-amber-200/65">×{stack.count}</div>
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          className="rounded border border-amber-500/55 bg-amber-950/50 px-2 py-1 text-xs font-black text-amber-100 transition hover:border-amber-300 disabled:opacity-40"
          onClick={editing ? onCloseEdit : onOpenEdit}
          title={t("heroMeet.transferToOther")}
        >
          {arrow}
        </button>
      </div>
      {editing && (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          <input
            type="number"
            min={1}
            max={editing.max}
            value={editing.count}
            onChange={(event) => {
              const next = Math.min(
                Math.max(1, Math.floor(Number(event.currentTarget.value) || 1)),
                editing.max,
              );
              onChangeCount(next);
            }}
            className="h-8 w-20 rounded border border-amber-700/60 bg-black/70 px-2 text-center text-xs font-black tabular-nums text-amber-50 outline-none focus:border-amber-300"
          />
          <span className="text-[10px] font-bold text-amber-300/70">/ {editing.max}</span>
          <button
            type="submit"
            disabled={disabled || editing.count < 1}
            className="ml-auto rounded border border-emerald-500/55 bg-emerald-950/50 px-3 py-1 text-xs font-black text-emerald-100 transition hover:border-emerald-300 disabled:opacity-40"
          >
            {t("common.confirm")}
          </button>
        </form>
      )}
    </div>
  );
}

function ArtifactSmall({ artifactId }: { artifactId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="text-amber-300/80">◆</span>;
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- HUD sprites use direct public asset paths and fixed tiny dimensions. */
    <img
      src={`/assets/sprites/artifacts/${artifactId}.webp`}
      alt=""
      className="h-6 w-6 object-contain [image-rendering:auto]"
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
