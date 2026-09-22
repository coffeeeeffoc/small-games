BEGIN;
CREATE TABLE IF NOT EXISTS runtime.competition_players (
  id uuid PRIMARY KEY, platform text NOT NULL DEFAULT 'guest', app_id text NOT NULL DEFAULT '',
  subject text, created_at bigint NOT NULL,
  UNIQUE(platform, app_id, subject)
);
CREATE TABLE IF NOT EXISTS runtime.competition_sessions (
  token_hash text PRIMARY KEY, player_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS competition_sessions_player ON runtime.competition_sessions(player_id);
CREATE TABLE IF NOT EXISTS runtime.competition_rooms (
  code text PRIMARY KEY, data jsonb NOT NULL, expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS competition_rooms_expiry ON runtime.competition_rooms(expires_at);
CREATE TABLE IF NOT EXISTS runtime.competition_actions (
  room_code text NOT NULL REFERENCES runtime.competition_rooms(code), player_id uuid NOT NULL,
  seq integer NOT NULL CHECK(seq > 0), action_hash text NOT NULL, created_at bigint NOT NULL,
  PRIMARY KEY(room_code, player_id, seq)
);
CREATE TABLE IF NOT EXISTS runtime.competition_results (
  match_id text NOT NULL, board text NOT NULL, player_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  score double precision NOT NULL, secondary double precision NOT NULL CHECK(secondary >= 0),
  created_at bigint NOT NULL, PRIMARY KEY(match_id, player_id)
);
CREATE TABLE IF NOT EXISTS runtime.competition_best (
  board text NOT NULL, player_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  score double precision NOT NULL, secondary double precision NOT NULL CHECK(secondary >= 0),
  match_id text NOT NULL, updated_at bigint NOT NULL, PRIMARY KEY(board, player_id)
);
CREATE INDEX IF NOT EXISTS competition_best_order ON runtime.competition_best(board, score DESC, secondary ASC, player_id);
CREATE TABLE IF NOT EXISTS runtime.competition_matches (
  id text PRIMARY KEY, board text NOT NULL, data jsonb NOT NULL, created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime.competition_duels (
  board text NOT NULL, day integer NOT NULL, first_player uuid NOT NULL, second_player uuid NOT NULL,
  match_id text NOT NULL, PRIMARY KEY(board,day,first_player,second_player)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON runtime.competition_players, runtime.competition_sessions,
  runtime.competition_rooms, runtime.competition_actions, runtime.competition_results, runtime.competition_best TO runtime_app;
GRANT SELECT, INSERT, UPDATE ON runtime.competition_matches,runtime.competition_duels TO runtime_app;
COMMIT;
