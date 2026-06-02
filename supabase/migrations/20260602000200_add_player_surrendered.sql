-- Track players who forfeit a game so their surrendered games are excluded from
-- the cross-game leaderboard aggregates (player_stats).
alter table public.game_players
  add column if not exists surrendered boolean not null default false;
