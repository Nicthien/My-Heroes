alter table public.profiles
  add column if not exists god_mode_enabled boolean not null default false;

create or replace function public.prevent_profile_god_mode_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.god_mode_enabled is distinct from new.god_mode_enabled
    and auth.uid() is not null
    and not public.is_admin()
  then
    raise exception 'god_mode_enabled can only be changed by an administrator';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_god_mode_self_update on public.profiles;
create trigger prevent_profile_god_mode_self_update
  before update of god_mode_enabled on public.profiles
  for each row
  execute function public.prevent_profile_god_mode_self_update();
