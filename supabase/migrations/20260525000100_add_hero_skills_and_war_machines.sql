alter table public.heroes
  add column if not exists skills jsonb not null default '{}'::jsonb,
  add column if not exists war_machines jsonb not null default '{}'::jsonb;
