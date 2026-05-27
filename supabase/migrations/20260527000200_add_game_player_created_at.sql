alter table public.game_players
  add column if not exists created_at timestamptz not null default now();
