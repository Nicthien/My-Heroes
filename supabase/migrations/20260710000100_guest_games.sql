-- Guest accounts and ephemeral game lifecycle.

alter table public.profiles
  add column if not exists is_guest boolean not null default false;

alter table public.games
  add column if not exists is_ephemeral boolean not null default false,
  add column if not exists preservation_pending_until timestamptz;

create index if not exists games_ephemeral_created_idx
  on public.games (created_at)
  where is_ephemeral = true;

create table if not exists public.game_presence (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (game_id, user_id, session_id)
);

create index if not exists game_presence_game_last_seen_idx
  on public.game_presence (game_id, last_seen_at desc);

alter table public.game_presence enable row level security;

-- Profiles are read through service-role game/auth routes. The only remaining
-- direct browser read is the signed-in user's own confirmation state.
drop policy if exists "profiles readable by authenticated users" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;
drop policy if exists "users can read own profile" on public.profiles;
create policy "users can read own profile" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

-- Presence is operational data: joins/leaves notify subscribers, while the
-- 30-second last_seen heartbeat deliberately does not cause a game re-fetch.
create or replace function public.bump_game_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id uuid;
  v_row record;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  if tg_table_name = 'game_presence'
    and tg_op = 'UPDATE'
    and old.left_at is not distinct from new.left_at
  then
    return null;
  end if;

  if tg_table_name = 'games' then
    v_game_id := v_row.id;
  elsif tg_table_name in (
    'game_players', 'resource_buildings', 'gates', 'boats',
    'neutral_armies', 'combats', 'turns', 'game_action_logs',
    'game_presence'
  ) then
    v_game_id := v_row.game_id;
  elsif tg_table_name = 'heroes' then
    select gp.game_id into v_game_id
    from public.game_players gp
    where gp.id = v_row.game_player_id;
  elsif tg_table_name = 'towns' then
    if v_row.game_id is not null then
      v_game_id := v_row.game_id;
    else
      select gp.game_id into v_game_id
      from public.game_players gp
      where gp.id = v_row.game_player_id;
    end if;
  elsif tg_table_name = 'armies' then
    select gp.game_id into v_game_id
    from public.heroes h
    join public.game_players gp on gp.id = h.game_player_id
    where h.id = v_row.hero_id;
  elsif tg_table_name = 'gate_stacks' then
    select g.game_id into v_game_id
    from public.gates g
    where g.id = v_row.gate_id;
  elsif tg_table_name = 'neutral_army_stacks' then
    select na.game_id into v_game_id
    from public.neutral_armies na
    where na.id = v_row.neutral_army_id;
  elsif tg_table_name in (
    'combat_participants', 'combat_reinforcement_requests',
    'combat_surrender_negotiations', 'combat_truces'
  ) then
    select c.game_id into v_game_id
    from public.combats c
    where c.id = v_row.combat_id;
  end if;

  if v_game_id is not null and exists (select 1 from public.games where id = v_game_id) then
    insert into public.game_events (game_id, updated_at)
    values (v_game_id, now())
    on conflict (game_id) do update set updated_at = excluded.updated_at;
  end if;

  return null;
end;
$$;

drop trigger if exists bump_game_event on public.game_presence;
create trigger bump_game_event
  after insert or update or delete on public.game_presence
  for each row execute function public.bump_game_event();

-- Presence must remain server-only and notification-only like every other game
-- data table. This is defensive for databases where it was manually published.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_presence'
  ) then
    alter publication supabase_realtime drop table public.game_presence;
  end if;
end $$;
