"""Reviewed control coordinator. Import is inert; legacy installers are never invoked."""
import base64
import binascii
import contextlib
import hashlib
import http.client
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import time
import urllib.parse
from http.cookies import SimpleCookie

ROOT = Path('/opt/small-games')
BASE = ROOT / 'admin-console'
PRIVATE = ROOT / 'admin-private'
ORIGIN = 'https://admin.nenggongzhiren.cn'
CALLBACK = ORIGIN + '/api/auth/github/callback'
SERVICES = ('runtime', 'kart', 'management')
COMMANDS = {'runtime': ['node', 'services/runtime-api/dist/main.js'],
            'kart': ['node', 'services/kart-server/src/main.ts'],
            'management': ['node', 'services/management-api/dist/main.js']}
PUBLIC_ENV = {'runtime': {'COMPETITION_CONTROL_ENABLED': 'true', 'COMPETITION_CONTROL_INSTANCE_ID': 'small-games-runtime',
                          'COMPETITION_CORS_ORIGINS': 'http://localhost:8080,https://ma-h5-al.tapimg.com,https://coffeeeeffoc.github.io',
                          'COMPETITION_CORS_METHODS': 'GET,POST,OPTIONS',
                          'COMPETITION_CORS_HEADERS': 'authorization,content-type',
                          'COMPETITION_CORS_CREDENTIALS': 'false'},
              'kart': {'COMPETITION_CONTROL_ENABLED': 'true', 'COMPETITION_CONTROL_INSTANCE_ID': 'small-games-kart'},
              'management': {'ADMIN_CONTROL_ENABLED': 'true'}}
CSP_BASE = "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'"
CSP_META = '<meta name="sg-csp-nonce" content="{{ $sgNonce }}">'
CSP_PREFIX = ('<!--{{- $sgNonce := randBytes 32 -}}{{- .RespHeader.Set "Content-Security-Policy" (printf "'
              + CSP_BASE.replace("style-src 'self'", "style-src 'self' 'nonce-%s'") + '" $sgNonce) -}}-->')
UI_PATHS = ['/', '/login', '/forbidden', '/config', '/games', '/members', '/roles', '/audit']
CSP_CONTRACT = {'version': 1, 'kind': 'nonce-v1', 'prefix': CSP_PREFIX, 'meta': CSP_META, 'baseCsp': CSP_BASE, 'paths': UI_PATHS}
MODULES = {}
STAGE = 'preflight'
ROOT_PRECONDITION = {
    'release': '0d7bfdfe4087-1792248271760-eb122d',
    'sourceSHA': '0d7bfdfe4087b85139dc525e9a75f3ab792e17f6',
    'helperSHA256': '55168636acfa30e302489acd96eb99335cf513550e9c62fb64d13f7f7773c536',
    'deploymentUid': 1000,
}
DATABASE_REASONS = frozenset({
    'CONTROL_PRIVATE_DIRECTORY', 'CONTROL_PRIVATE_FILE', 'CONTROL_PRIVATE_NOT_EMPTY',
    'CONTROL_RELEASE', 'CONTROL_MANIFEST', 'CONTROL_RELEASE_HASH', 'CONTROL_MIGRATION_ARTIFACT',
    'CONTROL_MIGRATION_BOUNDARIES', 'CONTROL_SQL_SEGMENTS', 'CONTROL_SQL_SESSION', 'CONTROL_SQL_CONTRACT',
    'CONTROL_CONTAINER_ID', 'CONTROL_INVENTORY', 'CONTROL_RESOURCE_CHANGED', 'CONTROL_WRITER_RUNNING',
    'CONTROL_DATABASE_IDENTITY', 'CONTROL_PG_VERSION', 'CONTROL_UNSUPPORTED_PROFILE', 'CONTROL_DISK_SPACE',
    'CONTROL_COMMAND_TIMEOUT', 'CONTROL_COMMAND_FAILED', 'CONTROL_PREFLIGHT_FAILED',
    'CONTROL_DATABASE_FAILED', 'CONTROL_SOURCE_CHANGED', 'CONTROL_POSTCOMMIT_STATE',
    'CONTROL_FIXTURE_CLEANUP_REQUIRED', 'CONTROL_FIXTURE_RECOVERY_REQUIRED',
})


class Stopped(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code, self.stage = code, STAGE


def database_failure(code, original):
    """Forward only validated public ownership diagnostics across the boundary."""
    error = Stopped(code)
    reason = getattr(original, 'code', None)
    error.reason = reason if reason in DATABASE_REASONS else 'CONTROL_DATABASE_FAILED'
    error.code = code + '__' + error.reason
    owned, token, pid = (getattr(original, key, None) for key in ('ownedContainerId', 'probeUUID', 'probeProcessId'))
    if isinstance(owned, str) and re.fullmatch(r'[a-f0-9]{64}', owned):
        error.ownedContainerId = owned
    if isinstance(token, str) and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', token):
        error.probeUUID = token
    if type(pid) is int and 1 <= pid <= 2147483647:
        error.probeProcessId = pid
    return error


def require(value, code):
    if not value:
        raise Stopped(code)


def stage(value):
    global STAGE
    STAGE = value
    print('ADMIN_REMOTE_STAGE ' + value, file=sys.stderr, flush=True)


def digest(value, size=64):
    return isinstance(value, str) and re.fullmatch(r'[a-f0-9]{' + str(size) + '}', value) is not None


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'INVALID_JSON')
        result[key] = value
    return result


def json_value(data):
    return json.loads(data, object_pairs_hook=unique_object)


def support(name):
    if name not in MODULES:
        file = Path(__file__).with_name(name)
        require(file.is_file() and not file.is_symlink(), 'DATABASE_HELPER_REQUIRED' if name == 'control-database.py' else 'SUPPORT_REQUIRED')
        spec = importlib.util.spec_from_file_location('control_' + name.replace('-', '_').replace('.', '_'), file)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        MODULES[name] = module
    return MODULES[name]


def domain_module():
    value = support('control-database.py')
    require(callable(getattr(value, 'provision_control_database', None))
            and callable(getattr(value, 'preflight_control_database', None))
            and callable(getattr(value, 'verify_control_database', None))
            and callable(getattr(value, 'provision_player_sessions', None))
            and callable(getattr(value, 'player_session_migration', None)), 'DATABASE_HELPER_REQUIRED')
    return value


def command(*args, **kwargs):
    legacy = support('legacy-tools.py')
    try:
        return legacy.command(*args, **kwargs)
    except legacy.Stopped as error:
        raise Stopped('COMMAND_TIMEOUT' if error.args == ('COMMAND_TIMEOUT',) else 'COMMAND_FAILED') from None


def scalar(*args, **kwargs):
    return command(*args, **kwargs).decode().strip()


def inventory():
    module = support('backend-context.py')
    result = {name: module.inventory('small-games', name) for name in (*SERVICES, 'postgres', 'nginx')}
    result['web'] = module.inventory('company-web', 'web')
    for name in ('management', 'nginx'):
        item = result[name]
        item['admin'] = scalar('docker', 'inspect', '--format', '{{index .Config.Labels "io.small-games.admin"}}', item['id'])
    result['nginx']['restart'] = scalar('docker', 'inspect', '--format', '{{.HostConfig.RestartPolicy.Name}}', result['nginx']['id'])
    require(all(value['running'] for value in result.values()), 'SERVICE_NOT_RUNNING')
    require(all(not result[name]['ports'] for name in SERVICES), 'SERVICE_BOUNDARY')
    require(result['kart']['networkMode'] == 'container:' + result['runtime']['id'], 'KART_NAMESPACE')
    require(result['nginx']['restart'] == 'unless-stopped', 'BARRIER_POLICY')
    return result


def private_directory(directory, create=False):
    if create and not directory.exists():
        directory.mkdir(mode=0o700)
    facts = directory.lstat()
    require(directory.resolve(strict=True) == directory and stat.S_ISDIR(facts.st_mode)
            and facts.st_uid == os.geteuid() and stat.S_IMODE(facts.st_mode) == 0o700, 'PRIVATE_DIRECTORY')


def private_metadata(file):
    require(file.resolve(strict=True) == file, 'PRIVATE_FILE')
    facts = file.lstat()
    require(stat.S_ISREG(facts.st_mode) and facts.st_nlink == 1 and facts.st_uid == os.geteuid()
            and stat.S_IMODE(facts.st_mode) == 0o600, 'PRIVATE_FILE')
    return [facts.st_dev, facts.st_ino, facts.st_size, facts.st_mtime_ns]


def private_json(file):
    private_metadata(file)
    require(file.stat().st_size <= 262144, 'PRIVATE_FILE')
    return json_value(file.read_bytes())


def fsync_directory(directory):
    fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_private(file, value, replace=False):
    data = (json.dumps(value, sort_keys=True) + '\n').encode()
    target = file.with_name('.' + file.name + '-' + os.urandom(6).hex()) if replace else file
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    if replace:
        private_metadata(file)
        os.replace(target, file)
    fsync_directory(file.parent)


def manifest_from(release, historical=False):
    require(release.parent == BASE / 'releases' and release.resolve(strict=True) == release
            and re.fullmatch(r'[a-z0-9-]{1,100}', release.name), 'RELEASE_PATH')
    value = json_value((release / 'manifest.json').read_bytes())
    require(isinstance(value, dict) and value.get('release') == release.name
            and digest(value.get('sourceSHA'), 40) and isinstance(value.get('files'), dict), 'RELEASE_MANIFEST')
    for name, checksum in value['files'].items():
        file = release / name
        require(isinstance(name, str) and re.fullmatch(r'[A-Za-z0-9_./-]+', name)
                and '..' not in Path(name).parts and not Path(name).is_absolute()
                and file.resolve(strict=True) == file and file.is_file() and digest(checksum)
                and hashlib.sha256(file.read_bytes()).hexdigest() == checksum, 'RELEASE_HASH')
    if historical and value.get('version') == 1:
        require({'deploy.py', 'fingerprint.sql', 'migrations/001-admin-auth.sql'} <= set(value['files']), 'RELEASE_MANIFEST')
        return value
    require(type(value.get('version')) is int and value['version'] == 2
            and set(value) == {'version', 'release', 'sourceSHA', 'kind', 'services', 'scope', 'qualityChecks', 'controlSchemaVersion', 'migrationArtifactSha256', 'cspContractSha256', 'adminHtml', 'files'}
            and value['kind'] in ('control-application', 'control-runner')
            and value['scope'] == 'admin-control' and value['qualityChecks'] == 'not-run'
            and type(value['controlSchemaVersion']) is int and value['controlSchemaVersion'] == 2
            and value['services'] in (list(SERVICES), ['management'], [])
            and {'control-deploy.py', 'control-database.py', 'control-fingerprint.sql', 'legacy-tools.py', 'backend-context.py', 'image-authority.py', 'migrations/002-control-center.sql', 'admin-csp-contract.json'} <= set(value['files'])
            and digest(value['migrationArtifactSha256'])
            and value['migrationArtifactSha256'] == value['files']['migrations/002-control-center.sql']
            and value['cspContractSha256'] == value['files']['admin-csp-contract.json'], 'RELEASE_MANIFEST')
    if value['kind'] == 'control-runner':
        require(value['services'] == [] and value['adminHtml'] is None, 'RELEASE_MANIFEST')
    else:
        require(value['services'] and {'Dockerfile', 'site/index.html'} <= set(value['files'])
                and value['adminHtml'] == {'contract': 'nonce-v1', 'templateSha256': value['files']['site/index.html']}, 'RELEASE_MANIFEST')
    contract = (json.dumps(CSP_CONTRACT, indent=2, ensure_ascii=False) + '\n').encode()
    require((release / 'admin-csp-contract.json').read_bytes() == contract, 'CSP_CONTRACT')
    return value


def control_contract(value):
    require(isinstance(value, dict) and set(value) == {'version', 'schema', 'schemaVersion', 'projectionSha256', 'metadataSha256'}
            and type(value['version']) is int and value['version'] == 1 and value['schema'] == 'game_control'
            and type(value['schemaVersion']) is int and value['schemaVersion'] == 2
            and digest(value['projectionSha256']) and digest(value['metadataSha256']), 'CONTROL_CONTRACT')
    return value


def verified_database(domain, pg, manifest, expected):
    result = domain.verify_control_database(pg_id=pg, migration_sha256=manifest['migrationArtifactSha256'], expected_contract=control_contract(expected))
    require(isinstance(result, dict) and set(result) == {'controlContract', 'readOnly', 'migrationArtifactSha256'}
            and result['readOnly'] is True and result['migrationArtifactSha256'] == manifest['migrationArtifactSha256']
            and control_contract(result['controlContract']) == expected, 'DATABASE_CONTRACT')
    return expected


def database_floor(pg):
    tools = support('legacy-tools.py')
    try:
        absent = tools.psql(pg, "BEGIN TRANSACTION READ ONLY; SELECT to_regnamespace('game_control') IS NULL; COMMIT;")
        if absent == 't':
            return 'absent'
        if absent == 'f' and tools.psql(pg, 'BEGIN TRANSACTION READ ONLY; SELECT version FROM game_control.schema_version; COMMIT;') == '2':
            return 'schema2'
    except Exception:
        pass
    raise Stopped('DATABASE_OUTCOME_UNKNOWN')


def authority(images, failure='AUTHORITY_IMAGE_REQUIRED'):
    module = support('image-authority.py')
    try:
        return module.require_images(images, failure)
    except module.AuthorityError as error:
        stopped = Stopped(error.code)
        for name in ('ownedContainerId', 'probeUUID', 'probeName', 'probeProcessId'):
            setattr(stopped, name, getattr(error, name, None))
        raise stopped from None


def management_config(release, allow_legacy=False):
    private_directory(PRIVATE)
    directory = PRIVATE / release.name
    private_directory(directory)
    value = private_json(directory / 'compose.json')
    require(isinstance(value, dict) and set(value.get('services', {})) == {'management'}, 'MANAGEMENT_CONFIG')
    item = value['services']['management']
    env = item.get('env_file')
    require(isinstance(env, list) and len(env) == 1 and isinstance(env[0], dict)
            and set(env[0]) == {'path', 'format'} and env[0]['format'] == 'raw'
            and isinstance(env[0]['path'], str), 'REMOTE_ENV_PATH')
    file = Path(env[0]['path'])
    require(file.name == 'management.env' and file.parent.parent == PRIVATE
            and re.fullmatch(r'[a-z0-9-]{1,100}', file.parent.name), 'REMOTE_ENV_PATH')
    private_directory(file.parent)
    signature = private_metadata(file)  # Deliberately no open/read/hash of management.env.
    expected = support('legacy-tools.py').compose(release, file)
    if 'environment' in item:
        expected['services']['management']['environment'] = PUBLIC_ENV['management']
    networks = item.get('networks')
    address = networks.get('existing', {}).get('ipv4_address') if isinstance(networks, dict) else None
    require(value == expected or value == control_compose(release, file, item.get('image'), address), 'MANAGEMENT_CONFIG')
    require(allow_legacy or item.get('environment') == PUBLIC_ENV['management'], 'CONTROL_FLAG_REQUIRED')
    return file, signature, value


def control_compose(release, envfile, image, management_ip=None):
    value = support('legacy-tools.py').compose(release, envfile)
    value['services']['management']['image'] = image
    value['services']['management']['environment'] = PUBLIC_ENV['management']
    if management_ip is not None:
        try:
            address = ipaddress.IPv4Address(management_ip)
        except ipaddress.AddressValueError:
            raise Stopped('MANAGEMENT_ADDRESS') from None
        require(address.is_private and not address.is_loopback and not address.is_unspecified, 'MANAGEMENT_ADDRESS')
        # Keep the original address while Nginx is stopped, so its trusted-proxy IP stays free.
        value['services']['management']['networks'] = {'existing': {'ipv4_address': str(address)}}
    return value


def assert_env(file, expected):
    require(private_metadata(file) == expected, 'REMOTE_ENV_CHANGED')


def canonical_nonce(value):
    require(isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9+/]{43}=', value), 'ADMIN_HTML_PROBE')
    try:
        decoded = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        raise Stopped('ADMIN_HTML_PROBE') from None
    require(len(decoded) == 32 and base64.b64encode(decoded).decode() == value, 'ADMIN_HTML_PROBE')
    return value


def one_header(headers, name):
    values = [value for key, value in headers if key.lower() == name]
    require(len(values) == 1, 'HTTPS_PROBE')
    return values[0]


def check_document(release, manifest, headers, body):
    template = (release / 'site/index.html').read_bytes()
    csp = one_header(headers, 'content-security-policy')
    require(one_header(headers, 'cache-control') == 'no-store'
            and one_header(headers, 'content-type').lower().startswith('text/html'), 'ADMIN_HTML_PROBE')
    if 'adminHtml' not in manifest:
        require(manifest['version'] == 1 and b'{{' not in template and b'sg-csp-nonce' not in template
                and body == template and csp == CSP_BASE, 'ADMIN_HTML_PROBE')
        return None
    require(manifest['adminHtml'] == {'contract': 'nonce-v1', 'templateSha256': hashlib.sha256(template).hexdigest()}, 'CSP_CONTRACT')
    prefix, meta = (CSP_PREFIX + '\n').encode(), CSP_META.encode()
    require(template.startswith(prefix) and template[len(prefix):].count(meta) == 1, 'CSP_CONTRACT')
    found = re.findall(rb'<meta name="sg-csp-nonce" content="([^"]*)">', body)
    require(len(found) == 1, 'ADMIN_HTML_PROBE')
    try:
        nonce = canonical_nonce(found[0].decode('ascii'))
    except UnicodeError:
        raise Stopped('ADMIN_HTML_PROBE') from None
    expected = b'<!---->\n' + template[len(prefix):].replace(meta, ('<meta name="sg-csp-nonce" content="' + nonce + '">').encode())
    require(b'{{' not in expected and body == expected
            and csp == CSP_BASE.replace("style-src 'self'", "style-src 'self' 'nonce-" + nonce + "'"), 'ADMIN_HTML_PROBE')
    return nonce


def https_request(path, deadline):
    require(time.monotonic() < deadline, 'HTTPS_PROBE')
    connection = http.client.HTTPSConnection('admin.nenggongzhiren.cn', timeout=min(5, deadline - time.monotonic()))
    try:
        connection.request('GET', path)
        response = connection.getresponse()
        body = response.read(1048577)
        require(len(body) <= 1048576, 'HTTPS_PROBE')
        return response.status, response.getheaders(), body
    finally:
        connection.close()


def oauth_metadata(headers, status):
    try:
        target = urllib.parse.urlsplit(one_header(headers, 'location'))
        query = urllib.parse.parse_qs(target.query, keep_blank_values=True, max_num_fields=12)
    except ValueError:
        raise Stopped('OAUTH_PROBE') from None
    require(status == 302 and target.scheme == 'https' and target.netloc == 'github.com'
            and target.path == '/login/oauth/authorize' and not target.fragment
            and set(query) == {'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'prompt'}
            and all(len(value) == 1 for value in query.values())
            and re.fullmatch(r'[A-Za-z0-9_-]{1,256}', query['client_id'][0])
            and query['redirect_uri'] == [CALLBACK] and query['scope'] == ['user:email']
            and query['code_challenge_method'] == ['S256'] and query['prompt'] == ['select_account'], 'OAUTH_PROBE')
    for key in ('state', 'code_challenge'):
        token = query[key][0]
        require(re.fullmatch(r'[A-Za-z0-9_-]{43}', token)
                and base64.urlsafe_b64encode(base64.urlsafe_b64decode(token + '=')).decode().rstrip('=') == token, 'OAUTH_PROBE')
    cookies = SimpleCookie()
    fields = [value for key, value in headers if key.lower() == 'set-cookie']
    require(len(fields) == 1, 'COOKIE_PROBE')
    cookies.load(fields[0])
    require(set(cookies) == {'__Secure-sg_admin_flow'}, 'COOKIE_PROBE')
    flow = cookies['__Secure-sg_admin_flow']
    require(flow.value == query['state'][0] and flow['path'] == '/api/' and flow['secure']
            and flow['httponly'] and flow['samesite'].lower() == 'lax' and not flow['domain'], 'COOKIE_PROBE')


def public_probe(release):
    manifest = manifest_from(release, historical=True)
    deadline = time.monotonic() + 40
    while True:
        try:
            nonces = set()
            for path in UI_PATHS if 'adminHtml' in manifest else UI_PATHS[:3]:
                status, headers, body = https_request(path, deadline)
                require(status == (403 if path == '/forbidden' else 200), 'HTTPS_PROBE')
                nonce = check_document(release, manifest, headers, body)
                require(nonce is None or nonce not in nonces, 'ADMIN_HTML_PROBE')
                nonces.add(nonce)
            status, headers, body = https_request('/api/session', deadline)
            require(status == 401 and json_value(body) == {'error': 'authentication_required'}
                    and one_header(headers, 'content-type').startswith('application/json'), 'HTTPS_PROBE')
            status, headers, _ = https_request('/api/auth/github', deadline)
            oauth_metadata(headers, status)
            return
        except (Stopped, OSError, ValueError, http.client.HTTPException):
            require(time.monotonic() < deadline, 'HTTPS_PROBE')
            time.sleep(1)


def read_precommit(release, manifest):
    directory = PRIVATE / release.name
    private_directory(directory)
    file, checksum_file = directory / 'control-precommit.json', directory / 'control-precommit.sha256'
    value = private_json(file)
    private_metadata(checksum_file)
    checksum = checksum_file.read_bytes()
    require(re.fullmatch(rb'[a-f0-9]{64}\n', checksum)
            and hashlib.sha256(file.read_bytes()).hexdigest().encode() + b'\n' == checksum, 'PRECOMMIT_PROOF')
    require(isinstance(value, dict) and set(value) == {'version', 'release', 'sourceSHA', 'migrationArtifactSha256', 'backupSHA256', 'oldStateSHA256', 'controlContract', 'isolatedRestoreVerified', 'oldDataUnchanged', 'leastPrivilegeVerified'}
            and type(value['version']) is int and value['version'] == 1
            and value['release'] == release.name and value['sourceSHA'] == manifest['sourceSHA']
            and value['migrationArtifactSha256'] == manifest['migrationArtifactSha256']
            and digest(value['backupSHA256']) and digest(value['oldStateSHA256'])
            and all(value[key] is True for key in ('isolatedRestoreVerified', 'oldDataUnchanged', 'leastPrivilegeVerified')), 'PRECOMMIT_PROOF')
    control_contract(value['controlContract'])
    return value, checksum.decode().strip()


def read_control_proof(release, manifest):
    private_directory(PRIVATE / release.name)
    value = private_json(PRIVATE / release.name / 'control-proof.json')
    require(isinstance(value, dict) and set(value) == {'version', 'sourceSHA', 'release', 'databaseProof', 'controlContract'}
            and type(value['version']) is int and value['version'] == 1
            and value['sourceSHA'] == manifest['sourceSHA'] and value['release'] == release.name, 'CONTROL_PROOF')
    proof = value['databaseProof']
    require(isinstance(proof, dict) and set(proof) == {'sourceSHA', 'release', 'backupSHA256', 'oldStateSHA256', 'precommitSHA256'}
            and digest(proof['sourceSHA'], 40) and re.fullmatch(r'[a-z0-9-]{1,100}', proof['release'])
            and all(digest(proof[key]) for key in ('backupSHA256', 'oldStateSHA256', 'precommitSHA256')), 'CONTROL_PROOF')
    control_contract(value['controlContract'])
    origin = BASE / 'releases' / proof['release']
    original, checksum = read_precommit(origin, manifest_from(origin))
    require(checksum == proof['precommitSHA256'] and original['sourceSHA'] == proof['sourceSHA']
            and original['controlContract'] == value['controlContract']
            and all(original[key] == proof[key] for key in ('backupSHA256', 'oldStateSHA256')), 'CONTROL_PROOF')
    return value


def persist_control_proof(release, manifest, precommit, checksum):
    value = {'version': 1, 'sourceSHA': manifest['sourceSHA'], 'release': release.name,
             'controlContract': precommit['controlContract'],
             'databaseProof': {'sourceSHA': precommit['sourceSHA'], 'release': precommit['release'],
                               'backupSHA256': precommit['backupSHA256'], 'oldStateSHA256': precommit['oldStateSHA256'],
                               'precommitSHA256': checksum}}
    file = PRIVATE / release.name / 'control-proof.json'
    if file.exists():
        require(private_json(file) == value, 'CONTROL_PROOF')
    else:
        write_private(file, value)
    return value


def assert_live_flags(items):
    for name in SERVICES:
        command('docker', 'exec', items[name]['id'], 'node', '-e',
                'const p=' + json.dumps(PUBLIC_ENV[name]) + ';if(Object.entries(p).some(([k,v])=>process.env[k]!==v))process.exit(1)', timeout=5)


def contexts_for(items):
    backend = support('backend-context.py')
    contexts = {name: backend.compose_context(items[name]) for name in ('runtime', 'kart')}
    for name, context in contexts.items():
        actual = backend.compose(context, None, 'config', '--hash', name).decode().strip().split()
        if actual != [name, items[name]['configHash']] and name == 'kart':
            declared = json.dumps({'services': {'kart': {'network_mode': 'service:runtime'}}}).encode()
            unchanged = backend.compose(context, '-', 'config', '--hash', name, input=declared).decode().strip().split()
            require(unchanged == actual, 'KART_NAMESPACE')
            namespace = json.dumps({'services': {'kart': {'network_mode': items[name]['networkMode']}}}).encode()
            actual = backend.compose(context, '-', 'config', '--hash', name, input=namespace).decode().strip().split()
        require(actual == [name, items[name]['configHash']], 'COMPOSE_CONTEXT_CHANGED')
    return contexts


def stable_identity(item):
    value = dict(item)
    value.pop('admin', None)
    value.pop('restart', None)
    value['networks'] = {name: {key: network.get(key) for key in ('NetworkID', 'Aliases')}
                         for name, network in item['networks'].items()}
    return value


def assert_nginx(items, stopped):
    actual = support('backend-context.py').inventory('small-games', 'nginx')
    expected = stable_identity(items['nginx'])
    expected['running'] = not stopped
    require(stable_identity(actual) == expected and scalar('docker', 'inspect', '--format', '{{.HostConfig.RestartPolicy.Name}}', actual['id']) == 'unless-stopped',
            'BARRIER_NOT_CLOSED' if stopped else 'BARRIER_IDENTITY')


def check_protected(items, pointers):
    backend = support('backend-context.py')
    for name, project in (('postgres', 'small-games'), ('web', 'company-web')):
        require(backend.inventory(project, name) == items[name], 'PROTECTED_CONTAINER_CHANGED')
    require(all(Path(file).resolve(strict=True) == Path(target) for file, target in pointers.items()), 'PROTECTED_POINTER_CHANGED')


def active_guards(items):
    support('backend-context.py').guard_games({name: items[name] for name in ('runtime', 'kart')})
    runtime_idle(items['postgres']['id'])


def runtime_idle(pg):
    # ranked-types.ts stores expiresAt in JSON milliseconds; three-choose-two
    # stores the same millisecond expiry in its dedicated expires_at column.
    sql = """BEGIN TRANSACTION READ ONLY;
SELECT (SELECT count(*) FROM runtime.competition_matches
        WHERE data->>'kind'='ranked-run-v1' AND data->>'status'='active'
          AND (data->>'expiresAt')::bigint>(extract(epoch from now())*1000)::bigint)
     + (SELECT count(*) FROM runtime.three_choose_two_sessions
        WHERE status='active' AND expires_at>(extract(epoch from now())*1000)::bigint);
COMMIT;"""
    require(support('legacy-tools.py').psql(pg, sql) == '0', 'ACTIVE_GAME')


def stopped_writers(pg):
    tools = support('legacy-tools.py')
    require(tools.psql(pg, "BEGIN TRANSACTION READ ONLY; SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'; COMMIT;") == '0', 'UNKNOWN_DATABASE_WRITER')
    require(tools.psql(pg, "BEGIN TRANSACTION READ ONLY; SELECT count(*) FROM runtime.competition_rooms WHERE data->>'status' IN ('waiting','playing') AND expires_at>(extract(epoch from now())*1000)::bigint; COMMIT;") == '0', 'ACTIVE_GAME')
    runtime_idle(pg)


def service_health(name, item):
    port = {'runtime': 43002, 'kart': 43003, 'management': 43001}[name]
    deadline = time.monotonic() + 45
    while True:
        try:
            command('docker', 'exec', item['id'], 'node', '-e', "fetch('http://127.0.0.1:" + str(port) + "/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))", timeout=5)
            return
        except Stopped:
            require(time.monotonic() < deadline, 'GAME_RESTART_FAILED')
            time.sleep(1)


def target_inventory(name, optional=False):
    return support('backend-context.py').inventory('small-games', name, optional=optional)


def save_journal(release, journal):
    write_private(PRIVATE / release.name / 'control-journal.json', journal, True)


def candidate_boundary(name, item, journal, release):
    before = journal['inventory'][name]
    require(item['ports'] == before['ports'] and item['mounts'] == before['mounts'], 'SERVICE_BOUNDARY')
    require(item['id'] == before['id'] or (item['image'] == journal['candidateImage']
            and item.get('update') == release.name), 'SERVICE_IDENTITY')


def activate_services(release, manifest, journal, names):
    """All image probes are delegated to the one shared owned-probe implementation."""
    directory = PRIVATE / release.name
    image = journal['candidateImage']
    authority({name: image for name in names})
    envfile = Path(journal['envFile'])
    assert_env(envfile, journal['envMetadata'])
    module = support('backend-context.py')
    if 'runtime' in names:
        kart = target_inventory('kart', optional=True)
        if kart is None:
            require(journal['kartRemovalAttempted'] is True, 'KART_NAMESPACE')
        else:
            candidate_boundary('kart', kart, journal, release)
            journal['kartRemovalAttempted'] = True
            save_journal(release, journal)
            command('docker', 'stop', '--time', '30', kart['id'])
            command('docker', 'rm', kart['id'])
        for name in ('runtime', 'kart'):
            services = {name: {'image': image, 'command': COMMANDS[name], 'pull_policy': 'never',
                               'environment': PUBLIC_ENV[name], 'labels': {'io.small-games.backend-update': release.name}}}
            if name == 'kart':
                current_runtime = target_inventory('runtime')
                candidate_boundary('runtime', current_runtime, journal, release)
                require(current_runtime['image'] == image and current_runtime.get('update') == release.name, 'SERVICE_IDENTITY')
                if current_runtime['id'] not in journal['runtimeIds']:
                    journal['runtimeIds'].append(current_runtime['id'])
                    save_journal(release, journal)
                services[name]['network_mode'] = 'container:' + current_runtime['id']
            file = directory / (name + '-control.json')
            if file.exists():
                old = private_json(file)
                if old != {'services': services} and name == 'kart':
                    namespace = old.get('services', {}).get('kart', {}).get('network_mode')
                    require(namespace in ['container:' + value for value in journal['runtimeIds']], 'CONTROL_OVERRIDE')
                    old['services']['kart']['network_mode'] = services[name]['network_mode']
                    require(old == {'services': services}, 'CONTROL_OVERRIDE')
                    write_private(file, {'services': services}, True)
                else:
                    require(old == {'services': services}, 'CONTROL_OVERRIDE')
            else:
                write_private(file, {'services': services})
            if name == 'runtime':
                candidate_boundary(name, target_inventory(name), journal, release)
            module.compose(journal['contexts'][name], file, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', name)
    file = directory / 'compose.json'
    management_ip = journal['inventory']['management']['networks']['small-games_default']['IPAddress']
    model = control_compose(release, envfile, image, management_ip)
    if file.exists():
        require(private_json(file) == model, 'MANAGEMENT_CONFIG')
    else:
        write_private(file, model)
    support('legacy-tools.py').compose_command(file, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'management')
    current = {name: target_inventory(name) for name in SERVICES}
    for name in SERVICES:
        expected = image if name in names else journal['inventory'][name]['image']
        require(current[name]['image'] == expected and current[name]['running']
                and current[name]['ports'] == journal['inventory'][name]['ports']
                and current[name]['mounts'] == journal['inventory'][name]['mounts'], 'SERVICE_BOUNDARY')
        if name not in names:
            require(current[name] == journal['inventory'][name], 'PROTECTED_CONTAINER_CHANGED')
        service_health(name, current[name])
    require(current['kart']['networkMode'] == 'container:' + current['runtime']['id'], 'KART_NAMESPACE')
    module.assert_boundaries({name: journal['inventory'][name] for name in SERVICES}, current)
    assert_live_flags(current)
    return current


def pointers_for(caddy):
    return {str(file): str(file.resolve(strict=True)) for file in (ROOT / 'current', ROOT / 'backend-current', caddy / 'current')}


def switch_pointer(release):
    tools = support('legacy-tools.py')
    if (BASE / 'current').is_symlink():
        tools.atomic_pointer(BASE / 'previous', (BASE / 'current').resolve(strict=True))
    tools.atomic_pointer(BASE / 'current', release)


def public_receipt(mode, release, manifest, runner_sha, current, proof):
    return {'ok': True, 'mode': mode, 'runnerSourceSHA': runner_sha, 'sourceSHA': manifest['sourceSHA'],
            'release': release.name, 'services': list(SERVICES) if mode in ('adopt', 'recover') else ['management'],
            'activeImages': {name: current[name]['image'] for name in SERVICES},
            'controlContract': proof['controlContract'], 'migrationArtifactSha256': manifest['migrationArtifactSha256'],
            'controlEnabled': True, 'remoteConfigReused': True, 'internalHealthVerified': True,
            'publicHtmlVerified': True, 'anonymousSessionVerified': True, 'oauthStartVerified': True,
            'realGithubLoginVerified': False, 'backupSHA256': proof['databaseProof']['backupSHA256'],
            'oldStateSHA256': proof['databaseProof']['oldStateSHA256']}


def build_image(release):
    tag = 'small-games-control:' + release.name
    command('docker', 'build', '--pull=false', '-t', tag, str(release), timeout=1200)
    image = scalar('docker', 'image', 'inspect', '--format', '{{.Id}}', tag)
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', image), 'MANAGEMENT_IMAGE')
    return image


def provision_result(value, manifest):
    require(isinstance(value, dict) and set(value) == {'outcome', 'oldDataUnchanged', 'isolatedRestoreVerified', 'leastPrivilegeVerified', 'backupSHA256', 'oldStateSHA256', 'controlContract', 'migrationArtifactSha256'}
            and value['outcome'] == 'committed'
            and all(value[key] is True for key in ('oldDataUnchanged', 'isolatedRestoreVerified', 'leastPrivilegeVerified'))
            and all(digest(value[key]) for key in ('backupSHA256', 'oldStateSHA256'))
            and value['migrationArtifactSha256'] == manifest['migrationArtifactSha256'], 'DATABASE_PROOF')
    control_contract(value['controlContract'])
    return value


def adoption_journal(value, release, manifest):
    keys = {'version', 'release', 'sourceSHA', 'phase', 'inventory', 'contexts', 'candidateImage', 'previous',
            'envFile', 'envMetadata', 'pointers', 'precommitPath', 'precommitSHA256', 'newActivationAttempted',
            'stopped', 'runtimeIds', 'kartRemovalAttempted', 'domainInvoked', 'barrierAttempted', 'verifiedNotCommitted'}
    require(isinstance(value, dict) and set(value) in (keys, keys | {'rootPreconditionEvidence'}) and type(value['version']) is int and value['version'] == 1
            and value['release'] == release.name and value['sourceSHA'] == manifest['sourceSHA']
            and value['phase'] in ('prepared', 'barrier', 'database', 'database-unknown', 'verified-not-committed', 'activate', 'recovery-required', 'restored')
            and value['precommitPath'] == str(PRIVATE / release.name / 'control-precommit.json')
            and (value['precommitSHA256'] is None or digest(value['precommitSHA256']))
            and isinstance(value['candidateImage'], str) and re.fullmatch(r'sha256:[a-f0-9]{64}', value['candidateImage'])
            and isinstance(value['previous'], str) and re.fullmatch(r'[a-z0-9-]{1,100}', value['previous'])
            and isinstance(value['envFile'], str) and isinstance(value['envMetadata'], list)
            and len(value['envMetadata']) == 4 and all(type(v) is int and v >= 0 for v in value['envMetadata'])
            and all(type(value[k]) is bool for k in ('newActivationAttempted', 'kartRemovalAttempted', 'domainInvoked', 'barrierAttempted', 'verifiedNotCommitted'))
            and isinstance(value['stopped'], list) and len(value['stopped']) == len(set(value['stopped']))
            and all(v in SERVICES for v in value['stopped']) and isinstance(value['runtimeIds'], list)
            and all(digest(v) for v in value['runtimeIds'])
            and isinstance(value['inventory'], dict) and set(value['inventory']) == {*SERVICES, 'postgres', 'nginx', 'web'}
            and isinstance(value['contexts'], dict) and set(value['contexts']) == {'runtime', 'kart'}
            and isinstance(value['pointers'], dict), 'RECOVERY_REQUIRED')
    require(all(isinstance(item, dict) and digest(item.get('id')) and isinstance(item.get('image'), str)
                and re.fullmatch(r'sha256:[a-f0-9]{64}', item['image']) for item in value['inventory'].values()), 'RECOVERY_REQUIRED')
    require(not value['verifiedNotCommitted'] or (value['phase'] in ('verified-not-committed', 'restored')
            and value['domainInvoked'] and not value['newActivationAttempted']), 'RECOVERY_REQUIRED')
    require(value['phase'] != 'restored' or (not value['newActivationAttempted']
            and (not value['domainInvoked'] or value['verifiedNotCommitted'])), 'RECOVERY_REQUIRED')
    if 'rootPreconditionEvidence' in value:
        evidence = value['rootPreconditionEvidence']
        require(isinstance(evidence, dict) and set(evidence) == {'binding', 'journalSHA256', 'journal'}
                and evidence['binding'] == ROOT_PRECONDITION and digest(evidence['journalSHA256'])
                and isinstance(evidence['journal'], dict) and set(evidence['journal']) == keys,
                'ROOT_PRECONDITION_UNPROVEN')
        original = evidence['journal']
        require(hashlib.sha256((json.dumps(original, sort_keys=True) + '\n').encode()).hexdigest() == evidence['journalSHA256'],
                'ROOT_PRECONDITION_UNPROVEN')
        root_precondition_journal(original, release, manifest)
        expected = dict(original, phase=value['phase'], verifiedNotCommitted=True,
                        rootPreconditionEvidence=evidence)
        require(value['phase'] in ('verified-not-committed', 'restored'), 'ROOT_PRECONDITION_UNPROVEN')
        require(value == expected, 'ROOT_PRECONDITION_UNPROVEN')
    return value


def root_precondition_journal(journal, release, manifest):
    require(release.name == ROOT_PRECONDITION['release'] and manifest['sourceSHA'] == ROOT_PRECONDITION['sourceSHA']
            and manifest.get('files', {}).get('control-database.py') == ROOT_PRECONDITION['helperSHA256']
            and journal['phase'] == 'database-unknown' and journal['domainInvoked'] is True
            and journal['barrierAttempted'] is True and journal['verifiedNotCommitted'] is False
            and journal['newActivationAttempted'] is False and journal['kartRemovalAttempted'] is False
            and journal['stopped'] == ['management', 'kart', 'runtime'] and journal['runtimeIds'] == []
            and journal['precommitSHA256'] is None, 'ROOT_PRECONDITION_UNPROVEN')


def prove_root_precondition(release, manifest, journal):
    """One reviewed incident, never a general inference from an absent schema."""
    root_precondition_journal(journal, release, manifest)
    directory = PRIVATE / release.name
    require(os.geteuid() == ROOT_PRECONDITION['deploymentUid']
            and {file.name for file in directory.iterdir()} == {'control-journal.json'}
            and hashlib.sha256((release / 'control-database.py').read_bytes()).hexdigest() == ROOT_PRECONDITION['helperSHA256'],
            'ROOT_PRECONDITION_UNPROVEN')
    require((BASE / 'current').resolve(strict=True) == BASE / 'releases' / journal['previous']
            and journal['inventory']['management'].get('admin') == journal['previous'], 'ROOT_PRECONDITION_UNPROVEN')
    assert_env(Path(journal['envFile']), journal['envMetadata'])
    check_protected(journal['inventory'], journal['pointers'])
    require(contexts_for(journal['inventory']) == journal['contexts'], 'COMPOSE_CONTEXT_CHANGED')
    assert_nginx(journal['inventory'], True)
    for name in SERVICES:
        expected = stable_identity(journal['inventory'][name])
        expected['running'] = False
        require(stable_identity(target_inventory(name)) == expected, 'RESTORE_IDENTITY')
    require(database_floor(journal['inventory']['postgres']['id']) == 'absent', 'DATABASE_OUTCOME_UNKNOWN')
    original = dict(journal)
    journal['rootPreconditionEvidence'] = {
        'binding': dict(ROOT_PRECONDITION), 'journal': original,
        'journalSHA256': hashlib.sha256((json.dumps(original, sort_keys=True) + '\n').encode()).hexdigest(),
    }
    journal.update(phase='verified-not-committed', verifiedNotCommitted=True)
    save_journal(release, journal)  # Durable evidence permits retry after a partial restart.


def restore_before_migration(release, journal, *, explicit_not_committed=False):
    require(not journal['newActivationAttempted'] and (not journal['domainInvoked'] or explicit_not_committed), 'DATABASE_OUTCOME_UNKNOWN')
    if 'rootPreconditionEvidence' in journal:
        require(os.geteuid() == ROOT_PRECONDITION['deploymentUid']
                and (BASE / 'current').resolve(strict=True) == BASE / 'releases' / journal['previous'],
                'ROOT_PRECONDITION_UNPROVEN')
    items = journal['inventory']
    require(database_floor(items['postgres']['id']) == 'absent', 'DATABASE_OUTCOME_UNKNOWN')
    assert_env(Path(journal['envFile']), journal['envMetadata'])
    check_protected(items, journal['pointers'])
    require(contexts_for(items) == journal['contexts'], 'COMPOSE_CONTEXT_CHANGED')
    for name in SERVICES:
        actual, expected = stable_identity(target_inventory(name)), stable_identity(items[name])
        actual['running'] = expected['running']
        require(actual == expected, 'RESTORE_IDENTITY')
    for name in ('runtime', 'kart', 'management'):
        if name in journal['stopped']:
            command('docker', 'start', items[name]['id'])
            service_health(name, items[name])
        require(stable_identity(target_inventory(name)) == stable_identity(items[name]), 'RESTORE_IDENTITY')
    if journal['barrierAttempted']:
        # It may already be running if docker stop failed before taking effect.
        live = target_inventory('nginx')
        assert_nginx(items, not live['running'])
        if not live['running']:
            command('docker', 'start', items['nginx']['id'])
        assert_nginx(items, False)
    journal['phase'] = 'restored'
    save_journal(release, journal)


def adopt(release, manifest, caddy, recover=False, root_precondition=False):
    require(manifest['kind'] == 'control-application' and manifest['services'] == list(SERVICES), 'ADOPTION_BUNDLE')
    domain = domain_module()  # Missing real implementation stops before maintenance or image build.
    directory = PRIVATE / release.name
    private_directory(PRIVATE, True)
    private_directory(directory, True)
    journal_file = directory / 'control-journal.json'
    if recover:
        journal = adoption_journal(private_json(journal_file), release, manifest)
        if root_precondition and not journal.get('rootPreconditionEvidence'):
            prove_root_precondition(release, manifest, journal)
        if not journal['domainInvoked'] or journal['verifiedNotCommitted']:
            restore_before_migration(release, journal, explicit_not_committed=journal['verifiedNotCommitted'])
            return {'ok': True, 'mode': 'recover', 'outcome': 'restored-before-migration',
                    'release': release.name, 'sourceSHA': manifest['sourceSHA'],
                    'runnerSourceSHA': manifest['sourceSHA'],
                    'migrationArtifactSha256': manifest['migrationArtifactSha256'],
                    'controlEnabled': False, 'internalHealthVerified': True,
                    'restoredImages': {name: journal['inventory'][name]['image'] for name in SERVICES}}
        assert_nginx(journal['inventory'], True)
        require(target_inventory('postgres')['id'] == journal['inventory']['postgres']['id'], 'DATABASE_IDENTITY')
        require(database_floor(journal['inventory']['postgres']['id']) == 'schema2', 'DATABASE_OUTCOME_UNKNOWN')
        precommit, checksum = read_precommit(release, manifest)
        require(journal.get('precommitSHA256') in (None, checksum), 'PRECOMMIT_PROOF')
        journal['precommitSHA256'] = checksum
        write_private(journal_file, journal, True)
        authority({name: journal['candidateImage'] for name in SERVICES})
        assert_env(Path(journal['envFile']), journal['envMetadata'])
        require(contexts_for(journal['inventory']) == journal['contexts'], 'COMPOSE_CONTEXT_CHANGED')
        verified_database(domain, journal['inventory']['postgres']['id'], manifest, precommit['controlContract'])
    else:
        require(not journal_file.exists(), 'RECOVERY_REQUIRED')
        try:
            domain.player_session_migration(release)
        except BaseException as error:
            raise database_failure('DATABASE_PREFLIGHT_FAILED', error) from None
        items = inventory()
        require(database_floor(items['postgres']['id']) == 'absent', 'CONTROL_ALREADY_ADOPTED')
        previous = (BASE / 'current').resolve(strict=True)
        old = manifest_from(previous, True)
        require(items['management']['admin'] == previous.name, 'UNKNOWN_MANAGEMENT_SERVICE')
        envfile, signature, _ = management_config(previous, True)
        contexts = contexts_for(items)
        active_guards(items)
        image = build_image(release)
        authority({name: image for name in SERVICES})
        try:
            domain.preflight_control_database(release=release, source_sha=manifest['sourceSHA'],
                migration_sha256=manifest['migrationArtifactSha256'], inventory=items, writers_running=True)
        except BaseException as error:
            raise database_failure('DATABASE_PREFLIGHT_FAILED', error) from None
        journal = {'version': 1, 'release': release.name, 'sourceSHA': manifest['sourceSHA'], 'phase': 'prepared',
                   'inventory': items, 'contexts': contexts, 'candidateImage': image, 'previous': previous.name,
                   'envFile': str(envfile), 'envMetadata': signature, 'pointers': pointers_for(caddy),
                   'precommitPath': str(directory / 'control-precommit.json'), 'precommitSHA256': None,
                   'newActivationAttempted': False, 'stopped': [], 'runtimeIds': [],
                   'kartRemovalAttempted': False, 'domainInvoked': False, 'barrierAttempted': False,
                   'verifiedNotCommitted': False}
        write_private(journal_file, journal)
        try:
            stage('service_stop')
            journal['barrierAttempted'] = True
            save_journal(release, journal)
            command('docker', 'stop', '--time', '30', items['nginx']['id'])
            assert_nginx(items, True)
            journal['phase'] = 'barrier'
            save_journal(release, journal)
            active_guards(items)
            for name in ('management', 'kart', 'runtime'):
                journal['stopped'].append(name)
                save_journal(release, journal)
                command('docker', 'stop', '--time', '30', items[name]['id'])
            stopped_writers(items['postgres']['id'])
        except BaseException:
            restore_before_migration(release, journal)
            raise
        journal['phase'] = 'database'
        journal['domainInvoked'] = True
        write_private(journal_file, journal, True)
        stage('database_migration')
        try:
            result = provision_result(domain.provision_control_database(release=release, source_sha=manifest['sourceSHA'], migration_sha256=manifest['migrationArtifactSha256'], inventory=items), manifest)
            precommit, checksum = read_precommit(release, manifest)
            require(all(result[key] == precommit[key] for key in ('controlContract', 'backupSHA256', 'oldStateSHA256')), 'PRECOMMIT_PROOF')
            journal['precommitSHA256'] = checksum
            require(database_floor(items['postgres']['id']) == 'schema2', 'DATABASE_OUTCOME_UNKNOWN')
            verified_database(domain, items['postgres']['id'], manifest, result['controlContract'])
        except BaseException as error:
            # Never infer not_committed from a missing/late response or a failed SQL read.
            known = getattr(error, 'outcome', 'unknown') == 'not_committed' and getattr(error, 'oldDataUnchanged', False) is True and not journal['newActivationAttempted']
            journal['verifiedNotCommitted'] = known
            journal['phase'] = 'verified-not-committed' if known else 'database-unknown'
            write_private(journal_file, journal, True)
            if known and database_floor(items['postgres']['id']) == 'absent':
                restore_before_migration(release, journal, explicit_not_committed=True)
                raise database_failure('DATABASE_NOT_COMMITTED', error) from None
            raise database_failure('DATABASE_OUTCOME_UNKNOWN', error) from None
    # After COMMIT every failure keeps the owned entrypoint closed; no legacy fallback.
    journal['phase'], journal['newActivationAttempted'] = 'activate', True
    write_private(journal_file, journal, True)
    try:
        # 014 has a separate restore proof; 002's unchanged-data proof remains exact.
        try:
            domain.provision_player_sessions(release, journal['inventory']['postgres']['id'])
        except BaseException as error:
            raise database_failure('DATABASE_OUTCOME_UNKNOWN', error) from None
        current = activate_services(release, manifest, journal, SERVICES)
        verified_database(domain, journal['inventory']['postgres']['id'], manifest, precommit['controlContract'])
        check_protected(journal['inventory'], journal['pointers'])
        assert_nginx(journal['inventory'], True)
        proof = persist_control_proof(release, manifest, precommit, checksum)
        switch_pointer(release)
        command('docker', 'start', journal['inventory']['nginx']['id'])
        assert_nginx(journal['inventory'], False)
        public_probe(release)
        journal['phase'] = 'complete'
        write_private(journal_file, journal, True)
        return public_receipt('recover' if recover else 'adopt', release, manifest, manifest['sourceSHA'], current, proof)
    except BaseException:
        # Reassert the same barrier even if the final HTTPS probe failed after opening it.
        command('docker', 'stop', '--time', '30', journal['inventory']['nginx']['id'])
        assert_nginx(journal['inventory'], True)
        journal['phase'] = 'recovery-required'
        write_private(journal_file, journal, True)
        raise


def saved_pointers():
    result = {}
    for name in ('current', 'previous'):
        file = BASE / name
        require(not file.exists() or file.is_symlink(), 'ADMIN_POINTER')
        result[name] = str(file.resolve(strict=True)) if file.is_symlink() else None
        if result[name] is not None:
            manifest_from(Path(result[name]), True)
    return result


def restore_pointers(saved, allowed):
    tools = support('legacy-tools.py')
    for name, target in saved.items():
        file = BASE / name
        if target is not None:
            tools.atomic_pointer(file, Path(target))
        elif file.is_symlink():
            require(file.resolve() in allowed, 'ADMIN_POINTER')
            file.unlink()
        else:
            require(not file.exists(), 'ADMIN_POINTER')


def guarded_management(release, expected_image):
    manifest = manifest_from(release)
    proof = read_control_proof(release, manifest)
    file, signature, model = management_config(release)
    require(model['services']['management']['image'] == expected_image
            and re.fullmatch(r'sha256:[a-f0-9]{64}', expected_image), 'AUTHORITY_FALLBACK_REQUIRED')
    authority({'management': expected_image}, 'AUTHORITY_FALLBACK_REQUIRED')
    return manifest, proof, file, signature


def update(release, manifest, caddy, rollback=False):
    domain = domain_module()
    items = inventory()
    require(database_floor(items['postgres']['id']) == 'schema2', 'CONTROL_NOT_ADOPTED')
    saved = saved_pointers()
    current_release = Path(saved['current'])
    old_manifest, old_proof, envfile, signature = guarded_management(current_release, items['management']['image'])
    require(old_manifest['migrationArtifactSha256'] == manifest['migrationArtifactSha256'], 'CONTROL_CONTRACT')
    require(items['management']['admin'] == current_release.name, 'UNKNOWN_MANAGEMENT_SERVICE')
    authority({name: items[name]['image'] for name in SERVICES}, 'AUTHORITY_FALLBACK_REQUIRED')
    assert_live_flags(items)
    verified_database(domain, items['postgres']['id'], manifest, old_proof['controlContract'])
    operation = release
    if rollback:
        require(saved['previous'] is not None, 'AUTHORITY_FALLBACK_REQUIRED')
        target = Path(saved['previous'])
        target_manifest = manifest_from(target)
        target_model = private_json(PRIVATE / target.name / 'compose.json')
        image = target_model['services']['management']['image']
        _, proof, envfile, signature = guarded_management(target, image)
        require(proof['controlContract'] == old_proof['controlContract']
                and target_manifest['migrationArtifactSha256'] == manifest['migrationArtifactSha256'], 'CONTROL_CONTRACT')
    else:
        require(manifest['kind'] == 'control-application' and manifest['services'] == ['management'], 'UPDATE_BUNDLE')
        target, target_manifest = release, manifest
        image = build_image(release)
        authority({'management': image})
        proof = {'version': 1, 'sourceSHA': manifest['sourceSHA'], 'release': release.name,
                 'databaseProof': old_proof['databaseProof'], 'controlContract': old_proof['controlContract']}
    private_directory(PRIVATE / operation.name, True)
    protected = pointers_for(caddy)
    journal = {'version': 1, 'sourceSHA': manifest['sourceSHA'], 'release': operation.name,
               'phase': 'prepared', 'candidateImage': image, 'inventory': items,
               'envFile': str(envfile), 'envMetadata': signature, 'savedPointers': saved}
    journal_file = PRIVATE / operation.name / 'control-update.json'
    write_private(journal_file, journal)
    try:
        journal['phase'] = 'activate'
        write_private(journal_file, journal, True)
        active = activate_services(target, target_manifest, journal, ('management',))
        verified_database(domain, items['postgres']['id'], manifest, proof['controlContract'])
        check_protected(items, protected)
        if not rollback:
            write_private(PRIVATE / target.name / 'control-proof.json', proof)
        switch_pointer(target)
        public_probe(target)
        journal['phase'] = 'complete'
        write_private(journal_file, journal, True)
        return public_receipt('rollback' if rollback else 'reuse', target, target_manifest, manifest['sourceSHA'], active, proof)
    except BaseException:
        # The prior current release is the rollback target, not an unverified old previous.
        guarded_management(current_release, items['management']['image'])
        try:
            support('legacy-tools.py').compose_command(PRIVATE / current_release.name / 'compose.json', 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'management')
        finally:
            restore_pointers(saved, {target, current_release})
        restored = {name: target_inventory(name) for name in SERVICES}
        assert_live_flags(restored)
        service_health('management', restored['management'])
        verified_database(domain, items['postgres']['id'], manifest, old_proof['controlContract'])
        public_probe(current_release)
        check_protected(items, protected)
        journal['phase'] = 'restored'
        write_private(journal_file, journal, True)
        raise


def interrupted(_number, _frame):
    for number in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(number, signal.SIG_IGN)
    raise Stopped('SIGNAL_INTERRUPTED')


def diagnostic_markers(error):
    result = []
    owned, probe, pid = (getattr(error, key, None) for key in ('ownedContainerId', 'probeUUID', 'probeProcessId'))
    if digest(owned):
        result.append('ADMIN_REMOTE_OWNED_PROBE ' + owned)
    if isinstance(probe, str) and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', probe):
        result.append('ADMIN_REMOTE_PROBE_UUID ' + probe)
    if type(pid) is int and 1 <= pid <= 2147483647:
        result.append('ADMIN_REMOTE_PROBE_PID ' + str(pid))
    return result


def recovery_target(runner, manifest, payload):
    require(manifest['kind'] == 'control-runner' and isinstance(payload['targetRelease'], str)
            and re.fullmatch(r'[a-z0-9-]{1,100}', payload['targetRelease'])
            and digest(payload['targetManifestSHA256']), 'CONFIG')
    target = BASE / 'releases' / payload['targetRelease']
    target_manifest = manifest_from(target)
    require(hashlib.sha256((target / 'manifest.json').read_bytes()).hexdigest() == payload['targetManifestSHA256'], 'RELEASE_HASH')
    require(target_manifest['migrationArtifactSha256'] == manifest['migrationArtifactSha256'], 'CONTROL_CONTRACT')
    require(target != runner, 'RECOVERY_REQUIRED')
    return target, target_manifest


def main(args=None, payload=None):
    args = sys.argv[1:] if args is None else args
    require(len(args) == 1 and args[0] in ('--adopt', '--recover', '--reuse', '--rollback'), 'ARGUMENTS')
    if payload is None:
        data = sys.stdin.buffer.read(8193)
        require(len(data) <= 8192, 'INPUT_TOO_LARGE')
        payload = json_value(data)
    keys = {'caddyDirectory', 'sourceSHA'} | ({'targetRelease', 'targetManifestSHA256'} if args[0] == '--recover' else set())
    root_precondition = isinstance(payload, dict) and payload.get('recoveryEvidence') == 'root-precondition-v1'
    if root_precondition and args[0] == '--recover':
        keys.add('recoveryEvidence')
    require(isinstance(payload, dict) and set(payload) == keys
            and digest(payload['sourceSHA'], 40) and isinstance(payload['caddyDirectory'], str)
            and re.fullmatch(r'/opt/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+', payload['caddyDirectory']), 'CONFIG')
    release = Path(__file__).resolve().parent
    manifest = manifest_from(release)
    require(manifest['sourceSHA'] == payload['sourceSHA'], 'SOURCE_MISMATCH')
    target, target_manifest = release, manifest
    if args[0] == '--recover':
        # Domain code and all tools come from this current reviewed runner. The
        # historical release is immutable application/journal data, never code.
        target, target_manifest = recovery_target(release, manifest, payload)
    domain_module()
    caddy = Path(payload['caddyDirectory'])
    require(caddy.resolve(strict=True) == caddy and caddy != ROOT, 'CADDY_PATH')
    import fcntl
    with contextlib.ExitStack() as stack:
        for file in (caddy / 'deploy.lock', ROOT / 'deploy.lock'):
            require(not file.is_symlink(), 'LOCK_PATH')
            lock = stack.enter_context(file.open('a'))
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        stage('preflight')
        if args[0] in ('--adopt', '--recover'):
            receipt = adopt(target, target_manifest, caddy, args[0] == '--recover', root_precondition)
            receipt['runnerSourceSHA'] = manifest['sourceSHA']
        else:
            receipt = update(release, manifest, caddy, args[0] == '--rollback')
    stage('complete')
    print(json.dumps(receipt))


if __name__ == '__main__':
    try:
        for number in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(number, interrupted)
        main()
    except BaseException as error:
        print('ADMIN_REMOTE_FAILED_STAGE ' + (error.stage if isinstance(error, Stopped) else STAGE), file=sys.stderr)
        print('ADMIN_REMOTE_STOPPED ' + (error.code if isinstance(error, Stopped) else 'UNEXPECTED_FAILURE'), file=sys.stderr)
        # Shared-probe ownership facts are public; never emit arbitrary causes or stderr.
        for marker in diagnostic_markers(error):
            print(marker, file=sys.stderr)
        sys.exit(1)
