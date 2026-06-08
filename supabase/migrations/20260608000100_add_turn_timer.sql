-- Per-turn timer support.
--
-- The timer duration itself lives in games.game_config.turnTimeLimit (seconds;
-- null/absent means "no limit"). This column records WHEN the current player's
-- turn started, so the server can auto-end the turn once that budget elapses.
-- It is refreshed every time current_turn_player_id changes.
alter table public.games
  add column if not exists current_turn_started_at timestamptz;
