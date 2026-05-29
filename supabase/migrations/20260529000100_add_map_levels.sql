alter table public.heroes
  add column if not exists map_level text not null default 'surface';

alter table public.towns
  add column if not exists map_level text not null default 'surface';

alter table public.neutral_armies
  add column if not exists map_level text not null default 'surface';

alter table public.resource_buildings
  add column if not exists map_level text not null default 'surface';

alter table public.gates
  add column if not exists map_level text not null default 'surface';

alter table public.boats
  add column if not exists map_level text not null default 'surface';

alter table public.combats
  add column if not exists map_level text not null default 'surface';
