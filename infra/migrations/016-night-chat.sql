BEGIN;
CREATE TABLE IF NOT EXISTS runtime.night_chat_messages (
  seq bigserial PRIMARY KEY,
  request_id uuid NOT NULL,
  player_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  signature text NOT NULL,
  body text NOT NULL,
  room jsonb,
  created_at bigint NOT NULL,
  removed boolean NOT NULL DEFAULT false,
  UNIQUE(player_id, request_id)
);
CREATE INDEX IF NOT EXISTS night_chat_visible ON runtime.night_chat_messages(seq DESC) WHERE NOT removed;
CREATE TABLE IF NOT EXISTS runtime.night_chat_limits (
  player_id uuid PRIMARY KEY REFERENCES runtime.competition_players(id),
  last_sent bigint NOT NULL DEFAULT 0,
  muted_until bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS runtime.night_chat_reports (
  reporter_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  message_seq bigint NOT NULL,
  evidence jsonb NOT NULL,
  reason text NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY(reporter_id,message_seq)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON runtime.night_chat_messages,runtime.night_chat_limits,runtime.night_chat_reports TO runtime_app;
GRANT USAGE,SELECT ON SEQUENCE runtime.night_chat_messages_seq_seq TO runtime_app;
COMMIT;
