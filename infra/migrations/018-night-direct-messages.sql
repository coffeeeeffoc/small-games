BEGIN;
-- Keep private content outside the public table so older Runtime versions cannot expose it.
CREATE TABLE IF NOT EXISTS runtime.night_direct_messages (
  seq bigint PRIMARY KEY DEFAULT nextval('runtime.night_chat_messages_seq_seq'),
  request_id uuid NOT NULL,
  player_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  recipient_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  signature text NOT NULL,
  body text NOT NULL,
  room jsonb,
  created_at bigint NOT NULL,
  removed boolean NOT NULL DEFAULT false,
  UNIQUE(player_id, request_id),
  CHECK(player_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS night_direct_inbox ON runtime.night_direct_messages(recipient_id,seq DESC) WHERE NOT removed;
CREATE INDEX IF NOT EXISTS night_direct_sent ON runtime.night_direct_messages(player_id,seq DESC) WHERE NOT removed;
GRANT SELECT,INSERT,UPDATE,DELETE ON runtime.night_direct_messages TO runtime_app;
CREATE INDEX IF NOT EXISTS night_direct_pair ON runtime.night_direct_messages(least(player_id,recipient_id),greatest(player_id,recipient_id),seq DESC) WHERE NOT removed;
ALTER TABLE runtime.night_presence ADD COLUMN IF NOT EXISTS activity text NOT NULL DEFAULT 'available' CHECK(activity IN ('available','playing'));
CREATE TABLE IF NOT EXISTS runtime.night_friendships (
  player_a uuid NOT NULL REFERENCES runtime.competition_players(id),
  player_b uuid NOT NULL REFERENCES runtime.competition_players(id),
  requested_by uuid NOT NULL REFERENCES runtime.competition_players(id),
  accepted boolean NOT NULL DEFAULT false,
  created_at bigint NOT NULL,
  PRIMARY KEY(player_a,player_b),
  CHECK(player_a < player_b),
  CHECK(requested_by IN (player_a,player_b))
);
CREATE INDEX IF NOT EXISTS night_friends_b ON runtime.night_friendships(player_b);
CREATE TABLE IF NOT EXISTS runtime.night_direct_reads (
  player_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  peer_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  through_seq bigint NOT NULL,
  PRIMARY KEY(player_id,peer_id),
  CHECK(player_id <> peer_id)
);
CREATE TABLE IF NOT EXISTS runtime.night_friend_limits (
  player_id uuid PRIMARY KEY REFERENCES runtime.competition_players(id),
  last_request bigint NOT NULL
);
GRANT SELECT,INSERT,UPDATE,DELETE ON runtime.night_friendships,runtime.night_direct_reads,runtime.night_friend_limits TO runtime_app;
COMMIT;
