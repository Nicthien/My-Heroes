alter table public.heroes
  alter column movement set default 1500,
  alter column max_movement set default 1500;

update public.heroes
set
  movement = case when movement <= 20 then 1500 else movement end,
  max_movement = case when max_movement <= 20 then 1500 else max_movement end
where movement <= 20 or max_movement <= 20;
