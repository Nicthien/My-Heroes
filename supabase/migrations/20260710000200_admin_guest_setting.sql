-- Admin-controlled feature flags.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('allow_anonymous_users', 'true'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
