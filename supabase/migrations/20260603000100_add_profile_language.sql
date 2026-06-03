-- Add per-user UI language preference to profiles (fr / en, defaults to fr).
alter table public.profiles
  add column if not exists language text not null default 'fr'
  check (language in ('fr', 'en'));
