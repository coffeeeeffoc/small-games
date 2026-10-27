"""Finite contracts by default; --postgres explicitly owns fresh local PG fixtures."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unittest
import uuid
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('control_database', HERE / 'control-database.py')
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
IMAGE = 'sha256:d741b376874687de90374fd34f55c6b2760e8f7bd7e4ae5cd47f50757fc08cf8'


class Contracts(unittest.TestCase):
    def test_ready_waits_for_final_tcp_server_before_using_socket(self):
        with patch.object(db, 'command', side_effect=[db.ControlDatabaseError('CONTROL_COMMAND_FAILED'), None]) as command, patch.object(db, 'psql', return_value='1') as query, patch.object(db.time, 'sleep') as sleep:
            db.ready('a' * 64)
            self.assertEqual(command.call_count, 2)
            command.assert_called_with('docker', 'exec', 'a' * 64, 'pg_isready', '-h', '127.0.0.1', '-U', 'platform_owner', timeout=5)
            query.assert_called_once()
            sleep.assert_called_once_with(0.5)
        with patch.object(db, 'command', side_effect=db.ControlDatabaseError('CONTROL_COMMAND_FAILED')), patch.object(db, 'psql') as query, patch.object(db.time, 'sleep'):
            with self.assertRaisesRegex(db.ControlDatabaseError, 'CONTROL_CLONE_NOT_READY'):
                db.ready('a' * 64)
            query.assert_not_called()

    def test_ordered_segments_and_pure_contract(self):
        parts = db.load_sql()
        self.assertTrue(parts['contract'].startswith('WITH '))
        self.assertNotIn('pg_temp', parts['contract'])
        self.assertNotIn('game_control.schema_version', parts['fingerprint'])
        self.assertIn('sg_control_metadata(protected_only)', parts['fingerprint'])
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'bad.sql'
            source = (HERE / 'control-fingerprint.sql').read_text(encoding='utf-8')
            for text in [source + db.MARKERS[2], source.replace(db.MARKERS[1], ''),
                         source.replace('SET LOCAL timezone', 'SET timezone')]:
                file.write_text(text,encoding='utf-8')
                with self.assertRaises(db.ControlDatabaseError):
                    db.load_sql(file)

    def test_transaction_assertions_precede_the_only_commit(self):
        parts = db.load_sql()
        contract = {'metadataSha256':'a'*64}
        sql = db.transaction_sql('SELECT 1;',parts,{}, {},contract)
        self.assertEqual(len(re.findall(r'(?m)^COMMIT;$',sql)),1)
        self.assertLess(sql.index('CONTROL_OLD_CHANGED'),sql.index('\nCOMMIT;'))
        self.assertLess(sql.index('CONTROL_FULL_CHANGED'),sql.index('\nCOMMIT;'))
        self.assertLess(sql.index('CONTROL_CONTRACT_CHANGED'),sql.index('\nCOMMIT;'))
        self.assertNotIn('PASSWORD',sql)
        self.assertNotIn('001-admin',sql)

    def test_expected_contract_required_before_database_access(self):
        with patch.object(db,'psql',side_effect=AssertionError('unexpected database access')):
            with self.assertRaisesRegex(db.ControlDatabaseError,'CONTROL_EXPECTED_CONTRACT_REQUIRED'):
                db.verify_control_database(pg_id='a'*64,migration_sha256=db.MIGRATION_SHA256,expected_contract=None)

    def test_verify_uses_actual_readonly_and_never_temp_setup(self):
        parts = db.load_sql()
        expected = {'version':1,'schema':'game_control','schemaVersion':3,'projectionSha256':parts['projection'],'metadataSha256':'a'*64}
        for readonly in (True,False):
            result = db.MARKER + json.dumps({'supported':True,'versions':[3],'metadataSha256':'a'*64,'readOnly':readonly})
            with patch.object(db,'psql',return_value=result) as execute:
                if readonly:
                    actual = db.verify_control_database(pg_id='b'*64,migration_sha256=db.MIGRATION_SHA256,expected_contract=expected)
                    self.assertEqual(set(actual),{'controlContract','readOnly','migrationArtifactSha256'})
                else:
                    with self.assertRaisesRegex(db.ControlDatabaseError,'CONTROL_NOT_READ_ONLY'):
                        db.verify_control_database(pg_id='b'*64,migration_sha256=db.MIGRATION_SHA256,expected_contract=expected)
                sql = execute.call_args.args[1]
                self.assertTrue(sql.startswith('BEGIN READ ONLY;'))
                self.assertNotIn('pg_temp',sql)
                self.assertNotIn('CREATE TEMP',sql)

    def test_wrong_versions_projection_metadata_and_unknown_profile_fail(self):
        parts = db.load_sql()
        expected = {'version':1,'schema':'game_control','schemaVersion':3,'projectionSha256':parts['projection'],'metadataSha256':'a'*64}
        for versions,supported,sha in [([],True,'a'*64),([1],True,'a'*64),([3],False,'a'*64),([3],True,'b'*64)]:
            value = db.MARKER+json.dumps({'supported':supported,'versions':versions,'metadataSha256':sha,'readOnly':True})
            with patch.object(db,'psql',return_value=value):
                with self.assertRaises(db.ControlDatabaseError):
                    db.verify_control_database(pg_id='b'*64,migration_sha256=db.MIGRATION_SHA256,expected_contract=expected)
        with patch.object(db,'psql',side_effect=AssertionError('unexpected query')):
            changed = dict(expected,projectionSha256='0'*64)
            with self.assertRaisesRegex(db.ControlDatabaseError,'CONTROL_PROJECTION_MISMATCH'):
                db.verify_control_database(pg_id='b'*64,migration_sha256=db.MIGRATION_SHA256,expected_contract=changed)

    def test_private_atomic_no_replace_links_and_permissions(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            file = directory / 'proof.json'
            with patch.object(db,'fsync_directory',wraps=db.fsync_directory) as sync:
                db.write_private(file,b'private fixture\n')
                self.assertEqual(file.read_bytes(),b'private fixture\n')
                self.assertEqual(file.stat().st_nlink,1)
                self.assertEqual(sync.call_count,1)
            with self.assertRaises(FileExistsError):
                db.write_private(file,b'overwrite')
            alias = directory/'alias'
            alias.symlink_to(file)
            with self.assertRaises(db.ControlDatabaseError):
                db.private_metadata(alias)
            file.chmod(0o644)
            with self.assertRaises(db.ControlDatabaseError):
                db.private_metadata(file)

    def test_inventory_checks_current_ids_not_snapshot_running(self):
        names = ('runtime','kart','management','postgres','nginx','web')
        items = {name:{'id':str(i+1)*64,'image':'sha256:'+'a'*64,'running':True,'mounts':[], 'ports':{},'networkMode':'none','networks':{}} for i,name in enumerate(names)}
        def inspect(identifier):
            name = next(name for name in names if items[name]['id']==identifier)
            return dict(items[name],running=name in ('postgres','web'))
        with patch.object(db,'inspect_container',side_effect=inspect):
            self.assertEqual(db.check_inventory(items),items['postgres']['id'])
        with patch.object(db,'inspect_container',return_value=dict(items['runtime'],running=True)):
            with self.assertRaises(db.ControlDatabaseError):
                db.check_inventory(items)
        with patch.object(db, 'inspect_container', side_effect=lambda identifier: next(item for item in items.values() if item['id'] == identifier)):
            self.assertEqual(db.check_inventory(items, writers_running=True), items['postgres']['id'])
            with self.assertRaisesRegex(db.ControlDatabaseError, 'CONTROL_WRITER_RUNNING'):
                db.check_inventory(items)

    def test_owner_failure_before_database_access_is_provably_not_committed(self):
        with patch.object(db, 'private_directory', side_effect=db.ControlDatabaseError('CONTROL_PRIVATE_DIRECTORY')), patch.object(db, 'command') as command:
            with self.assertRaises(db.ControlDatabaseError) as caught:
                db.provision_control_database(release=Path('/unused/candidate'), source_sha='a' * 40,
                    migration_sha256=db.MIGRATION_SHA256, inventory={})
            self.assertEqual(caught.exception.code, 'CONTROL_PRIVATE_DIRECTORY')
            self.assertEqual(caught.exception.outcome, 'not_committed')
            self.assertTrue(caught.exception.oldDataUnchanged)
            self.assertFalse(caught.exception.mutationReached)
            command.assert_not_called()

    def test_commit_timeout_never_becomes_known_not_committed(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            backup = directory / 'control-database.dump'
            backup.write_bytes(b'fixture-backup')
            parts = db.load_sql()
            contract = {'version': 1, 'schema': 'game_control', 'schemaVersion': 3,
                        'projectionSha256': parts['projection'], 'metadataSha256': 'a' * 64}
            with patch.object(db, 'preflight_control_database', return_value=('SELECT 1;', parts, 'a' * 64, directory)), patch.object(db, 'state', return_value={}), patch.object(db, 'write_private'), patch.object(db, 'command', return_value=b'fixture'), patch.object(db, 'restore_proof', return_value=({}, contract)), patch.object(db, 'check_inventory'), patch.object(db, 'psql', side_effect=db.ControlDatabaseError('CONTROL_COMMAND_TIMEOUT')) as execute:
                with self.assertRaises(db.ControlDatabaseError) as caught:
                    db.provision_control_database(release=directory, source_sha='a' * 40,
                        migration_sha256=db.MIGRATION_SHA256, inventory={})
                self.assertEqual(caught.exception.outcome, 'unknown')
                self.assertTrue(caught.exception.mutationReached)
                self.assertFalse(caught.exception.oldDataUnchanged)
                self.assertIn('\nCOMMIT;\n', execute.call_args.args[1])

    def test_only_standard_restrict_lines_are_removed(self):
        text = b'\\restrict AbC123\nCREATE ROLE platform_owner;\nCREATE ROLE runtime_app;\n\\unrestrict AbC123\n'
        self.assertEqual(db.restore_roles_sql(text),'CREATE ROLE runtime_app;\n')
        self.assertIn('\\restrict !unsafe',db.normalize_roles_dump(b'\\restrict !unsafe\n'))
        self.assertEqual(db.normalize_roles_dump(b'fixture\r\nbytes\r\n'),'fixture\r\nbytes\r\n')
        with self.assertRaises(db.ControlDatabaseError):
            db.restore_roles_sql(b'CREATE ROLE platform_owner;\nCREATE ROLE platform_owner;\n')

    def test_diagnostics_are_fixed_codes_and_outcome_is_not_inferred(self):
        class Result:
            returncode=1
            stdout=b''
            stderr=b'ERROR: P0001 private fixture data and SQL'
        with patch.object(db.subprocess,'run',return_value=Result()):
            with self.assertRaises(db.ControlDatabaseError) as caught:
                db.command('docker',input=b'private fixture data')
            self.assertEqual(str(caught.exception),'CONTROL_COMMAND_FAILED')
            self.assertEqual(caught.exception.outcome,'unknown')
            self.assertFalse(caught.exception.oldDataUnchanged)
            self.assertEqual(caught.exception.sqlstate,'P0001')

    def test_uncertain_create_and_cleanup_failure_keep_owned_identity(self):
        token='12345678123442348234123456789012'
        with patch.object(db,'scalar',side_effect=['',db.ControlDatabaseError('CONTROL_COMMAND_TIMEOUT'),'']):
            with self.assertRaisesRegex(db.ControlDatabaseError,'CONTROL_FIXTURE_RECOVERY_REQUIRED') as caught:
                with db.isolated_postgres(IMAGE,fixture_uuid=token):
                    self.fail('fixture should not start')
            self.assertEqual(caught.exception.probeUUID,'12345678-1234-4234-8234-123456789012')
        with patch.object(db,'scalar',side_effect=['','a'*64]),patch.object(db,'require_fixture_identity'),patch.object(db,'ready'),patch.object(db,'command',side_effect=db.ControlDatabaseError('CONTROL_COMMAND_FAILED')):
            with self.assertRaisesRegex(db.ControlDatabaseError,'CONTROL_FIXTURE_CLEANUP_REQUIRED') as caught:
                with db.isolated_postgres(IMAGE,fixture_uuid=token):
                    pass
            self.assertEqual(caught.exception.ownedContainerId,'a'*64)

    def test_fixture_identity_accepts_only_actual_tmpfs_representations(self):
        identifier='a'*64
        token='12345678123442348234123456789012'
        name='sg-control-source-'+token
        facts={'id':identifier,'image':IMAGE,'fixture':token,'name':'/'+name,'networkMode':'none','ports':{},
               'memory':268435456,'cpu':1000000000,'tmpfs':{'/var/lib/postgresql/data':'rw,size=134217728'},'mounts':[]}
        with patch.object(db,'inspect_container',return_value=facts):
            db.require_fixture_identity(identifier,IMAGE,token,name)
            for key,value in [('image','sha256:'+'b'*64),('networkMode','bridge'),('ports',{'1/tcp':[]}),('mounts',[{'Type':'bind','Destination':'/var/lib/postgresql/data','RW':True}])]:
                changed=dict(facts); changed[key]=value
                with patch.object(db,'inspect_container',return_value=changed):
                    with self.assertRaises(db.ControlDatabaseError):
                        db.require_fixture_identity(identifier,IMAGE,token,name)


def actual_postgres(fixture_uuid, receipt_path):
    """Fresh source/restore only. Lifecycle inventory is explicitly injected."""
    db.require(re.fullmatch(r'[a-f0-9]{32}',fixture_uuid) is not None,'FIXTURE_UUID')
    db.require(db.scalar('docker','image','inspect',IMAGE,'--format','{{.Id}}')==IMAGE,'FIXTURE_IMAGE')
    parts = db.load_sql()
    passed, owned, changed = [], [], []
    code_files = {name:hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in ('control-database.py','control-database.test.py','control-fingerprint.sql')}
    try:
        with tempfile.TemporaryDirectory(prefix='sg-control-'+fixture_uuid+'-') as folder:
            private = Path(folder)/'private'
            private.mkdir(mode=0o700)
            base = Path(folder)/'releases'
            base.mkdir(mode=0o700)
            release = base/('fixture-'+fixture_uuid)
            release.mkdir(mode=0o700)
            (release/'migrations').mkdir(mode=0o700)
            for name in ('control-database.py','control-fingerprint.sql','migrations/002-control-center.sql'):
                shutil.copyfile(HERE/name,release/name)
            manifest={'release':release.name,'sourceSHA':'1'*40,'migrationArtifactSha256':db.MIGRATION_SHA256,
                      'files':{name:hashlib.sha256((release/name).read_bytes()).hexdigest() for name in ('control-database.py','control-fingerprint.sql','migrations/002-control-center.sql')}}
            (release/'manifest.json').write_bytes(db.encoded_json(manifest))
            (private/release.name).mkdir(mode=0o700)
            with db.isolated_postgres(IMAGE,'source',fixture_uuid) as source:
                owned.append({'id':source,'uuid':fixture_uuid})
                facts=db.json_value(db.command('docker','inspect','--format','{"memory":{{json .HostConfig.Memory}},"cpu":{{json .HostConfig.NanoCpus}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}}}',source))
                db.require(facts['memory']==268435456 and facts['cpu']==1000000000 and facts['network']=='none' and not facts['ports'],'FIXTURE_LIMITS')
                db.psql(source,'CREATE DATABASE small_games;','postgres')
                db.psql(source,"""
REVOKE ALL ON DATABASE small_games FROM PUBLIC; REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE ROLE zz_control_canary NOLOGIN;
CREATE ROLE runtime_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10;
CREATE ROLE management_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE aa_control_canary NOLOGIN;
GRANT CONNECT ON DATABASE small_games TO runtime_app,management_app;
ALTER ROLE runtime_app SET search_path TO runtime,pg_catalog;
ALTER ROLE runtime_app SET statement_timeout TO '5s';
ALTER ROLE runtime_app SET idle_in_transaction_session_timeout TO '30s';
CREATE SCHEMA runtime; REVOKE ALL ON SCHEMA runtime FROM PUBLIC; GRANT USAGE ON SCHEMA runtime TO runtime_app;
CREATE TABLE runtime.competition_players(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,data jsonb NOT NULL);
INSERT INTO runtime.competition_players(data) VALUES('{"fixture":"保留","n":1}'),('{"fixture":"second","n":2}');
GRANT SELECT,INSERT,UPDATE ON runtime.competition_players TO runtime_app;
GRANT UPDATE(data) ON runtime.competition_players TO runtime_app;
GRANT USAGE ON SEQUENCE runtime.competition_players_id_seq TO runtime_app;
CREATE TABLE runtime.sequence_owner_a(id bigint); CREATE TABLE runtime.sequence_owner_b(id bigint);
CREATE TABLE runtime.empty_acl(id integer); REVOKE ALL ON runtime.empty_acl FROM platform_owner;
CREATE SEQUENCE runtime.canary_seq CACHE 20 OWNED BY runtime.sequence_owner_a.id; SELECT nextval('runtime.canary_seq');
CREATE FUNCTION runtime.canary_trigger() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN RETURN NEW; END$$;
REVOKE ALL ON FUNCTION runtime.canary_trigger() FROM PUBLIC; GRANT EXECUTE ON FUNCTION runtime.canary_trigger() TO runtime_app;
CREATE TRIGGER canary_before_update BEFORE UPDATE ON runtime.competition_players FOR EACH ROW EXECUTE FUNCTION runtime.canary_trigger();
ALTER TABLE runtime.competition_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY canary_policy ON runtime.competition_players TO runtime_app USING(true) WITH CHECK(true);
COMMENT ON SCHEMA runtime IS 'schema fixture'; COMMENT ON TABLE runtime.competition_players IS 'table fixture';
COMMENT ON COLUMN runtime.competition_players.data IS 'column fixture'; COMMENT ON ROLE zz_control_canary IS 'role fixture';
""")
                # Fresh-fixture setup only; never invokes the old provisioning wrapper.
                db.psql(source,(HERE/'migrations/001-admin-auth.sql').read_text(encoding='utf-8'))
                db.psql(source,"""INSERT INTO admin_console.admin_oauth_flows VALUES(repeat('a',64),repeat('a',43),'https://fixture.invalid/callback',100);
INSERT INTO admin_console.admin_sessions VALUES(repeat('b',64),repeat('c',64),true,'1','fixture','fixture@example.invalid',100);""")
                source_oids=db.psql(source,"SELECT jsonb_object_agg(rolname,oid) FROM pg_roles WHERE rolname IN('aa_control_canary','zz_control_canary','runtime_app','management_app');")
                real_restore=db.restore_proof
                def observer(event,clone):
                    if event=='restored':
                        token=db.inspect_container(clone)['fixture']
                        owned.append({'id':clone,'uuid':token})
                        clone_oids=db.psql(clone,"SELECT jsonb_object_agg(rolname,oid) FROM pg_roles WHERE rolname IN('aa_control_canary','zz_control_canary','runtime_app','management_app');")
                        db.require(db.json_value(source_oids)!=db.json_value(clone_oids),'FIXTURE_ROLE_OIDS_NOT_CHANGED')
                        passed.extend(['full_restore_old_data_structure_owner_roles_acl','role_oid_order_changed_with_equal_fingerprint'])
                    else:
                        exercise_mutations(clone,parts,passed,changed)
                def restore(*args,**kwargs):
                    return real_restore(*args,observer=observer,**kwargs)
                with patch.object(db,'BASE',base),patch.object(db,'PRIVATE',private),patch.object(db,'check_inventory',return_value=source),patch.object(db,'restore_proof',side_effect=restore):
                    proof=db.provision_control_database(release=release,source_sha='1'*40,migration_sha256=db.MIGRATION_SHA256,inventory={})
                db.require(set(proof)=={'outcome','oldDataUnchanged','isolatedRestoreVerified','leastPrivilegeVerified','backupSHA256','oldStateSHA256','controlContract','migrationArtifactSha256'},'FIXTURE_PROOF_KEYS')
                actual=db.verify_control_database(pg_id=source,migration_sha256=db.MIGRATION_SHA256,expected_contract=proof['controlContract'])
                db.require(actual['readOnly'] is True,'FIXTURE_NOT_READ_ONLY')
                record=private/release.name/'control-precommit.json'
                pair=private/release.name/'control-precommit.sha256'
                db.private_metadata(record); db.private_metadata(pair)
                pre=db.json_value(record.read_bytes())
                db.require(set(pre)=={'version','release','sourceSHA','migrationArtifactSha256','backupSHA256','oldStateSHA256','controlContract','isolatedRestoreVerified','oldDataUnchanged','leastPrivilegeVerified'},'FIXTURE_PRECOMMIT_KEYS')
                db.require(pair.read_text(encoding='ascii')==hashlib.sha256(record.read_bytes()).hexdigest()+'\n','FIXTURE_PRECOMMIT_HASH')
                for name in ('control-expected-full.json','control-expected-protected.json','control-expected-contract.json','control-database.dump','control-roles.sql'):
                    db.private_metadata(private/release.name/name)
                passed.extend(['exact_002_twice_idempotent','actual_positive_and_42501_negative_permissions','protected_precommit_pair','source_same_transaction_full_and_contract_guards','verify_actual_read_only'])
                # Keep the old canary intact, then exercise real UUID session tables after 002.
                db.psql(source, 'ALTER TABLE runtime.competition_players RENAME TO canary_players;')
                for number in ('010-competition.sql','011-competition-profiles.sql','012-three-choose-two.sql','013-competition-identities.sql'):
                    db.psql(source,(HERE.parent/'migrations'/number).read_text(encoding='utf-8'))
                session_file = 'migrations/014-player-sessions.sql'
                shutil.copyfile(HERE.parent/session_file,release/session_file)
                manifest['files'][session_file] = hashlib.sha256((release/session_file).read_bytes()).hexdigest()
                (release/'manifest.json').write_bytes(db.encoded_json(manifest))
                pid = '00000000-0000-4000-8000-000000000014'
                db.psql(source, "INSERT INTO runtime.competition_players(id,created_at,display_name) VALUES('"+pid+"',1,'保留玩家'); INSERT INTO runtime.competition_sessions(token_hash,player_id,expires_at) VALUES(repeat('a',64),'"+pid+"',100);")
                before_sessions = db.state(source,parts)
                real_psql, real_write = db.psql, db.write_private
                lost = [False]
                def response_lost(pg, query, *args, **kwargs):
                    value = real_psql(pg,query,*args,**kwargs)
                    if pg == source and 'DO $post$' in query and not lost[0]:
                        lost[0] = True
                        raise db.ControlDatabaseError('CONTROL_COMMAND_TIMEOUT')
                    return value
                with patch.object(db,'PRIVATE',private):
                    with patch.object(db,'psql',side_effect=response_lost):
                        with unittest.TestCase().assertRaises(db.ControlDatabaseError):
                            db.provision_player_sessions(release,source)
                    db.require(lost[0], 'FIXTURE_COMMIT_LOSS_NOT_REACHED')
                    def completion_lost(file,data):
                        if file.name == 'player-sessions-complete.json':
                            raise db.ControlDatabaseError('CONTROL_PRIVATE_FILE')
                        return real_write(file,data)
                    with patch.object(db,'write_private',side_effect=completion_lost):
                        with unittest.TestCase().assertRaises(db.ControlDatabaseError):
                            db.provision_player_sessions(release,source)
                    session_proof = db.provision_player_sessions(release,source)
                    db.require(db.provision_player_sessions(release,source)==session_proof,'FIXTURE_014_RETRY')
                    db.require(db.psql(source,"SELECT display_name FROM runtime.competition_players WHERE id='"+pid+"';")=='保留玩家','FIXTURE_PLAYER_CHANGED')
                    db.require(db.psql(source,'SELECT count(*) FROM runtime.competition_sessions;')=='0','FIXTURE_LEGACY_CREDENTIAL_REMAINED')
                    db.psql(source,"SET ROLE runtime_app; INSERT INTO runtime.player_game_access VALUES('"+pid+"','cops-robbers'); BEGIN; SELECT player_id FROM runtime.player_game_access FOR KEY SHARE; COMMIT; RESET ROLE;")
                    db.provision_player_sessions(release,source) # Business rows do not invalidate metadata.
                    db.psql(source,'REVOKE UPDATE ON runtime.player_game_access FROM runtime_app;')
                    with unittest.TestCase().assertRaises(db.ControlDatabaseError):
                        db.provision_player_sessions(release,source)
                    db.psql(source,'GRANT UPDATE ON runtime.player_game_access TO runtime_app;')
                    db.provision_player_sessions(release,source)
                    current = db.state(source,parts)
                    migration = db.player_session_migration(release)[2]
                    with unittest.TestCase().assertRaises(db.ControlDatabaseError):
                        db.psql(source,db.player_session_transaction(migration,parts,current,before_sessions))
                    db.require(db.state(source,parts)==current,'FIXTURE_014_ROLLBACK')
                passed.extend(['014_real_uuid_schema_restore_and_idempotence','014_commit_response_loss_retry','014_complete_write_failure_retry','014_preserves_players_invalidates_legacy_credentials','014_runtime_role_locks','014_business_rows_allowed_acl_drift_rejected','014_postcondition_failure_rolls_back'])

            for item in owned:
                db.require(not db.scalar('docker','ps','-aq','--no-trunc','--filter','label='+db.FIXTURE_LABEL+'='+item['uuid']),'FIXTURE_RESOURCE_REMAINED')
        receipt={'version':1,'status':'passed','fixtureUUID':fixture_uuid,'postgresImage':IMAGE,'postgresVersion':'17.6',
                 'limits':{'memoryBytes':268435456,'cpus':1,'network':'none','publishedPorts':[]},
                 'implementationSHA256':code_files,'ownedResources':owned,'ownedResourcesRemaining':0,
                 'lifecycleInventory':'injected; no real Nginx or application services','realPostgresRestoreAndSQL':True,
                 'productionExecuted':False,'realGithubLoginVerified':False,'passed':passed,'contractMutationsRejected':changed,
                 'controlContract':proof['controlContract'],'migrationArtifactSha256':db.MIGRATION_SHA256}
        receipt_path.write_bytes(db.encoded_json(receipt))
        print(json.dumps({'status':'passed','fixtureUUID':fixture_uuid,'cases':len(passed),'contractMutations':len(changed),'ownedResourcesRemaining':0}))
    except BaseException as error:
        code=error.code if isinstance(error,db.ControlDatabaseError) else 'FIXTURE_FAILED'
        if db.digest(getattr(error,'ownedContainerId',None)) and not any(item['id']==error.ownedContainerId for item in owned):
            owned.append({'id':error.ownedContainerId,'uuid':getattr(error,'fixtureUUID',fixture_uuid)})
        cleanup=[]
        for item in owned:
            try:
                remaining=db.scalar('docker','ps','-aq','--no-trunc','--filter','label='+db.FIXTURE_LABEL+'='+item['uuid']).splitlines()
                cleanup.append({'uuid':item['uuid'],'remaining':len(remaining)})
            except db.ControlDatabaseError:
                cleanup.append({'uuid':item['uuid'],'remaining':'unknown'})
        receipt_path.write_bytes(db.encoded_json({'version':1,'status':'failed','code':code,'originalCode':getattr(error,'originalCode',None),'sqlstate':getattr(error,'sqlstate',None),'fixtureUUID':fixture_uuid,'ownedResources':owned,'cleanup':cleanup,'passed':passed,'contractMutationsRejected':changed,'productionExecuted':False}))
        print(json.dumps({'status':'failed','code':code,'sqlstate':getattr(error,'sqlstate',None),'fixtureUUID':fixture_uuid}))
        raise SystemExit(1) from None


def exercise_mutations(pg,parts,passed,changed):
    initial=db.state(pg,parts)
    expected=db.contract_value(db.output_json(db.psql(pg,"BEGIN READ ONLY;"+parts['session']+"SELECT '"+db.MARKER+"'||result::text FROM ("+db.contract_expression(parts)+") q(result);COMMIT;")),parts)
    def verify():
        return db.verify_control_database(pg_id=pg,migration_sha256=db.MIGRATION_SHA256,expected_contract=expected)
    def rejected(label,apply,undo):
        db.psql(pg,apply)
        try:
            try:
                verify()
            except db.ControlDatabaseError:
                changed.append(label)
            else:
                raise db.ControlDatabaseError('FIXTURE_MUTATION_ACCEPTED')
        finally:
            db.psql(pg,undo)
        verify()
    rejected('column','ALTER TABLE game_control.members RENAME COLUMN email TO proof_email;','ALTER TABLE game_control.members RENAME COLUMN proof_email TO email;')
    rejected('default',"ALTER TABLE game_control.current_policy ALTER COLUMN state SET DEFAULT 'enabled';",'ALTER TABLE game_control.current_policy ALTER COLUMN state DROP DEFAULT;')
    rejected('owner','ALTER TABLE game_control.audit OWNER TO zz_control_canary;','ALTER TABLE game_control.audit OWNER TO platform_owner;')
    rejected('table_acl','GRANT SELECT ON game_control.audit TO runtime_app;','REVOKE SELECT ON game_control.audit FROM runtime_app;')
    rejected('column_acl','GRANT UPDATE(name) ON game_control.roles TO runtime_app;','REVOKE UPDATE(name) ON game_control.roles FROM runtime_app;')
    rejected('function_acl','GRANT EXECUTE ON FUNCTION game_control.guard_builtin_role() TO runtime_app;','REVOKE EXECUTE ON FUNCTION game_control.guard_builtin_role() FROM runtime_app;')
    rejected('index','CREATE INDEX control_proof_index ON game_control.members(email);','DROP INDEX game_control.control_proof_index;')
    view=db.psql(pg,"SELECT pg_get_viewdef('game_control.published_config'::regclass,false);")
    rejected('view','CREATE OR REPLACE VIEW game_control.published_config WITH(security_barrier=true) AS '+view.rstrip(';')+' AND true;',
             'CREATE OR REPLACE VIEW game_control.published_config WITH(security_barrier=true) AS '+view)
    function=db.psql(pg,"SELECT pg_get_functiondef('game_control.guard_builtin_role()'::regprocedure);")
    rejected('function_body',function.replace('IF OLD.builtin THEN','IF false AND OLD.builtin THEN'),function)
    rejected('trigger_enabled','ALTER TABLE game_control.roles DISABLE TRIGGER immutable_builtin;','ALTER TABLE game_control.roles ENABLE TRIGGER immutable_builtin;')
    rejected('policy','CREATE POLICY control_proof_policy ON game_control.members USING(true);','DROP POLICY control_proof_policy ON game_control.members;')
    rejected('unknown_type',"CREATE TYPE game_control.control_proof_type AS ENUM('a');",'DROP TYPE game_control.control_proof_type;')
    rejected('missing_version','DELETE FROM game_control.schema_version;','INSERT INTO game_control.schema_version VALUES(2);')
    rejected('wrong_version','ALTER TABLE game_control.schema_version DROP CONSTRAINT schema_version_version_check; UPDATE game_control.schema_version SET version=1;',
             'UPDATE game_control.schema_version SET version=2; ALTER TABLE game_control.schema_version ADD CONSTRAINT schema_version_version_check CHECK(version=2);')
    for value in (None,dict(expected,projectionSha256='0'*64)):
        try:
            db.verify_control_database(pg_id=pg,migration_sha256=db.MIGRATION_SHA256,expected_contract=value)
        except db.ControlDatabaseError:
            pass
        else:
            raise db.ControlDatabaseError('FIXTURE_BAD_EXPECTATION_ACCEPTED')
    passed.append('missing_expected_and_projection_change_rejected')
    protected=db.state(pg,parts,True)
    old_cases=[
        ('admin_rows','UPDATE admin_console.admin_sessions SET expires_at=101;','UPDATE admin_console.admin_sessions SET expires_at=100;'),
        ('admin_structure',"ALTER TABLE admin_console.admin_sessions ALTER COLUMN login SET DEFAULT 'fixture';",'ALTER TABLE admin_console.admin_sessions ALTER COLUMN login DROP DEFAULT;'),
        ('old_acl','GRANT SELECT ON runtime.competition_players TO management_app;','REVOKE SELECT ON runtime.competition_players FROM management_app;'),
        ('old_role','ALTER ROLE runtime_app CONNECTION LIMIT 11;','ALTER ROLE runtime_app CONNECTION LIMIT 10;'),
        ('old_trigger','ALTER TABLE runtime.competition_players DISABLE TRIGGER canary_before_update;','ALTER TABLE runtime.competition_players ENABLE TRIGGER canary_before_update;'),
        ('old_policy','ALTER POLICY canary_policy ON runtime.competition_players USING(false);','ALTER POLICY canary_policy ON runtime.competition_players USING(true);'),
        ('sequence_ownership_none','ALTER SEQUENCE runtime.canary_seq OWNED BY NONE;','ALTER SEQUENCE runtime.canary_seq OWNED BY runtime.sequence_owner_a.id;'),
        ('sequence_ownership_rebind','ALTER SEQUENCE runtime.canary_seq OWNED BY runtime.sequence_owner_b.id;','ALTER SEQUENCE runtime.canary_seq OWNED BY runtime.sequence_owner_a.id;'),
    ]
    for label,apply,undo in old_cases:
        db.psql(pg,apply)
        try:
            db.require(db.state(pg,parts,True)!=protected,'FIXTURE_OLD_MUTATION_ACCEPTED')
            passed.append('detected_'+label)
        finally:
            db.psql(pg,undo)
        db.require(db.state(pg,parts,True)==protected,'FIXTURE_OLD_UNDO_CHANGED')
    saved=db.json_value(db.psql(pg,'SELECT jsonb_build_array(last_value,is_called) FROM runtime.canary_seq;'))
    db.psql(pg,"SELECT nextval('runtime.canary_seq');")
    db.require(db.state(pg,parts,True)!=protected,'FIXTURE_SEQUENCE_NOT_DETECTED')
    db.psql(pg,"SELECT setval('runtime.canary_seq',"+str(saved[0])+','+str(saved[1]).lower()+');')
    db.require(db.state(pg,parts,True)==protected,'FIXTURE_SEQUENCE_UNDO')
    passed.append('detected_sequence_value')
    for label,apply,undo in [
        ('database_role_setting',"ALTER ROLE runtime_app IN DATABASE small_games SET statement_timeout='6s';",'ALTER ROLE runtime_app IN DATABASE small_games RESET ALL;'),
        ('unknown_global_guc',"ALTER ROLE runtime_app SET application_name='fixture';",'ALTER ROLE runtime_app RESET application_name;'),
        ('default_acl','ALTER DEFAULT PRIVILEGES FOR ROLE runtime_app GRANT SELECT ON TABLES TO management_app;','ALTER DEFAULT PRIVILEGES FOR ROLE runtime_app REVOKE SELECT ON TABLES FROM management_app;'),
    ]:
        db.psql(pg,apply)
        try:
            try:
                db.state(pg,parts,True)
            except db.ControlDatabaseError:
                passed.append('profile_rejects_'+label)
            else:
                raise db.ControlDatabaseError('FIXTURE_PROFILE_ACCEPTED')
        finally:
            db.psql(pg,undo)
    db.psql(pg,"""INSERT INTO game_control.members VALUES('00000000-0000-4000-8000-000000000002','member@example.invalid','2',true);
INSERT INTO game_control.member_roles VALUES('00000000-0000-4000-8000-000000000002','administrator');
UPDATE game_control.bootstrap SET initialized=true;
INSERT INTO game_control.revisions SELECT '00000000-0000-4000-8000-000000000003',0,jsonb_build_object('apiOrigins','[]'::jsonb,'games',jsonb_object_agg(game_id,state)),
'fixture','00000000-0000-4000-8000-000000000002',NULL,repeat('a',64),1 FROM game_control.current_policy;
INSERT INTO game_control.publications VALUES(1,'00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',1);
UPDATE game_control.active_head SET version=1,revision_id='00000000-0000-4000-8000-000000000003';
UPDATE game_control.current_policy SET revision=1;
INSERT INTO game_control.application_observations VALUES('00000000-0000-4000-8000-000000000004','runtime','proof',1,repeat('a',64),'applied',1);
INSERT INTO game_control.audit VALUES('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','fixture','fixture','{}',1);""")
    verify()
    passed.append('business_members_publications_observations_do_not_change_contract')
    db.psql(pg,"""UPDATE game_control.active_head SET version=0,revision_id=NULL; UPDATE game_control.current_policy SET revision=0;
DELETE FROM game_control.publications; DELETE FROM game_control.revisions; DELETE FROM game_control.application_observations;
DELETE FROM game_control.audit; DELETE FROM game_control.member_roles; DELETE FROM game_control.members; UPDATE game_control.bootstrap SET initialized=false;""")
    db.require(db.state(pg,parts)==initial,'FIXTURE_MUTATION_CLEANUP')


if __name__=='__main__':
    if len(sys.argv)==5 and sys.argv[1]=='--postgres' and sys.argv[3]=='--receipt':
        actual_postgres(sys.argv[2],Path(sys.argv[4]))
    else:
        unittest.main()
