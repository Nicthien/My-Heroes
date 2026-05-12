alter table public.heroes
  alter column movement type numeric using movement::numeric,
  alter column max_movement type numeric using max_movement::numeric;
