-- Add per-town tavern hero offer.
-- Declared in schema.sql for fresh installs but missing from migrated databases,
-- which left BUILD (Tavern) writes falling back to dropping the column so no
-- heroes ever became available for hire.
alter table public.towns
  add column if not exists tavern_offer jsonb not null default '[]';
