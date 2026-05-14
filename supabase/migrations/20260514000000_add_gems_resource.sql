alter table public.game_players
  add column if not exists gems integer not null default 5;
