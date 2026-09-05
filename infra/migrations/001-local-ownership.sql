-- Bootstrap only: Docker executes this on first creation of this project's volume.
-- Application roles cannot migrate schemas or assume the owner role.
REVOKE ALL ON DATABASE small_games FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE ROLE management_app LOGIN PASSWORD 'local-management-only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10;
CREATE ROLE runtime_app LOGIN PASSWORD 'local-runtime-only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 10;
GRANT CONNECT ON DATABASE small_games TO management_app, runtime_app;
CREATE SCHEMA management AUTHORIZATION platform_owner;
CREATE SCHEMA runtime AUTHORIZATION platform_owner;
REVOKE ALL ON SCHEMA management, runtime FROM PUBLIC;
GRANT USAGE ON SCHEMA management TO management_app;
GRANT USAGE ON SCHEMA runtime TO runtime_app;
ALTER ROLE management_app SET search_path TO management, pg_catalog;
ALTER ROLE runtime_app SET search_path TO runtime, pg_catalog;
ALTER ROLE management_app SET statement_timeout TO '5s';
ALTER ROLE runtime_app SET statement_timeout TO '5s';
ALTER ROLE management_app SET idle_in_transaction_session_timeout TO '30s';
ALTER ROLE runtime_app SET idle_in_transaction_session_timeout TO '30s';

-- Immutable schema-version markers let readiness verify actual scoped access,
-- not merely that a socket answers. Future business migrations grant explicitly.
CREATE TABLE management.schema_version (version integer PRIMARY KEY);
CREATE TABLE runtime.schema_version (version integer PRIMARY KEY);
INSERT INTO management.schema_version VALUES (1);
INSERT INTO runtime.schema_version VALUES (1);
GRANT SELECT ON management.schema_version TO management_app;
GRANT SELECT ON runtime.schema_version TO runtime_app;
