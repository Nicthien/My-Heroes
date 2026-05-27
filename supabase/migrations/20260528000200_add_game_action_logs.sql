create table if not exists public.game_action_logs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  game_player_id uuid references public.game_players(id) on delete set null,
  actor_kind text not null check (actor_kind in ('player', 'ai', 'system')),
  turn_number integer not null,
  action_type text not null,
  category text not null,
  summary text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists game_action_logs_game_turn_created_idx
  on public.game_action_logs (game_id, turn_number desc, created_at desc);
