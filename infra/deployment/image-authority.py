"""Finite image authority probes. Importing this module performs no I/O."""
import json
import re
import subprocess
import uuid


SPECS = {
    'runtime': ('file:///app/services/runtime-api/dist/competition/auth.js',
                'COMPETITION_AUTHORITY_PROTOCOL', {'control': 1, 'ephemeralGuestScope': 1},
                ('authenticate', 'assertGameScope', 'assertResourceAuth', 'assertStoredPlayerGame')),
    'kart': ('file:///app/services/kart-server/src/competition.ts',
             'KART_AUTHORITY_PROTOCOL', {'control': 1, 'identityRecheck': 1}, ('createCompetition',)),
    'management': ('file:///app/services/management-api/dist/admin/rbac-protocol.js',
                   'ADMIN_RBAC_PROTOCOL', {'control': 1, 'dbMemberRecheck': 1},
                   ('readAdminControlFlag', 'readAdminRbacPrincipal')),
}
IMAGE_ID = r'sha256:[a-f0-9]{64}'
CONTAINER_ID = r'[a-f0-9]{64}'
LABEL = 'io.small-games.image-authority'
ACTION_ERRORS = frozenset(('AUTHORITY_PROBE_OWNER_MISMATCH',
                           'AUTHORITY_PROBE_RECOVERY_REQUIRED', 'AUTHORITY_PROBE_CLEANUP_FAILED',
                           'AUTHORITY_PROBE_COMMAND_CLEANUP_FAILED'))
ERROR_CODES = ACTION_ERRORS | frozenset(('SIGNAL_INTERRUPTED', 'AUTHORITY_IMAGE_REQUIRED',
                                        'AUTHORITY_FALLBACK_REQUIRED', 'AUTHORITY_PROBE_COMMAND_FAILED',
                                        'AUTHORITY_PROBE_BOUNDARY', 'AUTHORITY_PROBE_CREATE_FAILED',
                                        'UNEXPECTED_FAILURE'))
PROJECTION = ('{"id":{{json .Id}},"image":{{json .Image}},"name":{{json .Name}},'
              '"uuid":{{json (index .Config.Labels "io.small-games.image-authority")}},'
              '"network":{{json .HostConfig.NetworkMode}},"readOnly":{{json .HostConfig.ReadonlyRootfs}},'
              '"memory":{{json .HostConfig.Memory}},"memorySwap":{{json .HostConfig.MemorySwap}},'
              '"pids":{{json .HostConfig.PidsLimit}},"nanoCpus":{{json .HostConfig.NanoCpus}},'
              '"capDrop":{{json .HostConfig.CapDrop}},"capAdd":{{json .HostConfig.CapAdd}},'
              '"securityOpt":{{json .HostConfig.SecurityOpt}},"user":{{json .Config.User}},'
              '"privileged":{{json .HostConfig.Privileged}},"mounts":{{json .Mounts}},'
              '"ports":{{json .HostConfig.PortBindings}},"health":{{json .Config.Healthcheck}}}')


class AuthorityError(Exception):
    def __init__(self, code, owned_id=None, probe_uuid=None, probe_name=None):
        super().__init__(code)
        self.code = code
        self.ownedContainerId = owned_id
        self.probeUUID = probe_uuid
        self.probeName = probe_name


def original_code(error):
    value = getattr(error, 'originalCode', str(error))
    return value if isinstance(value, str) and value in ERROR_CODES else 'UNEXPECTED_FAILURE'


def require(condition, code):
    if not condition:
        raise AuthorityError(code)


def docker(*args, timeout=10):
    # Only bounded successful output is accepted. Never forward Docker diagnostics.
    try:
        child = subprocess.Popen(('docker',) + args, stdout=subprocess.PIPE,
                                 stderr=subprocess.DEVNULL)
    except OSError:
        raise AuthorityError('AUTHORITY_PROBE_COMMAND_FAILED') from None
    try:
        output, _ = child.communicate(timeout=timeout)
    except BaseException as original:
        cleanup_error = None
        try:
            child.kill()
        except BaseException as error:
            cleanup_error = error
        try:
            child.communicate(timeout=5)
        except BaseException as error:
            cleanup_error = error
        if cleanup_error is not None:
            failure = AuthorityError('AUTHORITY_PROBE_COMMAND_CLEANUP_FAILED')
            failure.probeProcessId = child.pid if type(child.pid) is int and 0 < child.pid <= 2147483647 else None
            failure.originalCode = original_code(original)
            raise failure from cleanup_error
        if isinstance(original, subprocess.TimeoutExpired):
            raise AuthorityError('AUTHORITY_PROBE_COMMAND_FAILED') from None
        raise
    require(child.returncode == 0 and len(output) <= 16384, 'AUTHORITY_PROBE_COMMAND_FAILED')
    return output


def owned_probe_output(image, script):
    require(isinstance(image, str) and re.fullmatch(IMAGE_ID, image), 'AUTHORITY_IMAGE_REQUIRED')
    metadata = json.loads(docker('image', 'inspect', image, '--format',
                               '{"id":{{json .Id}},"volumes":{{json .Config.Volumes}}}'))
    require(metadata == {'id': image, 'volumes': None}
            or metadata == {'id': image, 'volumes': {}}, 'AUTHORITY_IMAGE_REQUIRED')
    token = uuid.uuid4()
    label, name = str(token), 'small-games-authority-' + token.hex
    owned_id, attempted, pending_error = None, False, None

    def failure(code, cause=None):
        error = AuthorityError(code, owned_id, label, name)
        source = cause if getattr(cause, 'probeProcessId', None) else pending_error
        if source is None:
            source = cause
        if source is not None:
            error.probeProcessId = getattr(source, 'probeProcessId', None)
            error.originalCode = original_code(source)
        return error

    def inspect(container_id):
        value = json.loads(docker('inspect', '--format', PROJECTION, container_id, timeout=5))
        require(isinstance(value, dict), 'AUTHORITY_PROBE_BOUNDARY')
        return value

    def belongs(value, container_id):
        return (value.get('id') == container_id and value.get('image') == image
                and value.get('name') == '/' + name and value.get('uuid') == label)

    def recover():
        output = docker('ps', '--all', '--quiet', '--no-trunc',
                        '--filter', 'label=' + LABEL + '=' + label,
                        '--filter', 'name=^/' + name + '$',
                        '--filter', 'ancestor=' + image, timeout=5)
        ids = output.decode('ascii').splitlines()
        if not ids:
            return None
        if (len(ids) != 1 or not re.fullmatch(CONTAINER_ID, ids[0])
                or not belongs(inspect(ids[0]), ids[0])):
            raise failure('AUTHORITY_PROBE_RECOVERY_REQUIRED')
        return ids[0]

    try:
        attempted = True
        output = docker('create', '--pull=never', '--name', name,
                        '--label', LABEL + '=' + label, '--network', 'none', '--read-only',
                        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                        '--memory', '256m', '--memory-swap', '256m', '--pids-limit', '32',
                        '--cpus', '0.5', '--no-healthcheck', '--user', 'node',
                        '--entrypoint', 'node', image, '--input-type=module', '-e', script)
        candidate = output.decode('ascii').strip()
        require(re.fullmatch(CONTAINER_ID, candidate), 'AUTHORITY_PROBE_CREATE_FAILED')
        value = inspect(candidate)
        if not belongs(value, candidate):
            raise failure('AUTHORITY_PROBE_OWNER_MISMATCH')
        owned_id = candidate
        require(value.get('network') == 'none' and value.get('readOnly') is True
                and value.get('memory') == 268435456 and value.get('memorySwap') == 268435456
                and value.get('pids') == 32 and value.get('nanoCpus') == 500000000
                and value.get('capDrop') == ['ALL'] and value.get('capAdd') in (None, [])
                and value.get('securityOpt') in (['no-new-privileges:true'], ['no-new-privileges'])
                and value.get('user') == 'node' and value.get('privileged') is False
                and value.get('mounts') == [] and value.get('ports') in (None, {})
                and value.get('health') == {'Test': ['NONE']}, 'AUTHORITY_PROBE_BOUNDARY')
        return docker('start', '--attach', owned_id, timeout=15)
    except BaseException as error:
        pending_error = error
        raise
    finally:
        if attempted:
            try:
                if owned_id is None:
                    owned_id = recover()
                    if owned_id is None:
                        raise failure('AUTHORITY_PROBE_RECOVERY_REQUIRED')
                if not belongs(inspect(owned_id), owned_id):
                    raise failure('AUTHORITY_PROBE_OWNER_MISMATCH')
                docker('rm', '-f', owned_id, timeout=5)
            except AuthorityError as error:
                code = error.code if error.code in ACTION_ERRORS else 'AUTHORITY_PROBE_CLEANUP_FAILED'
                raise failure(code, error) from error
            except Exception as error:
                raise failure('AUTHORITY_PROBE_CLEANUP_FAILED', error) from error


def image_capability(service, image):
    require(service in SPECS, 'AUTHORITY_IMAGE_REQUIRED')
    module, export, floor, functions = SPECS[service]
    script = ('try {'
              'const m=await import(' + json.dumps(module) + ');'
              'const p=m[' + json.dumps(export) + '];'
              'const floor=' + json.dumps(floor) + ';'
              'const functions=' + json.dumps(functions) + ';'
              'if(functions.some(key=>typeof m[key]!=="function"))throw new Error();'
              'const result={};'
              'for(const [key,min] of Object.entries(floor)){'
              'const version=p?.[key];'
              'if(!Number.isSafeInteger(version)||version<min)throw new Error();'
              'result[key]=version;}'
              'process.stdout.write(JSON.stringify(result));'
              '}catch{process.exitCode=78;}')
    output = owned_probe_output(image, script)
    require(len(output) <= 1024, 'AUTHORITY_IMAGE_REQUIRED')
    versions = json.loads(output)
    require(isinstance(versions, dict) and set(versions) == set(floor)
            and all(type(versions[key]) is int and floor[key] <= versions[key] <= 9007199254740991
                    for key in floor), 'AUTHORITY_IMAGE_REQUIRED')
    return {'image': image, **versions}


def require_images(images, failure='AUTHORITY_IMAGE_REQUIRED'):
    require(isinstance(images, dict) and images and set(images) <= set(SPECS), failure)
    try:
        return {name: image_capability(name, image) for name, image in images.items()}
    except AuthorityError as error:
        if error.code in ACTION_ERRORS:
            raise
        raise AuthorityError(failure) from None
    except (ValueError, TypeError, KeyError, UnicodeError):
        raise AuthorityError(failure) from None
