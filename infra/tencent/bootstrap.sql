\set ON_ERROR_STOP on
\getenv runtime_password RUNTIME_DB_PASSWORD
BEGIN;
REVOKE ALL ON DATABASE small_games FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SELECT format('CREATE ROLE runtime_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10', :'runtime_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'runtime_app')\gexec
GRANT CONNECT ON DATABASE small_games TO runtime_app;
CREATE SCHEMA IF NOT EXISTS runtime AUTHORIZATION platform_owner;
REVOKE ALL ON SCHEMA runtime FROM PUBLIC;
GRANT USAGE ON SCHEMA runtime TO runtime_app;
ALTER ROLE runtime_app SET search_path TO runtime, pg_catalog;
ALTER ROLE runtime_app SET statement_timeout TO '5s';
ALTER ROLE runtime_app SET idle_in_transaction_session_timeout TO '30s';
CREATE TABLE IF NOT EXISTS runtime.schema_version (version integer PRIMARY KEY);
INSERT INTO runtime.schema_version VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT ON runtime.schema_version TO runtime_app;
COMMIT;
