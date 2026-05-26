create table if not exists public.combat_truces (
  id uuid primary key default gen_random_uuid(),
  combat_id uuid not null references public.combats(id) on delete cascade,
  requested_by_player_id uuid not null references public.game_players(id) on delete cascade,
  requested_by_hero_id uuid not null references public.heroes(id) on delete cascade,
  side text not null,
  pause_until_turn integer not null,
  acknowledged_player_ids jsonb not null default '[]',
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (combat_id, requested_by_player_id)
);

alter publication supabase_realtime add table public.combat_truces;
