"use client";

import { RmgMapPreview } from "@/components/game/map/RmgMapPreview";
import {
  CornerOrnaments,
  ParchmentBackground,
  goldText,
  ornateFramePolished,
} from "@/components/game/hud/theme";
import { RmgTuning } from "@/lib/game/engine/rmg-tuning";
import { GameMap, type MapLevelId, type VictoryConditionType } from "@/lib/game/types";
import {
  GOLD_TARGET_BOUNDS,
  TURN_LIMIT_BOUNDS,
  VICTORY_CONDITION_META,
} from "@/lib/game/victory";
import { SURFACE_LEVEL, UNDERGROUND_LEVEL } from "@/lib/game/map-levels";
import { MAP_SIZES, TURN_TIMER_UNITS, type MapSizeKey, type PreviewStats, type TurnTimerUnit, randomSeedValue } from "./dashboardConstants";
import { FactionSelect } from "./FactionSelect";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { victoryConditionLabel, victoryConditionDescription } from "@/lib/game/victory";
import type { TranslationKey } from "@/lib/i18n/translate";
import {
  RmgGenerationProgress,
  RmgLegend,
  RmgStatBlock,
  RmgTuningSlider,
} from "./dashboardRmgControls";

const RMG_TUNING_CONTROLS: { key: keyof RmgTuning; labelKey: TranslationKey; min: number; max: number; step: number }[] = [
  { key: "resourceBudgetPercent", labelKey: "rmg.resourceBudget", min: 25, max: 250, step: 5 },
  { key: "buildingPercent", labelKey: "rmg.buildings", min: 0, max: 250, step: 5 },
  { key: "looseResourcePercent", labelKey: "rmg.looseResources", min: 0, max: 300, step: 5 },
  { key: "monsterPercent", labelKey: "rmg.monsters", min: 0, max: 250, step: 5 },
  { key: "adventurePercent", labelKey: "rmg.adventureBuildings", min: 0, max: 250, step: 5 },
];

export interface CreateGameWizardProps {
  step: 1 | 2;
  onStepChange: (step: 1 | 2) => void;
  isAdmin: boolean;
  userName?: string | null;

  gameName: string;
  setGameName: (value: string) => void;
  maxPlayers: number;
  setMaxPlayers: (value: number) => void;
  mapSize: MapSizeKey;
  setMapSize: (value: MapSizeKey) => void;
  seed: string;
  setSeed: (value: string) => void;
  selectedTemplateId: string;
  setTemplateId: (value: string) => void;
  templateOptions: { id: string; name: string; minPlayers: number; maxPlayers: number }[];
  normalizedRmgTuning: RmgTuning;
  updateRmgTuning: (key: keyof RmgTuning, value: number) => void;
  undergroundEnabled: boolean;
  setUndergroundEnabled: (value: boolean) => void;
  victoryType: VictoryConditionType;
  setVictoryType: (value: VictoryConditionType) => void;
  goldTarget: number;
  setGoldTarget: (value: number) => void;
  turnLimit: number;
  setTurnLimit: (value: number) => void;
  turnTimerEnabled: boolean;
  setTurnTimerEnabled: (value: boolean) => void;
  turnTimerValue: number;
  setTurnTimerValue: (value: number) => void;
  turnTimerUnit: TurnTimerUnit;
  setTurnTimerUnit: (value: TurnTimerUnit) => void;
  showRmgTuning: boolean;
  setShowRmgTuning: (updater: (value: boolean) => boolean) => void;
  showRmgPreview: boolean;
  setShowRmgPreview: (value: boolean) => void;
  previewLevel: MapLevelId;
  setPreviewLevel: (value: MapLevelId) => void;
  generateRandomSeed: () => void;

  isPreviewGenerating: boolean;
  visiblePreviewMap: GameMap | null;
  previewStats: PreviewStats | null;
  previewGenerationProgress: number;
  previewSeedLabel: string;
  previewSizeLabel: string;
  previewTemplateLabel: string;

  selectedFaction: string;
  setSelectedFaction: (value: string) => void;

  creating: boolean;
  onCreate: () => void;
  onClose: () => void;
}

const PRIMARY_BUTTON =
  "rounded-md border border-amber-400/60 bg-gradient-to-b from-amber-600 to-amber-800 px-6 py-2 font-black uppercase tracking-wider text-amber-50 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)] transition hover:from-amber-500 hover:to-amber-700 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "rounded-md border border-amber-700/40 bg-stone-950/70 px-6 py-2 text-sm font-bold uppercase tracking-wider text-amber-200/70 transition hover:border-amber-500/50 hover:text-amber-100";

export function CreateGameWizard(props: CreateGameWizardProps) {
  const {
    step,
    onStepChange,
    isAdmin,
    userName,
    gameName,
    setGameName,
    maxPlayers,
    setMaxPlayers,
    mapSize,
    setMapSize,
    seed,
    setSeed,
    selectedTemplateId,
    setTemplateId,
    templateOptions,
    normalizedRmgTuning,
    updateRmgTuning,
    undergroundEnabled,
    setUndergroundEnabled,
    victoryType,
    setVictoryType,
    goldTarget,
    setGoldTarget,
    turnLimit,
    setTurnLimit,
    turnTimerEnabled,
    setTurnTimerEnabled,
    turnTimerValue,
    setTurnTimerValue,
    turnTimerUnit,
    setTurnTimerUnit,
    showRmgTuning,
    setShowRmgTuning,
    showRmgPreview,
    setShowRmgPreview,
    previewLevel,
    setPreviewLevel,
    generateRandomSeed,
    isPreviewGenerating,
    visiblePreviewMap,
    previewStats,
    previewGenerationProgress,
    previewSeedLabel,
    previewSizeLabel,
    previewTemplateLabel,
    selectedFaction,
    setSelectedFaction,
    creating,
    onCreate,
    onClose,
  } = props;

  const { t, locale } = useI18n();

  const close = () => {
    onClose();
    setShowRmgPreview(false);
  };

  // Faction is always the first step; admins skip it and configure the map directly.
  const showFactionStep = !isAdmin && step === 1;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={close}
    >
      <div
        className={`relative ${ornateFramePolished} my-auto flex w-full max-w-6xl flex-col p-4 sm:min-h-[36rem] sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <CornerOrnaments />
        <ParchmentBackground />
        <h2 className={`mb-4 text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>
          {t("create.title")} {!isAdmin && <span className="text-sm font-bold text-amber-200/60">— {t("wizard.step", { step })}</span>}
        </h2>

        {showFactionStep ? (
          <>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-amber-200/80">{t("join.chooseFaction")}</label>
            <div className="mb-4">
              <FactionSelect selectedFaction={selectedFaction} onSelect={setSelectedFaction} />
            </div>
            <div className="mt-auto flex flex-wrap items-center justify-end gap-3 pt-4">
              <button onClick={close} className={SECONDARY_BUTTON}>
                {t("common.cancel")}
              </button>
              <button onClick={() => onStepChange(2)} className={PRIMARY_BUTTON}>
                {t("common.next")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {/* Réglages */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="game-name" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">{t("create.name")}</label>
                    <input
                      id="game-name"
                      type="text"
                      value={gameName}
                      onChange={(e) => setGameName(e.target.value)}
                      placeholder={t("create.namePlaceholder", { name: userName ?? "" })}
                      className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="max-players" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">{t("create.maxPlayers")}</label>
                    <select
                      id="max-players"
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(Number(e.target.value))}
                      className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                    >
                      {[2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>{t("create.playersOption", { n })}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-amber-200/80">{t("create.mapSize")}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["S", "M", "L"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setMapSize(s)}
                        className={`rounded-lg border p-2 text-center transition ${
                          mapSize === s
                            ? "border-amber-400 bg-amber-900/30 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.3)]"
                            : "border-amber-700/30 bg-stone-950/60 hover:border-amber-500/50"
                        }`}
                      >
                        <div className="text-base font-black text-amber-100">{s}</div>
                        <div className="text-[10px] uppercase tracking-wider text-amber-200/70">
                          {s === "S" ? "36×36" : s === "M" ? "72×72" : s === "L" ? "108×108" : "144×144"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="template" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">{t("create.template")}</label>
                    <select
                      id="template"
                      value={selectedTemplateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                      className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                    >
                      <option value="auto">{t("create.templateAuto")}</option>
                      {templateOptions.map((template) => (
                        <option key={template.id} value={template.id}>
                          {t("create.templateOption", { name: template.name, min: template.minPlayers, max: template.maxPlayers })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="seed" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">{t("create.seed")}</label>
                    <div className="flex gap-2">
                      <input
                        id="seed"
                        type="text"
                        value={seed}
                        onChange={(e) => setSeed(e.target.value.toUpperCase() || randomSeedValue())}
                        placeholder={t("create.seed")}
                        maxLength={32}
                        className="flex-1 rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={generateRandomSeed}
                        title={t("create.randomSeed")}
                        className="rounded-md border border-amber-700/50 bg-stone-950/70 px-3 text-amber-100 hover:border-amber-400"
                      >
                        🎲
                      </button>
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-md border border-amber-700/40 bg-stone-950/60 p-2.5 text-sm font-bold text-amber-100">
                  <input
                    type="checkbox"
                    checked={undergroundEnabled}
                    onChange={(event) => {
                      setUndergroundEnabled(event.target.checked);
                      if (!event.target.checked) setPreviewLevel(SURFACE_LEVEL);
                    }}
                    className="h-4 w-4 accent-amber-500"
                  />
                  <span>{t("create.generateUnderground")}</span>
                </label>

                <div className="rounded-lg border border-amber-700/40 bg-stone-950/60 p-3">
                  <label className="flex items-center gap-3 text-sm font-bold text-amber-100">
                    <input
                      type="checkbox"
                      checked={turnTimerEnabled}
                      onChange={(event) => setTurnTimerEnabled(event.target.checked)}
                      className="h-4 w-4 accent-amber-500"
                    />
                    <span>{t("create.turnTimerEnable")}</span>
                  </label>
                  {turnTimerEnabled && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        id="turn-timer-value"
                        type="number"
                        min={1}
                        max={turnTimerUnit === "days" ? 7 : turnTimerUnit === "hours" ? 168 : 10080}
                        step={1}
                        value={turnTimerValue}
                        onChange={(event) => setTurnTimerValue(Math.max(1, Number(event.target.value) || 1))}
                        className="w-24 rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                      />
                      <select
                        id="turn-timer-unit"
                        value={turnTimerUnit}
                        onChange={(event) => setTurnTimerUnit(event.target.value as TurnTimerUnit)}
                        className="flex-1 rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                      >
                        {TURN_TIMER_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {t(`create.turnTimerUnit.${unit}` as TranslationKey)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] leading-snug text-amber-200/55">
                    {turnTimerEnabled ? t("create.turnTimerHint") : t("create.turnTimerUnlimited")}
                  </p>
                </div>

                <div className="rounded-lg border border-amber-700/40 bg-stone-950/60 p-3">
                  <label htmlFor="victory-type" className="mb-1 block text-xs font-bold uppercase tracking-wider text-amber-200/80">
                    {t("create.victoryCondition")}
                  </label>
                  <select
                    id="victory-type"
                    value={victoryType}
                    onChange={(e) => setVictoryType(e.target.value as VictoryConditionType)}
                    className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                  >
                    {Object.values(VICTORY_CONDITION_META).map((meta) => (
                      <option key={meta.type} value={meta.type}>{victoryConditionLabel(meta.type, locale)}</option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] leading-snug text-amber-200/55">
                    {victoryConditionDescription(victoryType, locale)}
                    {victoryType !== "DOMINATION" && t("create.dominationFallback")}
                  </p>

                  {victoryType === "GOLD" && (
                    <div className="mt-2">
                      <label htmlFor="gold-target" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-amber-200/70">
                        {t("create.goldTarget")}
                      </label>
                      <input
                        id="gold-target"
                        type="number"
                        min={GOLD_TARGET_BOUNDS.min}
                        max={GOLD_TARGET_BOUNDS.max}
                        step={5000}
                        value={goldTarget}
                        onChange={(e) => setGoldTarget(Number(e.target.value))}
                        className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  )}

                  {victoryType === "TURN_LIMIT" && (
                    <div className="mt-2">
                      <label htmlFor="turn-limit" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-amber-200/70">
                        {t("create.turnCount")}
                      </label>
                      <input
                        id="turn-limit"
                        type="number"
                        min={TURN_LIMIT_BOUNDS.min}
                        max={TURN_LIMIT_BOUNDS.max}
                        step={5}
                        value={turnLimit}
                        onChange={(e) => setTurnLimit(Number(e.target.value))}
                        className="w-full rounded-md border border-amber-700/50 bg-stone-950/70 p-2 text-amber-100 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  )}

                  {victoryType === "CAPTURE_TOWN" && (
                    <p className="mt-2 text-[11px] leading-snug text-amber-200/45">
                      {t("create.captureNote")}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-amber-700/40 bg-stone-950/60">
                  <button
                    type="button"
                    onClick={() => setShowRmgTuning((value) => !value)}
                    aria-expanded={showRmgTuning}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <span>
                      <span className="block text-xs font-bold uppercase tracking-wider text-amber-200/80">{t("create.generationSettings")}</span>
                      <span className="block text-[11px] uppercase tracking-wider text-amber-200/50">
                        {t("create.generationSummary", { res: normalizedRmgTuning.resourceBudgetPercent, bld: normalizedRmgTuning.buildingPercent, mon: normalizedRmgTuning.monsterPercent })}
                      </span>
                    </span>
                    <span className="shrink-0 rounded border border-amber-700/40 bg-black/40 px-2 py-1 text-sm font-black text-amber-200">
                      {showRmgTuning ? "-" : "+"}
                    </span>
                  </button>
                  {showRmgTuning && (
                    <div className="grid gap-3 border-t border-amber-700/30 p-3 md:grid-cols-2">
                      {RMG_TUNING_CONTROLS.map((control) => (
                        <RmgTuningSlider
                          key={control.key}
                          label={t(control.labelKey)}
                          min={control.min}
                          max={control.max}
                          step={control.step}
                          value={normalizedRmgTuning[control.key]}
                          onChange={(value) => updateRmgTuning(control.key, value)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Aperçu */}
              <div className="flex flex-col rounded-lg border border-amber-700/40 bg-stone-950/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wider text-amber-200/80">{t("create.mapPreview")}</div>
                    <div className="truncate text-[11px] uppercase tracking-wider text-amber-200/50">
                      {t("create.previewSeedSize", { seed: previewSeedLabel, size: previewSizeLabel })}{undergroundEnabled ? t("create.undergroundOn") : ""}
                    </div>
                  </div>
                  {undergroundEnabled && (
                    <div className="flex rounded-md border border-amber-700/40 bg-black/30 p-1">
                      {[
                        { id: SURFACE_LEVEL, label: t("create.surface") },
                        { id: UNDERGROUND_LEVEL, label: t("create.underground") },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setPreviewLevel(item.id)}
                          className={`rounded px-2 py-1 text-[11px] font-black uppercase tracking-wider ${
                            previewLevel === item.id ? "bg-amber-500/25 text-amber-100" : "text-amber-200/55 hover:text-amber-100"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowRmgPreview(true)}
                    className="shrink-0 rounded-md border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-100 transition hover:bg-amber-500/25"
                  >
                    {t("create.largePreview")}
                  </button>
                </div>
                {isPreviewGenerating || !visiblePreviewMap ? (
                  <RmgGenerationProgress
                    progress={previewGenerationProgress}
                    className="h-[300px] flex-1 rounded-md border-amber-700/40 bg-stone-950/70 lg:h-auto lg:min-h-[300px]"
                  />
                ) : (
                  <RmgMapPreview
                    map={visiblePreviewMap}
                    minSize={260}
                    maxSize={360}
                    cellScale={4}
                    className="h-[300px] flex-1 rounded-md border-amber-700/40 bg-stone-950/70 lg:h-auto lg:min-h-[300px]"
                  />
                )}
              </div>
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
              <div>
                {!isAdmin && (
                  <button onClick={() => onStepChange(1)} className={SECONDARY_BUTTON}>
                    {t("common.previous")}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={close} className={SECONDARY_BUTTON}>
                  {t("common.cancel")}
                </button>
                <button onClick={onCreate} disabled={creating} data-testid="create-game-submit" className={PRIMARY_BUTTON}>
                  {creating ? t("create.creating") : isAdmin ? t("create.create") : t("create.start")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showRmgPreview && step === 1 && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
          onClick={(event) => {
            event.stopPropagation();
            setShowRmgPreview(false);
          }}
        >
          <div
            className="my-auto flex h-[calc(100vh-2rem)] w-full max-w-[1500px] flex-col gap-4 border border-amber-700/40 bg-stone-950 p-4 text-stone-100 shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-800 pb-3">
              <div>
                <h3 className="text-xl font-semibold tracking-normal">{t("create.rmgPreview")}</h3>
                <p className="text-sm text-stone-400">
                  {t("create.previewSeedTemplate", { seed: previewSeedLabel, template: previewTemplateLabel })}{undergroundEnabled ? t("create.undergroundOn") : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {undergroundEnabled && (
                  <div className="flex rounded border border-stone-700 bg-stone-900 p-1">
                    {[
                      { id: SURFACE_LEVEL, label: t("create.surface") },
                      { id: UNDERGROUND_LEVEL, label: t("create.underground") },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setPreviewLevel(item.id)}
                        className={`h-7 rounded px-2 text-xs font-semibold ${
                          previewLevel === item.id ? "bg-amber-500/25 text-amber-100" : "text-stone-300 hover:text-amber-100"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={generateRandomSeed}
                  className="h-9 rounded border border-amber-500/60 bg-amber-500/15 px-3 text-sm font-semibold text-amber-100 hover:bg-amber-500/25"
                >
                  {t("create.newSeed")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRmgPreview(false)}
                  className="h-9 rounded border border-stone-700 bg-stone-900 px-3 text-sm font-semibold text-stone-200 hover:border-amber-500/60 hover:text-amber-100"
                >
                  {t("common.close")}
                </button>
              </div>
            </header>

            <section className="grid gap-3 border-b border-stone-800 pb-4 lg:grid-cols-[1fr_auto_auto_auto]">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-stone-400">{t("create.seed")}</span>
                <input
                  value={seed}
                  onChange={(event) => setSeed(event.target.value.toUpperCase() || randomSeedValue())}
                  maxLength={32}
                  className="h-9 rounded border border-stone-700 bg-stone-900 px-3 font-mono text-sm outline-none focus:border-amber-400"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-stone-400">{t("create.size")}</span>
                <select
                  value={mapSize}
                  onChange={(event) => setMapSize(event.target.value as MapSizeKey)}
                  className="h-9 rounded border border-stone-700 bg-stone-900 px-3 text-sm outline-none focus:border-amber-400"
                >
                  {Object.entries(MAP_SIZES).filter(([key]) => key !== "XL").map(([key, value]) => (
                    <option key={key} value={key}>
                      {key} - {value}x{value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-stone-400">{t("create.players")}</span>
                <select
                  value={maxPlayers}
                  onChange={(event) => setMaxPlayers(Number(event.target.value))}
                  className="h-9 rounded border border-stone-700 bg-stone-900 px-3 text-sm outline-none focus:border-amber-400"
                >
                  {[2, 3, 4, 5, 6].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-stone-400">{t("create.template")}</span>
                <select
                  value={selectedTemplateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="h-9 rounded border border-stone-700 bg-stone-900 px-3 text-sm outline-none focus:border-amber-400"
                >
                  <option value="auto">{t("create.templateAuto")}</option>
                  {templateOptions.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.id}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              {isPreviewGenerating || !visiblePreviewMap || !previewStats ? (
                <RmgGenerationProgress progress={previewGenerationProgress} className="min-h-[520px] xl:col-span-2" />
              ) : (
                <>
                  <RmgMapPreview map={visiblePreviewMap} minSize={420} maxSize={1120} cellScale={8} />

                  <aside className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1 text-sm">
                    <RmgLegend />
                    <RmgStatBlock title={t("rmg.terrain")} values={previewStats.terrain} total={visiblePreviewMap.width * visiblePreviewMap.height} />
                    <RmgStatBlock title={t("rmg.objects")} values={previewStats.objects} total={previewStats.objectTotal} />
                    <RmgStatBlock title={t("rmg.details")} values={previewStats.details} />
                  </aside>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
