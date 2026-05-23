alter table public.heroes
  add column if not exists luck integer not null default 0,
  add column if not exists artifacts jsonb not null default '{"inventory":[],"equipment":{}}'::jsonb;
