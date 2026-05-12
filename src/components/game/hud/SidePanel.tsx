"use client";

import { useSession } from "@/lib/auth/client";
import { useGameStore } from "@/lib/stores/gameStore";
import { RESOURCE_BUILDING_RULES } from "@/lib/game/economy";
import {
  CornerOrnaments,
  HourglassIcon,
  MineIcon,
  OrnateHeader,
  ParchmentBackground,
  PortraitSeal,
  TowerIcon,
  goldText,
  ornateFrame,
} from "./theme";

export default function SidePanel() {
  const { data: session } = useSession();
  const gameState = useGameStore((s) => s.gameState);
  const selectedHeroId = useGameStore((s) => s.selectedHeroId);
  const selectedTownId = useGameStore((s) => s.selectedTownId);

  if (!gameState) return null;
  const me = gameState.players.find((p) => p.userId === session?.user?.id);
  if (!me) return null;

  const focusTile = useGameStore.getState().focusTile;
  const selectHero = useGameStore.getState().selectHero;
  const selectTown = useGameStore.getState().selectTown;

  const heroes = me.heroes;
  const towns = me.towns;
  const mines = me.resourceBuildings;

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-3">
      <Section title={`Héros (${heroes.length})`}>
        {heroes.length === 0 && <EmptyRow label="Aucun héros" />}
        {heroes.map((h) => {
          const active = h.id === selectedHeroId;
          return (
            <Row
              key={h.id}
              active={active}
              onClick={() => {
                selectHero(h.id);
                focusTile(h.position.x, h.position.y);
              }}
              left={
                <PortraitSeal
                  color={me.color}
                  label={h.name.slice(0, 2)}
                  active={active}
                  size={40}
                />
              }
              title={h.name}
              subtitle={`Niveau ${h.level}`}
              meta={
                <div className="flex items-center gap-1 text-[10px] text-amber-200/80">
                  <HourglassIcon className="h-3 w-3" />
                  {h.movement}/{h.maxMovement}
                </div>
              }
            />
          );
        })}
      </Section>

      <Section title={`Châteaux (${towns.length})`}>
        {towns.length === 0 && <EmptyRow label="Aucun château" />}
        {towns.map((t) => {
          const active = t.id === selectedTownId;
          return (
            <Row
              key={t.id}
              active={active}
              onClick={() => {
                selectTown(t.id);
                focusTile(t.position.x, t.position.y);
              }}
              left={
                <div
                  className={`grid h-10 w-10 place-items-center rounded-lg border ${
                    active
                      ? "border-amber-300 bg-amber-700/40"
                      : "border-amber-700/60 bg-stone-900/80"
                  }`}
                >
                  <TowerIcon className="h-6 w-6 text-amber-300" />
                </div>
              }
              title={t.name}
              subtitle={`Niveau ${t.level}`}
            />
          );
        })}
      </Section>

      <Section title={`Mines (${mines.length})`}>
        {mines.length === 0 && <EmptyRow label="Aucune mine" />}
        {mines.map((m) => {
          const rule = RESOURCE_BUILDING_RULES.find((r) => r.type === m.type);
          const label = rule?.label ?? m.type;
          const prod = rule
            ? Object.entries(rule.production)
                .map(([k, v]) => `+${v} ${k}`)
                .join(", ")
            : "";
          return (
            <Row
              key={m.id}
              onClick={() => focusTile(m.position.x, m.position.y)}
              left={
                <div className="grid h-10 w-10 place-items-center rounded-lg border border-amber-700/60 bg-stone-900/80">
                  <MineIcon className="h-6 w-6 text-amber-300" />
                </div>
              }
              title={label}
              subtitle={prod}
            />
          );
        })}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`relative ${ornateFrame}`}>
      <CornerOrnaments />
      <ParchmentBackground />
      <OrnateHeader>{title}</OrnateHeader>
      <div className="max-h-64 space-y-1 overflow-y-auto px-2 py-2">{children}</div>
    </div>
  );
}

function Row({
  left,
  title,
  subtitle,
  meta,
  active,
  onClick,
}: {
  left: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
        active
          ? "border-amber-400/70 bg-amber-700/15 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.25)]"
          : "border-amber-700/20 bg-black/30 hover:border-amber-500/50 hover:bg-amber-900/15"
      }`}
    >
      {left}
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-bold ${active ? goldText : "text-amber-100"}`}>
          {title}
        </div>
        {subtitle && (
          <div className="truncate text-[11px] text-amber-200/60">{subtitle}</div>
        )}
      </div>
      {meta}
    </button>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="px-2 py-3 text-center text-xs italic text-amber-200/40">{label}</div>;
}
