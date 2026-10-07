BEGIN;
CREATE TABLE IF NOT EXISTS runtime.three_choose_two_sessions (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'finished')),
  data jsonb NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS three_choose_two_one_active
  ON runtime.three_choose_two_sessions(player_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS three_choose_two_expiry
  ON runtime.three_choose_two_sessions(expires_at) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS runtime.three_choose_two_actions (
  session_id uuid NOT NULL REFERENCES runtime.three_choose_two_sessions(id),
  seq integer NOT NULL CHECK (seq > 0),
  action_hash text NOT NULL,
  action jsonb NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY (session_id, seq)
);
CREATE TABLE IF NOT EXISTS runtime.three_choose_two_results (
  session_id uuid PRIMARY KEY REFERENCES runtime.three_choose_two_sessions(id),
  player_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('verified', 'pending-review', 'ineligible', 'rejected')),
  score bigint NOT NULL CHECK (score >= 0),
  finished_at bigint NOT NULL,
  reason text,
  review_reason text,
  reviewed_at bigint
);
CREATE INDEX IF NOT EXISTS three_choose_two_result_player
  ON runtime.three_choose_two_results(version, player_id, score DESC, finished_at);
CREATE TABLE IF NOT EXISTS runtime.three_choose_two_best (
  version text NOT NULL,
  player_id uuid NOT NULL REFERENCES runtime.competition_players(id),
  session_id uuid NOT NULL REFERENCES runtime.three_choose_two_results(session_id),
  score bigint NOT NULL CHECK (score >= 0),
  achieved_at bigint NOT NULL,
  PRIMARY KEY (version, player_id)
);
CREATE INDEX IF NOT EXISTS three_choose_two_best_order
  ON runtime.three_choose_two_best(version, score DESC, achieved_at, player_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON runtime.three_choose_two_sessions,
  runtime.three_choose_two_actions, runtime.three_choose_two_results,
  runtime.three_choose_two_best TO runtime_app;
COMMIT;
