-- Per-round score history, used to draw the end-of-game progression chart.
-- One row per (game, player, round). Scores are recomputed from authoritative
-- state and persisted when a round closes (and once more when the game ends).
create table if not exists public.score_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  game_player_id uuid not null references public.game_players(id) on delete cascade,
  turn_number integer not null,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, game_player_id, turn_number)
);

create index if not exists score_snapshots_game_turn_idx
  on public.score_snapshots (game_id, turn_number);

alter table public.score_snapshots enable row level security;

drop policy if exists "score_snapshots visible to members" on public.score_snapshots;
create policy "score_snapshots visible to members" on public.score_snapshots
  for select to authenticated
  using (public.is_game_member(game_id));
