-- Adventure spell effects that persist on a hero until the start of their next turn
-- (fly, water_walk, disguise). Stored as a JSON array of { spellId }.
alter table public.heroes add column if not exists active_spell_effects jsonb default null;
