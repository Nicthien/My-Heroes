alter table public.game_players
  alter column user_id drop not null;

alter table public.game_players
  add column if not exists is_ai boolean not null default false,
  add column if not exists ai_name text,
  add column if not exists ai_difficulty text not null default 'simple';

alter table public.games
  add column if not exists ai_runner_locked_at timestamptz;
