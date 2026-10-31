import importlib.util
import contextlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backend_update', Path(__file__).with_name('deploy.py'))
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)


def item(name, image='a', revision='candidate'):
    return {'id': name + '-id', 'image': 'sha256:' + image * 64, 'running': True,
            'ports': {}, 'mounts': [], 'networks': {} if name == 'kart' else {'default': {}},
            'networkMode': 'container:runtime-id' if name == 'kart' else 'bridge',
            'update': revision, 'configHash': name + '-hash'}


class BackendContracts(unittest.TestCase):
    def test_platform_config_merge_preserves_other_apps_and_existing_games(self):
        incoming = {'platform': 'taptap', 'appId': 'night-app', 'secret': 'NEW_PRIVATE_${CANARY}', 'games': ['night-overwatch']}
        other = {'platform': 'wechat', 'appId': 'other-app', 'secret': 'OLD_OTHER_PRIVATE', 'games': ['vibeJam-myself-history-guess']}
        current = [other, {**incoming, 'secret': 'OLD_NIGHT_PRIVATE', 'games': ['carding-car']}]
        result = backend.merge_platform_config(current, incoming)
        self.assertEqual(result[0], other)
        self.assertEqual(result[1]['games'], ['carding-car', 'night-overwatch'])
        self.assertEqual(current[1]['secret'], 'OLD_NIGHT_PRIVATE')
        self.assertEqual(backend.merge_platform_config([other], incoming), [other, incoming])
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'platform.json'
            backend.platform_override(file, result)
            value = backend.private_json(file)
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            self.assertEqual(set(value['services']), {'runtime'})
            env = value['services']['runtime']['environment']
            self.assertEqual(set(env), {'COMPETITION_PLATFORM_CONFIG'})
            self.assertIn('$${CANARY}', env['COMPETITION_PLATFORM_CONFIG'])
            self.assertEqual(json.loads(env['COMPETITION_PLATFORM_CONFIG'].replace('$$', '$')), result)

    def test_platform_payload_rejects_extensions_and_wrong_target_before_inventory(self):
        config = {'platform': 'taptap', 'appId': 'app', 'secret': 'PRIVATE_CANARY_123', 'games': ['night-overwatch']}
        payload = {'services': ['runtime'], 'release': 'candidate', 'sourceSHA': 'a' * 40,
                   'caddyDirectory': '/unused', 'platformConfig': config}
        for value in [None, [], {**config, 'command': 'unsafe'}, {**config, 'secret': 'short'},
                      {**config, 'games': []}, {**config, 'games': ['night-overwatch'] * 2},
                      {**config, 'platform': 'unknown'}, {**config, 'secret': 'PRIVATE_CANARY\nBAD'}]:
            with patch.object(backend, 'selected_inventory') as inventory:
                with self.assertRaisesRegex(backend.Stopped, '^PLATFORM_CONFIG$'):
                    backend.main(['--execute'], {**payload, 'platformConfig': value})
                inventory.assert_not_called()
        with patch.object(backend, 'selected_inventory') as inventory:
            with self.assertRaisesRegex(backend.Stopped, '^BACKEND_SELECTION$'):
                backend.main(['--execute'], {**payload, 'services': ['kart']})
            inventory.assert_not_called()

    def test_platform_schema_validation_uses_real_runtime_module_and_stdin_before_mutation(self):
        config = [{'platform': 'taptap', 'appId': 'app', 'secret': 'PRIVATE_CANARY_123', 'games': ['night-overwacth']}]
        with patch.object(backend, 'command', side_effect=backend.Stopped('COMMAND_FAILED')) as command:
            with self.assertRaisesRegex(backend.Stopped, '^COMMAND_FAILED$'):
                backend.validate_platform_config(item('runtime'), config)
            self.assertEqual(command.call_args.kwargs['input'], json.dumps(config).encode())
            args = command.call_args.args
            self.assertEqual(args[:5], ('docker', 'exec', '-i', 'runtime-id', 'node'))
            self.assertIn('platformConfigSchema.safeParse', args[-1])
            self.assertNotIn('PRIVATE_CANARY', ' '.join(args))
        with patch.object(backend, 'guard_authority_state'), patch.object(backend, 'require_authority'), patch.object(backend, 'read_platform_config', return_value=[]), patch.object(backend, 'validate_platform_config', side_effect=backend.Stopped('COMMAND_FAILED')), patch.object(backend, 'private_directory') as private, patch.object(backend, 'command') as command:
            with self.assertRaisesRegex(backend.Stopped, '^COMMAND_FAILED$'):
                backend.execute(Path('/public/candidate'), {}, {'platformConfig': config[0]}, {'runtime': item('runtime')}, [], {}, None)
            private.assert_not_called()
            command.assert_not_called()

    def test_platform_rollback_removes_only_verified_current_revision_and_rejects_tampering(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(backend, 'PRIVATE', Path(directory)):
            release = Path('/public/candidate')
            revision = Path(directory) / release.name
            revision.mkdir()
            file = revision / 'platform-login.json'
            digest = backend.platform_override(file, [])
            contexts = {name: {'files': ['/original.yaml', '/older-platform.json', str(file), '/image.json'],
                               'envfile': '/private/env', 'working': '/original'} for name in ['runtime', 'kart']}
            journal = {'platformConfigSHA256': digest}
            result = backend.platform_rollback_contexts(release, journal, contexts)
            self.assertEqual(result['runtime']['files'], ['/original.yaml', '/older-platform.json', '/image.json'])
            self.assertIn(str(file), contexts['runtime']['files'])
            self.assertEqual(result['kart']['envfile'], '/private/env')
            for altered, ctx in [({}, contexts), ({'platformConfigSHA256': '0' * 64}, contexts),
                                 (journal, {'runtime': {**contexts['runtime'], 'files': ['/original.yaml']}})]:
                with self.assertRaisesRegex(backend.Stopped, '^ROLLBACK_GUARD$'):
                    backend.platform_rollback_contexts(release, altered, ctx)
            bad = {'services': {'runtime': {'environment': {'COMPETITION_PLATFORM_CONFIG': '[]'}, 'command': 'unsafe'}}}
            raw = json.dumps(bad).encode()
            file.write_bytes(raw)
            with self.assertRaisesRegex(backend.Stopped, '^ROLLBACK_GUARD$'):
                backend.platform_rollback_contexts(release, {'platformConfigSHA256': backend.hashlib.sha256(raw).hexdigest()}, contexts)

    def test_platform_update_restores_original_config_on_failure_and_never_stops_active_games(self):
        incoming = {'platform': 'taptap', 'appId': 'night-app', 'secret': 'PRIVATE_CANARY_123', 'games': ['night-overwatch']}
        previous = [{'platform': 'wechat', 'appId': 'other', 'secret': 'OTHER_PRIVATE_123'}]
        for fail_at in ['before_backup', 'after_backup', 'start', 'verify', None]:
            with self.subTest(fail_at=fail_at), tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
                selected = {'runtime': item('runtime', 'a'), 'kart': item('kart', 'b')}
                contexts = {name: {'files': ['/original.yaml'], 'envfile': '/private/env', 'working': '/original'} for name in selected}
                active = {**selected, 'runtime': item('runtime', 'd')}
                manifest = {'sourceSHA': 'c' * 40, 'release': 'candidate', 'services': ['runtime']}
                mocks = {}
                patches = {
                    'PRIVATE': Path(directory) / 'private', 'guard_authority_state': None,
                    'guard_control_schema': None, 'command': None, 'compose': None,
                    'schema_hash': 'schema', 'backup': 'e' * 64, 'assert_protected': None,
                }
                for name, value in patches.items():
                    mocks[name] = stack.enter_context(patch.object(backend, name, value) if name == 'PRIVATE'
                                                     else patch.object(backend, name, return_value=value))
                stack.enter_context(patch.object(backend, 'require_authority', side_effect=lambda images, *args:
                    {name: {'image': image, 'control': 1, 'authenticatedGameScope': 1,
                            **({'identityRecheck': 1} if name == 'kart' else {})} for name, image in images.items()}))
                stack.enter_context(patch.object(backend, 'text', side_effect=lambda *args:
                    args[3] if args[3].startswith('sha256:') else active['runtime']['image']))
                stack.enter_context(patch.object(backend, 'inventory', side_effect=lambda project, name, **kwargs:
                    {'id': 'pg'} if name == 'postgres' else selected[name]))
                guards = [backend.Stopped('ACTIVE_GAME')] if fail_at == 'before_backup' else [None, backend.Stopped('ACTIVE_GAME') if fail_at == 'after_backup' else None]
                stack.enter_context(patch.object(backend, 'guard_games', side_effect=guards))
                recreate = stack.enter_context(patch.object(backend, 'recreate', side_effect=[backend.Stopped('COMMAND_FAILED'), None] if fail_at == 'start' else None))
                stack.enter_context(patch.object(backend, 'health', side_effect=[selected] if fail_at == 'start' else [active, selected]))
                reads = [previous, previous] if fail_at == 'start' else [previous, [] if fail_at == 'verify' else [*previous, incoming], previous]
                stack.enter_context(patch.object(backend, 'read_platform_config', side_effect=reads))
                if fail_at:
                    with self.assertRaises(backend.Stopped):
                        backend.execute(Path('/public/candidate'), manifest, {'platformConfig': incoming}, selected, ['kart'], contexts, None)
                else:
                    result = backend.execute(Path('/public/candidate'), manifest, {'platformConfig': incoming}, selected, ['kart'], contexts, None)
                    self.assertTrue(result['healthVerified'])
                    self.assertNotIn('PRIVATE_CANARY', json.dumps(result))
                if fail_at in ('before_backup', 'after_backup'):
                    recreate.assert_not_called()
                    self.assertFalse(any(call.args[:2] == ('docker', 'stop') for call in mocks['command'].call_args_list))
                else:
                    self.assertTrue(recreate.call_args_list[0].args[0]['runtime']['files'][-1].endswith('/platform-login.json'))
                    if fail_at:
                        self.assertEqual(recreate.call_args_list[1].args[0], contexts)
                    saved = backend.private_json(Path(directory) / 'private/candidate/journal.json')
                    self.assertIn('platformConfigSHA256', saved)
                    self.assertNotIn('PRIVATE_CANARY', json.dumps(saved))

    def test_context_is_ordered_and_missing_interpolation_file_fails_before_updates(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            paths = [root / 'compose.yaml', root / 'older.json', root / 'current.json']
            for file in paths:
                file.write_text('{}')
            env = root / '.env'
            env.write_text('PRIVATE_CANARY=not-to-read')
            source = {'configFiles': ','.join(map(str, paths)), 'workingDirectory': str(root), 'environmentFile': str(env)}
            with patch.object(backend, 'ROOT', root.parent), patch.object(Path, 'read_bytes', side_effect=AssertionError('SECRET_READ')):
                context = backend.compose_context(source)
                self.assertEqual(context['files'], list(map(str, paths)))
                self.assertEqual(context['envfile'], str(env))
                with self.assertRaisesRegex(backend.Stopped, 'COMPOSE_CONTEXT_UNRESOLVED'):
                    backend.compose_context({**source, 'environmentFile': None})

    def test_runtime_companion_and_resolved_namespace_hash_without_environment_output(self):
        runtime, kart = item('runtime'), item('kart')
        def service(project, name, **kwargs):
            return {'runtime': runtime, 'kart': kart}[name]
        def compose(context, override, *args, input=None):
            name = args[-1]
            if name == 'kart' and override is None:
                return b'kart namespace-not-yet-resolved'
            if name == 'kart':
                if json.loads(input)['services']['kart']['network_mode'] == 'service:runtime':
                    return b'kart namespace-not-yet-resolved'
                self.assertEqual(json.loads(input), {'services': {'kart': {'network_mode': 'container:runtime-id'}}})
            return (name + ' ' + name + '-hash').encode()
        with patch.object(backend, 'inventory', side_effect=service), patch.object(backend, 'compose_context', return_value={}), patch.object(backend, 'compose', side_effect=compose):
            selected, companions, _ = backend.selected_inventory(['runtime'])
            self.assertEqual(set(selected), {'runtime', 'kart'})
            self.assertEqual(companions, ['kart'])
            selected, companions, _ = backend.selected_inventory(['kart'])
            self.assertEqual(set(selected), {'kart'})
            self.assertEqual(companions, [])
        with patch.object(backend, 'inventory', side_effect=service), patch.object(backend, 'compose_context', return_value={}), patch.object(backend, 'compose', return_value=b'runtime changed-hash'):
            with self.assertRaisesRegex(backend.Stopped, 'COMPOSE_CONTEXT_CHANGED'):
                backend.selected_inventory(['runtime'])
        with patch.object(backend, 'inventory', side_effect=service), patch.object(backend, 'compose_context', return_value={}), patch.object(backend, 'compose', side_effect=[b'kart host-network-hash', b'kart service-runtime-hash']):
            with self.assertRaisesRegex(backend.Stopped, 'KART_NAMESPACE'):
                backend.selected_inventory(['kart'])
        with patch.object(backend, 'inventory', side_effect=lambda project, name, **kwargs: runtime if name == 'runtime' else {**kart, 'networkMode': 'bridge'}):
            with self.assertRaisesRegex(backend.Stopped, 'KART_NAMESPACE'):
                backend.selected_inventory(['runtime'])

    def test_recreation_names_only_selected_services_and_releases_kart_namespace_first(self):
        calls = []
        journal = {'selected': ['runtime', 'kart'], 'contexts': {'runtime': {'files': []}, 'kart': {'files': []}},
                   'oldImages': {'runtime': 'sha256:' + 'a' * 64, 'kart': 'sha256:' + 'b' * 64}}
        with patch.object(backend, 'guard_authority_state'), patch.object(backend, 'guard_control_schema'), patch.object(backend, 'require_authority', return_value={}) as floor, patch.object(backend, 'inventory', side_effect=lambda project, name, **kwargs: {**item(name), 'id': 'a' * 64}), patch.object(backend, 'write_private'), patch.object(backend, 'command', side_effect=lambda *args, **kwargs: calls.append(('command', args))), patch.object(backend, 'compose', side_effect=lambda context, override, *args: calls.append(('compose', args))), patch.object(backend, 'health', return_value={}):
            backend.restore(journal, Path('/private/rollback.json'))
            floor.assert_called_once_with(journal['oldImages'], 'AUTHORITY_FALLBACK_REQUIRED')
        self.assertEqual(calls[0][1][:3], ('docker', 'stop', '--time'))
        self.assertEqual(calls[1][1][:2], ('docker', 'rm'))
        self.assertEqual([value[-1] for kind, value in calls if kind == 'compose'], ['runtime', 'kart'])
        for kind, value in calls:
            if kind == 'compose':
                self.assertIn('--no-deps', value)
                self.assertIn('--no-build', value)
                self.assertNotIn('postgres', value)


    def test_kart_recreation_appends_live_namespace_after_images_for_update_and_restore(self):
        for selected in (['runtime', 'kart'], ['kart']):
            for operation in ('update.json', 'rollback.json', 'reviewed-rollback.json', 'failback.json'):
                with self.subTest(selected=selected, operation=operation):
                    calls, writes = [], {}
                    context = {'files': ['/private/adopt/kart-control.json'], 'working': '/public', 'envfile': '/private/env'}
                    override = Path('/private/release') / operation
                    current_id = 'b' * 64
                    def service(project, name):
                        self.assertEqual(name, 'runtime')
                        if 'runtime' in selected:
                            self.assertEqual(calls[0][2][-1], 'runtime')
                        return {'running': True, 'id': current_id}
                    with patch.object(backend, 'inventory', side_effect=service), patch.object(backend, 'write_private', side_effect=lambda file, data: writes.update({file: json.loads(data)})), patch.object(backend, 'compose', side_effect=lambda ctx, file, *args: calls.append((ctx, file, args))):
                        backend.recreate({name: context for name in selected}, override, selected)
                    kart_context, kart_file, args = calls[-1]
                    self.assertEqual(args[-1], 'kart')
                    self.assertEqual(kart_context['files'], [*context['files'], str(override)])
                    self.assertEqual(writes[kart_file], {'services': {'kart': {'network_mode': 'container:' + current_id}}})
                    self.assertEqual(context['files'], ['/private/adopt/kart-control.json'])
        for runtime in ({'running': False, 'id': 'c' * 64}, {'running': True, 'id': '../invalid'}):
            with patch.object(backend, 'inventory', return_value=runtime), patch.object(backend, 'write_private') as write, patch.object(backend, 'compose') as compose:
                with self.assertRaisesRegex(backend.Stopped, 'KART_NAMESPACE'):
                    backend.recreate({'kart': {}}, Path('/private/update.json'), ['kart'])
                write.assert_not_called()
                compose.assert_not_called()

    def test_execute_failure_and_signal_restore_old_images_and_keep_private_backup(self):
        for failure in ['COMMAND_TIMEOUT', 'SIGNAL_INTERRUPTED']:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as folder:
                selected = {'runtime': item('runtime', 'a', None), 'kart': item('kart', 'b', None)}
                contexts = {name: {} for name in selected}
                manifest = {'sourceSHA': 'c' * 40, 'release': 'candidate', 'services': ['runtime']}
                def image(*args, **kwargs):
                    return args[3] if args[3].startswith('sha256:') else 'sha256:' + 'd' * 64
                with patch.object(backend, 'guard_authority_state'), patch.object(backend, 'guard_control_schema'), patch.object(backend, 'require_authority', return_value={}) as floor, patch.object(backend, 'PRIVATE', Path(folder) / 'private'), patch.object(backend, 'command', return_value=b''), patch.object(backend, 'text', side_effect=image), patch.object(backend, 'compose'), patch.object(backend, 'guard_games'), patch.object(backend, 'inventory', side_effect=lambda project, name, **kwargs: {'id': 'postgres-id'} if name == 'postgres' else selected[name]), patch.object(backend, 'schema_hash', return_value='schema'), patch.object(backend, 'backup', return_value='e' * 64), patch.object(backend, 'recreate', side_effect=[backend.Stopped(failure), None]) as recreate, patch.object(backend, 'health', return_value=selected), patch.object(backend, 'assert_protected'):
                    with self.assertRaisesRegex(backend.Stopped, failure):
                        backend.execute(Path('/public/candidate'), manifest, {}, selected, ['kart'], contexts, None)
                    self.assertEqual(recreate.call_count, 2)
                    self.assertEqual(recreate.call_args_list[1].args[1].name, 'rollback.json')
                    journal = backend.private_json(Path(folder) / 'private/candidate/journal.json')
                    self.assertEqual(journal['backupSHA256'], 'e' * 64)
                    self.assertEqual(journal['oldImages']['kart'], 'sha256:' + 'b' * 64)
                    self.assertEqual(floor.call_args_list[0].args[1], 'AUTHORITY_FALLBACK_REQUIRED')
                    self.assertEqual(floor.call_args_list[-1].args[1], 'AUTHORITY_FALLBACK_REQUIRED')

    def test_manual_rollback_failure_or_signal_restores_current_healthy_version(self):
        selected = {'runtime': item('runtime', 'd'), 'kart': item('kart', 'b')}
        manifest = {'sourceSHA': 'c' * 40, 'release': 'candidate', 'services': ['runtime']}
        journal = {'selected': list(selected), 'images': {name: value['image'] for name, value in selected.items()},
                   'oldImages': {'runtime': 'sha256:' + 'a' * 64, 'kart': 'sha256:' + 'b' * 64},
                   'contexts': {'runtime': {'untrusted-history': True}, 'kart': {}},
                   'schemaHash': 'schema', 'companions': ['kart'], 'release': 'candidate',
                   'sourceSHA': 'c' * 40, 'backupSHA256': 'e' * 64}
        rollback = {'services': {name: {'image': image, 'pull_policy': 'never',
                     'labels': {'io.small-games.backend-update': 'previous'}}
                    for name, image in journal['oldImages'].items()}}
        for failure, cleanup_failure in [('COMMAND_FAILED', False), ('SIGNAL_INTERRUPTED', False), ('COMMAND_FAILED', True)]:
            cleanup = backend.Stopped('AUTHORITY_PROBE_COMMAND_CLEANUP_FAILED')
            cleanup.probeProcessId = 1234
            with patch.object(backend, 'guard_authority_state'), patch.object(backend, 'require_authority', return_value={}), patch.object(backend, 'private_json', side_effect=lambda file: journal if file.name == 'journal.json' else rollback), patch.object(backend, 'inventory', return_value={'id': 'postgres-id'}), patch.object(backend, 'schema_hash', return_value='schema'), patch.object(backend, 'text', side_effect=lambda *args: args[3]), patch.object(backend, 'compose'), patch.object(backend, 'guard_games'), patch.object(backend, 'override') as override, patch.object(backend, 'restore', side_effect=[backend.Stopped(failure), cleanup if cleanup_failure else selected]) as restore, patch.object(backend, 'assert_protected'):
                with self.assertRaisesRegex(backend.Stopped, str(cleanup) if cleanup_failure else failure) as caught:
                    backend.rollback_update(Path('/public/candidate'), manifest, selected, {'runtime': {'current': True}, 'kart': {}}, None)
                if cleanup_failure:
                    self.assertEqual(caught.exception.probeProcessId, 1234)
                self.assertEqual(restore.call_count, 2)
                self.assertEqual(restore.call_args_list[1].args[0]['oldImages']['runtime'], selected['runtime']['image'])
                self.assertIn('failback-', override.call_args.args[0].name)
                self.assertTrue(restore.call_args_list[0].args[0]['contexts']['runtime']['current'])
                self.assertIn('reviewed-rollback-', restore.call_args_list[0].args[1].name)

    def test_schema_hash_removes_only_pg_dump_random_guards_and_detects_role_changes(self):
        first = [b'\\restrict abc123\nCREATE TABLE old();\n\\unrestrict abc123\n', b'CREATE ROLE runtime_app;\n']
        second = [b'\\restrict different456\nCREATE TABLE old();\n\\unrestrict different456\n', b'CREATE ROLE runtime_app;\n']
        with patch.object(backend, 'command', side_effect=first):
            expected = backend.schema_hash('fixture')
        with patch.object(backend, 'command', side_effect=second):
            self.assertEqual(backend.schema_hash('fixture'), expected)
        with patch.object(backend, 'command', side_effect=[second[0], b'ALTER ROLE runtime_app SUPERUSER;']):
            self.assertNotEqual(backend.schema_hash('fixture'), expected)

    def test_receipt_does_not_claim_restore_or_whole_backend_source(self):
        manifest = {'sourceSHA': 'a' * 40, 'release': 'candidate', 'services': ['runtime']}
        capabilities = {'runtime': {'image': item('runtime')['image'], 'control': 1, 'authenticatedGameScope': 1},
                        'kart': {'image': item('kart')['image'], 'control': 1, 'identityRecheck': 1, 'authenticatedGameScope': 1}}
        with patch.object(backend, 'require_authority', side_effect=AssertionError('UNEXPECTED_PROBE')):
            result = backend.receipt(manifest, 'execute', ['kart'], {'runtime': item('runtime'), 'kart': item('kart')}, capabilities, 'b' * 64)
            empty = backend.receipt(manifest, 'rollback', ['kart'], {}, {})
            with self.assertRaisesRegex(backend.Stopped, '^SERVICE_IMAGE$'):
                backend.receipt(manifest, 'execute', [], {'runtime': item('runtime', 'd')}, {'runtime': capabilities['runtime']})
        self.assertFalse(result['isolatedRestoreVerified'])
        self.assertFalse(result['databaseReplaced'])
        self.assertFalse(result['schemaChanged'])
        self.assertEqual(set(result['activeImages']), {'runtime', 'kart'})
        self.assertFalse(empty['backupCreated'])

    def test_successful_execute_reuses_candidate_proof_bound_to_active_image(self):
        selected = {'runtime': item('runtime')}
        active = {'runtime': item('runtime', 'd')}
        manifest = {'sourceSHA': 'c' * 40, 'release': 'candidate', 'services': ['runtime']}
        events = []
        def probe(images, *args):
            events.append('probe')
            return {name: {'image': image, 'control': 1, 'authenticatedGameScope': 1} for name, image in images.items()}
        def health(*args):
            events.append('health')
            return active
        with tempfile.TemporaryDirectory() as directory, patch.object(backend, 'PRIVATE', Path(directory) / 'private'), patch.object(backend, 'guard_authority_state'), patch.object(backend, 'require_authority', side_effect=probe), patch.object(backend, 'text', side_effect=lambda *args: args[3] if args[3].startswith('sha256:') else active['runtime']['image']), patch.object(backend, 'command'), patch.object(backend, 'compose'), patch.object(backend, 'guard_games'), patch.object(backend, 'inventory', return_value={'id': 'pg'}), patch.object(backend, 'schema_hash', return_value='schema'), patch.object(backend, 'backup', return_value='e' * 64), patch.object(backend, 'recreate'), patch.object(backend, 'health', side_effect=health), patch.object(backend, 'assert_protected'):
            result = backend.execute(Path('/public/candidate'), manifest, {}, selected, [], {'runtime': {}}, None)
        self.assertEqual(events, ['probe', 'probe', 'health'])
        self.assertEqual(result['imageCapabilities']['runtime']['image'], result['activeImages']['runtime'])

    def test_command_errors_never_render_server_stderr_or_credentials(self):
        result = subprocess.CompletedProcess([], 1, b'', b'CANARY_PASSWORD CLIENT_SECRET')
        with patch.object(backend.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(backend.Stopped, '^COMMAND_FAILED$'):
                backend.command('controlled', input=b'PRIVATE_CANARY')
        source = Path(__file__).with_name('deploy.py').read_text()
        self.assertNotIn('.Config.Env', source)
        self.assertNotIn('bootstrap.sql', source)
        self.assertNotIn('"postgres", "up"', source)

    def test_guardless_fallback_and_bad_candidate_fail_before_stop(self):
        selected = {'runtime': item('runtime')}
        for candidate in [False, True]:
            checks = [None, backend.Stopped('AUTHORITY_IMAGE_REQUIRED')] if candidate else [backend.Stopped('AUTHORITY_FALLBACK_REQUIRED')]
            with tempfile.TemporaryDirectory() as directory, patch.object(backend, 'PRIVATE', Path(directory) / 'private'), patch.object(backend, 'guard_authority_state'), patch.object(backend, 'require_authority', side_effect=checks), patch.object(backend, 'text', side_effect=lambda *args: args[3] if args[3].startswith('sha256:') else 'sha256:' + 'd' * 64), patch.object(backend, 'command') as command, patch.object(backend, 'backup') as backup, patch.object(backend, 'recreate') as recreate:
                with self.assertRaisesRegex(backend.Stopped, 'AUTHORITY_'):
                    backend.execute(Path('/public/candidate'), {'services': ['runtime']}, {}, selected, [], {}, None)
                self.assertFalse(any(call.args[:2] == ('docker', 'stop') for call in command.call_args_list))
                backup.assert_not_called()
                recreate.assert_not_called()
                if not candidate:
                    command.assert_not_called()
                    self.assertFalse((Path(directory) / 'private').exists())

    def test_unsafe_restore_never_stops_even_its_companion(self):
        with patch.object(backend, 'require_authority', side_effect=backend.Stopped('AUTHORITY_FALLBACK_REQUIRED')), patch.object(backend, 'command') as command, patch.object(backend, 'recreate') as recreate:
            with self.assertRaisesRegex(backend.Stopped, '^AUTHORITY_FALLBACK_REQUIRED$'):
                backend.restore({'selected': ['runtime', 'kart'], 'oldImages': {'runtime': 'old'}}, Path('/unused'))
            command.assert_not_called()
            recreate.assert_not_called()

    def test_kart_only_probes_protected_runtime_without_selecting_it(self):
        authority = backend.authority_module()
        proof = {'kart': {'image': 'kart-image'}, 'runtime': {'image': 'runtime-image'}}
        with patch.object(backend, 'inventory', return_value={'image': 'runtime-image'}) as inventory, patch.object(authority, 'require_images', return_value=proof) as probe:
            self.assertEqual(backend.require_authority({'kart': 'kart-image'}), {'kart': proof['kart']})
            inventory.assert_called_once_with('small-games', 'runtime')
            self.assertEqual(probe.call_args.args[0], {'kart': 'kart-image', 'runtime': 'runtime-image'})

    def test_public_override_is_fixed_and_private_context_stays_opaque(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'override.json'
            backend.override(file, {'runtime': 'sha256:' + 'a' * 64, 'kart': 'sha256:' + 'b' * 64}, {'runtime': 'new', 'kart': None})
            services = json.loads(file.read_bytes())['services']
            for name in services:
                self.assertEqual(services[name]['environment'], backend.PUBLIC_ENV[name])
                self.assertEqual(set(services[name]), {'image', 'pull_policy', 'labels', 'environment'})
                self.assertNotIn('DATABASE', json.dumps(services[name]))
            self.assertNotEqual(services['runtime']['environment']['COMPETITION_CONTROL_INSTANCE_ID'], services['kart']['environment']['COMPETITION_CONTROL_INSTANCE_ID'])

    def test_history_override_rejects_environment_and_compose_extensions(self):
        image = 'sha256:' + 'a' * 64
        base = {'image': image, 'pull_policy': 'never', 'labels': {'io.small-games.backend-update': ''}}
        for changes in [{'command': ['untrusted']}, {'environment': {'COMPETITION_CONTROL_ENABLED': 'false'}}, {'env_file': '/private'}]:
            with patch.object(backend, 'private_json', return_value={'services': {'runtime': {**base, **changes}}}):
                with self.assertRaisesRegex(backend.Stopped, '^ROLLBACK_GUARD$'):
                    backend.historical_rollback_labels(Path('/unused/candidate'), {'runtime': image})

    def test_release_name_is_strict_before_inventory(self):
        for name in ['../previous', '/opt/previous', 'x y', 'X', '', 'x' * 101]:
            with patch.object(backend, 'selected_inventory') as inventory:
                with self.assertRaisesRegex(backend.Stopped, '^RELEASE_PATH$'):
                    backend.main(['--rollback'], {'services': ['runtime'], 'caddyDirectory': '/unused', 'release': name})
                inventory.assert_not_called()

    def test_owned_probe_error_is_preserved_across_backend_boundary(self):
        authority = backend.authority_module()
        error = authority.AuthorityError('AUTHORITY_PROBE_CLEANUP_FAILED', 'a' * 64,
                                         '12345678-1234-4234-8234-123456789abc', 'public-name')
        error.probeProcessId = 1234
        error.originalCode = 'PRIVATE_CANARY'
        with patch.object(authority, 'require_images', side_effect=error):
            with self.assertRaisesRegex(backend.Stopped, '^AUTHORITY_PROBE_CLEANUP_FAILED$') as caught:
                backend.require_authority({'runtime': 'sha256:' + 'b' * 64})
            self.assertEqual(caught.exception.ownedContainerId, 'a' * 64)
            self.assertEqual(caught.exception.probeProcessId, 1234)
            self.assertEqual(caught.exception.originalCode, 'UNEXPECTED_FAILURE')

    def test_control_schema_requires_exact_version_four_and_read_only_query(self):
        for output in [b'[]', b'[1]', b'[2]', b'[3]', b'[5]', b'[4,4]', b'[4.0]', b'[true]', b'null', b'PRIVATE_CANARY']:
            with patch.object(backend, 'inventory', return_value={'id': 'pg'}), patch.object(backend, 'command', return_value=output) as command:
                with self.assertRaisesRegex(backend.Stopped, '^AUTHORITY_FALLBACK_REQUIRED$'):
                    backend.guard_control_schema()
                sql = command.call_args.args[-1]
                self.assertIn('BEGIN TRANSACTION READ ONLY', sql)
                self.assertNotIn('CREATE', sql)
        with patch.object(backend, 'inventory', return_value={'id': 'pg'}), patch.object(backend, 'command', return_value=b'[4]'):
            backend.guard_control_schema()

    def test_existing_public_environment_must_already_match_before_mutation(self):
        selected = {'runtime': item('runtime')}
        for problem in ['environment', 'schema']:
            with patch.object(backend, 'require_authority', return_value={}), patch.object(backend, 'assert_public_environment', side_effect=backend.Stopped('COMMAND_FAILED') if problem == 'environment' else None), patch.object(backend, 'guard_control_schema', side_effect=backend.Stopped('AUTHORITY_FALLBACK_REQUIRED') if problem == 'schema' else None), patch.object(backend, 'private_directory') as private, patch.object(backend, 'command') as command:
                with self.assertRaisesRegex(backend.Stopped, '^AUTHORITY_FALLBACK_REQUIRED$'):
                    backend.execute(Path('/public/candidate'), {}, {}, selected, [], {}, None)
                private.assert_not_called()
                command.assert_not_called()

    def test_kart_preflight_checks_protected_runtime_but_tianxia_does_not(self):
        with patch.object(backend, 'inventory', return_value=item('runtime')) as inventory, patch.object(backend, 'assert_public_environment') as public, patch.object(backend, 'guard_control_schema') as schema:
            selected = {'kart': item('kart')}
            backend.guard_authority_state(selected)
            self.assertEqual(set(selected), {'kart'})
            self.assertEqual({call.args[0] for call in public.call_args_list}, {'kart', 'runtime'})
            schema.assert_called_once_with()
            inventory.assert_called_once_with('small-games', 'runtime')
        with patch.object(backend, 'inventory') as inventory, patch.object(backend, 'command') as command:
            backend.guard_authority_state({'tianxia': item('tianxia')})
            inventory.assert_not_called()
            command.assert_not_called()


if __name__ == '__main__':
    unittest.main()
