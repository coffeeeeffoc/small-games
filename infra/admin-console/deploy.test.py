import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import secrets
import sys
import hashlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('admin_deploy', Path(__file__).with_name('deploy.py'))
admin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admin)


class AdminContracts(unittest.TestCase):
    def test_roles_restore_removes_only_one_exact_bootstrap_create(self):
        remaining = 'ALTER ROLE platform_owner WITH SUPERUSER;\nCREATE ROLE runtime_app;\nGRANT pg_monitor TO runtime_app;\n'
        self.assertEqual(admin.restore_roles_sql(('CREATE ROLE platform_owner;\n'+remaining).encode()), remaining)
        for bad in ['', remaining, 'CREATE ROLE platform_owner;\nCREATE ROLE platform_owner;\n', 'CREATE ROLE platform_owner_extra;\n', 'CREATE ROLE "platform_owner";\n']:
            with self.assertRaisesRegex(admin.Stopped, 'RESTORE_ROLE_DUMP'):
                admin.restore_roles_sql(bad.encode())

    def test_both_management_pointers_restore_on_second_swap_failure_or_signal(self):
        for action in ('activate', 'rollback'):
            for after_swap in (False, True):
                with tempfile.TemporaryDirectory() as folder:
                    base, private = Path(folder) / 'public', Path(folder) / 'private'
                    base.mkdir(); private.mkdir(mode=0o700)
                    releases = [base / name for name in ('current-release','previous-release','new-release')]
                    for release in releases: release.mkdir()
                    current, previous, new = releases
                    (base / 'current').symlink_to(current)
                    (base / 'previous').symlink_to(previous)
                    original = admin.atomic_pointer
                    calls = []
                    def swap(file, target):
                        calls.append((file, target))
                        if len(calls) == 2 and not after_swap: raise OSError('fixture swap failure')
                        original(file, target)
                        if len(calls) == 2 and after_swap: raise admin.Stopped('SIGNAL_INTERRUPTED')
                    old = {'id':'old', 'admin':current.name, 'ports':{}}
                    updated = {'id':'new', 'admin':new.name, 'ports':{}, 'networks':{'small-games_default':{}}}
                    seen = []
                    def service(*args, **kwargs):
                        seen.append(1)
                        return old if action == 'rollback' or len(seen) == 1 else updated
                    proof = {'sourceSHA':'a'*40,'backupSHA256':'b'*64,'oldStateSHA256':'c'*64,
                             'oldDataUnchanged':True,'isolatedRestoreVerified':True,'leastPrivilegeVerified':True}
                    with patch.object(admin, 'BASE', base), patch.object(admin, 'PRIVATE', private), patch.object(admin, 'manifest_from', return_value={'sourceSHA':'a'*40}), patch.object(admin, 'atomic_pointer', side_effect=swap), patch.object(admin, 'service', side_effect=service), patch.object(admin, 'command', return_value=b''), patch.object(admin, 'compose_command', return_value=b''), patch.object(admin, 'raw_capability'), patch.object(admin, 'public_probe'), patch.object(admin, 'retry_probe'), patch.object(admin, 'private_file', return_value=json.dumps(proof).encode()):
                        with self.assertRaises((OSError, admin.Stopped)):
                            if action == 'activate': admin.activate(new, 'a'*64, {'clientId':'canary','clientSecret':'fixture'}, '172.18.0.4')
                            else: admin.rollback()
                    self.assertEqual(Path(os.readlink(base/'current')), current)
                    self.assertEqual(Path(os.readlink(base/'previous')), previous)

    def test_input_limit_and_signal_cleanup_exception(self):
        self.assertEqual(admin.read_payload(io.BytesIO(b'{"public":true}')), {'public': True})
        with self.assertRaisesRegex(admin.Stopped, 'INPUT_TOO_LARGE'):
            admin.read_payload(io.BytesIO(b'x' * 16385))
        with patch.object(admin.signal, 'signal') as handler:
            with self.assertRaisesRegex(admin.Stopped, 'SIGNAL_INTERRUPTED'):
                admin.interrupted(admin.signal.SIGTERM, None)
            self.assertEqual(handler.call_count, 3)

    def test_restart_compares_stable_network_contract_but_rejects_address_change(self):
        value = {'id': 'a' * 64, 'networks': {'existing': {'NetworkID': 'network', 'IPAddress': '172.18.0.3', 'EndpointID': 'before'}}}
        with patch.object(admin, 'command', return_value=json.dumps(value).encode()):
            before = admin.inspect_container('fixture')
        value['networks']['existing']['EndpointID'] = 'after'
        with patch.object(admin, 'command', return_value=json.dumps(value).encode()):
            self.assertEqual(before, admin.inspect_container('fixture'))
        value['networks']['existing']['IPAddress'] = '172.18.0.9'
        with patch.object(admin, 'command', return_value=json.dumps(value).encode()):
            with self.assertRaisesRegex(admin.Stopped, 'PROTECTED_CONTAINER_CHANGED'):
                admin.assert_protection(({'fixture': before}, {}))

    def test_https_probe_retries_without_following_or_logging_oauth(self):
        with patch.object(admin, 'public_probe_once', side_effect=[admin.Stopped('HTTPS_PROBE'), None]) as probe, patch.object(admin.time, 'sleep'):
            admin.public_probe({'clientId': 'canary'})
            self.assertEqual(probe.call_count, 2)

    def test_single_transaction_and_logging_guards(self):
        migration = admin.migration_body(Path(__file__).with_name('migrations').joinpath('001-admin-auth.sql').read_text(encoding='utf-8'))
        text = admin.transaction('a' * 64, migration, '-- fingerprint fixture')
        self.assertEqual(text.count('\nCOMMIT;'), 1)
        self.assertEqual(text.count('BEGIN;'), 1)
        self.assertLess(text.index("log_min_error_statement='panic'"), text.index('PASSWORD'))
        self.assertLess(text.index("log_statement='none'"), text.index('PASSWORD'))
        self.assertLess(text.index('MANAGEMENT_PRIVILEGE_OVERREACH'), text.index('COMMIT;'))
        for body in ['BEGIN;\nCOMMIT;\nCOMMIT;', 'SELECT 1;', 'BEGIN;\nROLLBACK;\nCOMMIT;']:
            with self.assertRaises(admin.Stopped):
                admin.migration_body(body)

    def test_raw_environment_and_no_new_database_ports_or_dependencies(self):
        secret = '$HOME-${UNSET}-"double"-\'single\'-#hash-\\slash'
        value = admin.raw_environment('a' * 64, {'clientId': 'canary', 'clientSecret': secret}, '172.18.0.4').decode()
        self.assertIn('ADMIN_GITHUB_CLIENT_SECRET=' + secret + '\n', value)
        self.assertIn('MANAGEMENT_CAPABILITIES=admin', value)
        config = admin.compose(Path('/public/release'), Path('/private/protected.env'))
        self.assertEqual(set(config['services']), {'management'})
        self.assertNotIn('ports', config['services']['management'])
        self.assertNotIn('depends_on', config['services']['management'])
        self.assertEqual(config['services']['management']['env_file'][0]['format'], 'raw')
        self.assertTrue(config['networks']['existing']['external'])
        for bad in ['a\nb', 'a\rb', 'a\0b', '']:
            with self.assertRaises(admin.Stopped):
                admin.raw_environment('a' * 64, {'clientId': 'canary', 'clientSecret': bad}, '172.18.0.4')

    def test_private_files_unknown_permissions_and_links_fail_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder) / 'private'
            admin.private_directory(directory)
            file = directory / 'state'
            admin.write_private(file, b'private canary')
            self.assertEqual(admin.private_file(file), b'private canary')
            file.chmod(0o644)
            with self.assertRaises(admin.Stopped): admin.private_file(file)
            alias = directory / 'alias'
            alias.symlink_to(file)
            with self.assertRaises(admin.Stopped): admin.private_file(alias)
            with self.assertRaises(FileExistsError): admin.write_private(file, b'overwrite')

    def test_command_errors_never_render_stderr_or_arguments(self):
        class Result:
            returncode = 1
            stdout = b''
            stderr = b'CANARY_PASSWORD SQL_TOKEN CLIENT_SECRET'
        with patch.object(admin.subprocess, 'run', return_value=Result()) as run:
            with self.assertRaisesRegex(admin.Stopped, '^COMMAND_FAILED$'):
                admin.command('ssh', input=b'CANARY_SECRET')
            self.assertEqual(run.call_args.args[0], ('ssh',))
            self.assertEqual(run.call_args.kwargs['input'], b'CANARY_SECRET')

    def test_raw_capability_probes_exact_interpolation_without_secret(self):
        for mode in ('literal', 'serialized', 'expanded'):
            with tempfile.TemporaryDirectory() as folder:
                directory = Path(folder)
                def compose(file, *args):
                    config = json.loads(file.read_bytes())
                    env = Path(config['services']['probe']['env_file'][0]['path']).read_text(encoding='utf-8').split('=', 1)[1].rstrip('\n')
                    if mode == 'serialized': env = env.replace('$', '$$')
                    if mode == 'expanded': env = env.replace('$HOME', 'expanded')
                    return json.dumps({'services': {'probe': {'environment': {'CANARY': env}}}}).encode()
                with patch.object(admin, 'compose_command', side_effect=compose):
                    if mode == 'expanded':
                        with self.assertRaisesRegex(admin.Stopped, 'COMPOSE_RAW_UNSUPPORTED'): admin.raw_capability(directory)
                    else: admin.raw_capability(directory)
                self.assertNotIn('CLIENT_SECRET', (directory / 'raw-canary.env').read_text(encoding='utf-8'))

    def test_provision_only_requires_no_oauth_field(self):
        source = Path(__file__).with_name('deploy.py').read_text(encoding='utf-8')
        self.assertIn("{'caddyDirectory', 'sourceSHA'} if args[0] == '--provision-only'", source)
        self.assertNotIn('bootstrap.sql', source)
        self.assertNotIn('.Config.Env', source)
        self.assertIn("caddy / 'deploy.lock', ROOT / 'deploy.lock'", source)
        self.assertIn("rolname='sg_admin_restore'", source)


def postgres_fixture():
    """Explicit opt-in, two new none-network fixtures; never targets any existing PG."""
    tag = 'local-' + secrets.token_hex(6)
    name = 'sg-admin-source-' + tag
    image = admin.scalar('docker', 'image', 'inspect', 'postgres:17.6-alpine', '--format', '{{.Id}}')
    admin.require(not admin.scalar('docker', 'ps', '-aq', '--filter', 'name=^/' + name + '$'), 'FIXTURE_EXISTS')
    identifier = admin.scalar('docker', 'run', '-d', '--pull=never', '--name', name, '--network', 'none',
                              '--label', admin.LABEL + '=' + tag, '--tmpfs', '/var/lib/postgresql/data:rw',
                              '-e', 'POSTGRES_USER=platform_owner', '-e', 'POSTGRES_DB=small_games',
                              '-e', 'POSTGRES_PASSWORD=fixture-not-a-secret', image)
    try:
        admin.ready(identifier, 'platform_owner')
        print('ADMIN_FIXTURE_STAGE source_ready', flush=True)
        admin.psql(identifier, """REVOKE ALL ON DATABASE small_games FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE ROLE runtime_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA runtime;
CREATE TABLE runtime.competition_players(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, data jsonb NOT NULL);
INSERT INTO runtime.competition_players(data) VALUES('{"fixture":"中文"}'),('{"fixture":"preserve"}');
GRANT USAGE ON SCHEMA runtime TO runtime_app;
GRANT SELECT,INSERT,UPDATE ON runtime.competition_players TO runtime_app;
GRANT USAGE ON SEQUENCE runtime.competition_players_id_seq TO runtime_app;
CREATE SEQUENCE runtime.canary_seq CACHE 20;
SELECT nextval('runtime.canary_seq');
CREATE FUNCTION runtime.canary(n integer) RETURNS integer LANGUAGE sql AS 'SELECT n+1';
REVOKE ALL ON FUNCTION runtime.canary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION runtime.canary(integer) TO runtime_app;
""")
        fingerprint = Path(__file__).with_name('fingerprint.sql').read_text(encoding='utf-8')
        migration = admin.migration_body(Path(__file__).with_name('migrations').joinpath('001-admin-auth.sql').read_text(encoding='utf-8'))
        before = admin.old_state(identifier, fingerprint)
        try:
            admin.psql(identifier, admin.transaction('a'*64, migration + '\nSELECT 1/0;', fingerprint))
            raise AssertionError('atomic rollback did not reject')
        except admin.Stopped:
            pass
        assert admin.psql(identifier, "SELECT NOT EXISTS(SELECT FROM pg_roles WHERE rolname='management_app') AND to_regnamespace('admin_console') IS NULL;") == 't'
        assert admin.old_state(identifier, fingerprint) == before
        print('ADMIN_FIXTURE_STAGE atomic_failure_rolled_back', flush=True)
        with tempfile.TemporaryDirectory(prefix='admin-isolated-') as directory:
            backup = Path(directory) / 'fixture.dump'
            backup.write_bytes(admin.command('docker','exec',identifier,'pg_dump','-U','platform_owner','-d','small_games','-Fc'))
            roles = admin.command('docker','exec',identifier,'pg_dumpall','-U','platform_owner','--roles-only','--no-role-passwords')
            admin.restore_proof(identifier, backup, roles, migration, fingerprint, 'a'*64, before, tag)
        print('ADMIN_FIXTURE_STAGE complete_restore_and_clone_permissions', flush=True)
        admin.psql(identifier, admin.transaction('a'*64, migration, fingerprint))
        assert admin.old_state(identifier, fingerprint) == before
        assert admin.psql(identifier, admin.EFFECTIVE_CHECK) == 't'
        admin.psql(identifier, 'GRANT CONNECT ON DATABASE small_games TO management_app WITH GRANT OPTION;')
        assert admin.psql(identifier, admin.EFFECTIVE_CHECK) == 'f'
        try:
            admin.psql(identifier, admin.transaction('a'*64, migration, fingerprint))
            raise AssertionError('grant option accepted')
        except admin.Stopped:
            pass
        assert admin.psql(identifier, "SELECT bool_or(is_grantable) FROM pg_database d,LATERAL aclexplode(d.datacl) a WHERE d.datname=current_database() AND a.grantee='management_app'::regrole;") == 't'
        admin.psql(identifier, 'REVOKE GRANT OPTION FOR CONNECT ON DATABASE small_games FROM management_app;')
        admin.psql(identifier, "INSERT INTO admin_console.admin_oauth_flows VALUES('"+'b'*64+"','"+'c'*43+"','fixture',123);")
        existing = admin.old_state(identifier, fingerprint, True)
        admin.psql(identifier, admin.transaction('a'*64, migration, fingerprint, True))
        assert admin.old_state(identifier, fingerprint, True) == existing
        admin.clone_negative_checks(identifier)
        print(json.dumps({'passed':True,'image':image,'sourceContainerId':identifier,'sourceNetwork':'none',
                          'completeRestoreVerified':True,'oldStateSHA256':hashlib.sha256(before.encode()).hexdigest(),
                          'sequenceAfterNextvalRestore':True,'atomicRoleRollback':True,'connectGrantOptionRejectedWithoutRepair':True,
                          'existingAuthRowsPreserved':True,'idempotent':True,'permissionSQLState42501Only':True}))
    finally:
        facts = admin.inspect_container(identifier)
        admin.require(facts['id']==identifier and facts['fixture']==tag,'FIXTURE_CLEANUP_GUARD')
        admin.command('docker','rm','-f',identifier)
        assert not admin.scalar('docker','ps','-aq','--filter','label='+admin.LABEL+'='+tag)
        print(json.dumps({'fixtureContainersCleaned':True,'label':tag}))


if __name__ == '__main__':
    if sys.argv[1:] == ['--postgres']:
        try:
            postgres_fixture()
        except admin.Stopped as error:
            print(json.dumps({'fixtureFailedSQLState':getattr(error,'sqlstate',None),'fingerprintSections':getattr(error,'sections',None),'fixtureRelationNames':getattr(error,'relations',None)}))
            raise
    else:
        unittest.main()
