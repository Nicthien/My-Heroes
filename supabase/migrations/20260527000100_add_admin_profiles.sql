alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists must_change_password boolean not null default false;

create unique index if not exists profiles_name_lower_unique
  on public.profiles (lower(name))
  where name is not null;
