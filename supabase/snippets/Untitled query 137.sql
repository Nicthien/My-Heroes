-- RMG : seed, taille et template par partie
alter table public.games add column if not exists seed text;
alter table public.games add column if not exists map_size text;
alter table public.games add column if not exists template_id text;

-- Châteaux neutres : game_player_id devient nullable, ajout colonnes is_neutral / neutral_garrison
alter table public.towns alter column game_player_id drop not null;
alter table public.towns add column if not exists game_id uuid references public.games(id) on delete cascade;
alter table public.towns add column if not exists is_neutral boolean not null default false;
alter table public.towns add column if not exists neutral_garrison jsonb not null default '[]';
