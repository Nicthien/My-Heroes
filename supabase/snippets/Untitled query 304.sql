alter table public.heroes add column if not exists hero_class text not null default 'knight';
alter table public.heroes add column if not exists specialty text;
alter table public.towns add column if not exists tavern_offer jsonb not null default '[]';
