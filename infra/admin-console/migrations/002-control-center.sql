-- REVIEW ONLY: no application bootstrap executes this migration. Existing game/admin_console ACLs are untouched.
-- Lock protocol: Management locks head, then sorted game-control:<game_id> advisory xact locks exclusively.
-- Runtime takes pg_advisory_xact_lock_shared(hashtextextended('game-control:'||game_id,0)), SELECTs policy, then locks room/run.
-- Runtime must not use SELECT FOR SHARE (which would require UPDATE privileges).
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('game-control:v1',0));
DO $$ BEGIN
  -- Both real and temporary CREATE objects inherit the owner's global default ACL.
  -- Reject that unknown policy before creating anything; never normalize existing grants.
  IF EXISTS(SELECT FROM pg_default_acl WHERE defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user)
    AND defaclnamespace=0 AND defaclobjtype IN ('r','f')) THEN
    RAISE EXCEPTION 'Unknown owner global default ACL';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='management_app' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
    OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname='runtime_app' AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Expected approved application roles';
  END IF;
END $$;
CREATE TEMP TABLE sg_control_init(id integer) ON COMMIT DROP;
DO $migration$
DECLARE
  fresh boolean := to_regnamespace('game_control') IS NULL;
  definition text := $ddl$
    CREATE TABLE @schema_version(version integer PRIMARY KEY CHECK(version=2));
    CREATE TABLE @bootstrap(id integer PRIMARY KEY CHECK(id=1), initialized boolean NOT NULL);
    CREATE TABLE @roles(
      id text PRIMARY KEY CHECK(id ~ '^[a-z][a-z0-9-]{0,47}$'),
      name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
      permissions jsonb NOT NULL CHECK(jsonb_typeof(permissions)='array' AND permissions <@ '["control.read","control.write","control.publish","members.read","members.write","roles.read","roles.write","audit.read"]'::jsonb),
      builtin boolean NOT NULL CHECK(builtin=(id='administrator'))
    );
    CREATE TABLE @members(
      id uuid PRIMARY KEY, email text NOT NULL UNIQUE CHECK(email=lower(email) AND length(email) BETWEEN 3 AND 254),
      github_id text UNIQUE CHECK(github_id ~ '^[1-9][0-9]{0,19}$'), active boolean NOT NULL
    );
    CREATE TABLE @member_roles(member_id uuid NOT NULL REFERENCES @members(id), role_id text NOT NULL REFERENCES @roles(id), PRIMARY KEY(member_id,role_id));
    CREATE TABLE @revisions(
      id uuid PRIMARY KEY, parent_version bigint NOT NULL CHECK(parent_version BETWEEN 0 AND 9007199254740991),
      snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND snapshot ?& ARRAY['apiOrigins','games'] AND snapshot - 'apiOrigins' - 'games'='{}'::jsonb
        AND jsonb_typeof(snapshot->'apiOrigins')='array' AND jsonb_typeof(snapshot->'games')='object'
        AND snapshot->'games' ?& ARRAY['cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car']
        AND (snapshot->'games') - ARRAY['cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car']='{}'::jsonb
        AND NOT jsonb_path_exists(snapshot,'$.games.* ? (@ != "enabled" && @ != "draining" && @ != "disabled")')),
      reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 500), actor uuid NOT NULL,
      rollback_of uuid REFERENCES @revisions(id), digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), created_at bigint NOT NULL
    );
    CREATE TABLE @publications(version bigint PRIMARY KEY CHECK(version BETWEEN 1 AND 9007199254740991), revision_id uuid NOT NULL UNIQUE REFERENCES @revisions(id), actor uuid NOT NULL, created_at bigint NOT NULL);
    CREATE TABLE @active_head(id integer PRIMARY KEY CHECK(id=1), version bigint NOT NULL CHECK(version BETWEEN 0 AND 9007199254740991), revision_id uuid REFERENCES @revisions(id), CHECK((version=0)=(revision_id IS NULL)));
    CREATE TABLE @current_policy(game_id text PRIMARY KEY CHECK(game_id IN('cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car')),
      state text NOT NULL CHECK(state IN('enabled','draining','disabled')), kill_epoch bigint NOT NULL CHECK(kill_epoch BETWEEN 0 AND 9007199254740991), revision bigint NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991));
    CREATE TABLE @application_observations(
      id uuid PRIMARY KEY, consumer text NOT NULL CHECK(consumer IN ('runtime','kart')),
      instance_id text NOT NULL CHECK(length(instance_id) BETWEEN 1 AND 128), version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
      digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), status text NOT NULL CHECK(status IN ('applied','failed')), observed_at bigint NOT NULL
    );
    CREATE INDEX ON @application_observations(consumer,instance_id,observed_at DESC,id DESC);
    CREATE TABLE @audit(id uuid PRIMARY KEY, actor uuid NOT NULL, action text NOT NULL, target text NOT NULL, detail jsonb NOT NULL CHECK(jsonb_typeof(detail)='object'), created_at bigint NOT NULL);
    CREATE VIEW @published_config WITH(security_barrier=true) AS
      SELECT h.version,h.revision_id,r.digest,jsonb_build_object('apiOrigins',r.snapshot->'apiOrigins','games',r.snapshot->'games') AS snapshot
      FROM @active_head h JOIN @revisions r ON r.id=h.revision_id WHERE h.id=1;
  $ddl$;
  relation text;
  actual oid;
  expected oid;
  actual_shape jsonb;
  expected_shape jsonb;
  actual_acl jsonb;
  expected_acl jsonb;
  owner_id oid := (SELECT oid FROM pg_roles WHERE rolname=current_user);
  app_id oid := (SELECT oid FROM pg_roles WHERE rolname='management_app');
  runtime_id oid := (SELECT oid FROM pg_roles WHERE rolname='runtime_app');
  guard_body text := $guard$
BEGIN
  IF OLD.builtin THEN RAISE EXCEPTION 'Builtin role is immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$guard$;
BEGIN
  EXECUTE regexp_replace(definition,'@([a-z_]+)','pg_temp.sg_control_\1','g');
  IF fresh THEN
    CREATE SCHEMA game_control;
    EXECUTE regexp_replace(definition,'@([a-z_]+)','game_control.\1','g');
    -- Revoke only objects newly created by this transaction. Unknown existing ACLs are never repaired.
    REVOKE ALL ON SCHEMA game_control FROM PUBLIC;
    REVOKE ALL ON ALL TABLES IN SCHEMA game_control FROM PUBLIC,management_app,runtime_app;
    GRANT USAGE ON SCHEMA game_control TO management_app,runtime_app;
    GRANT SELECT ON game_control.schema_version,game_control.bootstrap,game_control.roles,game_control.members,game_control.member_roles,
      game_control.revisions,game_control.publications,game_control.active_head,game_control.current_policy,game_control.application_observations,game_control.audit,game_control.published_config TO management_app;
    GRANT INSERT,UPDATE,DELETE ON game_control.roles,game_control.members,game_control.member_roles TO management_app;
    GRANT UPDATE(initialized) ON game_control.bootstrap TO management_app;
    GRANT UPDATE(version,revision_id) ON game_control.active_head TO management_app;
    GRANT UPDATE(state,kill_epoch,revision) ON game_control.current_policy TO management_app;
    GRANT INSERT ON game_control.revisions,game_control.publications,game_control.audit TO management_app;
    GRANT SELECT ON game_control.published_config,game_control.current_policy TO runtime_app;
    -- Append-only observations: no observation read, update, delete or membership privileges for runtime_app.
    GRANT INSERT ON game_control.application_observations TO runtime_app;
    INSERT INTO game_control.schema_version VALUES(2);
    INSERT INTO game_control.bootstrap VALUES(1,false);
    INSERT INTO game_control.active_head VALUES(1,0,NULL);
    INSERT INTO game_control.current_policy SELECT game,'enabled',0,0 FROM unnest(ARRAY['cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car']) game;
    INSERT INTO game_control.roles VALUES('administrator','Administrator','["control.read","control.write","control.publish","members.read","members.write","roles.read","roles.write","audit.read"]',true);
    EXECUTE format('CREATE FUNCTION game_control.guard_builtin_role() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS %L',guard_body);
    REVOKE ALL ON FUNCTION game_control.guard_builtin_role() FROM PUBLIC;
    CREATE TRIGGER immutable_builtin BEFORE UPDATE OR DELETE ON game_control.roles FOR EACH ROW EXECUTE FUNCTION game_control.guard_builtin_role();
  END IF;
  IF (SELECT nspowner FROM pg_namespace WHERE nspname='game_control') IS DISTINCT FROM owner_id
    OR EXISTS(SELECT FROM pg_default_acl WHERE defaclnamespace='game_control'::regnamespace)
    OR (SELECT count(*) FROM pg_proc WHERE pronamespace='game_control'::regnamespace)<>1
    OR (SELECT count(*) FROM pg_type WHERE typnamespace='game_control'::regnamespace)<>24
    OR (SELECT count(*) FROM pg_class WHERE relnamespace='game_control'::regnamespace) <>
       (SELECT count(*) FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'sg_control\_%' ESCAPE '\' AND relname<>'sg_control_init') THEN
    RAISE EXCEPTION 'Unknown game_control owner or objects';
  END IF;
  IF (SELECT count(*) FROM pg_namespace n,LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='game_control')<>4
    OR EXISTS(SELECT FROM pg_namespace n,LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='game_control'
      AND NOT(a.grantor=owner_id AND NOT a.is_grantable AND ((a.grantee=owner_id AND a.privilege_type IN ('CREATE','USAGE')) OR (a.grantee IN(app_id,runtime_id) AND a.privilege_type='USAGE')))) THEN
    RAISE EXCEPTION 'Unknown game_control schema ACL';
  END IF;
  IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.pronamespace='game_control'::regnamespace AND p.proname='guard_builtin_role'
    AND p.proowner=owner_id AND NOT p.prosecdef AND p.prorettype='trigger'::regtype AND p.pronargs=0 AND l.lanname='plpgsql'
    AND p.prosrc=guard_body AND p.proconfig=ARRAY['search_path=pg_catalog']
    AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>owner_id OR a.grantor<>owner_id OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN
    RAISE EXCEPTION 'Unknown builtin protection function';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='game_control'::regnamespace) AND NOT tgisinternal)<>1
    OR NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='game_control.roles'::regclass AND tgname='immutable_builtin' AND tgtype=27 AND tgenabled='O'
      AND tgfoid='game_control.guard_builtin_role()'::regprocedure AND tgnargs=0 AND tgqual IS NULL AND tgattr=''::int2vector) THEN
    RAISE EXCEPTION 'Unknown game_control triggers';
  END IF;
  FOR relation IN SELECT unnest(ARRAY['schema_version','bootstrap','roles','members','member_roles','revisions','publications','active_head','current_policy','application_observations','audit','published_config']) LOOP
    actual := to_regclass('game_control.'||relation);
    expected := to_regclass('pg_temp.sg_control_'||relation);
    IF NOT EXISTS(SELECT FROM pg_class WHERE oid=actual AND relowner=owner_id AND relpersistence='p' AND NOT relrowsecurity AND NOT relforcerowsecurity
      AND relkind=CASE WHEN relation='published_config' THEN 'v'::"char" ELSE 'r'::"char" END AND relhasrules=(relation='published_config')
      AND reloptions IS NOT DISTINCT FROM (SELECT reloptions FROM pg_class WHERE oid=expected))
      OR EXISTS(SELECT FROM pg_inherits WHERE inhrelid=actual OR inhparent=actual)
      OR EXISTS(SELECT FROM pg_constraint fk JOIN pg_class target ON target.oid=fk.confrelid
        WHERE fk.conrelid=actual AND fk.contype='f' AND target.relnamespace<>'game_control'::regnamespace) THEN
      RAISE EXCEPTION 'Unknown game_control relation owner or policy';
    END IF;
    WITH facts AS(SELECT rel,jsonb_build_object(
      'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=rel AND a.attnum>0 AND NOT a.attisdropped),
      'constraints',(SELECT jsonb_agg(jsonb_build_array(contype,conkey::text,confkey::text,confupdtype,confdeltype,confmatchtype,convalidated,condeferrable,condeferred,
        CASE WHEN contype='c' THEN pg_get_expr(conbin,conrelid) END,replace((SELECT relname FROM pg_class WHERE oid=confrelid),'sg_control_','')) ORDER BY contype,conkey::text)
        FROM pg_constraint WHERE conrelid=rel),
      'indexes',(SELECT jsonb_agg(jsonb_build_array(indisunique,indisprimary,indisvalid,indisready,indnkeyatts,indkey::text,indclass::text,indcollation::text,indoption::text,
        (SELECT relam FROM pg_class WHERE oid=indexrelid),pg_get_expr(indexprs,indrelid),pg_get_expr(indpred,indrelid)) ORDER BY indkey::text) FROM pg_index WHERE indrelid=rel)) value FROM unnest(ARRAY[actual,expected]) rel)
      SELECT (SELECT value FROM facts WHERE rel=actual),(SELECT value FROM facts WHERE rel=expected) INTO actual_shape,expected_shape;
    IF actual_shape IS DISTINCT FROM expected_shape THEN RAISE EXCEPTION 'Unknown game_control table shape'; END IF;
    -- Expected grants are assigned only to temporary reference tables for exact ACL comparison.
    EXECUTE format('GRANT SELECT ON %s TO management_app',expected::regclass);
    IF relation IN('roles','members','member_roles') THEN EXECUTE format('GRANT INSERT,UPDATE,DELETE ON %s TO management_app',expected::regclass); END IF;
    IF relation IN('revisions','publications','audit') THEN EXECUTE format('GRANT INSERT ON %s TO management_app',expected::regclass); END IF;
    IF relation='bootstrap' THEN EXECUTE format('GRANT UPDATE(initialized) ON %s TO management_app',expected::regclass); END IF;
    IF relation='active_head' THEN EXECUTE format('GRANT UPDATE(version,revision_id) ON %s TO management_app',expected::regclass); END IF;
    IF relation='current_policy' THEN EXECUTE format('GRANT UPDATE(state,kill_epoch,revision) ON %s TO management_app',expected::regclass); END IF;
    IF relation='application_observations' THEN EXECUTE format('GRANT INSERT ON %s TO runtime_app',expected::regclass); END IF;
    IF relation IN('published_config','current_policy') THEN EXECUTE format('GRANT SELECT ON %s TO runtime_app',expected::regclass); END IF;
    SELECT jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) INTO actual_acl
      FROM pg_class c,LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=actual;
    SELECT jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) INTO expected_acl
      FROM pg_class c,LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=expected;
    IF actual_acl IS DISTINCT FROM expected_acl OR
      (SELECT jsonb_agg(jsonb_build_array(attnum,attacl::text) ORDER BY attnum) FROM pg_attribute WHERE attrelid=actual AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM
      (SELECT jsonb_agg(jsonb_build_array(attnum,attacl::text) ORDER BY attnum) FROM pg_attribute WHERE attrelid=expected AND attnum>0 AND NOT attisdropped) THEN
      RAISE EXCEPTION 'Unknown game_control ACL';
    END IF;
  END LOOP;
  IF regexp_replace(pg_get_viewdef('game_control.published_config'::regclass,true),'game_control\.','','g') IS DISTINCT FROM
    regexp_replace(replace(pg_get_viewdef('pg_temp.sg_control_published_config'::regclass,true),'sg_control_',''),'pg_temp_[0-9]+\.','','g') THEN
    RAISE EXCEPTION 'Unknown published configuration projection';
  END IF;
  IF (SELECT array_agg(version) FROM game_control.schema_version) IS DISTINCT FROM ARRAY[2]
    OR (SELECT count(*) FROM game_control.bootstrap WHERE id=1)<>1 OR (SELECT count(*) FROM game_control.active_head WHERE id=1)<>1
    OR (SELECT count(*) FROM game_control.current_policy)<>11
    OR NOT EXISTS(SELECT FROM game_control.roles WHERE id='administrator' AND builtin AND name='Administrator'
      AND permissions='["control.read","control.write","control.publish","members.read","members.write","roles.read","roles.write","audit.read"]'::jsonb) THEN
    RAISE EXCEPTION 'Unknown control ledger or builtin role';
  END IF;
  DROP VIEW pg_temp.sg_control_published_config;
  DROP TABLE pg_temp.sg_control_current_policy,pg_temp.sg_control_active_head,pg_temp.sg_control_publications,
    pg_temp.sg_control_application_observations,pg_temp.sg_control_audit,pg_temp.sg_control_revisions,
    pg_temp.sg_control_member_roles,pg_temp.sg_control_members,pg_temp.sg_control_roles,pg_temp.sg_control_bootstrap,pg_temp.sg_control_schema_version;
END $migration$;
COMMIT;
