create table if not exists public.combat_surrender_negotiations (
  id uuid primary key default gen_random_uuid(),
  combat_id uuid not null references public.combats(id) on delete cascade,
  surrendering_player_id uuid not null references public.game_players(id) on delete cascade,
  surrendering_hero_id uuid not null references public.heroes(id) on delete cascade,
  target_player_id uuid not null references public.game_players(id) on delete cascade,
  side text not null,
  base_gold integer not null default 0,
  offer jsonb not null default '{"gold":0,"wood":0,"ore":0,"mercury":0,"crystals":0,"gems":0,"sulfur":0}'::jsonb,
  refusal_count integer not null default 0,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (combat_id, surrendering_hero_id)
);

alter publication supabase_realtime add table public.combat_surrender_negotiations;
