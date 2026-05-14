alter table public.heroes add column if not exists mana integer not null default 10;
alter table public.heroes add column if not exists max_mana integer not null default 10;
alter table public.heroes add column if not exists morale integer not null default 0;
alter table public.heroes add column if not exists luck integer not null default 0;
alter table public.heroes add column if not exists boat_id text;
alter table public.heroes add column if not exists map_layer text not null default 'surface';

create table if not exists public.adventure_objects (
  id text primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  game_player_id uuid references public.game_players(id) on delete set null,
  object_type text not null,
  x integer not null,
  y integer not null,
  guardian_power integer not null default 0,
  state jsonb not null default '{}'
);

create table if not exists public.hero_artifacts (
  id uuid primary key default gen_random_uuid(),
  hero_id uuid not null references public.heroes(id) on delete cascade,
  artifact_type text not null,
  slot text,
  created_at timestamptz not null default now()
);

create table if not exists public.hero_skills (
  id uuid primary key default gen_random_uuid(),
  hero_id uuid not null references public.heroes(id) on delete cascade,
  skill text not null,
  level integer not null default 1,
  created_at timestamptz not null default now(),
  unique (hero_id, skill)
);

create table if not exists public.hero_spellbook (
  id uuid primary key default gen_random_uuid(),
  hero_id uuid not null references public.heroes(id) on delete cascade,
  spell text not null,
  created_at timestamptz not null default now(),
  unique (hero_id, spell)
);

create table if not exists public.hero_status_effects (
  id uuid primary key default gen_random_uuid(),
  hero_id uuid not null references public.heroes(id) on delete cascade,
  effect_type text not null,
  amount integer not null default 0,
  expires_on text,
  expires_turn integer,
  created_at timestamptz not null default now()
);

alter publication supabase_realtime add table public.adventure_objects;
