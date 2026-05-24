alter table public.heroes
  add column if not exists status text not null default 'ACTIVE';

