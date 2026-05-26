create table if not exists public.combat_reinforcement_requests (
  id uuid primary key default gen_random_uuid(),
  combat_id uuid not null references public.combats(id) on delete cascade,
  requester_player_id uuid not null references public.game_players(id) on delete cascade,
  requester_hero_id uuid not null references public.heroes(id) on delete cascade,
  target_player_id uuid not null references public.game_players(id) on delete cascade,
  side text not null,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (combat_id, requester_hero_id)
);

alter publication supabase_realtime add table public.combat_reinforcement_requests;
