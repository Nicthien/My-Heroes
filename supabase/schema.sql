-- Supabase schema for My Heroes.
-- Run this in Supabase SQL Editor on a fresh project.

create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.game_status as enum ('PENDING', 'ACTIVE', 'COMPLETED', 'ABANDONED');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.game_status not null default 'PENDING',
  max_players integer not null default 2,
  map_width integer not null default 36,
  map_height integer not null default 36,
  turn_number integer not null default 1,
  current_turn_player_id uuid,
  winner_id uuid,
  map_data jsonb not null,
  game_config jsonb not null default '{}',
  map_state jsonb not null default '{}',
  ai_runner_locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  faction text not null,
  color text not null,
  is_ai boolean not null default false,
  ai_name text,
  ai_difficulty text not null default 'simple',
  gold integer not null default 5000,
  wood integer not null default 200,
  ore integer not null default 100,
  mercury integer not null default 50,
  crystals integer not null default 50,
  gems integer not null default 50,
  sulfur integer not null default 50,
  is_ready boolean not null default false,
  is_alive boolean not null default true,
  turn_order integer not null,
  explored_tiles jsonb not null default '[]',
  unique (game_id, user_id)
);

alter table public.games
  add constraint games_current_turn_player_id_fkey foreign key (current_turn_player_id) references public.game_players(id) on delete set null,
  add constraint games_winner_id_fkey foreign key (winner_id) references public.game_players(id) on delete set null;

create table public.heroes (
  id uuid primary key default gen_random_uuid(),
  game_player_id uuid not null references public.game_players(id) on delete cascade,
  name text not null,
  hero_class text not null default 'knight',
  specialty text,
  level integer not null default 1,
  experience integer not null default 0,
  attack integer not null default 1,
  defense integer not null default 1,
  spell_power integer not null default 1,
  knowledge integer not null default 1,
  morale integer not null default 0,
  luck integer not null default 0,
  mana integer not null default 10,
  has_spell_book boolean not null default true,
  known_spells jsonb default null,
  artifacts jsonb not null default '{"inventory":[],"equipment":{}}'::jsonb,
  skills jsonb not null default '{}'::jsonb,
  war_machines jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE',
  movement numeric not null default 1500,
  max_movement numeric not null default 1500,
  x integer not null,
  y integer not null,
  is_moving boolean not null default false
);

create table public.armies (
  id uuid primary key default gen_random_uuid(),
  hero_id uuid not null references public.heroes(id) on delete cascade,
  unit_type text not null,
  count integer not null,
  health integer not null,
  max_health integer not null,
  position integer not null
);

create table public.towns (
  id uuid primary key default gen_random_uuid(),
  game_player_id uuid not null references public.game_players(id) on delete cascade,
  name text not null,
  town_type text not null,
  x integer not null,
  y integer not null,
  level integer not null default 1,
  is_fort boolean not null default false,
  buildings jsonb not null default '[]',
  garrison jsonb not null default '[]',
  available_recruits jsonb not null default '{}',
  tavern_offer jsonb not null default '[]',
  last_built_turn integer
);

-- Migration for existing databases (idempotent):
-- alter table public.heroes add column if not exists hero_class text not null default 'knight';
-- alter table public.heroes add column if not exists specialty text;
-- alter table public.towns add column if not exists tavern_offer jsonb not null default '[]';

create table public.neutral_armies (
  id text primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  x integer not null,
  y integer not null,
  status text not null default 'ACTIVE'
);

create table public.neutral_army_stacks (
  id uuid primary key default gen_random_uuid(),
  neutral_army_id text not null references public.neutral_armies(id) on delete cascade,
  unit_type text not null,
  count integer not null,
  health integer not null,
  max_health integer not null,
  position integer not null
);

create table public.resource_buildings (
  id text primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  game_player_id uuid references public.game_players(id) on delete set null,
  building_type text not null,
  x integer not null,
  y integer not null,
  guardian_power integer not null default 0
);

create table public.gates (
  id text primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  game_player_id uuid references public.game_players(id) on delete set null,
  x integer not null,
  y integer not null,
  guardian_power integer not null default 0
);

create table public.gate_stacks (
  id uuid primary key default gen_random_uuid(),
  gate_id text not null references public.gates(id) on delete cascade,
  unit_type text not null,
  count integer not null,
  health integer not null,
  max_health integer not null,
  position integer not null
);

create table public.boats (
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

create table public.turns (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  game_player_id uuid not null references public.game_players(id) on delete cascade,
  turn_number integer not null,
  actions jsonb not null default '[]',
  is_completed boolean not null default false,
  unique (game_id, game_player_id, turn_number)
);

create table public.combats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  mode text not null,
  status text not null default 'ACTIVE',
  attacker_player_id uuid not null references public.game_players(id) on delete cascade,
  defender_player_id uuid references public.game_players(id) on delete set null,
  attacker_hero_id uuid not null references public.heroes(id) on delete cascade,
  defender_hero_id uuid references public.heroes(id) on delete set null,
  neutral_army_id text references public.neutral_armies(id) on delete set null,
  gate_id text references public.gates(id) on delete set null,
  current_player_id uuid references public.game_players(id) on delete set null,
  current_unit_id text,
  round integer not null default 1,
  x integer not null,
  y integer not null,
  board_state jsonb not null,
  turn_queue jsonb not null default '[]',
  action_log jsonb not null default '[]',
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.combat_participants (
  id uuid primary key default gen_random_uuid(),
  combat_id uuid not null references public.combats(id) on delete cascade,
  player_id uuid not null references public.game_players(id) on delete cascade,
  hero_id uuid not null references public.heroes(id) on delete cascade,
  side text not null,
  joined_at timestamptz not null default now(),
  unique (combat_id, hero_id)
);

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_players;
alter publication supabase_realtime add table public.heroes;
alter publication supabase_realtime add table public.towns;
alter publication supabase_realtime add table public.resource_buildings;
alter publication supabase_realtime add table public.gates;
alter publication supabase_realtime add table public.gate_stacks;
alter publication supabase_realtime add table public.boats;
alter publication supabase_realtime add table public.combats;
alter publication supabase_realtime add table public.combat_participants;

alter table public.profiles enable row level security;
create policy "profiles readable by authenticated users" on public.profiles for select to authenticated using (true);
create policy "users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id);

-- ============================================================================
-- RMG (Random Map Generator) — refonte map (templates, seed, zones, châteaux neutres)
-- ============================================================================

alter table public.games add column if not exists seed text;
alter table public.games add column if not exists map_size text;
alter table public.games add column if not exists template_id text;

-- Châteaux neutres : game_player_id devient nullable, ajout des colonnes is_neutral/neutral_garrison
alter table public.towns alter column game_player_id drop not null;
alter table public.towns add column if not exists game_id uuid references public.games(id) on delete cascade;
alter table public.towns add column if not exists is_neutral boolean not null default false;
alter table public.towns add column if not exists neutral_garrison jsonb not null default '[]';
