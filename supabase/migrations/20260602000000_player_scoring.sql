-- Player scoring & cross-game leaderboard.

-- Per-game cumulative counters used to compute a player's score.
alter table public.game_players add column if not exists score_stats jsonb not null default '{}';

-- Cross-game aggregate leaderboard stats, one row per user.
create table if not exists public.player_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  games_played integer not null default 0,
  games_won integer not null default 0,
  best_score integer not null default 0,
  total_score bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Leaderboard is public to all authenticated users; writes go through the service-role API only.
alter table public.player_stats enable row level security;
drop policy if exists "player_stats readable by authenticated users" on public.player_stats;
create policy "player_stats readable by authenticated users" on public.player_stats
  for select to authenticated
  using (true);
