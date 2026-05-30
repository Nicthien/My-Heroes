alter table public.games add column if not exists seed text;
alter table public.games add column if not exists map_size text;
alter table public.games add column if not exists template_id text;

alter table public.towns alter column game_player_id drop not null;
alter table public.towns add column if not exists game_id uuid references public.games(id) on delete cascade;
alter table public.towns add column if not exists is_neutral boolean not null default false;
alter table public.towns add column if not exists neutral_garrison jsonb not null default '[]';

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_game_member(p_game_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.game_players
    where game_id = p_game_id
      and user_id = auth.uid()
  );
$$;

alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.heroes enable row level security;
alter table public.armies enable row level security;
alter table public.towns enable row level security;
alter table public.resource_buildings enable row level security;
alter table public.gates enable row level security;
alter table public.gate_stacks enable row level security;
alter table public.boats enable row level security;
alter table public.neutral_armies enable row level security;
alter table public.neutral_army_stacks enable row level security;
alter table public.turns enable row level security;
alter table public.game_action_logs enable row level security;
alter table public.combats enable row level security;
alter table public.combat_participants enable row level security;
alter table public.combat_reinforcement_requests enable row level security;
alter table public.combat_surrender_negotiations enable row level security;
alter table public.combat_truces enable row level security;

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
drop policy if exists "game_action_logs visible to members" on public.game_action_logs;
drop policy if exists "combats visible to members" on public.combats;
drop policy if exists "combat_participants visible to members" on public.combat_participants;
drop policy if exists "combat_reinforcement_requests visible to members" on public.combat_reinforcement_requests;
drop policy if exists "combat_surrender_negotiations visible to members" on public.combat_surrender_negotiations;
drop policy if exists "combat_truces visible to members" on public.combat_truces;

create policy "games visible to members" on public.games
  for select to authenticated
  using (public.is_game_member(id));

create policy "game_players visible to members" on public.game_players
  for select to authenticated
  using (public.is_game_member(game_id));

create policy "heroes visible to members" on public.heroes
  for select to authenticated
  using (
    exists (
      select 1
      from public.game_players gp
      where gp.id = heroes.game_player_id
        and public.is_game_member(gp.game_id)
    )
  );

create policy "armies visible to members" on public.armies
  for select to authenticated
  using (
    exists (
      select 1
      from public.heroes h
      join public.game_players gp on gp.id = h.game_player_id
      where h.id = armies.hero_id
        and public.is_game_member(gp.game_id)
    )
  );

create policy "towns visible to members" on public.towns
  for select to authenticated
  using (
    (game_id is not null and public.is_game_member(game_id))
    or exists (
      select 1
      from public.game_players gp
      where gp.id = towns.game_player_id
        and public.is_game_member(gp.game_id)
    )
  );

create policy "resource_buildings visible to members" on public.resource_buildings
  for select to authenticated
  using (public.is_game_member(game_id));

create policy "gates visible to members" on public.gates
  for select to authenticated
  using (public.is_game_member(game_id));

create policy "gate_stacks visible to members" on public.gate_stacks
  for select to authenticated
  using (
    exists (
      select 1
      from public.gates g
      where g.id = gate_stacks.gate_id
        and public.is_game_member(g.game_id)
    )
  );

create policy "boats visible to members" on public.boats
  for select to authenticated
  using (public.is_game_member(game_id));

create policy "neutral_armies visible to members" on public.neutral_armies
  for select to authenticated
  using (public.is_game_member(game_id));

create policy "neutral_army_stacks visible to members" on public.neutral_army_stacks
  for select to authenticated
  using (
    exists (
      select 1
      from public.neutral_armies na
      where na.id = neutral_army_stacks.neutral_army_id
        and public.is_game_member(na.game_id)
    )
  );

create policy "turns visible to members" on public.turns
  for select to authenticated
  using (public.is_game_member(game_id));

create policy "game_action_logs visible to members" on public.game_action_logs
  for select to authenticated
  using (public.is_game_member(game_id));

create policy "combats visible to members" on public.combats
  for select to authenticated
  using (public.is_game_member(game_id));

create policy "combat_participants visible to members" on public.combat_participants
  for select to authenticated
  using (
    exists (
      select 1
      from public.combats c
      where c.id = combat_participants.combat_id
        and public.is_game_member(c.game_id)
    )
  );

create policy "combat_reinforcement_requests visible to members" on public.combat_reinforcement_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.combats c
      where c.id = combat_reinforcement_requests.combat_id
        and public.is_game_member(c.game_id)
    )
  );

create policy "combat_surrender_negotiations visible to members" on public.combat_surrender_negotiations
  for select to authenticated
  using (
    exists (
      select 1
      from public.combats c
      where c.id = combat_surrender_negotiations.combat_id
        and public.is_game_member(c.game_id)
    )
  );

create policy "combat_truces visible to members" on public.combat_truces
  for select to authenticated
  using (
    exists (
      select 1
      from public.combats c
      where c.id = combat_truces.combat_id
        and public.is_game_member(c.game_id)
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.armies;
exception
  when duplicate_object then null;
end $$;
