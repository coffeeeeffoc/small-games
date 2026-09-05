BEGIN;
CREATE TABLE IF NOT EXISTS management.accounts (
  id uuid PRIMARY KEY,
  username text UNIQUE NOT NULL CHECK (username ~ '^[a-z0-9_.-]{3,64}$'),
  password_hash text NOT NULL,
  roles jsonb NOT NULL CHECK (jsonb_typeof(roles) = 'array' AND roles <@ '["creator","reviewer","publisher","admin"]'::jsonb)
);
CREATE TABLE IF NOT EXISTS management.auth_sessions (
  access_hash text PRIMARY KEY,
  refresh_hash text UNIQUE NOT NULL,
  account_id uuid NOT NULL REFERENCES management.accounts(id) ON DELETE CASCADE,
  access_expires_at bigint NOT NULL,
  refresh_expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_account_id_idx ON management.auth_sessions(account_id);
GRANT SELECT, INSERT ON management.accounts TO management_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON management.auth_sessions TO management_app;
COMMIT;
