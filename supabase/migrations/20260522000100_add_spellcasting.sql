alter table public.heroes add column if not exists mana integer;
alter table public.heroes add column if not exists has_spell_book boolean not null default true;
alter table public.heroes add column if not exists known_spells jsonb default null;

update public.heroes
set mana = greatest(0, knowledge * 10)
where mana is null;

alter table public.heroes alter column mana set default 10;
alter table public.heroes alter column mana set not null;
