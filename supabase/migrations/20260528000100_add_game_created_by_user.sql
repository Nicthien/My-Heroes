alter table public.games
  add column if not exists created_by_user_id uuid references public.profiles(id) on delete set null;
