-- ---------------------------------------------------------------------------
-- Fix: bump_game_event must not insert into game_events when the owning game
-- no longer exists.
--
-- When a game is deleted (e.g. the creator leaves a PENDING game in
-- /api/games/[id]/leave), Postgres cascade-deletes the child rows
-- (towns, game_players, heroes, ...). The AFTER DELETE bump_game_event
-- trigger then fired on those child rows AFTER the parent games row was
-- already gone, and tried to INSERT into game_events with the deleted
-- game_id — violating game_events_game_id_fkey:
--   insert or update on table "game_events" violates foreign key
--   constraint "game_events_game_id_fkey"
--
-- Guard the insert with an existence check so the trigger is a no-op once the
-- game is gone. Only the function body changes; the per-table triggers still
-- reference it by name.
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

  -- Skip when the owning game no longer exists. During a cascade delete of a
  -- game, this AFTER DELETE trigger fires on child rows once the parent games
  -- row is already gone; inserting into game_events here would violate
  -- game_events_game_id_fkey (and resurrect an orphan event row).
  if v_game_id is not null and exists (select 1 from public.games where id = v_game_id) then
    insert into public.game_events (game_id, updated_at)
    values (v_game_id, now())
    on conflict (game_id) do update set updated_at = excluded.updated_at;
  end if;

  return null;
end;
$$;
