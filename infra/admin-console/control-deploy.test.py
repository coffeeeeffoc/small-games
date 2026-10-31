"""Dependency-free control deployment contracts; all service/DB operations are mocks."""
import base64
import copy
import contextlib
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
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
CONTRACT = {'version': 1, 'schema': 'game_control', 'schemaVersion': 4,
            'projectionSha256': 'c' * 64, 'metadataSha256': 'd' * 64}


def facts():
    result = {name: {'id': str(index) * 64, 'image': 'sha256:' + 'e' * 64,
                     'running': True, 'ports': {}, 'mounts': [], 'update': None,
                     'configHash': 'old', 'networkMode': 'none',
                     'networks': {'task': {'NetworkID': 'a' * 64, 'Aliases': [name],
                                           'IPAddress': '172.20.0.' + str(index), 'IPPrefixLen': 24, 'Gateway': '172.20.0.1'}}}
              for index, name in enumerate((*control.SERVICES, 'postgres', 'nginx', 'web'), 1)}
    result['management']['networks']['small-games_default'] = result['management']['networks'].pop('task')
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
    def test_historical_manifest_catalogs_are_finite_and_do_not_authorize_current_candidates(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder).resolve()
            release = base / 'releases' / 'candidate'
            release.mkdir(parents=True)
            names = ['control-deploy.py', 'control-database.py', 'control-fingerprint.sql', 'legacy-tools.py', 'backend-context.py', 'image-authority.py', 'migrations/002-control-center.sql', 'migrations/003-night-overwatch-control.sql', 'migrations/004-tetracube-control.sql', 'admin-csp-contract.json']
            files = {}
            for name in names:
                target = release / name
                target.parent.mkdir(exist_ok=True)
                data = (json.dumps(control.CSP_CONTRACT, indent=2, ensure_ascii=False) + '\n').encode() if name == 'admin-csp-contract.json' else name.encode()
                target.write_bytes(data)
                files[name] = hashlib.sha256(data).hexdigest()
            value = {'version': 2, 'release': 'candidate', 'sourceSHA': SHA, 'kind': 'control-runner', 'services': [], 'scope': 'admin-control', 'qualityChecks': 'not-run', 'controlSchemaVersion': 4, 'migrationArtifactSha256': files[names[-2]], 'cspContractSha256': files['admin-csp-contract.json'], 'adminHtml': None, 'files': files}
            with patch.object(control, 'BASE', base):
                for version, migration in ((2, names[-4]), (3, names[-3]), (4, names[-2])):
                    value.update(controlSchemaVersion=version, migrationArtifactSha256=files[migration])
                    (release / 'manifest.json').write_text(json.dumps(value))
                    self.assertEqual(control.manifest_from(release, True), value)
                    if version == 4: self.assertEqual(control.manifest_from(release), value)
                    else:
                        with self.assertRaisesRegex(control.Stopped, 'RELEASE_MANIFEST'): control.manifest_from(release)
                for version in (1, 5, True):
                    value['controlSchemaVersion'] = version
                    (release / 'manifest.json').write_text(json.dumps(value))
                    with self.assertRaisesRegex(control.Stopped, 'RELEASE_MANIFEST'): control.manifest_from(release, True)

    def test_pointer_retry_preserves_previous_and_rejects_unexpected_current(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            old, release, other = (base / name for name in ('old', 'candidate', 'other'))
            for directory in (old, release, other): directory.mkdir()
            (base / 'current').symlink_to(old)
            def atomic(file, target):
                file.unlink(missing_ok=True)
                file.symlink_to(target)
            with patch.object(control, 'BASE', base), patch.object(control, 'support', return_value=SimpleNamespace(atomic_pointer=atomic)):
                control.switch_pointer(release, old)
                # Retrying after a failed public probe must retain the rollback target.
                control.switch_pointer(release, old)
                control.switch_pointer(release, old)
                self.assertEqual((base / 'previous').resolve(), old)
                self.assertEqual((base / 'current').resolve(), release)
                atomic(base / 'current', other)
                with self.assertRaisesRegex(control.Stopped, 'ADMIN_POINTER'):
                    control.switch_pointer(release, old)
                self.assertEqual((base / 'previous').resolve(), old)

    def test_recovery_reports_actual_restored_control_flags(self):
        release = Path('/fixture/candidate')
        state = dict(journal(release), initialFloor='schema2', phase='verified-not-committed',
                     verifiedNotCommitted=True, newActivationAttempted=False)
        for flag in ('true', 'false'):
            with patch.object(control, 'domain_module'), patch.object(control, 'private_directory'), patch.object(control, 'private_json', return_value=copy.deepcopy(state)), patch.object(control, 'restore_before_migration'), patch.object(control, 'scalar', return_value=flag) as read:
                receipt = control.adopt(release, manifest(), Path('/caddy'), True)
                self.assertIs(receipt['controlEnabled'], flag == 'true')
                self.assertEqual({call.args[2] for call in read.call_args_list}, {state['inventory'][name]['id'] for name in control.SERVICES})
        for flags in (['true', 'false', 'true'], ['invalid'] * 3):
            with patch.object(control, 'scalar', side_effect=flags), self.assertRaisesRegex(control.Stopped, 'CONTROL_FLAG_REQUIRED'):
                control.restored_control_enabled(state['inventory'])

    def test_real_legacy_command_errors_retry_without_exposing_output(self):
        spec = importlib.util.spec_from_file_location('legacy_command_tested', Path(__file__).with_name('deploy.py'))
        legacy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(legacy)
        failed = SimpleNamespace(returncode=1, stdout=b'', stderr=b'private diagnostic')
        ready = SimpleNamespace(returncode=0, stdout=b'ok', stderr=b'')
        with patch.object(control, 'support', return_value=legacy), patch.object(legacy.subprocess, 'run', side_effect=[failed, subprocess.TimeoutExpired('docker', 5), ready]) as run, patch.object(control.time, 'sleep'):
            control.service_health('management', {'id': 'a' * 64})
            self.assertEqual(run.call_count, 3)
        with patch.object(control, 'support', return_value=legacy), patch.object(legacy.subprocess, 'run', side_effect=subprocess.TimeoutExpired('docker', 5)):
            with self.assertRaisesRegex(control.Stopped, '^COMMAND_TIMEOUT$'):
                control.command('docker', 'start', 'a' * 64)

    def test_management_keeps_its_address_when_nginx_is_stopped(self):
        spec = importlib.util.spec_from_file_location('legacy_compose_tested', Path(__file__).with_name('deploy.py'))
        legacy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(legacy)
        release, env = Path('/release/candidate'), Path('/opaque/management.env')
        with patch.object(control, 'support', return_value=legacy):
            old = control.control_compose(release, env, IMAGE)
            self.assertEqual(old['services']['management']['networks'], ['existing'])
            pinned = control.control_compose(release, env, IMAGE, '172.18.0.5')
            self.assertEqual(pinned['services']['management']['networks'], {'existing': {'ipv4_address': '172.18.0.5'}})
            old['services']['management']['networks'] = pinned['services']['management']['networks']
            self.assertEqual(old, pinned)
            for address in ('bad', '127.0.0.1', '0.0.0.0', '8.8.8.8'):
                with self.subTest(address=address), self.assertRaisesRegex(control.Stopped, 'MANAGEMENT_ADDRESS'):
                    control.control_compose(release, env, IMAGE, address)

    def test_health_waits_for_ready_and_has_a_deadline(self):
        with patch.object(control, 'command', side_effect=[control.Stopped('COMMAND_FAILED'), None]) as call, patch.object(control.time, 'sleep'):
            control.service_health('runtime', {'id': 'a' * 64})
            self.assertEqual(call.call_count, 2)
        with patch.object(control, 'command', side_effect=control.Stopped('COMMAND_FAILED')), patch.object(control.time, 'monotonic', side_effect=[0, 46]):
            with self.assertRaisesRegex(control.Stopped, 'GAME_RESTART_FAILED'):
                control.service_health('runtime', {'id': 'a' * 64})

    def test_runtime_public_override_adds_only_the_approved_tap_origin(self):
        self.assertEqual(control.PUBLIC_ENV['runtime'], {
            'COMPETITION_CONTROL_ENABLED': 'true',
            'COMPETITION_CONTROL_INSTANCE_ID': 'small-games-runtime',
            'COMPETITION_CORS_ORIGINS': 'http://localhost:8080,https://ma-h5-al.tapimg.com,https://coffeeeeffoc.github.io',
            'COMPETITION_CORS_METHODS': 'GET,POST,OPTIONS',
            'COMPETITION_CORS_HEADERS': 'authorization,content-type',
            'COMPETITION_CORS_CREDENTIALS': 'false'})
        self.assertEqual(control.PUBLIC_ENV['management'], {'ADMIN_CONTROL_ENABLED': 'true'})
        self.assertNotIn('COMPETITION_CORS_ORIGINS', control.PUBLIC_ENV['kart'])

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
        domain = SimpleNamespace(provision_player_sessions=Mock(), verify_control_database=Mock(return_value={
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
                with patch.object(control, 'PRIVATE', private), patch.object(control, 'target_inventory', side_effect=inspect), patch.object(control, 'support', side_effect=lambda name: backend if name == 'backend-context.py' else tools), patch.object(control, 'authority'), patch.object(control, 'assert_env'), patch.object(control, 'command', side_effect=command), patch.object(control, 'control_compose', side_effect=lambda _release, _env, _image, ip=None: {'services': {'management': {'networks': {'existing': {'ipv4_address': ip}} if ip else ['existing']}}}), patch.object(control, 'save_journal'), patch.object(control, 'service_health'), patch.object(control, 'assert_live_flags'):
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
                    model_file = private / release.name / 'compose.json'
                    pinned = json.loads(model_file.read_text())
                    old = copy.deepcopy(pinned)
                    old['services']['management']['networks'] = ['existing']
                    control.write_private(model_file, old, True)
                    control.activate_services(release, manifest(), state, control.SERVICES)
                    self.assertEqual(json.loads(model_file.read_text()), pinned)
                    old['services']['management']['ports'] = ['43001:43001']
                    control.write_private(model_file, old, True)
                    with self.assertRaisesRegex(control.Stopped, 'MANAGEMENT_CONFIG'):
                        control.activate_services(release, manifest(), state, control.SERVICES)
                    self.assertEqual(json.loads(model_file.read_text()), old)
                    control.write_private(model_file, pinned, True)
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
            for network in item['networks'].values():
                network.update(IPAddress='', IPPrefixLen=0, Gateway='')
        calls = []
        live['runtime']['running'] = True  # This writer was never stopped by this operation.
        def command(*args):
            calls.append(args)
            for item in live.values():
                if item['id'] == args[-1]:
                    item['running'] = True
                    for network in item['networks'].values():
                        network.update(IPAddress='172.20.0.99', IPPrefixLen=24, Gateway='172.20.0.1')
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

    def test_schema3_restore_probes_exact_old_catalog_only_before_any_start(self):
        release = Path('/fixture/candidate')
        state = journal(release)
        state.update(initialFloor='schema3', domainInvoked=True, newActivationAttempted=False,
                     verifiedNotCommitted=True, stopped=[], barrierAttempted=False)
        with patch.object(control, 'database_floor', return_value='schema3') as floor, patch.object(control, 'assert_env'), patch.object(control, 'check_protected'), patch.object(control, 'contexts_for', return_value=state['contexts']), patch.object(control, 'target_inventory', side_effect=lambda name: state['inventory'][name]), patch.object(control, 'authority') as authority, patch.object(control, 'command') as command, patch.object(control, 'save_journal'):
            control.restore_before_migration(release, state, explicit_not_committed=True)
            authority.assert_called_once_with({name: state['inventory'][name]['image'] for name in control.SERVICES}, control_catalog=3)
            command.assert_not_called()
            authority.reset_mock()
            for actual_floor in ('schema4', 'schema2', 'absent'):
                floor.return_value = actual_floor
                with self.assertRaisesRegex(control.Stopped, 'DATABASE_OUTCOME_UNKNOWN'):
                    control.restore_before_migration(release, state, explicit_not_committed=True)
            floor.return_value = 'schema3'
            with self.assertRaisesRegex(control.Stopped, 'DATABASE_OUTCOME_UNKNOWN'):
                control.restore_before_migration(release, state)
            state['newActivationAttempted'] = True
            with self.assertRaisesRegex(control.Stopped, 'DATABASE_OUTCOME_UNKNOWN'):
                control.restore_before_migration(release, state, explicit_not_committed=True)
            authority.assert_not_called()
            command.assert_not_called()

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
                domain = SimpleNamespace(player_session_migration=Mock(), preflight_control_database=Mock(), provision_control_database=Mock())
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
        domain = SimpleNamespace(provision_control_database=Mock(), provision_player_sessions=Mock())
        calls = []
        with patch.object(control, 'domain_module', return_value=domain), patch.object(control, 'private_directory'), patch.object(control, 'private_json', return_value=state), patch.object(control, 'write_private'), patch.object(control, 'assert_nginx'), patch.object(control, 'target_inventory', return_value=state['inventory']['postgres']), patch.object(control, 'database_floor', return_value='schema4'), patch.object(control, 'read_precommit', return_value=(proof, 'f' * 64)), patch.object(control, 'authority'), patch.object(control, 'assert_env'), patch.object(control, 'contexts_for', return_value=state['contexts']), patch.object(control, 'verified_database'), patch.object(control, 'activate_services', side_effect=control.Stopped('COMMAND_FAILED')), patch.object(control, 'command', side_effect=lambda *args: calls.append(args)), patch.object(control, 'restore_before_migration') as restore:
            with self.assertRaisesRegex(control.Stopped, 'COMMAND_FAILED'):
                with patch.object(Path, 'resolve', return_value=control.BASE / 'releases' / state['previous']):
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
            domain = SimpleNamespace(player_session_migration=Mock(), preflight_control_database=Mock(), provision_control_database=Mock(side_effect=failure))
            with patch.object(control, 'PRIVATE', private), patch.object(control, 'BASE', base), patch.object(control, 'domain_module', return_value=domain), patch.object(control, 'inventory', return_value=facts()), patch.object(control, 'database_floor', return_value='absent'), patch.object(control, 'manifest_from', return_value={}), patch.object(control, 'management_config', return_value=(Path('/opaque/management.env'), [1, 2, 3, 4], {})), patch.object(control, 'contexts_for', return_value={'runtime': {}, 'kart': {}}), patch.object(control, 'active_guards'), patch.object(control, 'build_image', return_value=IMAGE), patch.object(control, 'authority'), patch.object(control, 'pointers_for', return_value={}), patch.object(control, 'command'), patch.object(control, 'assert_nginx'), patch.object(control, 'stopped_writers'), patch.object(control, 'restore_before_migration', side_effect=control.Stopped('GAME_RESTART_FAILED')):
                with self.assertRaisesRegex(control.Stopped, 'GAME_RESTART_FAILED'):
                    control.adopt(release, manifest(), base)
                saved = control.private_json(private / release.name / 'control-journal.json')
                self.assertTrue(saved['verifiedNotCommitted'])
                self.assertEqual(saved['phase'], 'verified-not-committed')
                with patch.object(control, 'restore_before_migration') as restore, patch.object(control, 'restored_control_enabled', return_value=False):
                    self.assertEqual(control.adopt(release, manifest(), base, True)['outcome'], 'restored-before-migration')
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


class ApplicationRepair(unittest.TestCase):
    @contextlib.contextmanager
    def fixture(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as stack:
            base, private = Path(folder) / 'public', Path(folder) / 'private'
            previous, target, release = (base / 'releases' / name for name in ('previous', 'failed', 'fixed'))
            for directory in (previous, target, release): directory.mkdir(parents=True)
            private.mkdir(mode=0o700)
            (base / 'current').symlink_to(previous)
            (target / 'manifest.json').write_text('{}')
            (release / 'manifest.json').write_text('{}')
            stack.enter_context(patch.object(control, 'BASE', base))
            stack.enter_context(patch.object(control, 'PRIVATE', private))
            source = dict(journal(target), phase='recovery-required', initialFloor='schema2',
                          precommitSHA256='9' * 64, runtimeIds=['7' * 64], kartRemovalAttempted=True)
            source_dir = private / target.name
            source_dir.mkdir(mode=0o700)
            source_file = source_dir / 'control-journal.json'
            control.write_private(source_file, source)
            sessions = {'sourceSHA': SHA, 'migrationSHA256': '8' * 64, 'metadataSHA256': '6' * 64}
            control.write_private(source_dir / 'player-sessions-complete.json', sessions)
            value = dict(manifest(), files={'migrations/014-player-sessions.sql': '8' * 64})
            fixed = dict(value, sourceSHA='f' * 40)
            live = copy.deepcopy(source['inventory'])
            for name in control.SERVICES:
                live[name].update(image=IMAGE, update=target.name)
            live['runtime']['id'] = '7' * 64
            live['kart']['networkMode'] = 'container:' + live['runtime']['id']
            live['nginx']['running'] = False
            new_image, events = 'sha256:' + 'f' * 64, []
            proof = {'controlContract': CONTRACT, 'databaseProof': {'backupSHA256': '1' * 64, 'oldStateSHA256': '2' * 64}}
            domain = SimpleNamespace(load_sql=Mock(), player_session_metadata=Mock(return_value='6' * 64),
                                     provision_player_sessions=Mock(), provision_control_database=Mock())
            def command(*args, **kwargs):
                events.append(args)
                if args[:2] in (('docker', 'start'), ('docker', 'stop')):
                    self.assertEqual(args[-1], live['nginx']['id'])
                    live['nginx']['running'] = args[1] == 'start'
            def ingress(_inventory, stopped): self.assertEqual(live['nginx']['running'], not stopped)
            def switch(destination, old):
                self.assertEqual(old, previous)
                (base / 'current').unlink()
                (base / 'current').symlink_to(destination)
            def activate(destination, _manifest, activation, names):
                self.assertEqual(destination, release)
                self.assertEqual(names, ('management',))
                self.assertEqual(activation['inventory']['runtime'], live['runtime'])
                self.assertEqual(activation['inventory']['kart'], live['kart'])
                live.setdefault('management', copy.deepcopy(activation['inventory']['management'])).update(image=new_image, id='8' * 64, running=True)
                return {name: copy.deepcopy(live[name]) for name in control.SERVICES}
            mocks = {}
            for name, options in {
                'domain_module': {'return_value': domain},
                'read_precommit': {'return_value': ({'controlContract': CONTRACT}, '9' * 64)},
                'assert_nginx': {'side_effect': ingress}, 'check_protected': {},
                'database_floor': {'return_value': 'schema4'}, 'verified_database': {}, 'assert_env': {},
                'target_inventory': {'side_effect': lambda name, **_: copy.deepcopy(live.get(name))},
                'service_health': {}, 'assert_live_flags': {}, 'authority': {},
                'build_image': {'return_value': new_image},
                'scalar': {'side_effect': lambda *_: release.name if live['management']['image'] == new_image else target.name},
                'contexts_for': {'return_value': source['contexts']},
                'activate_services': {'side_effect': activate}, 'persist_control_proof': {'return_value': proof},
                'read_control_proof': {'return_value': proof}, 'switch_pointer': {'side_effect': switch},
                'command': {'side_effect': command}, 'public_probe': {}, 'stage': {},
            }.items():
                mocks[name] = stack.enter_context(patch.object(control, name, **options))
            yield SimpleNamespace(base=base, private=private, target=target, release=release, source=source,
                                  source_file=source_file, manifest=value, fixed=fixed, live=live,
                                  mocks=mocks, domain=domain, events=events, new_image=new_image)

    def run_repair(self, fixture):
        return control.repair_application(fixture.release, fixture.fixed, fixture.target, fixture.manifest)

    def test_repair_and_completed_retry_preserve_games_and_original_evidence(self):
        with self.fixture() as f:
            original, games = f.source_file.read_bytes(), copy.deepcopy(f.live)
            receipt = self.run_repair(f)
            self.assertEqual(receipt['services'], ['management'])
            self.assertEqual(receipt['sourceSHA'], f.fixed['sourceSHA'])
            self.assertEqual(receipt['activeImages']['management'], f.new_image)
            for name in ('runtime', 'kart'): self.assertEqual(f.live[name], games[name])
            self.assertEqual(self.run_repair(f), receipt)
            f.mocks['activate_services'].assert_called_once()
            f.domain.provision_player_sessions.assert_not_called()
            f.domain.provision_control_database.assert_not_called()
            self.assertEqual(f.source_file.read_bytes(), original)
            self.assertTrue(f.live['nginx']['running'])
            # A stale recover must not replace the repaired application.
            with self.assertRaisesRegex(control.Stopped, 'RECOVERY_SUPERSEDED'):
                control.adopt(f.target, f.manifest, f.base, True)

    def test_failures_reclose_ingress_and_can_retry_without_remigrating(self):
        for stage in ('activate_services', 'persist_control_proof', 'switch_pointer', 'public_probe'):
            with self.subTest(stage=stage), self.fixture() as f:
                operation = f.mocks[stage]
                original_side_effect = operation.side_effect
                operation.side_effect = control.Stopped('INJECTED_FAILURE')
                with self.assertRaisesRegex(control.Stopped, 'INJECTED_FAILURE'): self.run_repair(f)
                self.assertFalse(f.live['nginx']['running'])
                self.assertEqual(control.private_json(f.private / 'fixed/application-repair.json')['phase'], 'recovery-required')
                operation.side_effect = original_side_effect
                if stage == 'activate_services': f.live.pop('management')
                self.run_repair(f)
                self.assertTrue(f.live['nginx']['running'])
                f.domain.provision_player_sessions.assert_not_called()

    def test_repair_rejects_missing_proof_or_drift_before_activation(self):
        for failure in ('schema', 'precommit', 'sessions', 'runtime', 'kart', 'env', 'pointer', 'not-committed'):
            with self.subTest(failure=failure), self.fixture() as f:
                if failure == 'schema': f.mocks['database_floor'].return_value = 'schema2'
                elif failure == 'precommit': f.mocks['read_precommit'].return_value = ({'controlContract': CONTRACT}, '0' * 64)
                elif failure == 'sessions': f.domain.player_session_metadata.return_value = '0' * 64
                elif failure == 'runtime': f.live['runtime']['id'] = '0' * 64
                elif failure == 'kart': f.live['kart']['networkMode'] = 'host'
                elif failure == 'env': f.mocks['assert_env'].side_effect = control.Stopped('ENV_CHANGED')
                elif failure == 'pointer':
                    (f.base / 'current').unlink(); (f.base / 'current').symlink_to(f.target)
                else:
                    f.source['newActivationAttempted'] = False
                    control.write_private(f.source_file, f.source, True)
                with self.assertRaises(control.Stopped): self.run_repair(f)
                f.mocks['activate_services'].assert_not_called()
                f.mocks['command'].assert_not_called()

    def test_retry_after_compose_stops_original_management(self):
        with self.fixture() as f:
            operation = f.mocks['activate_services']
            original = operation.side_effect
            def fail(*_):
                f.live['management']['running'] = False
                for network in f.live['management']['networks'].values():
                    network.update(IPAddress='', IPPrefixLen=0, Gateway='')
                raise control.Stopped('COMPOSE_INTERRUPTED')
            operation.side_effect = fail
            with self.assertRaisesRegex(control.Stopped, 'COMPOSE_INTERRUPTED'): self.run_repair(f)
            operation.side_effect = original
            self.run_repair(f)
            self.assertTrue(f.live['nginx']['running'])

    def test_full_session_snapshot_exceeds_config_limit_but_keeps_private_file_guard(self):
        for unsafe_mode in (False, True):
            with self.subTest(unsafe_mode=unsafe_mode), self.fixture() as f:
                file = f.private / f.target.name / 'player-sessions-complete.json'
                proof = control.private_json(file)
                proof['before'] = {'snapshot': 'a' * 300000}
                control.write_private(file, proof, True)
                self.assertGreater(file.stat().st_size, 262144)
                if unsafe_mode:
                    file.chmod(0o644)
                    with self.assertRaisesRegex(control.Stopped, 'PRIVATE_FILE'): self.run_repair(f)
                    f.mocks['activate_services'].assert_not_called()
                else:
                    self.assertTrue(self.run_repair(f)['ok'])

    def test_retry_rejects_changed_evidence_and_game_identity(self):
        for failure in ('source', 'binding', 'application-manifest', 'runtime', 'management'):
            with self.subTest(failure=failure), self.fixture() as f:
                f.mocks['public_probe'].side_effect = control.Stopped('INJECTED_FAILURE')
                with self.assertRaises(control.Stopped): self.run_repair(f)
                f.mocks['activate_services'].reset_mock()
                if failure == 'source':
                    f.source['stopped'] = []
                    control.write_private(f.source_file, f.source, True)
                elif failure == 'binding': f.fixed['sourceSHA'] = '0' * 40
                elif failure == 'application-manifest': (f.release / 'manifest.json').write_text('{"different":"same source and release"}')
                elif failure == 'runtime': f.live['runtime']['configHash'] = 'changed'
                else: f.live['management']['image'] = 'sha256:' + '0' * 64
                with self.assertRaises(control.Stopped): self.run_repair(f)
                f.mocks['activate_services'].assert_not_called()
                self.assertFalse(f.live['nginx']['running'])


class DatabaseDiagnostics(unittest.TestCase):
    def test_domain_failure_keeps_only_validated_public_ownership(self):
        original = SimpleNamespace(ownedContainerId='a' * 64,
            probeUUID='12345678-1234-1234-1234-123456789012',
            probeProcessId=123, secret='never forward', outcome='unknown')
        error = control.database_failure('DATABASE_OUTCOME_UNKNOWN', original)
        self.assertEqual(len(control.diagnostic_markers(error)), 3)
        self.assertFalse(hasattr(error, 'secret'))
        self.assertEqual(error.code, 'DATABASE_OUTCOME_UNKNOWN__CONTROL_DATABASE_FAILED')
        original.ownedContainerId='bad'; original.probeUUID='bad'; original.probeProcessId=True
        self.assertEqual(control.diagnostic_markers(control.database_failure('DATABASE_OUTCOME_UNKNOWN', original)), [])

    def test_only_enumerated_causes_cross_the_boundary(self):
        for reason in ('CONTROL_PRIVATE_DIRECTORY', 'PRIVATE_CANARY', None, 'CONTROL_COMMAND_FAILED secret'):
            error = control.database_failure('DATABASE_PREFLIGHT_FAILED', SimpleNamespace(code=reason))
            self.assertEqual(error.code, 'DATABASE_PREFLIGHT_FAILED__' + (
                reason if reason in control.DATABASE_REASONS else 'CONTROL_DATABASE_FAILED'))


class HelperBoundary(unittest.TestCase):
    @contextlib.contextmanager
    def fixture(self):
        spec = importlib.util.spec_from_file_location('real_control_database', Path(control.__file__).with_name('control-database.py'))
        db = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(db)
        with tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as stack:
            base, private = Path(folder) / 'public', Path(folder) / 'private'
            (base / 'releases/previous').mkdir(parents=True)
            (base / 'current').symlink_to(base / 'releases/previous')
            private.mkdir(mode=0o700)
            release = base / 'releases/candidate'
            (release / 'migrations').mkdir(parents=True)
            (private / release.name).mkdir(mode=0o700)
            files = ('control-database.py', 'control-fingerprint.sql', 'migrations/002-control-center.sql', 'migrations/003-night-overwatch-control.sql', 'migrations/004-tetracube-control.sql', 'migrations/014-player-sessions.sql')
            for name in files:
                shutil.copyfile((Path(control.__file__).parent.parent if name.endswith('014-player-sessions.sql') else Path(control.__file__).parent) / name, release / name)
            value = dict(manifest(), release=release.name, migrationArtifactSha256=db.MIGRATION_SHA256,
                         files={name: hashlib.sha256((release / name).read_bytes()).hexdigest() for name in files})
            (release / 'manifest.json').write_text(json.dumps(value))
            live, events, sql = facts(), [], []
            def docker(*args, **kwargs):
                if args[:2] == ('docker', 'inspect'):
                    return json.dumps(next(item for item in live.values() if item['id'] == args[-1])).encode()
                if args[:3] == ('docker', 'compose', 'version'):
                    return b'Docker Compose version v2.40.0'
                if args[:2] == ('docker', 'compose') and args[-2:] == ('config', '--quiet'):
                    self.assertEqual(json.loads(kwargs['input'])['services']['probe']['env_file'], [{'path': '/dev/null', 'format': 'raw'}])
                    return b''
                if args[-1] == '--version':
                    return (args[-2] + ' (PostgreSQL) 17.6').encode()
                query = kwargs['input'].decode()
                self.assertTrue(query.startswith('BEGIN READ ONLY;'))
                self.assertNotIn('CREATE ', query)
                sql.append(query)
                return b'1024' if 'pg_database_size' in query else b't'
            def lifecycle(*args, **kwargs):
                events.append(args)
                for item in live.values():
                    if item['id'] == args[-1]:
                        item['running'] = args[1] == 'start'
                return b''
            stack.enter_context(patch.dict(control.MODULES, {'control-database.py': db}, clear=True))
            for module, key, replacement in [(db, 'BASE', base / 'releases'), (db, 'PRIVATE', private),
                                             (control, 'BASE', base), (control, 'PRIVATE', private)]:
                stack.enter_context(patch.object(module, key, replacement))
            stack.enter_context(patch.object(db, 'command', side_effect=docker))
            for name, replacement in {
                'inventory': lambda: copy.deepcopy(live), 'database_floor': lambda *_: 'absent',
                'manifest_from': lambda *_: {}, 'management_config': lambda *_: (Path('/opaque/management.env'), [1, 2, 3, 4], {}),
                'contexts_for': lambda *_: {'runtime': {}, 'kart': {}}, 'active_guards': lambda *_: None,
                'build_image': lambda *_: IMAGE, 'authority': lambda *_: None, 'pointers_for': lambda *_: {},
                'command': lifecycle, 'assert_nginx': lambda *_: None, 'stopped_writers': lambda *_: None,
                'assert_env': lambda *_: None, 'check_protected': lambda *_: None,
                'target_inventory': lambda name: copy.deepcopy(live[name]), 'service_health': lambda *_: None,
            }.items():
                stack.enter_context(patch.object(control, name, side_effect=replacement))
            yield db, release, value, private, live, events, sql

    def test_real_helper_preflight_under_nonroot_owner_is_readonly_before_stop(self):
        # Run via WSL/Linux to exercise real uid and 0700/0600 checks, not a mocked helper.
        self.assertNotEqual(os.geteuid(), 0)
        with self.fixture() as (db, release, value, private, live, events, sql):
            with patch.object(control, 'pointers_for', side_effect=control.Stopped('ACTIVE_GAME')):
                with self.assertRaisesRegex(control.Stopped, 'ACTIVE_GAME'):
                    control.adopt(release, value, release.parent)
            self.assertEqual(len(sql), 3)
            self.assertEqual(events, [])
            self.assertEqual(list((private / release.name).iterdir()), [])
            self.assertTrue(all(item['running'] for item in live.values()))

    def test_preflight_permissions_hash_tools_profile_and_disk_fail_without_stopping(self):
        for failure in ('permissions', 'hash', 'tools', 'profile', 'disk'):
            with self.subTest(failure=failure), self.fixture() as (db, release, value, private, live, events, sql), contextlib.ExitStack() as stack:
                if failure == 'permissions':
                    def permissions_changed(*_):
                        (private / release.name).chmod(0o755)
                        return Path('/opaque/management.env'), [1, 2, 3, 4], {}
                    stack.enter_context(patch.object(control, 'management_config', side_effect=permissions_changed))
                elif failure == 'hash':
                    (release / 'control-database.py').write_text('invalid')
                elif failure == 'tools':
                    stack.enter_context(patch.object(db, 'command', side_effect=db.ControlDatabaseError('CONTROL_COMMAND_FAILED')))
                elif failure == 'profile':
                    stack.enter_context(patch.object(db, 'psql', side_effect=['t', 'f']))
                else:
                    stack.enter_context(patch.object(db.shutil, 'disk_usage', return_value=SimpleNamespace(free=0)))
                with self.assertRaisesRegex(control.Stopped, 'DATABASE_PREFLIGHT_FAILED') as caught:
                    control.adopt(release, value, release.parent)
                self.assertIn(caught.exception.reason, control.DATABASE_REASONS)
                self.assertEqual(events, [])
                self.assertTrue(all(item['running'] for item in live.values()))
                self.assertEqual(list((private / release.name).iterdir()), [])

    def test_real_helper_failure_before_any_database_command_restores_exact_old_services(self):
        with self.fixture() as (db, release, value, private, live, events, sql):
            def changed_after_stop(_pg):
                (release / 'control-fingerprint.sql').write_text('changed after preflight')
            with patch.object(control, 'stopped_writers', side_effect=changed_after_stop):
                with self.assertRaisesRegex(control.Stopped, 'DATABASE_NOT_COMMITTED') as caught:
                    control.adopt(release, value, release.parent)
            self.assertEqual(caught.exception.reason, 'CONTROL_RELEASE_HASH')
            self.assertEqual(len(sql), 3)  # Only the pre-stop readonly queries; no post-stop DB command.
            self.assertEqual([call[-1] for call in events if call[1] == 'start'],
                             [live[name]['id'] for name in ('runtime', 'kart', 'management', 'nginx')])
            saved = control.private_json(private / release.name / 'control-journal.json')
            self.assertEqual(saved['phase'], 'restored')
            self.assertFalse(saved['newActivationAttempted'])


class RootPreconditionRecovery(unittest.TestCase):
    @contextlib.contextmanager
    def fixture(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as stack:
            base, private = Path(folder) / 'public', Path(folder) / 'private'
            previous = base / 'releases/previous'
            previous.mkdir(parents=True)
            (base / 'current').symlink_to(previous)
            release = base / 'releases' / control.ROOT_PRECONDITION['release']
            release.mkdir()
            # Historical bytes are data only; executing this fixture is always a failure.
            helper = b'raise AssertionError("historical code executed")\n'
            (release / 'control-database.py').write_bytes(helper)
            binding = dict(control.ROOT_PRECONDITION, deploymentUid=os.geteuid(), helperSHA256=hashlib.sha256(helper).hexdigest())
            value = dict(manifest(), sourceSHA=binding['sourceSHA'], files={'control-database.py': binding['helperSHA256']})
            private.mkdir(mode=0o700)
            directory = private / release.name
            directory.mkdir(mode=0o700)
            stack.enter_context(patch.object(control, 'PRIVATE', private))
            stack.enter_context(patch.object(control, 'BASE', base))
            stack.enter_context(patch.object(control, 'ROOT_PRECONDITION', binding))
            state = journal(release)
            state.update(sourceSHA=binding['sourceSHA'], phase='database-unknown', newActivationAttempted=False,
                         stopped=['management', 'kart', 'runtime'])
            live = copy.deepcopy(state['inventory'])
            for name in (*control.SERVICES, 'nginx'):
                live[name]['running'] = False
            events = []
            def command(*args):
                events.append(args)
                next(item for item in live.values() if item['id'] == args[-1])['running'] = True
            for name, replacement in {
                'domain_module': lambda: SimpleNamespace(provision_control_database=Mock(side_effect=AssertionError('must not migrate'))),
                'assert_env': lambda *_: None, 'check_protected': lambda *_: None,
                'contexts_for': lambda *_: state['contexts'], 'assert_nginx': lambda *_: None,
                'database_floor': lambda *_: 'absent', 'target_inventory': lambda name: copy.deepcopy(live[name]),
                'command': command, 'service_health': lambda *_: None,
                'restored_control_enabled': lambda *_: False,
            }.items():
                stack.enter_context(patch.object(control, name, side_effect=replacement))
            yield release, value, state, directory, live, events

    def test_explicit_bound_evidence_restores_and_preserves_original_journal(self):
        with self.fixture() as (release, value, state, directory, live, events):
            control.write_private(directory / 'control-journal.json', state)
            self.assertEqual(control.adopt(release, value, release.parent, True, True)['outcome'], 'restored-before-migration')
            saved = control.private_json(directory / 'control-journal.json')
            self.assertEqual(saved['phase'], 'restored')
            self.assertEqual(saved['rootPreconditionEvidence']['journal'], state)
            self.assertEqual(len(events), 4)
            self.assertEqual(control.adopt(release, value, release.parent, True, True)['outcome'], 'restored-before-migration')
            self.assertTrue(all(item['running'] for item in live.values()))

    def test_absence_alone_and_every_incomplete_binding_refuse_without_start(self):
        for failure in ('no-option', 'uid', 'source', 'helper-manifest', 'helper-bytes', 'backup', 'precommit',
                        'activation', 'phase', 'precommit-hash', 'runtime-id', 'kart-removal', 'stopped',
                        'container', 'schema2', 'pointer'):
            with self.subTest(failure=failure), self.fixture() as (release, value, state, directory, live, events), contextlib.ExitStack() as stack:
                if failure == 'uid':
                    # Ownership checks stay real; only the historical execution-uid claim differs.
                    stack.enter_context(patch.object(control, 'ROOT_PRECONDITION', dict(control.ROOT_PRECONDITION, deploymentUid=os.geteuid() + 1)))
                elif failure == 'source': value['sourceSHA'] = state['sourceSHA'] = 'f' * 40
                elif failure == 'helper-manifest': value['files']['control-database.py'] = 'f' * 64
                elif failure == 'helper-bytes': (release / 'control-database.py').write_text('changed')
                elif failure in ('backup', 'precommit'): (directory / ('control-database.dump' if failure == 'backup' else 'control-precommit.json')).touch()
                elif failure == 'activation': state['newActivationAttempted'] = True
                elif failure == 'phase': state['phase'] = 'database'
                elif failure == 'precommit-hash': state['precommitSHA256'] = 'f' * 64
                elif failure == 'runtime-id': state['runtimeIds'] = ['f' * 64]
                elif failure == 'kart-removal': state['kartRemovalAttempted'] = True
                elif failure == 'stopped': state['stopped'] = ['runtime']
                elif failure == 'container': live['runtime']['id'] = 'f' * 64
                elif failure == 'schema2': stack.enter_context(patch.object(control, 'database_floor', return_value='schema4'))
                elif failure == 'pointer': state['previous'] = 'other'
                control.write_private(directory / 'control-journal.json', state)
                with self.assertRaises(control.Stopped):
                    control.adopt(release, value, release.parent, True, failure != 'no-option')
                self.assertEqual(events, [])

    def test_proven_evidence_survives_partial_restart_and_tampering_is_rejected(self):
        with self.fixture() as (release, value, state, directory, live, events):
            control.write_private(directory / 'control-journal.json', state)
            with patch.object(control, 'service_health', side_effect=control.Stopped('GAME_RESTART_FAILED')):
                with self.assertRaisesRegex(control.Stopped, 'GAME_RESTART_FAILED'):
                    control.adopt(release, value, release.parent, True, True)
            saved = control.private_json(directory / 'control-journal.json')
            control.adoption_journal(saved, release, value)
            changed = copy.deepcopy(saved)
            changed['rootPreconditionEvidence']['journal']['newActivationAttempted'] = True
            with self.assertRaisesRegex(control.Stopped, 'ROOT_PRECONDITION_UNPROVEN'):
                control.adoption_journal(changed, release, value)
            self.assertEqual(control.adopt(release, value, release.parent, True, True)['outcome'], 'restored-before-migration')
            self.assertTrue(all(item['running'] for item in live.values()))


if __name__ == '__main__':
    unittest.main()
