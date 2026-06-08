-- Turn-timer: store the ABSOLUTE start of each player's turn so a
-- CANCEL_END_TURN resumes the countdown from the original deadline — the clock
-- keeps running during the "ended/waiting" window, it does not pause.
--
-- Replaces the earlier `time_used_ms` (a frozen-consumed snapshot, which paused
-- the clock on cancel and was not what we want).
alter table public.turns
  add column if not exists started_at timestamptz;
alter table public.turns
  drop column if exists time_used_ms;
