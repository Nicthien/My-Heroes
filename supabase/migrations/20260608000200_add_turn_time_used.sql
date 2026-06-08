-- Turn-timer: remember how much of the per-turn time budget a player had already
-- spent when they ended their turn. When a player CANCELS their end-turn, this
-- lets us resume their clock where it left off instead of refilling it.
alter table public.turns
  add column if not exists time_used_ms bigint not null default 0;
