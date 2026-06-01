-- Add hero class and specialty.
-- Declared in schema.sql for fresh installs but missing from migrated databases,
-- which left hero inserts falling back to dropping these columns. As a result
-- heroes lost their class/specialty and tavern de-duplication by template stopped
-- working.
alter table public.heroes
  add column if not exists hero_class text not null default 'knight';
alter table public.heroes
  add column if not exists specialty text;
