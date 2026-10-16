-- 仅由现库 owner 执行；不建账号/数据库/成员关系，不改游戏对象。未知或部分已存在状态失败关闭。
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'management_app' AND rolcanlogin
    AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
    OR EXISTS (SELECT FROM pg_auth_members WHERE roleid = (SELECT oid FROM pg_roles WHERE rolname = 'management_app')
      OR member = (SELECT oid FROM pg_roles WHERE rolname = 'management_app')) THEN
    RAISE EXCEPTION 'management_app must be an approved isolated login role';
  END IF;
END $$;
-- 临时参考表用于逐项比较列、默认值、generated/identity、约束、索引及 PG 本版本 owner ACL（含 MAINTAIN）。
CREATE TEMP TABLE sg_admin_expected_schema_version (version integer PRIMARY KEY CHECK (version = 1)) ON COMMIT DROP;
CREATE TEMP TABLE sg_admin_expected_flows (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  verifier text NOT NULL CHECK (verifier ~ '^[A-Za-z0-9_-]{43}$'),
  callback text NOT NULL,
  expires_at bigint NOT NULL
) ON COMMIT DROP;
CREATE INDEX ON sg_admin_expected_flows (expires_at);
CREATE TEMP TABLE sg_admin_expected_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  family_hash text NOT NULL CHECK (family_hash ~ '^[a-f0-9]{64}$'),
  active boolean NOT NULL,
  github_id text NOT NULL,
  login text NOT NULL,
  email text NOT NULL,
  expires_at bigint NOT NULL
) ON COMMIT DROP;
CREATE INDEX ON sg_admin_expected_sessions (expires_at);
CREATE INDEX ON sg_admin_expected_sessions (family_hash);
GRANT SELECT ON sg_admin_expected_schema_version TO management_app;
GRANT SELECT, INSERT, DELETE ON sg_admin_expected_flows, sg_admin_expected_sessions TO management_app;
DO $$
DECLARE
  pair record;
  target oid;
  reference oid;
  target_shape jsonb;
  reference_shape jsonb;
  target_acl jsonb;
  reference_acl jsonb;
  owner_id oid := (SELECT oid FROM pg_roles WHERE rolname = current_user);
  app_id oid := (SELECT oid FROM pg_roles WHERE rolname = 'management_app');
BEGIN
  IF to_regnamespace('admin_console') IS NULL THEN
    CREATE SCHEMA admin_console;
    CREATE TABLE admin_console.schema_version (LIKE pg_temp.sg_admin_expected_schema_version INCLUDING ALL);
    CREATE TABLE admin_console.admin_oauth_flows (LIKE pg_temp.sg_admin_expected_flows INCLUDING ALL);
    CREATE TABLE admin_console.admin_sessions (LIKE pg_temp.sg_admin_expected_sessions INCLUDING ALL);
    REVOKE ALL ON SCHEMA admin_console FROM PUBLIC;
    REVOKE ALL ON admin_console.schema_version, admin_console.admin_oauth_flows, admin_console.admin_sessions FROM PUBLIC;
    GRANT USAGE ON SCHEMA admin_console TO management_app;
    GRANT SELECT ON admin_console.schema_version TO management_app;
    GRANT SELECT, INSERT, DELETE ON admin_console.admin_oauth_flows, admin_console.admin_sessions TO management_app;
    INSERT INTO admin_console.schema_version VALUES (1);
  END IF;
  IF (SELECT nspowner FROM pg_namespace WHERE nspname = 'admin_console') IS DISTINCT FROM owner_id
    OR (SELECT count(*) FROM pg_class WHERE relnamespace = 'admin_console'::regnamespace) <> 9
    OR (SELECT count(*) FROM pg_class WHERE relnamespace = 'admin_console'::regnamespace AND relkind = 'r'
      AND relname IN ('schema_version', 'admin_oauth_flows', 'admin_sessions')) <> 3
    OR EXISTS (SELECT FROM pg_proc WHERE pronamespace = 'admin_console'::regnamespace)
    OR EXISTS (SELECT FROM pg_default_acl WHERE defaclnamespace = 'admin_console'::regnamespace)
    OR (SELECT count(*) FROM pg_type WHERE typnamespace = 'admin_console'::regnamespace) <> 6 THEN
    RAISE EXCEPTION 'Unknown admin_console ownership or objects';
  END IF;
  IF (SELECT count(*) FROM pg_namespace n, LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
      WHERE n.nspname = 'admin_console') <> 3
    OR EXISTS (SELECT FROM pg_namespace n, LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
      WHERE n.nspname = 'admin_console' AND NOT (a.grantor = owner_id AND NOT a.is_grantable AND
        ((a.grantee = owner_id AND a.privilege_type IN ('CREATE','USAGE')) OR
         (a.grantee = app_id AND a.privilege_type = 'USAGE')))) THEN
    RAISE EXCEPTION 'Unknown admin_console schema ACL';
  END IF;
  FOR pair IN SELECT * FROM (VALUES ('schema_version','sg_admin_expected_schema_version'),
      ('admin_oauth_flows','sg_admin_expected_flows'),('admin_sessions','sg_admin_expected_sessions')) p(actual, expected) LOOP
    target := to_regclass(format('admin_console.%I', pair.actual));
    reference := to_regclass(format('pg_temp.%I', pair.expected));
    IF NOT EXISTS (SELECT FROM pg_class WHERE oid = target AND relowner = owner_id AND relkind = 'r'
      AND relpersistence = 'p' AND NOT relrowsecurity AND NOT relforcerowsecurity AND NOT relhasrules AND NOT relhastriggers) THEN
      RAISE EXCEPTION 'Unknown admin_console table owner or policies';
    END IF;
    IF EXISTS (SELECT FROM pg_inherits WHERE inhrelid = target OR inhparent = target) THEN
      RAISE EXCEPTION 'Admin authentication tables cannot participate in inheritance';
    END IF;
    WITH facts AS (SELECT rel, jsonb_build_object(
      'columns', (SELECT jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull,
        pg_get_expr(d.adbin,d.adrelid), a.attidentity, a.attgenerated, a.attacl::text) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = rel AND a.attnum > 0 AND NOT a.attisdropped),
      'constraints', (SELECT jsonb_agg(jsonb_build_array(contype, pg_get_constraintdef(oid), convalidated,
        condeferrable, condeferred) ORDER BY pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = rel),
      'indexes', (SELECT jsonb_agg(jsonb_build_array(indisunique, indisprimary, indisvalid, indisready,
        indnkeyatts, indkey::text, indclass::text, indcollation::text, indoption::text,
        (SELECT relam FROM pg_class WHERE oid=indexrelid), pg_get_expr(indexprs,indrelid), pg_get_expr(indpred,indrelid))
        ORDER BY indkey::text) FROM pg_index WHERE indrelid = rel)) value
      FROM unnest(ARRAY[target,reference]) rel)
      SELECT (SELECT value FROM facts WHERE rel = target), (SELECT value FROM facts WHERE rel = reference)
      INTO target_shape, reference_shape;
    IF target_shape IS DISTINCT FROM reference_shape THEN RAISE EXCEPTION 'Unknown admin_console table shape'; END IF;
    SELECT jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) INTO target_acl
      FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid = target;
    SELECT jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
      ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) INTO reference_acl FROM (
        SELECT grantor, grantee, privilege_type, is_grantable FROM aclexplode(acldefault('r',owner_id))
        UNION ALL SELECT owner_id, app_id, privilege, false FROM unnest(
          CASE WHEN pair.actual = 'schema_version' THEN ARRAY['SELECT'] ELSE ARRAY['SELECT','INSERT','DELETE'] END
        ) privilege) a;
    IF target_acl IS DISTINCT FROM reference_acl THEN RAISE EXCEPTION 'Unknown admin_console table ACL'; END IF;
  END LOOP;
  IF (SELECT array_agg(version ORDER BY version) FROM admin_console.schema_version) IS DISTINCT FROM ARRAY[1] THEN
    RAISE EXCEPTION 'Unknown admin_console migration ledger';
  END IF;
END $$;
COMMIT;
