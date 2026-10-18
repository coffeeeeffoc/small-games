BEGIN;
ALTER TABLE runtime.competition_sessions ADD COLUMN IF NOT EXISTS game text NOT NULL DEFAULT '';
ALTER TABLE runtime.competition_sessions ADD COLUMN IF NOT EXISTS family_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE runtime.competition_sessions ADD COLUMN IF NOT EXISTS family_expires_at bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS competition_sessions_family ON runtime.competition_sessions(player_id, family_id);
ALTER TABLE runtime.competition_refresh_tokens ADD COLUMN IF NOT EXISTS game text NOT NULL DEFAULT '';
ALTER TABLE runtime.competition_refresh_tokens ADD COLUMN IF NOT EXISTS session_hash text
  REFERENCES runtime.competition_sessions(token_hash) ON DELETE CASCADE;
CREATE TABLE IF NOT EXISTS runtime.player_game_access (
  player_id uuid NOT NULL REFERENCES runtime.competition_players(id) ON DELETE CASCADE,
  game text NOT NULL,
  PRIMARY KEY(player_id, game)
);
-- Legacy credentials have no server-issued game scope and cannot be upgraded implicitly.
DELETE FROM runtime.competition_refresh_tokens WHERE game='' OR session_hash IS NULL;
DELETE FROM runtime.competition_sessions WHERE game='';
-- Row locks require UPDATE privilege; no HTTP endpoint exposes grant mutation.
GRANT SELECT, INSERT, UPDATE ON runtime.player_game_access TO runtime_app;
COMMIT;
