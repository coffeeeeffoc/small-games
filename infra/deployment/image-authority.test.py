import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import uuid
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('authority', Path(__file__).with_name('image-authority.py'))
authority = importlib.util.module_from_spec(spec)
spec.loader.exec_module(authority)
IMAGE = 'sha256:' + 'b' * 64
ID = 'a' * 64
TOKEN = uuid.UUID('12345678-1234-4234-8234-123456789abc')
NAME = 'small-games-authority-' + TOKEN.hex


def state(**changes):
    return dict({'id': ID, 'image': IMAGE, 'name': '/' + NAME, 'uuid': str(TOKEN),
                 'network': 'none', 'readOnly': True, 'memory': 268435456,
                 'memorySwap': 268435456, 'pids': 32, 'nanoCpus': 500000000,
                 'capDrop': ['ALL'], 'capAdd': None, 'securityOpt': ['no-new-privileges:true'],
                 'user': 'node', 'privileged': False, 'mounts': [], 'ports': None,
                 'health': {'Test': ['NONE']}}, **changes)


class DockerFixture:
    def __init__(self, create_lost=False, start_failure=False, cleanup_failure=None,
                 recovered=None, boundary=None, create_id=ID):
        self.calls = []
        self.create_lost, self.start_failure = create_lost, start_failure
        self.cleanup_failure, self.recovered = cleanup_failure, recovered
        self.boundary, self.create_id = boundary or {}, create_id
        self.inspections = 0

    def __call__(self, *args, **options):
        self.calls.append((args, options))
        if args[:2] == ('image', 'inspect'):
            return json.dumps({'id': IMAGE, 'volumes': None}).encode()
        if args[0] == 'create':
            if self.create_lost:
                raise authority.AuthorityError('AUTHORITY_PROBE_COMMAND_FAILED')
            return self.create_id.encode()
        if args[0] == 'ps':
            return (self.recovered if self.recovered is not None else ID).encode()
        if args[0] == 'inspect':
            self.inspections += 1
            if self.cleanup_failure == 'inspect' and self.inspections > 1:
                raise authority.AuthorityError('AUTHORITY_PROBE_COMMAND_FAILED')
            value = state(**self.boundary)
            if self.cleanup_failure == 'owner' and self.inspections > 1:
                value['uuid'] = str(uuid.UUID(int=0))
            return json.dumps(value).encode()
        if args[0] == 'start':
            if self.start_failure:
                raise authority.AuthorityError('AUTHORITY_PROBE_COMMAND_FAILED')
            return b'{"control":1,"authenticatedGameScope":1}'
        if args[0] == 'rm':
            if self.cleanup_failure == 'signal':
                raise RuntimeError('SIGNAL_INTERRUPTED')
            if self.cleanup_failure == 'rm':
                raise authority.AuthorityError('AUTHORITY_PROBE_COMMAND_FAILED')
            return ID.encode()
        raise AssertionError('Unexpected Docker operation')


class AuthorityContracts(unittest.TestCase):
    def test_actual_node_probe_resolves_service_package_and_checks_catalog_and_schemas(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            service = root / 'service.mjs'
            package = root / 'node_modules/@coffeeeeffoc/service-kit'
            package.mkdir(parents=True)
            (package / 'package.json').write_text(json.dumps({'type': 'module', 'exports': './index.js'}))
            def run(service_name, ids, reject_snapshot=False, reject_policy=False, catalog=4):
                _, export, floor, functions = authority.SPECS[service_name]
                service.write_text('export const ' + export + '=' + json.dumps(dict(floor, controlCatalog=4)) + ';' + ''.join('export function ' + name + '(){}' for name in functions))
                (package / 'index.js').write_text(
                    'export const CONTROL_GAME_IDS=' + json.dumps(ids) + ';'
                    'export const controlSnapshotSchema={parse(v){if(' + str(reject_snapshot).lower() + '||Object.keys(v.games).length!==CONTROL_GAME_IDS.length)throw Error();return v;}};'
                    'export const gameControlPolicySchema={parse(v){if(' + str(reject_policy).lower() + '||!CONTROL_GAME_IDS.includes(v.gameId))throw Error();return v;}};')
                if service_name == 'kart': (package / 'index.js').unlink()
                def execute(_image, script):
                    result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True)
                    if result.returncode: raise authority.AuthorityError('AUTHORITY_IMAGE_REQUIRED')
                    return result.stdout
                specs = dict(authority.SPECS)
                specs[service_name] = (service.as_uri(), export, floor, functions)
                with patch.object(authority, 'SPECS', specs), patch.object(authority, 'owned_probe_output', side_effect=execute):
                    return authority.image_capability(service_name, IMAGE, control_catalog=catalog)
            ids = list(authority.CONTROL_GAMES)
            for service_name in ('runtime', 'management'):
                self.assertEqual(run(service_name, ids)['controlCatalog'], 4)
                self.assertEqual(run(service_name, ids[:-1], catalog=3)['controlCatalog'], 3)
                for bad in (ids[:-1], ids + ['unknown'], ids[:-1] + [ids[0]], ids[:-1] + ['unknown']):
                    with self.subTest(service=service_name, ids=bad), self.assertRaises(authority.AuthorityError):
                        run(service_name, bad)
                for reject_snapshot, reject_policy in ((True, False), (False, True)):
                    with self.assertRaises(authority.AuthorityError):
                        run(service_name, ids, reject_snapshot, reject_policy)
            self.assertNotIn('controlCatalog', run('kart', [], True, True))

    def test_catalog_output_is_exact_and_never_a_version_floor(self):
        for value in (None, 3, 5, True, '4'):
            output = {'control': 1, 'authenticatedGameScope': 1}
            if value is not None: output['controlCatalog'] = value
            with patch.object(authority, 'owned_probe_output', return_value=json.dumps(output).encode()):
                with self.assertRaises(authority.AuthorityError):
                    authority.image_capability('runtime', IMAGE)

    def run_probe(self, fixture):
        with patch.object(authority.uuid, 'uuid4', return_value=TOKEN), patch.object(authority, 'docker', side_effect=fixture):
            return authority.owned_probe_output(IMAGE, 'reviewed-script')

    def test_success_isolated_create_attach_and_owned_id_cleanup(self):
        fixture = DockerFixture()
        self.assertIn(b'control', self.run_probe(fixture))
        create = next(args for args, _ in fixture.calls if args[0] == 'create')
        for key, value in [('name', NAME), ('label', authority.LABEL + '=' + str(TOKEN)),
                           ('network', 'none'), ('memory', '256m'), ('memory-swap', '256m'),
                           ('pids-limit', '32'), ('cpus', '0.5'), ('user', 'node'), ('entrypoint', 'node')]:
            self.assertEqual(create[create.index('--' + key) + 1], value)
        for flag in ['--read-only', '--cap-drop', '--no-healthcheck', '--pull=never']:
            self.assertIn(flag, create)
        self.assertFalse(any(arg in create for arg in ['--env', '--env-file', '--mount', '--volume', '--publish']))
        self.assertEqual([args for args, _ in fixture.calls if args[0] == 'rm'], [('rm', '-f', ID)])
        self.assertEqual(next(opts['timeout'] for args, opts in fixture.calls if args[0] == 'start'), 15)

    def test_image_projection_keeps_empty_volumes_and_rejects_other_metadata_before_create(self):
        for volumes in (None, {}):
            fixture = DockerFixture()
            with self.subTest(volumes=volumes):
                def docker(*args, **options):
                    if args[:2] == ('image', 'inspect'):
                        return json.dumps({'id': IMAGE, 'volumes': volumes}).encode()
                    return fixture(*args, **options)
                with patch.object(authority.uuid, 'uuid4', return_value=TOKEN), patch.object(authority, 'docker', side_effect=docker):
                    self.assertIn(b'control', authority.owned_probe_output(IMAGE, 'reviewed-script'))
        for metadata in ({'id': IMAGE, 'volumes': {'/data': {}}},
                         {'id': IMAGE}, {'id': IMAGE, 'volumes': []},
                         {'id': IMAGE, 'volumes': None, 'env': 'PRIVATE_CANARY'},
                         {'id': 'sha256:' + 'c' * 64, 'volumes': None}):
            fixture = DockerFixture()
            def docker(*args, **options):
                if args[:2] == ('image', 'inspect'):
                    return json.dumps(metadata).encode()
                return fixture(*args, **options)
            with self.subTest(metadata=metadata), patch.object(authority, 'docker', side_effect=docker):
                with self.assertRaisesRegex(authority.AuthorityError, '^AUTHORITY_IMAGE_REQUIRED$'):
                    authority.owned_probe_output(IMAGE, 'reviewed-script')
            self.assertEqual(fixture.calls, [])

    def test_image_metadata_command_failure_is_not_retried_or_used_to_create(self):
        for code in ('AUTHORITY_PROBE_COMMAND_FAILED', 'AUTHORITY_PROBE_COMMAND_CLEANUP_FAILED'):
            error = authority.AuthorityError(code)
            with self.subTest(code=code), patch.object(authority, 'docker', side_effect=error) as docker:
                with self.assertRaises(authority.AuthorityError) as caught:
                    authority.owned_probe_output(IMAGE, 'reviewed-script')
                self.assertIs(caught.exception, error)
            docker.assert_called_once_with('image', 'inspect', IMAGE, '--format', authority.IMAGE_PROJECTION)

    def test_start_timeout_removes_only_verified_id(self):
        fixture = DockerFixture(start_failure=True)
        with self.assertRaisesRegex(authority.AuthorityError, '^AUTHORITY_PROBE_COMMAND_FAILED$'):
            self.run_probe(fixture)
        self.assertIn((('rm', '-f', ID), {'timeout': 5}), fixture.calls)

    def test_lost_create_response_recovers_by_three_filters_then_cleans_id(self):
        fixture = DockerFixture(create_lost=True)
        with self.assertRaisesRegex(authority.AuthorityError, '^AUTHORITY_PROBE_COMMAND_FAILED$'):
            self.run_probe(fixture)
        lookup = next(args for args, _ in fixture.calls if args[0] == 'ps')
        self.assertIn('label=' + authority.LABEL + '=' + str(TOKEN), lookup)
        self.assertIn('name=^/' + NAME + '$', lookup)
        self.assertIn('ancestor=' + IMAGE, lookup)
        self.assertIn((('rm', '-f', ID), {'timeout': 5}), fixture.calls)
        self.assertFalse(any(args[0] == 'start' for args, _ in fixture.calls))

    def test_foreign_create_id_is_never_removed(self):
        fixture = DockerFixture(create_id='c' * 64)
        with self.assertRaisesRegex(authority.AuthorityError, '^AUTHORITY_PROBE_OWNER_MISMATCH$'):
            self.run_probe(fixture)
        self.assertEqual([args for args, _ in fixture.calls if args[0] == 'rm'], [('rm', '-f', ID)])

    def test_uncertain_recovery_never_removes_candidates(self):
        for recovered in ['', ID + '\n' + 'c' * 64, 'short', 'c' * 64]:
            fixture = DockerFixture(create_lost=True, recovered=recovered)
            with self.subTest(recovered=recovered), self.assertRaisesRegex(
                    authority.AuthorityError, '^AUTHORITY_PROBE_RECOVERY_REQUIRED$') as caught:
                self.run_probe(fixture)
            self.assertEqual(caught.exception.probeUUID, str(TOKEN))
            self.assertFalse(any(args[0] == 'rm' for args, _ in fixture.calls))

    def test_cleanup_failure_keeps_owned_id_and_is_not_hidden_by_start_timeout(self):
        for mode in ['inspect', 'rm', 'owner', 'signal']:
            fixture = DockerFixture(start_failure=True, cleanup_failure=mode)
            code = 'AUTHORITY_PROBE_OWNER_MISMATCH' if mode == 'owner' else 'AUTHORITY_PROBE_CLEANUP_FAILED'
            with self.subTest(mode=mode), self.assertRaisesRegex(authority.AuthorityError, '^' + code + '$') as caught:
                self.run_probe(fixture)
            self.assertEqual(caught.exception.ownedContainerId, ID)
            if mode == 'signal':
                self.assertEqual(caught.exception.originalCode, 'AUTHORITY_PROBE_COMMAND_FAILED')
            if mode not in ('rm', 'signal'):
                self.assertFalse(any(args[0] == 'rm' for args, _ in fixture.calls))

    def test_bad_boundary_is_cleaned_before_any_start(self):
        for boundary in [{'network': 'host'}, {'readOnly': False}, {'pids': 0}, {'memory': 0},
                         {'nanoCpus': 0}, {'capDrop': []}, {'health': None}, {'ports': {'80': []}}]:
            fixture = DockerFixture(boundary=boundary)
            with self.subTest(boundary=boundary), self.assertRaisesRegex(authority.AuthorityError, 'BOUNDARY'):
                self.run_probe(fixture)
            self.assertFalse(any(args[0] == 'start' for args, _ in fixture.calls))
            self.assertIn((('rm', '-f', ID), {'timeout': 5}), fixture.calls)

    def test_fixed_modules_integer_versions_and_function_shapes(self):
        for service, (module, export, floor, functions) in authority.SPECS.items():
            versions = dict(floor, **({'controlCatalog': 4} if service != 'kart' else {}))
            with patch.object(authority, 'owned_probe_output', return_value=json.dumps(versions).encode()) as probe:
                self.assertEqual(authority.image_capability(service, IMAGE), {'image': IMAGE, **versions})
            script = probe.call_args.args[1]
            self.assertIn(module, script)
            self.assertIn(export, script)
            self.assertIn('typeof m[key]!=="function"', script)
            for function in functions:
                self.assertIn(function, script)
            self.assertNotIn('process.env', script)
            self.assertNotIn('/main.', script)
        for output in [b'{"control":true,"authenticatedGameScope":1}', b'{"control":0,"authenticatedGameScope":1}',
                       b'{"control":1}', b'{"control":1,"authenticatedGameScope":1,"secret":"CANARY"}', b'noise\n{}']:
            with patch.object(authority, 'owned_probe_output', return_value=output):
                with self.assertRaisesRegex(authority.AuthorityError, '^AUTHORITY_FALLBACK_REQUIRED$'):
                    authority.require_images({'runtime': IMAGE}, 'AUTHORITY_FALLBACK_REQUIRED')

    def test_kart_rejects_old_unscoped_identity_protocol(self):
        with patch.object(authority, 'owned_probe_output', return_value=b'{"control":1,"identityRecheck":1}'):
            with self.assertRaisesRegex(authority.AuthorityError, '^AUTHORITY_FALLBACK_REQUIRED$'):
                authority.require_images({'kart': IMAGE}, 'AUTHORITY_FALLBACK_REQUIRED')

    def test_cleanup_error_attributes_survive_floor_wrapper(self):
        error = authority.AuthorityError('AUTHORITY_PROBE_CLEANUP_FAILED', ID, str(TOKEN), NAME)
        with patch.object(authority, 'image_capability', side_effect=error):
            with self.assertRaises(authority.AuthorityError) as caught:
                authority.require_images({'runtime': IMAGE}, 'AUTHORITY_FALLBACK_REQUIRED')
            self.assertIs(caught.exception, error)

    def test_subprocess_diagnostics_are_discarded_and_timeout_kills_only_cli(self):
        child = MagicMock()
        child.__enter__.return_value = child
        child.communicate.side_effect = [subprocess.TimeoutExpired('docker', 1), (b'', None)]
        with patch.object(authority.subprocess, 'Popen', return_value=child) as spawn:
            with self.assertRaisesRegex(authority.AuthorityError, '^AUTHORITY_PROBE_COMMAND_FAILED$'):
                authority.docker('start', '--attach', ID, timeout=1)
        child.kill.assert_called_once_with()
        self.assertIs(spawn.call_args.kwargs['stderr'], subprocess.DEVNULL)
        self.assertEqual(child.communicate.call_args_list[-1].kwargs, {'timeout': 5})
        child.__exit__.assert_not_called()

    def test_signal_is_reraised_after_bounded_cli_cleanup(self):
        original = RuntimeError('SIGNAL_INTERRUPTED')
        child = MagicMock(pid=1234)
        child.communicate.side_effect = [original, (b'', None)]
        with patch.object(authority.subprocess, 'Popen', return_value=child):
            with self.assertRaises(RuntimeError) as caught:
                authority.docker('start', '--attach', ID)
        self.assertIs(caught.exception, original)
        child.kill.assert_called_once_with()
        self.assertEqual(child.communicate.call_args_list[-1].kwargs, {'timeout': 5})
        child.__exit__.assert_not_called()

    def test_cli_cleanup_refusal_or_timeout_is_explicit(self):
        for refusal in ['kill', 'wait']:
            child = MagicMock(pid=1234)
            original = RuntimeError('SIGNAL_INTERRUPTED')
            child.communicate.side_effect = [original, (b'', None)]
            if refusal == 'kill':
                child.kill.side_effect = PermissionError('PRIVATE_CANARY')
            else:
                child.communicate.side_effect = [original, subprocess.TimeoutExpired('docker', 5)]
            with self.subTest(refusal=refusal), patch.object(authority.subprocess, 'Popen', return_value=child):
                with self.assertRaisesRegex(authority.AuthorityError, '^AUTHORITY_PROBE_COMMAND_CLEANUP_FAILED$') as caught:
                    authority.docker('start', '--attach', ID)
                self.assertEqual(caught.exception.probeProcessId, 1234)
                self.assertEqual(caught.exception.originalCode, 'SIGNAL_INTERRUPTED')
                self.assertNotIn('PRIVATE_CANARY', str(caught.exception))

    def test_unknown_uppercase_errors_and_invalid_pid_are_not_diagnostics(self):
        child = MagicMock(pid=-1)
        child.communicate.side_effect = [RuntimeError('PRIVATE_CANARY'), subprocess.TimeoutExpired('docker', 5)]
        with patch.object(authority.subprocess, 'Popen', return_value=child):
            with self.assertRaises(authority.AuthorityError) as caught:
                authority.docker('start', '--attach', ID)
        self.assertEqual(caught.exception.originalCode, 'UNEXPECTED_FAILURE')
        self.assertIsNone(caught.exception.probeProcessId)


if __name__ == '__main__':
    unittest.main()
