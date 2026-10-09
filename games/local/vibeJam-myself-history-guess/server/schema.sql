PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  identity_subject TEXT UNIQUE,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS identity_nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS images (hash TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  mode TEXT NOT NULL CHECK(mode IN ('practice','daily','duel')),
  phase TEXT NOT NULL CHECK(phase IN ('guessing','revealed','finished')),
  question_version TEXT NOT NULL,
  deck TEXT NOT NULL,
  round_index INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  competition_date TEXT,
  invite_code TEXT,
  created_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_entry ON runs(player_id, competition_date) WHERE mode = 'daily';
CREATE UNIQUE INDEX IF NOT EXISTS duel_entry ON runs(player_id, invite_code) WHERE invite_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS player_runs ON runs(player_id, created_at DESC);
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  round_index INTEGER NOT NULL,
  image_ticket TEXT NOT NULL UNIQUE,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(run_id, round_index)
);
CREATE TABLE IF NOT EXISTS answers (
  round_id TEXT PRIMARY KEY REFERENCES rounds(id),
  run_id TEXT NOT NULL REFERENCES runs(id),
  request_id TEXT NOT NULL,
  result TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE(run_id, request_id)
);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  host_run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_results (
  player_id TEXT NOT NULL REFERENCES players(id),
  competition_date TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),
  score INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  PRIMARY KEY(player_id, competition_date)
);
CREATE INDEX IF NOT EXISTS daily_ranking ON daily_results(competition_date, score DESC);
