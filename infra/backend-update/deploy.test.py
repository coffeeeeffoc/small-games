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
        with patch.object(backend, 'inventory', return_value=item('kart')), patch.object(backend, 'command', side_effect=lambda *args, **kwargs: calls.append(('command', args))), patch.object(backend, 'compose', side_effect=lambda context, override, *args: calls.append(('compose', args))), patch.object(backend, 'health', return_value={}):
            backend.restore(journal, Path('/private/rollback.json'))
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
                with patch.object(backend, 'PRIVATE', Path(folder) / 'private'), patch.object(backend, 'command', return_value=b''), patch.object(backend, 'text', side_effect=image), patch.object(backend, 'compose'), patch.object(backend, 'guard_games'), patch.object(backend, 'inventory', side_effect=lambda project, name, **kwargs: {'id': 'postgres-id'} if name == 'postgres' else selected[name]), patch.object(backend, 'schema_hash', return_value='schema'), patch.object(backend, 'backup', return_value='e' * 64), patch.object(backend, 'recreate', side_effect=[backend.Stopped(failure), None]) as recreate, patch.object(backend, 'health', return_value=selected), patch.object(backend, 'assert_protected'):
                    with self.assertRaisesRegex(backend.Stopped, failure):
                        backend.execute(Path('/public/candidate'), manifest, {}, selected, ['kart'], contexts, None)
                    self.assertEqual(recreate.call_count, 2)
                    self.assertEqual(recreate.call_args_list[1].args[1].name, 'rollback.json')
                    journal = backend.private_json(Path(folder) / 'private/candidate/journal.json')
                    self.assertEqual(journal['backupSHA256'], 'e' * 64)
                    self.assertEqual(journal['oldImages']['kart'], 'sha256:' + 'b' * 64)

    def test_manual_rollback_failure_or_signal_restores_current_healthy_version(self):
        selected = {'runtime': item('runtime', 'd'), 'kart': item('kart', 'b')}
        manifest = {'sourceSHA': 'c' * 40, 'release': 'candidate', 'services': ['runtime']}
        journal = {'selected': list(selected), 'images': {name: value['image'] for name, value in selected.items()},
                   'oldImages': {'runtime': 'sha256:' + 'a' * 64, 'kart': 'sha256:' + 'b' * 64},
                   'contexts': {name: {} for name in selected}, 'schemaHash': 'schema', 'companions': ['kart']}
        for failure in ['COMMAND_FAILED', 'SIGNAL_INTERRUPTED']:
            with patch.object(backend, 'private_json', return_value=journal), patch.object(backend, 'inventory', return_value={'id': 'postgres-id'}), patch.object(backend, 'schema_hash', return_value='schema'), patch.object(backend, 'text', side_effect=lambda *args: args[3]), patch.object(backend, 'compose'), patch.object(backend, 'guard_games'), patch.object(backend, 'override') as override, patch.object(backend, 'restore', side_effect=[backend.Stopped(failure), selected]) as restore, patch.object(backend, 'assert_protected'):
                with self.assertRaisesRegex(backend.Stopped, failure):
                    backend.rollback_update(Path('/public/candidate'), manifest, selected, {}, None)
                self.assertEqual(restore.call_count, 2)
                self.assertEqual(restore.call_args_list[1].args[0]['oldImages']['runtime'], selected['runtime']['image'])
                self.assertIn('failback-', override.call_args.args[0].name)

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
        result = backend.receipt(manifest, 'execute', ['kart'], {'runtime': item('runtime'), 'kart': item('kart')}, 'b' * 64)
        self.assertFalse(result['isolatedRestoreVerified'])
        self.assertFalse(result['databaseReplaced'])
        self.assertFalse(result['schemaChanged'])
        self.assertEqual(set(result['activeImages']), {'runtime', 'kart'})
        self.assertFalse(backend.receipt(manifest, 'rollback', ['kart'], {}, None)['backupCreated'])

    def test_command_errors_never_render_server_stderr_or_credentials(self):
        result = subprocess.CompletedProcess([], 1, b'', b'CANARY_PASSWORD CLIENT_SECRET')
        with patch.object(backend.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(backend.Stopped, '^COMMAND_FAILED$'):
                backend.command('controlled', input=b'PRIVATE_CANARY')
        source = Path(__file__).with_name('deploy.py').read_text()
        self.assertNotIn('.Config.Env', source)
        self.assertNotIn('bootstrap.sql', source)
        self.assertNotIn('"postgres", "up"', source)


if __name__ == '__main__':
    unittest.main()
