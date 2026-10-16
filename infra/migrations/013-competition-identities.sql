BEGIN;
-- Preserve every existing UUID, scoped platform identity, session and score.
ALTER TABLE runtime.competition_players
  ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS runtime.competition_refresh_tokens (
  token_hash text PRIMARY KEY,
  -- Derived credentials disappear only when their player is explicitly deleted.
  player_id uuid NOT NULL REFERENCES runtime.competition_players(id) ON DELETE CASCADE,
  expires_at bigint NOT NULL,
  installation_id uuid
);
CREATE INDEX IF NOT EXISTS competition_refresh_player ON runtime.competition_refresh_tokens(player_id);
GRANT SELECT, INSERT, DELETE ON runtime.competition_refresh_tokens TO runtime_app;
COMMIT;
