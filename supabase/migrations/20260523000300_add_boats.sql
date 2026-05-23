create table if not exists public.boats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  owner_player_id uuid references public.game_players(id) on delete set null,
  hero_id uuid references public.heroes(id) on delete cascade,
  faction text not null default 'castle',
  x integer not null,
  y integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boats_empty_or_occupied check (
    (hero_id is null and x >= 0 and y >= 0) or
    (hero_id is not null)
  )
);

do $$
begin
  alter publication supabase_realtime add table public.boats;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
