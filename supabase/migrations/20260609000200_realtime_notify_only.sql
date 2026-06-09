-- Realtime hardening: stop streaming raw game rows to clients.
--
-- Problem: every game data table (games, heroes, towns, combats, …) was both
--   (a) in the `supabase_realtime` publication and
--   (b) SELECT-able by any game member via RLS.
-- Supabase Realtime delivers the full changed row (`payload.new`) to every
-- subscriber that passes RLS, and PostgREST lets a member SELECT any row of the
-- game. A member could therefore read ALL enemy positions, garrisons, combat
-- boards and the Grail location — a full "wallhack" — even though the app's
-- /sync endpoint carefully sanitizes what it returns.
--
-- Fix: the browser never reads these tables directly — it only reacts to a
-- "something changed" signal and then re-fetches the sanitized service-role
-- /sync endpoint. So:
--   1. Publish a single lightweight notification table `game_events`
--      (game_id + updated_at) and remove every data table from the publication.
--   2. A trigger bumps `game_events` for the relevant game on any data change.
--   3. Drop the member SELECT policies on the data tables (RLS now denies direct
--      reads; service-role API routes bypass RLS and keep working).

-- ---------------------------------------------------------------------------
-- 1. Notification table (only carries game_id + updated_at — nothing sensitive)
-- ---------------------------------------------------------------------------
create table if not exists public.game_events (
  game_id uuid primary key references public.games(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.game_events enable row level security;
drop policy if exists "game_events visible to members" on public.game_events;
create policy "game_events visible to members" on public.game_events
  for select to authenticated
  using (public.is_game_member(game_id));

-- Backfill one row per existing game so subscribers have a stable target.
insert into public.game_events (game_id)
select id from public.games
on conflict (game_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Trigger: bump game_events for the owning game on any data change
-- ---------------------------------------------------------------------------
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

  if tg_table_name = 'games' then
    v_game_id := v_row.id;
  elsif tg_table_name in (
    'game_players', 'resource_buildings', 'gates', 'boats',
    'neutral_armies', 'combats', 'turns', 'game_action_logs'
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

  if v_game_id is not null then
    insert into public.game_events (game_id, updated_at)
    values (v_game_id, now())
    on conflict (game_id) do update set updated_at = excluded.updated_at;
  end if;

  return null;
end;
$$;

-- Attach the trigger to every table whose changes the client cares about.
do $$
declare
  t text;
begin
  foreach t in array array[
    'games', 'game_players', 'heroes', 'armies', 'towns', 'resource_buildings',
    'gates', 'gate_stacks', 'boats', 'neutral_armies', 'neutral_army_stacks',
    'combats', 'combat_participants', 'combat_reinforcement_requests',
    'combat_surrender_negotiations', 'combat_truces', 'turns', 'game_action_logs'
  ]
  loop
    execute format('drop trigger if exists bump_game_event on public.%I', t);
    execute format(
      'create trigger bump_game_event after insert or update or delete on public.%I '
      || 'for each row execute function public.bump_game_event()',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Realtime publication: only game_events (drop every data table)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'games', 'game_players', 'heroes', 'armies', 'towns', 'resource_buildings',
    'gates', 'gate_stacks', 'boats', 'combats', 'combat_participants',
    'combat_reinforcement_requests', 'combat_surrender_negotiations',
    'combat_truces', 'game_action_logs', 'neutral_armies', 'neutral_army_stacks',
    'turns'
  ]
  loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_events'
  ) then
    alter publication supabase_realtime add table public.game_events;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Drop direct-read (pull) access for members on the data tables.
--    RLS stays ENABLED with no SELECT policy → authenticated clients get zero
--    rows via PostgREST. Service-role API routes bypass RLS and are unaffected.
-- ---------------------------------------------------------------------------
drop policy if exists "games visible to members" on public.games;
drop policy if exists "game_players visible to members" on public.game_players;
drop policy if exists "heroes visible to members" on public.heroes;
drop policy if exists "armies visible to members" on public.armies;
drop policy if exists "towns visible to members" on public.towns;
drop policy if exists "resource_buildings visible to members" on public.resource_buildings;
drop policy if exists "gates visible to members" on public.gates;
drop policy if exists "gate_stacks visible to members" on public.gate_stacks;
drop policy if exists "boats visible to members" on public.boats;
drop policy if exists "neutral_armies visible to members" on public.neutral_armies;
drop policy if exists "neutral_army_stacks visible to members" on public.neutral_army_stacks;
drop policy if exists "turns visible to members" on public.turns;
drop policy if exists "score_snapshots visible to members" on public.score_snapshots;
drop policy if exists "game_action_logs visible to members" on public.game_action_logs;
drop policy if exists "combats visible to members" on public.combats;
drop policy if exists "combat_participants visible to members" on public.combat_participants;
drop policy if exists "combat_reinforcement_requests visible to members" on public.combat_reinforcement_requests;
drop policy if exists "combat_surrender_negotiations visible to members" on public.combat_surrender_negotiations;
drop policy if exists "combat_truces visible to members" on public.combat_truces;
