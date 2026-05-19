create table if not exists public.gates (
  id text primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  game_player_id uuid references public.game_players(id) on delete set null,
  x integer not null,
  y integer not null,
  guardian_power integer not null default 0
);

create table if not exists public.gate_stacks (
  id uuid primary key default gen_random_uuid(),
  gate_id text not null references public.gates(id) on delete cascade,
  unit_type text not null,
  count integer not null,
  health integer not null,
  max_health integer not null,
  position integer not null
);

alter table public.combats
  add column if not exists gate_id text references public.gates(id) on delete set null;

alter publication supabase_realtime add table public.gates;
alter publication supabase_realtime add table public.gate_stacks;
