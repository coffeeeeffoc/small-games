BEGIN;
CREATE TABLE IF NOT EXISTS runtime.night_presence (
  player_id uuid PRIMARY KEY REFERENCES runtime.competition_players(id) ON DELETE CASCADE,
  seen_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS night_presence_seen ON runtime.night_presence(seen_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON runtime.night_presence TO runtime_app;
COMMIT;
