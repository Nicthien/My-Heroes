-- The generic trigger record does not expose game_presence-only fields while
-- running for another table. Nest the column comparison behind the table guard
-- so PostgreSQL never evaluates OLD.left_at for games/heroes/etc.
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

  if tg_table_name = 'game_presence' and tg_op = 'UPDATE' then
    if old.left_at is not distinct from new.left_at then
      return null;
    end if;
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
