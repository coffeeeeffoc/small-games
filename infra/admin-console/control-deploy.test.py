"""Dependency-free control deployment contracts; all service/DB operations are mocks."""
import base64
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('control_deploy_tested', Path(__file__).with_name('control-deploy.py'))
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)
SHA = 'a' * 40
IMAGE = 'sha256:' + 'b' * 64
CONTRACT = {'version': 1, 'schema': 'game_control', 'schemaVersion': 2,
            'projectionSha256': 'c' * 64, 'metadataSha256': 'd' * 64}


def facts():
    result = {name: {'id': str(index) * 64, 'image': 'sha256:' + 'e' * 64,
                     'running': True, 'ports': {}, 'mounts': [], 'update': None,
                     'configHash': 'old', 'networkMode': 'none',
                     'networks': {'task': {'NetworkID': 'a' * 64, 'Aliases': [name],
                                           'IPAddress': '172.20.0.' + str(index), 'IPPrefixLen': 24, 'Gateway': '172.20.0.1'}}}
              for index, name in enumerate((*control.SERVICES, 'postgres', 'nginx', 'web'), 1)}
    result['kart']['networkMode'] = 'container:' + result['runtime']['id']
    result['management']['admin'] = 'previous'
    result['nginx'].update(admin='', restart='unless-stopped')
    return result


def journal(release):
    return {'version': 1, 'release': release.name, 'sourceSHA': SHA, 'phase': 'activate',
            'inventory': facts(), 'contexts': {'runtime': {}, 'kart': {}}, 'candidateImage': IMAGE,
            'previous': 'previous', 'envFile': '/opt/small-games/admin-private/previous/management.env',
            'envMetadata': [1, 2, 3, 4], 'pointers': {},
            'precommitPath': str(control.PRIVATE / release.name / 'control-precommit.json'),
            'precommitSHA256': None, 'newActivationAttempted': True, 'stopped': list(control.SERVICES),
            'runtimeIds': [], 'kartRemovalAttempted': False, 'domainInvoked': True, 'barrierAttempted': True,
            'verifiedNotCommitted': False}


def manifest():
    return {'kind': 'control-application', 'services': list(control.SERVICES), 'sourceSHA': SHA,
            'migrationArtifactSha256': 'f' * 64}


class ControlContracts(unittest.TestCase):
    def test_import_is_inert_and_missing_domain_never_becomes_noop(self):
        self.assertEqual(control.MODULES, {})
        with tempfile.TemporaryDirectory() as folder, patch.object(control, '__file__', str(Path(folder) / 'control-deploy.py')):
            with self.assertRaisesRegex(control.Stopped, 'DATABASE_HELPER_REQUIRED'):
                control.domain_module()

    def test_contract_and_success_proof_are_strictly_typed(self):
        good = {'outcome': 'committed', 'oldDataUnchanged': True, 'isolatedRestoreVerified': True,
                'leastPrivilegeVerified': True, 'backupSHA256': '1' * 64, 'oldStateSHA256': '2' * 64,
                'controlContract': CONTRACT, 'migrationArtifactSha256': 'f' * 64}
        self.assertEqual(control.provision_result(good, manifest()), good)
        for key in good:
            bad = dict(good)
            del bad[key]
            with self.assertRaises(control.Stopped):
                control.provision_result(bad, manifest())
        for bad in [dict(good, oldDataUnchanged=1), dict(good, outcome='unknown'),
                    dict(good, migrationArtifactSha256='0' * 64), dict(good, backupSHA256=['1' * 64])]:
            with self.assertRaises(control.Stopped):
                control.provision_result(bad, manifest())
        domain = SimpleNamespace(verify_control_database=Mock(return_value={
            'controlContract': CONTRACT, 'readOnly': True, 'migrationArtifactSha256': 'f' * 64}))
        control.verified_database(domain, 'pg', manifest(), CONTRACT)
        domain.verify_control_database.return_value['readOnly'] = 1
        with self.assertRaisesRegex(control.Stopped, 'DATABASE_CONTRACT'):
            control.verified_database(domain, 'pg', manifest(), CONTRACT)

    def test_nonce_render_is_exact_with_caddy_empty_comment_and_no_header_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            release = Path(folder)
            (release / 'site').mkdir()
            template = (control.CSP_PREFIX + '\n<html>' + control.CSP_META + '</html>').encode()
            (release / 'site/index.html').write_bytes(template)
            value = {'version': 2, 'adminHtml': {'contract': 'nonce-v1', 'templateSha256': hashlib.sha256(template).hexdigest()}}
            nonce = base64.b64encode(bytes(range(32))).decode()
            body = ('<!---->\n<html><meta name="sg-csp-nonce" content="' + nonce + '"></html>').encode()
            headers = [('content-security-policy', control.CSP_BASE.replace("style-src 'self'", "style-src 'self' 'nonce-" + nonce + "'")), ('cache-control', 'no-store'), ('content-type', 'text/html')]
            self.assertEqual(control.check_document(release, value, headers, body), nonce)
            for bad_headers, bad_body in [(headers[1:], body), (headers, body[8:]), (headers, body + b'\n'),
                                          (headers, body.replace(nonce.encode(), b'A' * 43 + b'='))]:
                with self.assertRaises(control.Stopped):
                    control.check_document(release, value, bad_headers, bad_body)
            for invalid in [nonce.rstrip('='), nonce[:-2] + 'B=', [nonce]]:
                with self.assertRaises(control.Stopped):
                    control.canonical_nonce(invalid)

    def test_env_is_metadata_only_and_rejects_links_permissions_or_changed_inode(self):
        with tempfile.TemporaryDirectory() as folder:
            private, release = Path(folder) / 'private', Path(folder) / 'release'
            private.mkdir(mode=0o700)
            directory = private / release.name
            directory.mkdir(mode=0o700)
            env = directory / 'management.env'
            env.write_text('PRIVATE_CANARY_MUST_NOT_READ')
            env.chmod(0o600)
            model = {'services': {'management': {'env_file': [{'path': str(env), 'format': 'raw'}]}}}
            compose = directory / 'compose.json'
            compose.write_text(json.dumps(model))
            compose.chmod(0o600)
            original = Path.read_bytes
            def read(file):
                if file == env:
                    raise AssertionError('secret file was read')
                return original(file)
            with patch.object(control, 'PRIVATE', private), patch.object(control, 'support', return_value=SimpleNamespace(compose=lambda *_: model)), patch.object(Path, 'read_bytes', read):
                file, signature, _ = control.management_config(release, True)
                control.assert_env(file, signature)
                env.chmod(0o644)
                with self.assertRaisesRegex(control.Stopped, 'PRIVATE_FILE'):
                    control.assert_env(file, signature)
                env.chmod(0o600)
                alias = directory / 'alias'
                os.link(env, alias)
                with self.assertRaisesRegex(control.Stopped, 'PRIVATE_FILE'):
                    control.private_metadata(env)

    def test_kart_context_proves_declared_service_namespace_before_resolved_id(self):
        items = facts()
        for drift in (False, 'host', 'bridge'):
            calls = []
            def compose(context, override, *_args, **kwargs):
                if context == 'runtime':
                    return b'runtime old'
                body = json.loads(kwargs['input']) if 'input' in kwargs else None
                calls.append(body)
                if body is None:
                    return ('kart ' + (drift or 'baseline')).encode()
                mode = body['services']['kart']['network_mode']
                return b'kart baseline' if mode == 'service:runtime' else b'kart old'
            backend = SimpleNamespace(compose_context=lambda item: 'runtime' if item is items['runtime'] else 'kart', compose=compose)
            with patch.object(control, 'support', return_value=backend):
                if drift:
                    with self.assertRaisesRegex(control.Stopped, 'KART_NAMESPACE'):
                        control.contexts_for(items)
                    self.assertEqual(len(calls), 2)
                else:
                    control.contexts_for(items)
                    self.assertEqual(calls[1]['services']['kart']['network_mode'], 'service:runtime')
                    self.assertEqual(calls[2]['services']['kart']['network_mode'], items['kart']['networkMode'])

    def test_recovery_is_repeatable_after_kart_remove_or_namespace_change(self):
        for interrupted_runtime in (True, False):
            with self.subTest(interrupted_runtime=interrupted_runtime), tempfile.TemporaryDirectory() as folder:
                private, release = Path(folder), Path(folder) / 'candidate'
                (private / release.name).mkdir(mode=0o700)
                state = journal(release)
                live = copy.deepcopy(state['inventory'])
                for item in live.values():
                    item.pop('admin', None)
                    item.pop('restart', None)
                events = []
                failed = [False]
                def inspect(name, optional=False):
                    if name not in live:
                        self.assertTrue(optional)
                        return None
                    return copy.deepcopy(live[name])
                def command(*args, **_):
                    events.append(args)
                    if args[:2] == ('docker', 'rm'):
                        del live['kart']
                    return b''
                def compose(_context, file, *_args):
                    name = _args[-1]
                    if name == 'runtime' and interrupted_runtime and not failed[0]:
                        failed[0] = True
                        raise control.Stopped('COMMAND_FAILED')
                    item = copy.deepcopy(state['inventory'][name])
                    item.pop('admin', None)
                    item.update(id=('7' if name == 'runtime' else '8') * 64, image=IMAGE, update=release.name)
                    if name == 'kart':
                        item['networkMode'] = json.loads(file.read_text())['services']['kart']['network_mode']
                    live[name] = item
                def management(*_args):
                    live['management']['image'] = IMAGE
                backend = SimpleNamespace(compose=compose, assert_boundaries=Mock())
                tools = SimpleNamespace(compose_command=management)
                with patch.object(control, 'PRIVATE', private), patch.object(control, 'target_inventory', side_effect=inspect), patch.object(control, 'support', side_effect=lambda name: backend if name == 'backend-context.py' else tools), patch.object(control, 'authority'), patch.object(control, 'assert_env'), patch.object(control, 'command', side_effect=command), patch.object(control, 'control_compose', return_value={'services': {'management': {}}}), patch.object(control, 'save_journal'), patch.object(control, 'service_health'), patch.object(control, 'assert_live_flags'):
                    if interrupted_runtime:
                        with self.assertRaisesRegex(control.Stopped, 'COMMAND_FAILED'):
                            control.activate_services(release, manifest(), state, control.SERVICES)
                        self.assertNotIn('kart', live)
                        self.assertTrue(state['kartRemovalAttempted'])
                    control.activate_services(release, manifest(), state, control.SERVICES)
                    # A later owned Runtime replacement only changes Kart's namespace;
                    # all other immutable override fields must remain exact.
                    live['runtime']['id'] = '9' * 64
                    def keep_runtime(_context, file, *_args):
                        if _args[-1] == 'kart':
                            compose(_context, file, *_args)
                    backend.compose = keep_runtime
                    control.activate_services(release, manifest(), state, control.SERVICES)
                    self.assertEqual(live['kart']['networkMode'], 'container:' + '9' * 64)
                    backend.assert_boundaries.assert_called()
                    override = json.loads((private / release.name / 'kart-control.json').read_text())
                    override['services']['kart']['image'] = 'sha256:' + '0' * 64
                    file = private / release.name / 'kart-control.json'
                    file.write_text(json.dumps(override)); file.chmod(0o600)
                    live['runtime']['id'] = 'a' * 64
                    with self.assertRaisesRegex(control.Stopped, 'CONTROL_OVERRIDE'):
                        control.activate_services(release, manifest(), state, control.SERVICES)

    def test_pre_migration_restore_only_starts_logged_exact_old_ids(self):
        release = Path('/fixture/candidate')
        state = journal(release)
        state.update(domainInvoked=False, newActivationAttempted=False, stopped=['management', 'kart'])
        live = copy.deepcopy(state['inventory'])
        for item in live.values():
            item.pop('admin', None); item.pop('restart', None)
            item['running'] = False
            item['networks']['task'].update(IPAddress='', IPPrefixLen=0, Gateway='')
        calls = []
        live['runtime']['running'] = True  # This writer was never stopped by this operation.
        def command(*args):
            calls.append(args)
            for item in live.values():
                if item['id'] == args[-1]:
                    item['running'] = True
                    item['networks']['task'].update(IPAddress='172.20.0.99', IPPrefixLen=24, Gateway='172.20.0.1')
        with patch.object(control, 'database_floor', return_value='absent'), patch.object(control, 'assert_env'), patch.object(control, 'check_protected'), patch.object(control, 'contexts_for', return_value=state['contexts']), patch.object(control, 'target_inventory', side_effect=lambda name: live[name]), patch.object(control, 'command', side_effect=command), patch.object(control, 'service_health'), patch.object(control, 'assert_nginx'), patch.object(control, 'save_journal'):
            control.restore_before_migration(release, state)
            self.assertEqual([call[-1] for call in calls], [state['inventory'][name]['id'] for name in ('kart', 'management', 'nginx')])
            self.assertEqual(state['phase'], 'restored')
            state['domainInvoked'] = True
            with self.assertRaisesRegex(control.Stopped, 'DATABASE_OUTCOME_UNKNOWN'):
                control.restore_before_migration(release, state)
            state['domainInvoked'] = False
            live['runtime']['id'] = '0' * 64
            with self.assertRaisesRegex(control.Stopped, 'RESTORE_IDENTITY'):
                control.restore_before_migration(release, state)

    def test_stopped_nginx_uses_stable_network_identity_not_dynamic_address(self):
        items = facts()
        actual = copy.deepcopy(items['nginx'])
        actual.pop('admin'); actual.pop('restart'); actual['running'] = False
        actual['networks']['task'].update(IPAddress='', Gateway='', IPPrefixLen=0)
        backend = SimpleNamespace(inventory=lambda *_: actual)
        with patch.object(control, 'support', return_value=backend), patch.object(control, 'scalar', return_value='unless-stopped'):
            control.assert_nginx(items, True)
            actual['networks']['task']['NetworkID'] = '0' * 64
            with self.assertRaisesRegex(control.Stopped, 'BARRIER_NOT_CLOSED'):
                control.assert_nginx(items, True)

    def test_build_then_new_game_or_partial_stop_compensates_before_domain(self):
        for failure in ('ACTIVE_GAME', 'COMMAND_FAILED', 'SIGNAL_INTERRUPTED', 'UNKNOWN_DATABASE_WRITER'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as folder:
                private, base = Path(folder) / 'private', Path(folder) / 'public'
                private.mkdir(mode=0o700); base.mkdir()
                previous = base / 'previous-release'; previous.mkdir()
                (base / 'current').symlink_to(previous)
                release = base / 'candidate'
                domain = SimpleNamespace(provision_control_database=Mock())
                guards = Mock(side_effect=[None, control.Stopped(failure)] if failure == 'ACTIVE_GAME' else None)
                def command(*args, **_):
                    if args[-1] == facts()['kart']['id'] and failure in ('COMMAND_FAILED', 'SIGNAL_INTERRUPTED'):
                        raise control.Stopped(failure)
                with patch.object(control, 'PRIVATE', private), patch.object(control, 'BASE', base), patch.object(control, 'domain_module', return_value=domain), patch.object(control, 'inventory', side_effect=lambda: dict(facts(), management=dict(facts()['management'], admin=previous.name))), patch.object(control, 'database_floor', return_value='absent'), patch.object(control, 'manifest_from', return_value={}), patch.object(control, 'management_config', return_value=(Path('/opaque/management.env'), [1, 2, 3, 4], {})), patch.object(control, 'contexts_for', return_value={'runtime': {}, 'kart': {}}), patch.object(control, 'active_guards', guards), patch.object(control, 'build_image', return_value=IMAGE), patch.object(control, 'authority'), patch.object(control, 'pointers_for', return_value={}), patch.object(control, 'command', side_effect=command), patch.object(control, 'assert_nginx'), patch.object(control, 'stopped_writers', side_effect=control.Stopped(failure) if failure == 'UNKNOWN_DATABASE_WRITER' else None), patch.object(control, 'restore_before_migration') as restore:
                    with self.assertRaisesRegex(control.Stopped, failure):
                        control.adopt(release, manifest(), base)
                    restore.assert_called_once()
                    self.assertFalse(restore.call_args.args[1]['domainInvoked'])
                    domain.provision_control_database.assert_not_called()

    def test_post_commit_failure_keeps_exact_barrier_and_never_legacy_restore(self):
        release = Path('/fixture/candidate')
        state = journal(release)
        proof = {'controlContract': CONTRACT}
        domain = SimpleNamespace(provision_control_database=Mock())
        calls = []
        with patch.object(control, 'domain_module', return_value=domain), patch.object(control, 'private_directory'), patch.object(control, 'private_json', return_value=state), patch.object(control, 'write_private'), patch.object(control, 'assert_nginx'), patch.object(control, 'target_inventory', return_value=state['inventory']['postgres']), patch.object(control, 'database_floor', return_value='schema2'), patch.object(control, 'read_precommit', return_value=(proof, 'f' * 64)), patch.object(control, 'authority'), patch.object(control, 'assert_env'), patch.object(control, 'contexts_for', return_value=state['contexts']), patch.object(control, 'verified_database'), patch.object(control, 'activate_services', side_effect=control.Stopped('COMMAND_FAILED')), patch.object(control, 'command', side_effect=lambda *args: calls.append(args)), patch.object(control, 'restore_before_migration') as restore:
            with self.assertRaisesRegex(control.Stopped, 'COMMAND_FAILED'):
                control.adopt(release, manifest(), Path('/caddy'), True)
            self.assertEqual(calls, [('docker', 'stop', '--time', '30', state['inventory']['nginx']['id'])])
            restore.assert_not_called()
            domain.provision_control_database.assert_not_called()

    def test_verified_not_committed_survives_failed_compensation_and_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            private, base = Path(folder) / 'private', Path(folder) / 'public'
            private.mkdir(mode=0o700); base.mkdir()
            previous = base / 'previous'; previous.mkdir()
            (base / 'current').symlink_to(previous)
            release = base / 'candidate'
            failure = control.Stopped('COMMAND_FAILED')
            failure.outcome, failure.oldDataUnchanged = 'not_committed', True
            domain = SimpleNamespace(provision_control_database=Mock(side_effect=failure))
            with patch.object(control, 'PRIVATE', private), patch.object(control, 'BASE', base), patch.object(control, 'domain_module', return_value=domain), patch.object(control, 'inventory', return_value=facts()), patch.object(control, 'database_floor', return_value='absent'), patch.object(control, 'manifest_from', return_value={}), patch.object(control, 'management_config', return_value=(Path('/opaque/management.env'), [1, 2, 3, 4], {})), patch.object(control, 'contexts_for', return_value={'runtime': {}, 'kart': {}}), patch.object(control, 'active_guards'), patch.object(control, 'build_image', return_value=IMAGE), patch.object(control, 'authority'), patch.object(control, 'pointers_for', return_value={}), patch.object(control, 'command'), patch.object(control, 'assert_nginx'), patch.object(control, 'stopped_writers'), patch.object(control, 'restore_before_migration', side_effect=control.Stopped('GAME_RESTART_FAILED')):
                with self.assertRaisesRegex(control.Stopped, 'GAME_RESTART_FAILED'):
                    control.adopt(release, manifest(), base)
                saved = control.private_json(private / release.name / 'control-journal.json')
                self.assertTrue(saved['verifiedNotCommitted'])
                self.assertEqual(saved['phase'], 'verified-not-committed')
                with patch.object(control, 'restore_before_migration') as restore:
                    with self.assertRaisesRegex(control.Stopped, 'PREMIGRATION_RESTORED'):
                        control.adopt(release, manifest(), base, True)
                    restore.assert_called_once()
                    self.assertTrue(restore.call_args.kwargs['explicit_not_committed'])
                self.assertEqual(domain.provision_control_database.call_count, 1)

    def test_private_precommit_pair_is_bound_and_hash_checked(self):
        with tempfile.TemporaryDirectory() as folder:
            private, release = Path(folder), Path('/public/candidate')
            directory = private / release.name; directory.mkdir(mode=0o700)
            value = {'version': 1, 'release': release.name, 'sourceSHA': SHA,
                     'migrationArtifactSha256': 'f' * 64, 'backupSHA256': '1' * 64,
                     'oldStateSHA256': '2' * 64, 'controlContract': CONTRACT,
                     'isolatedRestoreVerified': True, 'oldDataUnchanged': True, 'leastPrivilegeVerified': True}
            file = directory / 'control-precommit.json'
            file.write_text(json.dumps(value)); file.chmod(0o600)
            checksum = directory / 'control-precommit.sha256'
            checksum.write_text(hashlib.sha256(file.read_bytes()).hexdigest() + '\n'); checksum.chmod(0o600)
            with patch.object(control, 'PRIVATE', private):
                self.assertEqual(control.read_precommit(release, manifest())[0], value)
                file.write_text(json.dumps(dict(value, sourceSHA='0' * 40)))
                with self.assertRaisesRegex(control.Stopped, 'PRECOMMIT_PROOF'):
                    control.read_precommit(release, manifest())

    def test_diagnostics_are_finite_owned_metadata_only(self):
        error = control.Stopped('AUTHORITY_PROBE_RECOVERY_REQUIRED')
        error.ownedContainerId = '1' * 64
        error.probeUUID = '12345678-1234-1234-1234-123456789012'
        error.probeProcessId = 123
        error.private = 'PRIVATE_CANARY'
        markers = control.diagnostic_markers(error)
        self.assertEqual(len(markers), 3)
        self.assertNotIn('PRIVATE_CANARY', '\n'.join(markers))
        error.ownedContainerId = 'bad'; error.probeUUID = 'bad'; error.probeProcessId = True
        self.assertEqual(control.diagnostic_markers(error), [])

    def test_all_ranked_activity_guards_are_read_only_and_fail_nonzero(self):
        for count in ('0', '1', '2'):
            tools = SimpleNamespace(psql=Mock(return_value=count))
            with patch.object(control, 'support', return_value=tools):
                if count == '0':
                    control.runtime_idle('pg')
                else:
                    with self.assertRaisesRegex(control.Stopped, 'ACTIVE_GAME'):
                        control.runtime_idle('pg')
            query = tools.psql.call_args.args[1]
            self.assertIn('BEGIN TRANSACTION READ ONLY', query)
            self.assertIn("data->>'kind'='ranked-run-v1'", query)
            self.assertIn("data->>'expiresAt'", query)
            self.assertIn('runtime.three_choose_two_sessions', query)
            self.assertNotIn('admission-v1', query)
        with patch.object(control, 'runtime_idle') as idle, patch.object(control, 'support', return_value=SimpleNamespace(psql=Mock(return_value='0'), guard_games=Mock())):
            control.active_guards(facts())
            control.stopped_writers(facts()['postgres']['id'])
            self.assertEqual(idle.call_count, 2)

    def test_recovery_binds_historical_data_without_executing_historical_runner(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            target = base / 'releases/old'
            target.mkdir(parents=True)
            (target / 'manifest.json').write_bytes(b'public old manifest')
            checksum = hashlib.sha256((target / 'manifest.json').read_bytes()).hexdigest()
            current = dict(manifest(), kind='control-runner')
            old = dict(manifest(), sourceSHA='0' * 40)
            payload = {'targetRelease': 'old', 'targetManifestSHA256': checksum}
            with patch.object(control, 'BASE', base), patch.object(control, 'manifest_from', return_value=old):
                self.assertEqual(control.recovery_target(base / 'releases/current', current, payload), (target, old))
                for bad in [dict(payload, targetRelease='../old'), dict(payload, targetManifestSHA256='0' * 64)]:
                    with self.assertRaises(control.Stopped):
                        control.recovery_target(base / 'releases/current', current, bad)


if __name__ == '__main__':
    unittest.main()
