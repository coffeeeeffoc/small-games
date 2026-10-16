import importlib.util
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
        journal = {'selected': ['runtime', 'kart'], 'contexts': {'runtime': {'name': 'runtime'}, 'kart': {'name': 'kart'}},
                   'oldImages': {'runtime': 'sha256:' + 'a' * 64, 'kart': 'sha256:' + 'b' * 64}}
        with patch.object(backend, 'guard_authority_state'), patch.object(backend, 'guard_control_schema'), patch.object(backend, 'require_authority', return_value={}) as floor, patch.object(backend, 'inventory', return_value=item('kart')), patch.object(backend, 'command', side_effect=lambda *args, **kwargs: calls.append(('command', args))), patch.object(backend, 'compose', side_effect=lambda context, override, *args: calls.append(('compose', args))), patch.object(backend, 'health', return_value={}):
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
        capabilities = {'runtime': {'image': item('runtime')['image'], 'control': 1, 'ephemeralGuestScope': 1},
                        'kart': {'image': item('kart')['image'], 'control': 1, 'identityRecheck': 1}}
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
            return {name: {'image': image, 'control': 1, 'ephemeralGuestScope': 1} for name, image in images.items()}
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

    def test_control_schema_requires_exact_version_two_and_read_only_query(self):
        for output in [b'[]', b'[1]', b'[2,2]', b'[2.0]', b'[true]', b'null', b'PRIVATE_CANARY']:
            with patch.object(backend, 'inventory', return_value={'id': 'pg'}), patch.object(backend, 'command', return_value=output) as command:
                with self.assertRaisesRegex(backend.Stopped, '^AUTHORITY_FALLBACK_REQUIRED$'):
                    backend.guard_control_schema()
                sql = command.call_args.args[-1]
                self.assertIn('BEGIN TRANSACTION READ ONLY', sql)
                self.assertNotIn('CREATE', sql)
        with patch.object(backend, 'inventory', return_value={'id': 'pg'}), patch.object(backend, 'command', return_value=b'[2]'):
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
