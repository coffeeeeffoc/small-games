"""Updates of selected existing services, with optional private platform credentials."""
import contextlib
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time

ROOT = Path('/opt/small-games')
BASE = ROOT / 'backend-updates'
PRIVATE = ROOT / 'backend-private'
ALLOWED = ('runtime', 'kart', 'tianxia')
PORTS = {'runtime': 43002, 'kart': 43003, 'tianxia': 43004}
STAGE = 'preflight'
PUBLIC_ENV = {
    'runtime': {'COMPETITION_CONTROL_ENABLED': 'true',
                'COMPETITION_CONTROL_INSTANCE_ID': 'small-games-runtime'},
    'kart': {'COMPETITION_CONTROL_ENABLED': 'true',
             'COMPETITION_CONTROL_INSTANCE_ID': 'small-games-kart'},
}
IMAGE_ID = r'sha256:[a-f0-9]{64}'
IMAGE_AUTHORITY = None


class Stopped(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.stage = STAGE


def require(condition, code):
    if not condition:
        raise Stopped(code)


def stage(name):
    global STAGE
    STAGE = name
    print('BACKEND_REMOTE_STAGE ' + name, file=sys.stderr, flush=True)


def authority_module():
    global IMAGE_AUTHORITY
    if IMAGE_AUTHORITY is None:
        file = Path(__file__).with_name('image-authority.py')
        if not file.is_file():
            file = Path(__file__).resolve().parents[1] / 'deployment/image-authority.py'
        spec = importlib.util.spec_from_file_location('image_authority', file)
        IMAGE_AUTHORITY = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(IMAGE_AUTHORITY)
    return IMAGE_AUTHORITY


def require_authority(images, failure='AUTHORITY_IMAGE_REQUIRED'):
    targets = {name: image for name, image in images.items() if name in PUBLIC_ENV}
    if not targets:
        return {}
    if 'kart' in targets and 'runtime' not in targets:
        targets['runtime'] = inventory('small-games', 'runtime')['image']
    authority = authority_module()
    try:
        proof = authority.require_images(targets, failure)
    except authority.AuthorityError as error:
        stopped = Stopped(error.code)
        for key in ('ownedContainerId', 'probeUUID', 'probeName'):
            setattr(stopped, key, getattr(error, key, None))
        pid = getattr(error, 'probeProcessId', None)
        stopped.probeProcessId = pid if type(pid) is int and 0 < pid <= 2147483647 else None
        stopped.originalCode = authority.original_code(error)
        raise stopped from None
    return {name: value for name, value in proof.items() if name in images}


def command(*args, input=None, timeout=180, output=None):
    try:
        result = subprocess.run(args, input=input, stdout=output or subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        raise Stopped('COMMAND_TIMEOUT') from None
    except (OSError, subprocess.SubprocessError):
        raise Stopped('COMMAND_FAILED') from None
    require(result.returncode == 0, 'COMMAND_FAILED')
    return result.stdout


def text(*args, **kwargs):
    return command(*args, **kwargs).decode().strip()


def inventory(project, name, optional=False):
    ids = text('docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project,
               '--filter', 'label=com.docker.compose.service=' + name).splitlines()
    require(len(ids) == 1 or (optional and not ids), 'SERVICE_INVENTORY')
    if not ids:
        return None
    projection = '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}},"networks":{{json .NetworkSettings.Networks}},"networkMode":{{json .HostConfig.NetworkMode}},"configFiles":{{json (index .Config.Labels "com.docker.compose.project.config_files")}},"workingDirectory":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}},"environmentFile":{{json (index .Config.Labels "com.docker.compose.project.environment_file")}},"configHash":{{json (index .Config.Labels "com.docker.compose.config-hash")}},"update":{{json (index .Config.Labels "io.small-games.backend-update")}}}'
    value = json.loads(command('docker', 'inspect', '--format', projection, ids[0]))
    value['networks'] = {key: {field: network.get(field) for field in
                         ['NetworkID', 'IPAddress', 'IPPrefixLen', 'Gateway', 'Aliases']}
                         for key, network in value['networks'].items()}
    return value


def checked_path(value, directory=False):
    require(isinstance(value, str) and value.startswith(str(ROOT) + '/'), 'COMPOSE_CONTEXT_UNRESOLVED')
    file = Path(value)
    require('..' not in file.parts and file.resolve(strict=True) == file
            and (file.is_dir() if directory else file.is_file()), 'COMPOSE_CONTEXT_UNRESOLVED')
    return file


def compose_context(item):
    # The original interpolation file is an explicit Compose label, never guessed or exported.
    require(isinstance(item['configFiles'], str) and item['configFiles'], 'COMPOSE_CONTEXT_UNRESOLVED')
    return {'files': [str(checked_path(value)) for value in item['configFiles'].split(',')],
            'working': str(checked_path(item['workingDirectory'], True)),
            'envfile': str(checked_path(item['environmentFile']))}


def compose(context, override, *args, input=None):
    files = [value for filename in context['files'] for value in ['-f', filename]]
    return command('docker', 'compose', '--project-name', 'small-games', '--project-directory',
                   context['working'], '--env-file', context['envfile'], *files,
                   *(['-f', str(override)] if override is not None else []), *args, input=input, timeout=240)


def private_directory(directory):
    if not directory.exists():
        directory.mkdir(mode=0o700)
    info = directory.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid()
            and stat.S_IMODE(info.st_mode) == 0o700, 'PRIVATE_DIRECTORY')


def write_private(file, data):
    fd = os.open(file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def private_json(file):
    info = file.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.geteuid()
            and stat.S_IMODE(info.st_mode) == 0o600, 'PRIVATE_FILE')
    return json.loads(file.read_bytes())


def manifest_from(release):
    require(release.parent == BASE / 'releases' and release.resolve() == release
            and re.fullmatch(r'[a-z0-9-]{1,100}', release.name), 'RELEASE_PATH')
    value = json.loads((release / 'manifest.json').read_bytes())
    require(value['version'] == 1 and value['release'] == release.name
            and re.fullmatch(r'[a-f0-9]{40}', value['sourceSHA'])
            and value['databaseMigrations'] is False, 'RELEASE_MANIFEST')
    require(set(value['files']) >= {'Dockerfile', 'deploy.py'}, 'RELEASE_MANIFEST')
    for name, digest in value['files'].items():
        file = release / name
        require(re.fullmatch(r'[A-Za-z0-9_./-]+', name) and '..' not in Path(name).parts
                and not Path(name).is_absolute() and file.resolve() == file and file.is_file()
                and not re.search(r'(^|/)\.env(\.|$)|\.(pem|key|sql)$', name, re.I), 'RELEASE_FILE')
        require(hashlib.sha256(file.read_bytes()).hexdigest() == digest, 'RELEASE_HASH')
    return value


def selected_inventory(services):
    selected = {name: inventory('small-games', name) for name in services}
    require(all(item['running'] for item in selected.values()), 'SERVICE_NOT_RUNNING')
    companions = []
    if 'runtime' in selected and 'kart' not in selected:
        kart = inventory('small-games', 'kart', optional=True)
        if kart:
            require(kart['networkMode'] == 'container:' + selected['runtime']['id'], 'KART_NAMESPACE')
            require(kart['running'], 'SERVICE_NOT_RUNNING')
            selected['kart'] = kart
            companions.append('kart')
    if 'runtime' in selected and 'kart' in selected:
        require(selected['kart']['networkMode'] == 'container:' + selected['runtime']['id'], 'KART_NAMESPACE')
    contexts = {name: compose_context(item) for name, item in selected.items()}
    for name, item in selected.items():
        value = compose(contexts[name], None, 'config', '--hash', name).decode().strip().split()
        if value != [name, item['configHash']] and name == 'kart' and item['networkMode'].startswith('container:'):
            declared = json.dumps({'services': {'kart': {'network_mode': 'service:runtime'}}}).encode()
            unchanged = compose(contexts[name], '-', 'config', '--hash', name, input=declared).decode().strip().split()
            require(unchanged == value, 'KART_NAMESPACE')
            runtime = selected.get('runtime') or inventory('small-games', 'runtime')
            require(item['networkMode'] == 'container:' + runtime['id'], 'KART_NAMESPACE')
            # Compose hashes the resolved namespace when creating the container.
            # Reproduce only that non-secret substitution; all environment input stays in Compose.
            namespace = json.dumps({'services': {'kart': {'network_mode': item['networkMode']}}}).encode()
            value = compose(contexts[name], '-', 'config', '--hash', name, input=namespace).decode().strip().split()
        require(value == [name, item['configHash']], 'COMPOSE_CONTEXT_CHANGED')
    return selected, companions, contexts


def protected_snapshot(touched, caddy):
    items = {}
    for project, name in [('small-games', 'postgres'), ('small-games', 'runtime'),
                          ('small-games', 'kart'), ('small-games', 'tianxia'),
                          ('small-games', 'management'), ('small-games', 'nginx'), ('company-web', 'web')]:
        if name in touched and project == 'small-games':
            continue
        value = inventory(project, name, optional=name in ('management', 'tianxia'))
        items[(project, name)] = value
    pointers = {file: str(file.resolve(strict=True)) if file.is_symlink() else None for file in
                [ROOT / 'current', ROOT / 'backend-current', caddy / 'current',
                 ROOT / 'company/current', ROOT / 'admin-console/current']}
    return items, pointers


def assert_protected(snapshot):
    items, pointers = snapshot
    require(all(inventory(project, name, optional=before is None) == before
                for (project, name), before in items.items()), 'PROTECTED_CONTAINER_CHANGED')
    require(all((str(file.resolve(strict=True)) if file.is_symlink() else None) == target
                for file, target in pointers.items()), 'PROTECTED_POINTER_CHANGED')


def schema_hash(pg):
    schema = command('docker', 'exec', pg, 'pg_dump', '-U', 'platform_owner', '-d', 'small_games', '--schema-only', timeout=180)
    roles = command('docker', 'exec', pg, 'pg_dumpall', '-U', 'platform_owner', '--roles-only', '--no-role-passwords')
    stable = lambda data: re.sub(rb'(?m)^\\(?:un)?restrict [A-Za-z0-9]+\r?\n', b'', data)
    return hashlib.sha256(stable(schema) + stable(roles)).hexdigest()


def backup(pg, directory):
    file = directory / 'database.dump'
    fd = os.open(file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        command('docker', 'exec', pg, 'pg_dump', '-U', 'platform_owner', '-d', 'small_games', '-Fc', timeout=600, output=stream)
    with file.open('rb') as stream:
        result = subprocess.run(['docker', 'exec', '-i', pg, 'pg_restore', '--list'], stdin=stream,
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=180, check=False)
    require(result.returncode == 0 and file.stat().st_size > 0, 'BACKUP_FAILED')
    with file.open('rb') as stream:
        digest = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
        return digest.hexdigest()


def guard_games(selected):
    if 'runtime' in selected:
        pg = inventory('small-games', 'postgres')['id']
        require(text('docker', 'exec', pg, 'psql', '-X', '-qAt', '-U', 'platform_owner', '-d', 'small_games',
                     '-v', 'ON_ERROR_STOP=1', '-c', "BEGIN TRANSACTION READ ONLY; SELECT count(*) FROM runtime.competition_rooms WHERE data->>'status' IN ('waiting','playing') AND expires_at>(extract(epoch from now())*1000)::bigint; COMMIT;") == '0', 'ACTIVE_GAME')
    if 'kart' in selected:
        command('docker', 'exec', selected['kart']['id'], 'node', '-e',
                "fetch('http://127.0.0.1:43003/health').then(r=>r.json()).then(v=>process.exit(v.rooms===0?0:1)).catch(()=>process.exit(1))")


def assert_public_environment(name, item):
    expected = json.dumps(PUBLIC_ENV[name])
    command('docker', 'exec', item['id'], 'node', '-e', 'const expected=' + expected + ';'
            'if(Object.entries(expected).some(([key,value])=>process.env[key]!==value))process.exit(1)', timeout=5)


def guard_control_schema():
    try:
        pg = inventory('small-games', 'postgres')['id']
        output = command('docker', 'exec', pg, 'psql', '-X', '-qAt', '-U', 'platform_owner',
                         '-d', 'small_games', '-v', 'ON_ERROR_STOP=1', '-c',
                         'BEGIN TRANSACTION READ ONLY; SELECT json_agg(version ORDER BY version) '
                         'FROM game_control.schema_version; COMMIT;', timeout=10)
        require(len(output) <= 64, 'AUTHORITY_FALLBACK_REQUIRED')
        versions = json.loads(output)
        require(isinstance(versions, list) and len(versions) == 1
                and type(versions[0]) is int and versions[0] == 4, 'AUTHORITY_FALLBACK_REQUIRED')
    except Stopped as error:
        if str(error) == 'SIGNAL_INTERRUPTED':
            raise
        raise Stopped('AUTHORITY_FALLBACK_REQUIRED') from None
    except (ValueError, TypeError, KeyError):
        raise Stopped('AUTHORITY_FALLBACK_REQUIRED') from None


def guard_authority_state(selected):
    touched = {name: item for name, item in selected.items() if name in PUBLIC_ENV}
    if not touched:
        return
    if 'runtime' not in touched:
        touched['runtime'] = inventory('small-games', 'runtime')
    try:
        for name, item in touched.items():
            require(item['running'], 'AUTHORITY_FALLBACK_REQUIRED')
            assert_public_environment(name, item)
        guard_control_schema()
    except Stopped as error:
        if str(error) == 'SIGNAL_INTERRUPTED':
            raise
        raise Stopped('AUTHORITY_FALLBACK_REQUIRED') from None


def override(file, images, labels):
    require(set(images) == set(labels), 'ROLLBACK_GUARD')
    services = {}
    for name, image in images.items():
        require(name in ALLOWED and isinstance(image, str) and re.fullmatch(IMAGE_ID, image), 'SERVICE_IMAGE')
        label = labels[name] or ''
        require(isinstance(label, str) and (label == '' or re.fullmatch(r'[a-z0-9-]{1,100}', label)), 'ROLLBACK_GUARD')
        services[name] = {'image': image, 'pull_policy': 'never',
                          'labels': {'io.small-games.backend-update': label}}
        if name in PUBLIC_ENV:
            services[name]['environment'] = dict(PUBLIC_ENV[name])
    write_private(file, (json.dumps({'services': services}) + '\n').encode())


def historical_rollback_labels(release, images):
    value = private_json(PRIVATE / release.name / 'rollback.json')
    require(isinstance(value, dict) and set(value) == {'services'}
            and isinstance(value['services'], dict) and set(value['services']) == set(images), 'ROLLBACK_GUARD')
    labels = {}
    for name, image in images.items():
        item = value['services'][name]
        require(isinstance(item, dict) and set(item) in (
            {'image', 'pull_policy', 'labels'}, {'image', 'pull_policy', 'labels', 'environment'})
            and item['image'] == image and item['pull_policy'] == 'never'
            and isinstance(item['labels'], dict)
            and set(item['labels']) == {'io.small-games.backend-update'}, 'ROLLBACK_GUARD')
        require('environment' not in item or item['environment'] == PUBLIC_ENV.get(name, {}), 'ROLLBACK_GUARD')
        labels[name] = item['labels']['io.small-games.backend-update']
    return labels


def platform_entry(value, games_required=True):
    require(isinstance(value, dict) and set(value) <= {'platform', 'appId', 'secret', 'games'}
            and set(value) >= {'platform', 'appId', 'secret'}, 'PLATFORM_CONFIG')
    require(value['platform'] in ('wechat', 'bilibili', 'douyin', 'kuaishou', 'taptap')
            and isinstance(value['appId'], str) and re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value['appId'])
            and isinstance(value['secret'], str) and re.fullmatch(r'[\x21-\x7e]{16,512}', value['secret']), 'PLATFORM_CONFIG')
    games = value.get('games')
    require((not games_required and 'games' not in value) or (isinstance(games, list) and 0 < len(games) <= 32
            and all(isinstance(game, str) and re.fullmatch(r'[a-zA-Z][a-zA-Z0-9-]{0,99}', game) for game in games)
            and len(set(games)) == len(games)), 'PLATFORM_CONFIG')
    return value


def read_platform_config(item):
    data = command('docker', 'exec', item['id'], 'node', '-e',
                   "process.stdout.write(process.env.COMPETITION_PLATFORM_CONFIG || '[]')", timeout=10)
    require(len(data) <= 65536, 'PLATFORM_CONFIG')
    try:
        value = json.loads(data)
    except (ValueError, TypeError):
        raise Stopped('PLATFORM_CONFIG') from None
    require(isinstance(value, list), 'PLATFORM_CONFIG')
    keys = []
    for entry in value:
        platform_entry(entry, False)
        keys.append((entry['platform'], entry['appId']))
    require(len(keys) == len(set(keys)), 'PLATFORM_CONFIG')
    return value


def merge_platform_config(current, incoming):
    platform_entry(incoming)
    result, found = [], False
    for entry in current:
        if (entry['platform'], entry['appId']) == (incoming['platform'], incoming['appId']):
            result.append({**incoming, 'games': list(dict.fromkeys([*entry.get('games', []), *incoming['games']]))})
            found = True
        else:
            result.append(entry)
    if not found:
        result.append(incoming)
    for entry in result:
        platform_entry(entry, False)
    require(len(json.dumps(result).encode()) <= 65536, 'PLATFORM_CONFIG')
    return result


def validate_platform_config(item, config):
    # Use the deployed Runtime's actual enum/schema before stopping any service.
    script = ("import {platformConfigSchema} from '/app/services/runtime-api/dist/competition/platform-login.js';"
              "let body='';for await(const chunk of process.stdin)body+=chunk;"
              "try{if(!platformConfigSchema.safeParse(JSON.parse(body)).success)process.exit(1)}catch{process.exit(1)}")
    command('docker', 'exec', '-i', item['id'], 'node', '--input-type=module', '-e', script,
            input=json.dumps(config).encode(), timeout=10)


def platform_override(file, config):
    # Compose interpolation must not interpret dollar signs in a platform credential.
    value = json.dumps(config).replace('$', '$$')
    body = json.dumps({'services': {'runtime': {'environment': {'COMPETITION_PLATFORM_CONFIG': value}}}}).encode()
    write_private(file, body)
    return hashlib.sha256(body).hexdigest()


def platform_rollback_contexts(release, journal, contexts):
    file = PRIVATE / release.name / 'platform-login.json'
    digest = journal.get('platformConfigSHA256')
    if digest is None:
        require(all(str(file) not in context.get('files', []) for context in contexts.values()), 'ROLLBACK_GUARD')
        return contexts
    require(isinstance(digest, str) and re.fullmatch(r'[a-f0-9]{64}', digest), 'ROLLBACK_GUARD')
    value = private_json(file)
    require(hashlib.sha256(file.read_bytes()).hexdigest() == digest
            and isinstance(value, dict) and set(value) == {'services'}
            and isinstance(value['services'], dict) and set(value['services']) == {'runtime'}
            and isinstance(value['services']['runtime'], dict) and set(value['services']['runtime']) == {'environment'}, 'ROLLBACK_GUARD')
    env = value['services']['runtime']['environment']
    require(isinstance(env, dict) and set(env) == {'COMPETITION_PLATFORM_CONFIG'}
            and isinstance(env['COMPETITION_PLATFORM_CONFIG'], str), 'ROLLBACK_GUARD')
    require(all(context['files'].count(str(file)) == 1 for context in contexts.values()), 'ROLLBACK_GUARD')
    # Remove only this verified configuration revision from the live context, never replay history.
    return {name: {**context, 'files': [item for item in context['files'] if item != str(file)]}
            for name, context in contexts.items()}


def recreate(contexts, override_file, names):
    for name in ['runtime', 'kart', 'tianxia']:
        if name in names:
            context, active_override = contexts[name], override_file
            if name == 'kart':
                runtime = inventory('small-games', 'runtime')
                require(runtime['running'] and re.fullmatch(r'[a-f0-9]{64}', runtime['id']), 'KART_NAMESPACE')
                # Adoption pins a container ID; every update and restore must bind the current Runtime.
                active_override = override_file.with_name('kart-network-' + os.urandom(6).hex() + '.json')
                namespace = {'services': {'kart': {'network_mode': 'container:' + runtime['id']}}}
                write_private(active_override, (json.dumps(namespace) + '\n').encode())
                context = {**context, 'files': [*context['files'], str(override_file)]}
            compose(context, active_override, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never',
                    '--force-recreate', '--wait', '--wait-timeout', '180', name)


def health(names, images):
    current = {name: inventory('small-games', name) for name in names}
    for name, item in current.items():
        require(item['running'] and item['image'] == images[name], 'SERVICE_IMAGE')
        if name in PUBLIC_ENV:
            assert_public_environment(name, item)
        command('docker', 'exec', item['id'], 'node', '-e',
                "fetch('http://127.0.0.1:" + str(PORTS[name]) + "/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))", timeout=10)
    if 'runtime' in current and 'kart' in current:
        require(current['kart']['networkMode'] == 'container:' + current['runtime']['id'], 'KART_NAMESPACE')
    if 'runtime' in current:
        deadline = time.monotonic() + 40
        while True:
            connection = http.client.HTTPSConnection('api.nenggongzhiren.cn', timeout=5)
            try:
                connection.request('GET', '/health')
                response = connection.getresponse()
                body = response.read(2048)
                require(response.status == 200 and json.loads(body) == {'service': 'runtime', 'status': 'ok'}, 'HTTPS_PROBE')
                break
            except (Stopped, OSError, http.client.HTTPException, ValueError):
                require(time.monotonic() < deadline, 'HTTPS_PROBE')
                time.sleep(1)
            finally:
                connection.close()
    return current


def assert_boundaries(before, after):
    for name, item in after.items():
        require(item['ports'] == before[name]['ports'] and item['mounts'] == before[name]['mounts']
                and set(item['networks']) == set(before[name]['networks']), 'SERVICE_BOUNDARY')
        if name != 'kart' or 'runtime' not in before:
            require(item['networkMode'] == before[name]['networkMode'], 'SERVICE_BOUNDARY')


def restore(journal, rollback_file):
    require_authority(journal['oldImages'], 'AUTHORITY_FALLBACK_REQUIRED')
    if set(journal['oldImages']) & set(PUBLIC_ENV):
        guard_control_schema()
    stage('rollback')
    # A stopped Kart must release its old Runtime namespace before Runtime recreation.
    if 'runtime' in journal['selected'] and 'kart' in journal['selected']:
        kart = inventory('small-games', 'kart', optional=True)
        if kart:
            command('docker', 'stop', '--time', '30', kart['id'])
            command('docker', 'rm', kart['id'])
    recreate(journal['contexts'], rollback_file, journal['selected'])
    return health(journal['selected'], journal['oldImages'])


def receipt(manifest, mode, companions, active, capabilities, backup_hash=None):
    images = {name: item['image'] for name, item in active.items()}
    require(set(capabilities) == set(images) & set(PUBLIC_ENV)
            and all(proof.get('image') == images[name] for name, proof in capabilities.items()), 'SERVICE_IMAGE')
    return {'ok': True, 'mode': mode, 'sourceSHA': manifest['sourceSHA'], 'release': manifest['release'],
            'services': manifest['services'], 'recreateCompanions': companions, 'healthVerified': True,
            'databaseReplaced': False, 'schemaChanged': False, 'backupCreated': backup_hash is not None,
            'backupSHA256': backup_hash, 'isolatedRestoreVerified': False,
            'activeImages': images, 'imageCapabilities': capabilities}


def execute(release, manifest, config, selected, companions, contexts, protection):
    stage('context_guard')
    old_images = {name: item['image'] for name, item in selected.items()}
    # Ordinary deployment requires a compatible recovery image before any mutation.
    require_authority(old_images, 'AUTHORITY_FALLBACK_REQUIRED')
    guard_authority_state(selected)
    previous_platform = merged_platform = None
    if 'platformConfig' in config:
        previous_platform = read_platform_config(selected['runtime'])
        merged_platform = merge_platform_config(previous_platform, config['platformConfig'])
        validate_platform_config(selected['runtime'], merged_platform)
    revision = PRIVATE / release.name
    private_directory(PRIVATE)
    private_directory(revision)
    for image in old_images.values():
        require(text('docker', 'image', 'inspect', image, '--format', '{{.Id}}') == image, 'ROLLBACK_IMAGE')
    image = 'small-games-backend-update:' + release.name
    stage('image_build')
    command('docker', 'build', '--pull=false', '-t', image, str(release), timeout=1200)
    new_id = text('docker', 'image', 'inspect', image, '--format', '{{.Id}}')
    images = {name: new_id if name in manifest['services'] else item['image'] for name, item in selected.items()}
    capabilities = require_authority(images)
    active_contexts = contexts
    platform_digest = None
    if merged_platform is not None:
        platform_file = revision / 'platform-login.json'
        platform_digest = platform_override(platform_file, merged_platform)
        active_contexts = {name: {**context, 'files': [*context['files'], str(platform_file)]}
                           for name, context in contexts.items()}
    update_file, rollback_file = revision / 'update.json', revision / 'rollback.json'
    override(update_file, images, {name: release.name for name in selected})
    override(rollback_file, old_images, {name: item['update'] for name, item in selected.items()})
    for name in contexts:
        compose(active_contexts[name], update_file, 'config', '--quiet')
        compose(contexts[name], rollback_file, 'config', '--quiet')
    guard_games(selected)
    pg = inventory('small-games', 'postgres')['id'] if 'runtime' in selected else None
    old_schema = schema_hash(pg) if pg else None
    stage('database_backup')
    backup_hash = backup(pg, revision) if pg else None
    journal = {'selected': list(selected), 'contexts': contexts, 'oldImages': old_images,
               'images': images, 'schemaHash': old_schema, 'backupSHA256': backup_hash,
               'sourceSHA': manifest['sourceSHA'], 'release': release.name, 'companions': companions}
    if platform_digest:
        journal['platformConfigSHA256'] = platform_digest
    write_private(revision / 'journal.json', json.dumps(journal).encode())
    # The backup may take time; refuse an update if a game started meanwhile.
    guard_games(selected)
    try:
        stage('service_stop')
        for name in ['kart', 'runtime', 'tianxia']:
            if name in selected:
                command('docker', 'stop', '--time', '30', selected[name]['id'])
        if 'runtime' in selected and 'kart' in selected:
            command('docker', 'rm', selected['kart']['id'])
        stage('service_start')
        recreate(active_contexts, update_file, selected)
        stage('https_probe')
        active = health(selected, images)
        if merged_platform is not None:
            require(read_platform_config(active['runtime']) == merged_platform, 'PLATFORM_CONFIG')
        assert_boundaries(selected, active)
        require(not pg or schema_hash(pg) == old_schema, 'SCHEMA_CHANGED')
        assert_protected(protection)
    except Exception:
        try:
            restored = restore(journal, rollback_file)
            if previous_platform is not None:
                require(read_platform_config(restored['runtime']) == previous_platform, 'PLATFORM_CONFIG')
            assert_boundaries(selected, restored)
            require(not pg or schema_hash(pg) == old_schema, 'SCHEMA_CHANGED')
            assert_protected(protection)
        except Exception as error:
            if getattr(error, 'probeUUID', None) or getattr(error, 'probeProcessId', None):
                raise
            raise Stopped('ROLLBACK_FAILED') from None
        raise
    return receipt(manifest, 'execute', companions, active, capabilities, backup_hash)


def rollback_update(release, manifest, selected, contexts, protection):
    journal = private_json(PRIVATE / release.name / 'journal.json')
    journal_keys = {
        'selected', 'contexts', 'oldImages', 'images', 'schemaHash', 'backupSHA256',
        'sourceSHA', 'release', 'companions'}
    require(isinstance(journal, dict) and set(journal) in (journal_keys, journal_keys | {'platformConfigSHA256'}), 'ROLLBACK_GUARD')
    companions = ['kart'] if 'runtime' in manifest['services'] and 'kart' not in manifest['services'] and 'kart' in selected else []
    require(journal['release'] == release.name and journal['sourceSHA'] == manifest['sourceSHA']
            and isinstance(journal['selected'], list) and len(journal['selected']) == len(selected)
            and set(journal['selected']) == set(selected) and journal['companions'] == companions
            and isinstance(journal['oldImages'], dict) and set(journal['oldImages']) == set(selected)
            and isinstance(journal['images'], dict) and set(journal['images']) == set(selected)
            and all(isinstance(value, str) and re.fullmatch(IMAGE_ID, value)
                    for values in (journal['oldImages'], journal['images']) for value in values.values())
            and all(item['update'] == release.name and item['image'] == journal['images'][name]
                    for name, item in selected.items()), 'ROLLBACK_GUARD')
    capabilities = require_authority(journal['oldImages'], 'AUTHORITY_FALLBACK_REQUIRED')
    current_images = {name: item['image'] for name, item in selected.items()}
    require_authority(current_images, 'AUTHORITY_FALLBACK_REQUIRED')
    guard_authority_state(selected)
    pg = inventory('small-games', 'postgres')['id'] if 'runtime' in selected else None
    require(not pg or schema_hash(pg) == journal['schemaHash'], 'SCHEMA_CHANGED')
    for image in journal['oldImages'].values():
        require(text('docker', 'image', 'inspect', image, '--format', '{{.Id}}') == image, 'ROLLBACK_IMAGE')
    # Historical files supply labels/images only, never executable Compose context.
    rollback_contexts = platform_rollback_contexts(release, journal, contexts)
    journal = {**journal, 'contexts': rollback_contexts}
    rollback_file = PRIVATE / release.name / ('reviewed-rollback-' + os.urandom(6).hex() + '.json')
    override(rollback_file, journal['oldImages'], historical_rollback_labels(release, journal['oldImages']))
    for context in rollback_contexts.values():
        compose(context, rollback_file, 'config', '--quiet')
    fallback = PRIVATE / release.name / ('failback-' + os.urandom(6).hex() + '.json')
    override(fallback, current_images, {name: item['update'] for name, item in selected.items()})
    current_journal = {'selected': list(selected), 'contexts': contexts, 'oldImages': current_images}
    guard_games(selected)
    try:
        active = restore(journal, rollback_file)
        assert_boundaries(selected, active)
        require(not pg or schema_hash(pg) == journal['schemaHash'], 'SCHEMA_CHANGED')
        assert_protected(protection)
    except Exception:
        try:
            restored = restore(current_journal, fallback)
            assert_boundaries(selected, restored)
            require(not pg or schema_hash(pg) == journal['schemaHash'], 'SCHEMA_CHANGED')
            assert_protected(protection)
        except Exception as error:
            if getattr(error, 'probeUUID', None) or getattr(error, 'probeProcessId', None):
                raise
            raise Stopped('ROLLBACK_FAILED') from None
        raise
    return receipt(manifest, 'rollback', journal['companions'], active, capabilities)


def main(args=None, payload=None):
    args = sys.argv[1:] if args is None else args
    require(len(args) == 1 and args[0] in ('--check', '--execute', '--rollback'), 'ARGUMENTS')
    if payload is None:
        data = sys.stdin.buffer.read(8193)
        require(len(data) <= 8192, 'INPUT_TOO_LARGE')
        payload = json.loads(data)
    require(isinstance(payload, dict), 'CONFIG')
    expected = {'services', 'caddyDirectory', 'release'}
    if args[0] == '--execute':
        expected.add('sourceSHA')
        if 'platformConfig' in payload:
            expected.add('platformConfig')
            platform_entry(payload['platformConfig'])
    require(set(payload) == expected if args[0] != '--check' else
            'services' in payload and set(payload) <= {'services', 'caddyDirectory'}, 'CONFIG')
    if args[0] != '--check':
        require(isinstance(payload['release'], str)
                and re.fullmatch(r'[a-z0-9-]{1,100}', payload['release']), 'RELEASE_PATH')
    services = payload.get('services')
    require(isinstance(services, list) and services and len(set(services)) == len(services)
            and all(name in ALLOWED for name in services), 'BACKEND_SELECTION')
    require('platformConfig' not in payload or 'runtime' in services, 'BACKEND_SELECTION')
    selected, companions, contexts = selected_inventory(services)
    if args[0] == '--check':
        print(json.dumps({'ok': True, 'readOnly': True, 'services': services,
                          'recreateCompanions': companions, 'composeContextVerified': True}))
        return
    import fcntl
    caddy = checked_path(payload['caddyDirectory'], True)
    release = BASE / 'releases' / payload['release']
    manifest = manifest_from(release)
    require(manifest['services'] == services, 'SOURCE_MISMATCH')
    with contextlib.ExitStack() as stack:
        for file in [caddy / 'deploy.lock', ROOT / 'deploy.lock']:
            require(not file.is_symlink(), 'LOCK_PATH')
            lock = stack.enter_context(file.open('a'))
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        selected, companions, contexts = selected_inventory(services)
        protection = protected_snapshot(selected, caddy)
        if args[0] == '--execute':
            require(payload.get('sourceSHA') == manifest['sourceSHA'], 'SOURCE_MISMATCH')
            result = execute(release, manifest, payload, selected, companions, contexts, protection)
        else:
            result = rollback_update(release, manifest, selected, contexts, protection)
    stage('complete')
    print(json.dumps(result))


def interrupted(_signum, _frame):
    for number in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(number, signal.SIG_IGN)
    raise Stopped('SIGNAL_INTERRUPTED')


def entry(args=None, payload=None):
    try:
        for number in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
            signal.signal(number, interrupted)
        main(args, payload)
    except Exception as error:
        pid = getattr(error, 'probeProcessId', None)
        if type(pid) is int and 0 < pid <= 2147483647:
            print('BACKEND_REMOTE_PROBE_PID ' + str(pid), file=sys.stderr)
        owned_id = getattr(error, 'ownedContainerId', None)
        if isinstance(owned_id, str) and re.fullmatch(r'[a-f0-9]{64}', owned_id):
            print('BACKEND_REMOTE_OWNED_PROBE ' + owned_id, file=sys.stderr)
        probe_uuid = getattr(error, 'probeUUID', None)
        if isinstance(probe_uuid, str) and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', probe_uuid):
            print('BACKEND_REMOTE_PROBE_UUID ' + probe_uuid, file=sys.stderr)
        print('BACKEND_REMOTE_FAILED_STAGE ' + getattr(error, 'stage', STAGE), file=sys.stderr)
        print('BACKEND_REMOTE_STOPPED ' + (str(error) if isinstance(error, Stopped) else 'UNEXPECTED_FAILURE'), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    entry()
