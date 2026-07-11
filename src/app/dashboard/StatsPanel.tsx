"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CornerOrnaments,
  ParchmentBackground,
  goldText,
  ornateFramePolished,
} from "@/components/game/hud/theme";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/types";
import { FACTION_META, factionLabel } from "./factionMeta";

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

interface AdminStats {
  totals: {
    users: number;
    admins: number;
    games: number;
    pendingGames: number;
    activeGames: number;
    completedGames: number;
    abandonedGames: number;
    players: number;
    humanPlayers: number;
    aiPlayers: number;
    combats: number;
    heroes: number;
  };
  averages: {
    turnsPerGame: number;
    turnsPerCompletedGame: number;
    playersPerGame: number;
  };
  gamesByStatus: { key: string; count: number }[];
  factionDistribution: { key: string; count: number }[];
  gamesOverTime: { date: string; count: number }[];
  usersOverTime: { date: string; count: number }[];
  anonymousUsers: {
    trackingStartedAt: string | null;
    totals: {
      currentAnonymous: number;
      pendingConversions: number;
      guestsCreated: number;
      conversionRequests: number;
      conversionsCompleted: number;
      conversionRate: number;
    };
    guestsOverTime: { date: string; count: number }[];
    conversionRequestsOverTime: { date: string; count: number }[];
    conversionsCompletedOverTime: { date: string; count: number }[];
  };
  topPlayers: { name: string; gamesPlayed: number; gamesWon: number; bestScore: number }[];
}

interface StatsPanelProps {
  fetchWithAuth: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  parseJsonResponse: (response: Response) => Promise<unknown>;
  t: TFn;
  locale: Locale;
  onClose: () => void;
}

interface StatsPanelBodyProps {
  fetchWithAuth: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  parseJsonResponse: (response: Response) => Promise<unknown>;
  t: TFn;
  locale: Locale;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#fbbf24",
  ACTIVE: "#34d399",
  COMPLETED: "#22d3ee",
  ABANDONED: "#9ca3af",
};

function statusLabel(status: string, t: TFn) {
  if (status === "PENDING") return t("status.pending");
  if (status === "ACTIVE") return t("status.active");
  if (status === "COMPLETED") return t("status.completed");
  if (status === "ABANDONED") return t("stats.abandoned");
  return status;
}

function numberLocale(locale: Locale) {
  return locale === "en" ? "en-US" : "fr-FR";
}

function formatDecimal(value: number, locale: Locale) {
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: 1 }).format(value);
}

function formatTooltipDate(isoDate: string, locale: Locale) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(numberLocale(locale), { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-md border border-amber-700/35 bg-stone-950/55 px-3 py-3">
      <div className={`text-2xl font-black ${accent ?? goldText}`}>{value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-amber-200/60">{label}</div>
    </div>
  );
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 truncate text-xs font-semibold text-amber-100/85">{label}</div>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-black/40">
        <div
          className="h-full rounded transition-all"
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%`, backgroundColor: color }}
        />
      </div>
      <div className="w-20 shrink-0 text-right text-xs font-bold text-amber-100/80">
        {count} <span className="text-amber-200/45">({pct}%)</span>
      </div>
    </div>
  );
}

interface OverTimeColors {
  /** Gradient/area fill base color. */
  area: string;
  /** Line stroke color. */
  line: string;
  /** Data point dot color. */
  dot: string;
}

const GAMES_OVER_TIME_COLORS: OverTimeColors = { area: "#f59e0b", line: "#fbbf24", dot: "#fde68a" };
const USERS_OVER_TIME_COLORS: OverTimeColors = { area: "#22d3ee", line: "#67e8f9", dot: "#a5f3fc" };
const GUESTS_OVER_TIME_COLORS: OverTimeColors = { area: "#a855f7", line: "#c084fc", dot: "#e9d5ff" };

function OverTimeChart({
  data,
  title,
  gradientId,
  colors,
  t,
  locale,
}: {
  data: { date: string; count: number }[];
  title: string;
  gradientId: string;
  colors: OverTimeColors;
  t: TFn;
  locale: Locale;
}) {
  const width = 720;
  const height = 180;
  const padX = 32;
  const padY = 20;
  const max = Math.max(1, ...data.map((point) => point.count));
  const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;
  const pointX = (index: number) => padX + index * stepX;
  const pointY = (count: number) => height - padY - (count / max) * (height - padY * 2);

  const linePath = data
    .map((point, index) => `${index === 0 ? "M" : "L"}${pointX(index).toFixed(1)},${pointY(point.count).toFixed(1)}`)
    .join(" ");
  const areaPath =
    data.length > 0
      ? `${linePath} L${pointX(data.length - 1).toFixed(1)},${height - padY} L${pointX(0).toFixed(1)},${height - padY} Z`
      : "";

  const periodTotal = data.reduce((sum, point) => sum + point.count, 0);
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-amber-100">{title}</h3>
        <span className="text-xs font-semibold text-amber-200/60">{t("stats.last30Days", { n: periodTotal })}</span>
      </div>
      <div className="rounded-md border border-amber-700/35 bg-stone-950/55 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" preserveAspectRatio="none" role="img">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.area} stopOpacity="0.45" />
              <stop offset="100%" stopColor={colors.area} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((fraction) => (
            <line
              key={fraction}
              x1={padX}
              x2={width - padX}
              y1={padY + fraction * (height - padY * 2)}
              y2={padY + fraction * (height - padY * 2)}
              stroke="#78716c"
              strokeOpacity="0.25"
              strokeWidth="1"
            />
          ))}
          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
          {linePath && <path d={linePath} fill="none" stroke={colors.line} strokeWidth="2" />}
          {data.map((point, index) => {
            if (point.count === 0) return null;
            const cx = pointX(index);
            const cy = pointY(point.count);
            return (
              <g key={point.date}>
                <circle cx={cx} cy={cy} r="2.5" fill={colors.dot} />
                <circle cx={cx} cy={cy} r="10" fill="transparent" style={{ cursor: "pointer" }}>
                  <title>{`${formatTooltipDate(point.date, locale)} : ${point.count}`}</title>
                </circle>
              </g>
            );
          })}
          {data.map((point, index) =>
            index % labelEvery === 0 ? (
              <text
                key={`label-${point.date}`}
                x={pointX(index)}
                y={height - 4}
                textAnchor="middle"
                fontSize="9"
                fill="#d6d3d1"
                fillOpacity="0.6"
              >
                {point.date.slice(5)}
              </text>
            ) : null,
          )}
          <text x={padX - 6} y={padY + 4} textAnchor="end" fontSize="9" fill="#d6d3d1" fillOpacity="0.6">
            {max}
          </text>
        </svg>
      </div>
    </div>
  );
}

function ConversionComparisonChart({
  requests,
  completed,
  t,
  locale,
}: {
  requests: { date: string; count: number }[];
  completed: { date: string; count: number }[];
  t: TFn;
  locale: Locale;
}) {
  const width = 720;
  const height = 180;
  const padX = 32;
  const padY = 20;
  const max = Math.max(1, ...requests.map((point) => point.count), ...completed.map((point) => point.count));
  const stepX = requests.length > 1 ? (width - padX * 2) / (requests.length - 1) : 0;
  const x = (index: number) => padX + index * stepX;
  const y = (count: number) => height - padY - (count / max) * (height - padY * 2);
  const path = (data: { count: number }[]) =>
    data.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.count).toFixed(1)}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(requests.length / 6));

  return (
    <div data-testid="anonymous-conversions-chart">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-amber-100">{t("stats.anonymousConversionsOverTime")}</h3>
        <div className="flex gap-4 text-xs font-semibold">
          <span className="text-amber-300">● {t("stats.conversionRequests")}</span>
          <span className="text-emerald-300">● {t("stats.conversionsCompleted")}</span>
        </div>
      </div>
      <div className="rounded-md border border-amber-700/35 bg-stone-950/55 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label={t("stats.anonymousConversionsOverTime")}>
          {[0, 0.5, 1].map((fraction) => (
            <line key={fraction} x1={padX} x2={width - padX} y1={padY + fraction * (height - padY * 2)} y2={padY + fraction * (height - padY * 2)} stroke="#78716c" strokeOpacity="0.25" />
          ))}
          <path d={path(requests)} fill="none" stroke="#fbbf24" strokeWidth="2" />
          <path d={path(completed)} fill="none" stroke="#34d399" strokeWidth="2" />
          {requests.map((point, index) => (
            <g key={point.date}>
              <circle cx={x(index)} cy={y(point.count)} r="2.5" fill="#fbbf24"><title>{`${formatTooltipDate(point.date, locale)} : ${t("stats.conversionRequests")} ${point.count}`}</title></circle>
              <circle cx={x(index)} cy={y(completed[index]?.count ?? 0)} r="2.5" fill="#34d399"><title>{`${formatTooltipDate(point.date, locale)} : ${t("stats.conversionsCompleted")} ${completed[index]?.count ?? 0}`}</title></circle>
              {index % labelEvery === 0 && <text x={x(index)} y={height - 4} textAnchor="middle" fontSize="9" fill="#d6d3d1" fillOpacity="0.6">{point.date.slice(5)}</text>}
            </g>
          ))}
          <text x={padX - 6} y={padY + 4} textAnchor="end" fontSize="9" fill="#d6d3d1" fillOpacity="0.6">{max}</text>
        </svg>
      </div>
    </div>
  );
}

export function StatsPanelBody({ fetchWithAuth, parseJsonResponse, t, locale }: StatsPanelBodyProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await fetchWithAuth("/api/admin/stats", { cache: "no-store" });
    if (!response.ok) {
      const data = (await parseJsonResponse(response)) as { error?: string } | null;
      setError(localizedServerMessage(data?.error, locale) || t("stats.loadFailed"));
      setLoading(false);
      return;
    }
    const data = (await parseJsonResponse(response)) as AdminStats | null;
    setStats(data);
    setLoading(false);
  }, [fetchWithAuth, parseJsonResponse, locale, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats().catch((err) => {
      console.error(err);
      setError(t("stats.loadFailed"));
      setLoading(false);
    });
  }, [loadStats, t]);

  const totals = stats?.totals;
  const factionTotal = stats?.factionDistribution.reduce((sum, entry) => sum + entry.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => loadStats().catch(console.error)}
          disabled={loading}
          className="rounded-md border border-cyan-400/50 bg-cyan-950/50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-cyan-100 transition hover:border-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t("common.loading") : t("admin.refresh")}
        </button>
      </div>
      <div className="space-y-6">{renderStatsBody({ stats, error, totals, factionTotal, locale, t })}</div>
    </div>
  );
}

function renderStatsBody({
  stats,
  error,
  totals,
  factionTotal,
  locale,
  t,
}: {
  stats: AdminStats | null;
  error: string | null;
  totals: AdminStats["totals"] | undefined;
  factionTotal: number;
  locale: Locale;
  t: TFn;
}) {
  return (
    <>
      {error && (
        <div className="rounded-md border border-red-400/50 bg-red-950/45 px-4 py-3 text-sm font-semibold text-red-100">
          {error}
        </div>
      )}

      {!stats && !error && (
        <div className="py-16 text-center text-sm italic text-amber-200/50">{t("common.loading")}</div>
      )}

      {totals && stats && (
        <>
          <section>
            <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-amber-100">{t("stats.overview")}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <StatCard label={t("stats.totalUsers")} value={totals.users} />
              <StatCard label={t("stats.totalGames")} value={totals.games} />
              <StatCard label={t("stats.activeGames")} value={totals.activeGames} accent="text-emerald-300" />
              <StatCard label={t("stats.completedGames")} value={totals.completedGames} accent="text-cyan-300" />
              <StatCard label={t("stats.totalPlayers")} value={totals.players} />
              <StatCard label={t("stats.humanPlayers")} value={totals.humanPlayers} />
              <StatCard label={t("stats.aiPlayers")} value={totals.aiPlayers} />
              <StatCard label={t("stats.totalCombats")} value={totals.combats} accent="text-rose-300" />
            </div>
          </section>

          <section data-testid="anonymous-account-stats">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <h3 className="text-sm font-black uppercase tracking-[0.18em] text-amber-100">{t("stats.anonymousUsers")}</h3>
              <span className="text-xs text-amber-200/55">
                {stats.anonymousUsers.trackingStartedAt
                  ? t("stats.trackingSince", { date: formatTooltipDate(stats.anonymousUsers.trackingStartedAt, locale) })
                  : t("stats.trackingSinceUnknown")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label={t("stats.currentAnonymous")} value={stats.anonymousUsers.totals.currentAnonymous} accent="text-purple-300" />
              <StatCard label={t("stats.pendingConversions")} value={stats.anonymousUsers.totals.pendingConversions} accent="text-orange-300" />
              <StatCard label={t("stats.guestsCreated")} value={stats.anonymousUsers.totals.guestsCreated} />
              <StatCard label={t("stats.conversionRequests")} value={stats.anonymousUsers.totals.conversionRequests} />
              <StatCard label={t("stats.conversionsCompleted")} value={stats.anonymousUsers.totals.conversionsCompleted} accent="text-emerald-300" />
              <StatCard label={t("stats.conversionRate")} value={`${formatDecimal(stats.anonymousUsers.totals.conversionRate, locale)} %`} accent="text-cyan-300" />
            </div>
          </section>

          <div data-testid="anonymous-guests-chart">
            <OverTimeChart
              data={stats.anonymousUsers.guestsOverTime}
              title={t("stats.guestsOverTime")}
              gradientId="stats-guests-area"
              colors={GUESTS_OVER_TIME_COLORS}
              t={t}
              locale={locale}
            />
          </div>

          <ConversionComparisonChart
            requests={stats.anonymousUsers.conversionRequestsOverTime}
            completed={stats.anonymousUsers.conversionsCompletedOverTime}
            t={t}
            locale={locale}
          />

          <section>
            <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-amber-100">{t("stats.averages")}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard label={t("stats.avgTurns")} value={formatDecimal(stats.averages.turnsPerGame, locale)} />
              <StatCard
                label={t("stats.avgTurnsCompleted")}
                value={formatDecimal(stats.averages.turnsPerCompletedGame, locale)}
              />
              <StatCard label={t("stats.avgPlayers")} value={formatDecimal(stats.averages.playersPerGame, locale)} />
            </div>
          </section>

          <OverTimeChart
            data={stats.gamesOverTime}
            title={t("stats.gamesOverTime")}
            gradientId="stats-games-area"
            colors={GAMES_OVER_TIME_COLORS}
            t={t}
            locale={locale}
          />

          <OverTimeChart
            data={stats.usersOverTime}
            title={t("stats.usersOverTime")}
            gradientId="stats-users-area"
            colors={USERS_OVER_TIME_COLORS}
            t={t}
            locale={locale}
          />

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-amber-100">
                {t("stats.gamesByStatus")}
              </h3>
              <div className="space-y-2 rounded-md border border-amber-700/35 bg-stone-950/55 p-3">
                {stats.gamesByStatus.length === 0 && (
                  <div className="py-4 text-center text-xs italic text-amber-200/50">{t("stats.noData")}</div>
                )}
                {stats.gamesByStatus.map((entry) => (
                  <BarRow
                    key={entry.key}
                    label={statusLabel(entry.key, t)}
                    count={entry.count}
                    total={totals.games}
                    color={STATUS_COLORS[entry.key] ?? "#a8a29e"}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-amber-100">
                {t("stats.factionDistribution")}
              </h3>
              <div className="space-y-2 rounded-md border border-amber-700/35 bg-stone-950/55 p-3">
                {stats.factionDistribution.length === 0 && (
                  <div className="py-4 text-center text-xs italic text-amber-200/50">{t("stats.noData")}</div>
                )}
                {stats.factionDistribution.map((entry) => (
                  <BarRow
                    key={entry.key}
                    label={factionLabel(entry.key, locale)}
                    count={entry.count}
                    total={factionTotal}
                    color={FACTION_META[entry.key]?.color ?? "#a8a29e"}
                  />
                ))}
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-amber-100">{t("stats.topPlayers")}</h3>
            <div className="overflow-x-auto rounded-md border border-amber-700/35">
              <table className="min-w-full divide-y divide-amber-900/60 text-left text-sm">
                <thead className="bg-stone-950/70 text-xs uppercase tracking-wider text-amber-200/70">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">{t("leaderboard.player")}</th>
                    <th className="px-3 py-2 text-right">{t("stats.colGamesPlayed")}</th>
                    <th className="px-3 py-2 text-right">{t("stats.colGamesWon")}</th>
                    <th className="px-3 py-2 text-right">{t("stats.colBestScore")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-900/35 bg-stone-950/35 text-amber-100/85">
                  {stats.topPlayers.map((player, index) => (
                    <tr key={`${player.name}-${index}`}>
                      <td className="px-3 py-2 font-black text-amber-300">{index + 1}</td>
                      <td className="px-3 py-2 font-semibold">{player.name}</td>
                      <td className="px-3 py-2 text-right">{player.gamesPlayed}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-300">{player.gamesWon}</td>
                      <td className="px-3 py-2 text-right">{player.bestScore}</td>
                    </tr>
                  ))}
                  {stats.topPlayers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center italic text-amber-200/50">
                        {t("stats.noData")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

export function StatsPanel({ fetchWithAuth, parseJsonResponse, t, locale, onClose }: StatsPanelProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stats-panel-title"
        className={`relative ${ornateFramePolished} my-auto w-full max-w-5xl p-4 sm:p-6`}
        data-testid="stats-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <CornerOrnaments />
        <ParchmentBackground />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="stats-panel-title" className={`text-xl font-black uppercase tracking-[0.2em] ${goldText}`}>
            {t("stats.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-amber-700/40 bg-stone-950/70 px-4 py-2 text-xs font-black uppercase tracking-wider text-amber-200/80 transition hover:border-amber-500/60 hover:text-amber-100"
          >
            {t("common.close")}
          </button>
        </div>
        <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto pr-1">
          <StatsPanelBody fetchWithAuth={fetchWithAuth} parseJsonResponse={parseJsonResponse} t={t} locale={locale} />
        </div>
      </div>
    </div>
  );
}
