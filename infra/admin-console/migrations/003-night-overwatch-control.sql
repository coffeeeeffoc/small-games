-- Explicit v2 -> v3 expansion. Run with the reviewed control deployment's backup/restore barrier.
-- 002 remains immutable and validates the complete v2 schema before this upgrade.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('game-control:v1',0));
CREATE TEMP TABLE sg_night_old_snapshot(snapshot jsonb CHECK(jsonb_typeof(snapshot)='object' AND snapshot ?& ARRAY['apiOrigins','games'] AND snapshot - 'apiOrigins' - 'games'='{}'::jsonb
        AND jsonb_typeof(snapshot->'apiOrigins')='array' AND jsonb_typeof(snapshot->'games')='object'
        AND snapshot->'games' ?& ARRAY['cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car']
        AND (snapshot->'games') - ARRAY['cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car']='{}'::jsonb
        AND NOT jsonb_path_exists(snapshot,'$.games.* ? (@ != "enabled" && @ != "draining" && @ != "disabled")'))) ON COMMIT DROP;
CREATE TEMP TABLE sg_night_new_snapshot(snapshot jsonb CHECK(jsonb_typeof(snapshot)='object' AND snapshot ?& ARRAY['apiOrigins','games'] AND snapshot - 'apiOrigins' - 'games'='{}'::jsonb
        AND jsonb_typeof(snapshot->'apiOrigins')='array' AND jsonb_typeof(snapshot->'games')='object'
        AND snapshot->'games' ?& ARRAY['cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car']
        AND (snapshot->'games') - ARRAY['night-overwatch','cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car']='{}'::jsonb
        AND NOT jsonb_path_exists(snapshot,'$.games.* ? (@ != "enabled" && @ != "draining" && @ != "disabled")'))) ON COMMIT DROP;
CREATE TEMP TABLE sg_night_old_policy(game_id text CHECK(game_id IN('cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car'))) ON COMMIT DROP;
CREATE TEMP TABLE sg_night_new_policy(game_id text CHECK(game_id IN('cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car','night-overwatch'))) ON COMMIT DROP;
CREATE TEMP TABLE sg_night_old_version(version integer CHECK(version=2)) ON COMMIT DROP;
CREATE TEMP TABLE sg_night_new_version(version integer CHECK(version=3)) ON COMMIT DROP;
DO $upgrade$
DECLARE
  schema_version integer;
  item record;
  expected oid;
  actual text;
  before_history jsonb;
  after_history jsonb;
  head_version bigint;
BEGIN
  SELECT v.version INTO STRICT schema_version FROM game_control.schema_version v;
  IF schema_version NOT IN (2,3) OR
    (SELECT nspowner FROM pg_namespace WHERE nspname='game_control') <> (SELECT oid FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'Unexpected control schema version or owner';
  END IF;
  SELECT h.version INTO STRICT head_version FROM game_control.active_head h WHERE id=1 FOR UPDATE;
  FOR item IN SELECT game_id FROM game_control.current_policy ORDER BY game_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('game-control:'||item.game_id,0));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('game-control:night-overwatch',0));
  LOCK TABLE game_control.current_policy, game_control.revisions, game_control.schema_version IN ACCESS EXCLUSIVE MODE;
  FOR item IN SELECT * FROM (VALUES
    ('revisions','revisions_snapshot_check','snapshot'),
    ('current_policy','current_policy_game_id_check','policy'),
    ('schema_version','schema_version_version_check','version')
  ) t(relation,constraint_name,reference) LOOP
    expected := to_regclass('pg_temp.sg_night_'||CASE WHEN schema_version=2 THEN 'old_' ELSE 'new_' END||item.reference);
    SELECT pg_get_expr(conbin,conrelid) INTO actual FROM pg_constraint
      WHERE conrelid=to_regclass('game_control.'||item.relation) AND conname=item.constraint_name AND contype='c' AND convalidated;
    IF actual IS DISTINCT FROM (SELECT pg_get_expr(conbin,conrelid) FROM pg_constraint WHERE conrelid=expected AND contype='c') THEN
      RAISE EXCEPTION 'Unexpected control constraint';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM game_control.current_policy) <> (CASE WHEN schema_version=2 THEN 11 ELSE 12 END)
    OR EXISTS(SELECT FROM game_control.current_policy WHERE revision<>head_version)
    OR (schema_version=2 AND EXISTS(SELECT FROM game_control.current_policy WHERE game_id='night-overwatch')) THEN
    RAISE EXCEPTION 'Incomplete or stale control policy';
  END IF;
  SELECT jsonb_build_object(
    'head',(SELECT to_jsonb(h) FROM game_control.active_head h),
    'revisions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM game_control.revisions r),
    'publications',(SELECT jsonb_agg(to_jsonb(p) ORDER BY version) FROM game_control.publications p),
    'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM game_control.audit a),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY game_id) FROM game_control.current_policy p WHERE game_id<>'night-overwatch')
  ) INTO before_history;
  IF schema_version=2 THEN
    ALTER TABLE game_control.revisions DROP CONSTRAINT revisions_snapshot_check;
    ALTER TABLE game_control.revisions ADD CONSTRAINT revisions_snapshot_check CHECK(jsonb_typeof(snapshot)='object' AND snapshot ?& ARRAY['apiOrigins','games'] AND snapshot - 'apiOrigins' - 'games'='{}'::jsonb
        AND jsonb_typeof(snapshot->'apiOrigins')='array' AND jsonb_typeof(snapshot->'games')='object'
        AND snapshot->'games' ?& ARRAY['cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car']
        AND (snapshot->'games') - ARRAY['night-overwatch','cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car']='{}'::jsonb
        AND NOT jsonb_path_exists(snapshot,'$.games.* ? (@ != "enabled" && @ != "draining" && @ != "disabled")'));
    ALTER TABLE game_control.current_policy DROP CONSTRAINT current_policy_game_id_check;
    ALTER TABLE game_control.current_policy ADD CONSTRAINT current_policy_game_id_check CHECK(game_id IN('cops-robbers','cops-robbers-realtime','letters-words2','vibeJam-myself-history-guess','xiangqi-five','flick-arena','carrom-club','cage-rescue','tower-brake','three-choose-two','carding-car','night-overwatch'));
    INSERT INTO game_control.current_policy VALUES('night-overwatch','disabled',0,head_version);
    ALTER TABLE game_control.schema_version DROP CONSTRAINT schema_version_version_check;
    UPDATE game_control.schema_version SET version=3;
    ALTER TABLE game_control.schema_version ADD CONSTRAINT schema_version_version_check CHECK(version=3);
  END IF;
  SELECT jsonb_build_object(
    'head',(SELECT to_jsonb(h) FROM game_control.active_head h),
    'revisions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM game_control.revisions r),
    'publications',(SELECT jsonb_agg(to_jsonb(p) ORDER BY version) FROM game_control.publications p),
    'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM game_control.audit a),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY game_id) FROM game_control.current_policy p WHERE game_id<>'night-overwatch')
  ) INTO after_history;
  IF before_history IS DISTINCT FROM after_history THEN RAISE EXCEPTION 'Control history changed'; END IF;
END $upgrade$;
COMMIT;
