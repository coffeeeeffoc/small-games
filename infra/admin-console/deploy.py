"""User-run admin-only transaction. stdout/stderr never contain command diagnostics."""
import contextlib
import hashlib
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import signal
import stat
import subprocess
import sys
import time
import urllib.parse

ROOT = Path('/opt/small-games')
BASE = ROOT / 'admin-console'
PRIVATE = ROOT / 'admin-private'
ORIGIN = 'https://admin.nenggongzhiren.cn'
CALLBACK = ORIGIN + '/api/auth/github/callback'
EMAIL = '1521152077@qq.com'
LABEL = 'io.small-games.admin-fixture'


class Stopped(Exception):
    pass


def require(condition, code):
    if not condition:
        raise Stopped(code)


def command(*args, input=None, timeout=180):
    try:
        result = subprocess.run(args, input=input, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError):
        raise Stopped('COMMAND_FAILED') from None
    if result.returncode != 0:
        error = Stopped('COMMAND_FAILED')
        found = re.search(rb'ERROR:\s+([A-Z0-9]{5})\b', result.stderr)
        error.sqlstate = found[1].decode() if found else None
        raise error
    return result.stdout


def scalar(*args, **kwargs):
    return command(*args, **kwargs).decode().strip()


def inspect_container(identifier):
    projection = '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}},"networks":{{json .NetworkSettings.Networks}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"admin":{{json (index .Config.Labels "io.small-games.admin")}},"fixture":{{json (index .Config.Labels "io.small-games.admin-fixture")}}}'
    value = json.loads(command('docker', 'inspect', '--format', projection, identifier))
    # Endpoint IDs are recreated by stop/start; retain the actual network and address contract.
    value['networks'] = {name: {key: network.get(key) for key in
        ['NetworkID', 'IPAddress', 'IPPrefixLen', 'Gateway', 'GlobalIPv6Address', 'GlobalIPv6PrefixLen', 'Aliases']}
        for name, network in value['networks'].items()}
    return value


def service(project, name, optional=False):
    ids = scalar('docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project,
                 '--filter', 'label=com.docker.compose.service=' + name).splitlines()
    require(len(ids) == 1 or (optional and not ids), 'SERVICE_INVENTORY')
    return inspect_container(ids[0]) if ids else None


def private_directory(directory):
    if not directory.exists():
        directory.mkdir(mode=0o700)
    facts = directory.lstat()
    require(stat.S_ISDIR(facts.st_mode) and facts.st_uid == os.geteuid()
            and stat.S_IMODE(facts.st_mode) == 0o700, 'PRIVATE_DIRECTORY')


def private_file(file):
    facts = file.lstat()
    require(stat.S_ISREG(facts.st_mode) and facts.st_nlink == 1 and facts.st_uid == os.geteuid()
            and stat.S_IMODE(facts.st_mode) == 0o600, 'PRIVATE_FILE')
    return file.read_bytes()


def write_private(file, content):
    fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


def manifest_from(release):
    require(release.parent == BASE / 'releases' and release.resolve() == release
            and re.fullmatch(r'[a-z0-9-]+', release.name), 'RELEASE_PATH')
    manifest = json.loads((release / 'manifest.json').read_bytes())
    require(manifest['version'] == 1 and manifest['release'] == release.name
            and re.fullmatch(r'[a-f0-9]{40}', manifest['sourceSHA']), 'RELEASE_MANIFEST')
    for name, digest in manifest['files'].items():
        file = release / name
        require(re.fullmatch(r'[A-Za-z0-9_./-]+', name) and '..' not in Path(name).parts
                and not Path(name).is_absolute() and file.resolve() == file and file.is_file(), 'RELEASE_FILE')
        require(hashlib.sha256(file.read_bytes()).hexdigest() == digest, 'RELEASE_HASH')
    require(set(manifest['files']) >= {'deploy.py', 'fingerprint.sql', 'migrations/001-admin-auth.sql'}, 'RELEASE_MANIFEST')
    return manifest


def migration_body(text):
    found = re.fullmatch(r'(?s)(?:--[^\n]*\n)*BEGIN;\n(.*)\nCOMMIT;\s*', text.replace('\r\n', '\n'))
    require(found is not None, 'MIGRATION_BOUNDARIES')
    require(not re.search(r'(?im)^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;', found[1]), 'MIGRATION_BOUNDARIES')
    return found[1]


def psql(container, sql, database='small_games', user='platform_owner'):
    return scalar('docker', 'exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                  '-v', 'VERBOSITY=sqlstate',
                  '-U', user, '-d', database, input=sql.encode())


def old_state(container, fingerprint, include_admin=False):
    sql = 'BEGIN;\nCREATE TEMP TABLE sg_admin_init(n integer) ON COMMIT DROP;\n' + fingerprint
    return psql(container, sql + '\nSELECT pg_temp.sg_admin_old_state(' + str(include_admin).lower() + ');\nROLLBACK;')


def require_same_state(actual, expected, code):
    if actual != expected:
        error = Stopped(code)
        before, after = json.loads(expected), json.loads(actual)
        error.sections = [key for key in ('rows','database','roles','members','schemas','relations','columns','constraints','indexes','routines','defaults','policies') if before.get(key) != after.get(key)]
        error.relations = [key for key in before.get('rows', {}) if before['rows'][key] != after.get('rows', {}).get(key)]
        raise error


PUBLIC_CHECK = """
SELECT NOT EXISTS (SELECT FROM pg_database d, LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.grantee=0)
 AND NOT EXISTS (SELECT FROM pg_namespace n, LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema','admin_console') AND a.grantee=0)
 AND NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, LATERAL aclexplode(c.relacl) a WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema','admin_console') AND a.grantee=0)
 AND NOT EXISTS (SELECT FROM pg_attribute x JOIN pg_class c ON c.oid=x.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace, LATERAL aclexplode(x.attacl) a WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema','admin_console') AND a.grantee=0);
"""
EFFECTIVE_CHECK = """
SELECT has_database_privilege('management_app',current_database(),'CONNECT')
 AND (SELECT count(*) FROM pg_database d, LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.grantee='management_app'::regrole)=1
 AND NOT EXISTS (SELECT FROM pg_database d, LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.grantee='management_app'::regrole AND (a.grantor<>d.datdba OR a.privilege_type<>'CONNECT' OR a.is_grantable))
 AND EXISTS (SELECT FROM pg_roles WHERE rolname='management_app' AND rolcanlogin AND rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit=-1 AND rolvaliduntil IS NULL AND rolconfig IS NULL)
 AND NOT has_database_privilege('management_app',current_database(),'CREATE,TEMP')
 AND NOT EXISTS (SELECT FROM pg_auth_members WHERE roleid='management_app'::regrole OR member='management_app'::regrole)
 AND NOT EXISTS (SELECT FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema','admin_console') AND has_schema_privilege('management_app',oid,'USAGE,CREATE'))
 AND NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema','admin_console') AND CASE WHEN c.relkind IN ('r','p','v','m','f') THEN has_table_privilege('management_app',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') ELSE false END)
 AND NOT EXISTS (SELECT FROM pg_attribute x JOIN pg_class c ON c.oid=x.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema','admin_console') AND CASE WHEN c.relkind IN ('r','p','v','m','f') AND x.attnum>0 AND NOT x.attisdropped THEN has_column_privilege('management_app',c.oid,x.attnum,'SELECT,INSERT,UPDATE,REFERENCES') ELSE false END)
 AND NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema','admin_console') AND CASE WHEN c.relkind='S' THEN has_sequence_privilege('management_app',c.oid,'USAGE,SELECT,UPDATE') ELSE false END);
"""


def transaction(password, migration, fingerprint, include_admin=False):
    require(re.fullmatch(r'[a-f0-9]{64}', password), 'DATABASE_CONFIG')
    # Set all logging guards before the first statement containing a password.
    return """BEGIN;
SET LOCAL log_statement='none';
SET LOCAL log_min_error_statement='panic';
SET LOCAL log_error_verbosity='terse';
SET LOCAL log_parameter_max_length_on_error=0;
SELECT pg_advisory_xact_lock(67602420261016);
CREATE TEMP TABLE sg_admin_init(n integer) ON COMMIT DROP;
""" + fingerprint + """
CREATE TEMP TABLE sg_admin_before AS SELECT pg_temp.sg_admin_old_state(""" + str(include_admin).lower() + """) value;
DO $role$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='management_app') THEN
   CREATE ROLE management_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '""" + password + """';
 END IF;
END $role$;
GRANT CONNECT ON DATABASE small_games TO management_app;
""" + migration + """
DO $guard$ BEGIN
 IF (SELECT value FROM sg_admin_before) IS DISTINCT FROM pg_temp.sg_admin_old_state(""" + str(include_admin).lower() + """) THEN
   RAISE EXCEPTION 'OLD_DATABASE_CHANGED';
 END IF;
 IF NOT (""" + EFFECTIVE_CHECK.strip()[7:-1] + """) THEN
   RAISE EXCEPTION 'MANAGEMENT_PRIVILEGE_OVERREACH';
 END IF;
END $guard$;
COMMIT;
"""


def database_config(pg):
    file = PRIVATE / 'database.json'
    present = psql(pg, "SELECT EXISTS(SELECT FROM pg_roles WHERE rolname='management_app');") == 't'
    if file.exists():
        value = json.loads(private_file(file))
        require(set(value) == {'version', 'password'} and value['version'] == 1
                and re.fullmatch(r'[a-f0-9]{64}', value['password']), 'DATABASE_CONFIG')
    else:
        require(not present, 'UNKNOWN_MANAGEMENT_ROLE')
        value = {'version': 1, 'password': secrets.token_hex(32)}
        write_private(file, (json.dumps(value) + '\n').encode())
    if present:
        sql = "\\setenv PGPASSWORD '" + value['password'] + "'\n\\connect 'host=127.0.0.1 user=management_app dbname=small_games'\nSELECT current_user='management_app';\n"
        require(psql(pg, sql).splitlines()[-1] == 't', 'DATABASE_CONFIG')
    return value


def ready(container, user):
    for _ in range(60):
        try:
            command('docker', 'exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', user, timeout=5)
            psql(container, 'SELECT 1;', 'postgres', user)
            return
        except Stopped:
            time.sleep(1)
    raise Stopped('RESTORE_NOT_READY')


def clone_negative_checks(clone):
    statements = [
        'SELECT * FROM runtime.competition_players LIMIT 0;',
        'CREATE TABLE admin_console.forbidden(n integer);',
        'UPDATE admin_console.schema_version SET version=1;',
        'INSERT INTO admin_console.schema_version VALUES(1);',
        'TRUNCATE admin_console.admin_sessions;',
        'CREATE SCHEMA forbidden;',
        'CREATE TEMP TABLE forbidden(n integer);',
        'SET ROLE runtime_app;',
    ]
    for statement in statements:
        sql = "BEGIN; SET SESSION AUTHORIZATION management_app; DO $negative$ BEGIN EXECUTE '" + statement.replace("'", "''") + "'; RAISE EXCEPTION 'CLONE_PERMISSION_OVERREACH'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $negative$; ROLLBACK;"
        psql(clone, sql)
    psql(clone, "BEGIN; SET SESSION AUTHORIZATION runtime_app; DO $negative$ BEGIN PERFORM * FROM admin_console.schema_version; RAISE EXCEPTION 'RUNTIME_ADMIN_OVERREACH'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $negative$; ROLLBACK;")


def restore_roles_sql(roles):
    text = roles.decode('utf-8')
    require(len(re.findall(r'(?m)^CREATE ROLE platform_owner;$', text)) == 1, 'RESTORE_ROLE_DUMP')
    return re.sub(r'(?m)^CREATE ROLE platform_owner;\n', '', text)


def restore_proof(pg, backup, roles, migration, fingerprint, password, expected, tag, include_admin=False):
    name = 'sg-admin-restore-' + tag
    image = inspect_container(pg)['image']
    existing = scalar('docker', 'ps', '-aq', '--filter', 'name=^/' + name + '$')
    require(not existing, 'RESTORE_NAME_EXISTS')
    identifier = None
    try:
        identifier = scalar('docker', 'run', '-d', '--pull=never', '--name', name,
                            '--label', LABEL + '=' + tag, '--network', 'none',
                            '--tmpfs', '/var/lib/postgresql/data:rw',
                            '-e', 'POSTGRES_USER=platform_owner', '-e', 'POSTGRES_PASSWORD=fixture-not-a-secret', image)
        require(re.fullmatch(r'[a-f0-9]{64}', identifier), 'RESTORE_ID')
        ready(identifier, 'platform_owner')
        # Same bootstrap owner preserves grantors on PostgreSQL's built-in memberships.
        psql(identifier, restore_roles_sql(roles), 'postgres', 'platform_owner')
        command('docker', 'exec', '-i', identifier, 'pg_restore', '--exit-on-error', '--create',
                '-U', 'platform_owner', '-d', 'postgres', input=backup.read_bytes())
        require_same_state(old_state(identifier, fingerprint, include_admin), expected, 'RESTORE_FINGERPRINT')
        psql(identifier, transaction(password, migration, fingerprint, include_admin))
        require(psql(identifier, PUBLIC_CHECK).strip() == 't' and psql(identifier, EFFECTIVE_CHECK) == 't', 'CLONE_PERMISSIONS')
        after = old_state(identifier, fingerprint, include_admin)
        require(after == expected, 'CLONE_OLD_CHANGED')
        psql(identifier, transaction(password, migration, fingerprint, include_admin))
        require(old_state(identifier, fingerprint, include_admin) == expected, 'MIGRATION_NOT_IDEMPOTENT')
        clone_negative_checks(identifier)
    finally:
        if identifier is None:
            found = scalar('docker', 'ps', '-aq', '--no-trunc', '--filter', 'name=^/' + name + '$', '--filter', 'label=' + LABEL + '=' + tag).splitlines()
            require(len(found) <= 1, 'RESTORE_CLEANUP_GUARD')
            if found:
                identifier = found[0]
        if identifier is not None:
            current = inspect_container(identifier)
            require(current['id'] == identifier and current['fixture'] == tag, 'RESTORE_CLEANUP_GUARD')
            command('docker', 'rm', '-f', identifier)


def raw_environment(password, oauth, trusted_ip):
    require(set(oauth) == {'clientId', 'clientSecret'} and re.fullmatch(r'[A-Za-z0-9_-]{1,256}', oauth['clientId']), 'OAUTH_REQUIRED')
    require(0 < len(oauth['clientSecret']) <= 4096 and not re.search(r'[\r\n\0]', oauth['clientSecret']), 'OAUTH_REQUIRED')
    ip = ipaddress.ip_address(trusted_ip)
    require(ip.version == 4 and ip.is_private, 'TRUSTED_PROXY')
    values = {'NODE_ENV': 'production', 'HOST': '0.0.0.0', 'PORT': '43001', 'TRUST_PROXY': '1',
              'MANAGEMENT_CAPABILITIES': 'admin', 'MANAGEMENT_DATABASE_URL': 'postgres://management_app:' + password + '@postgres:5432/small_games',
              'ADMIN_ORIGIN': ORIGIN, 'ADMIN_ALLOWED_EMAILS': EMAIL,
              'ADMIN_GITHUB_CLIENT_ID': oauth['clientId'], 'ADMIN_GITHUB_CLIENT_SECRET': oauth['clientSecret'],
              'MANAGEMENT_TRUSTED_PROXY_IP': trusted_ip, 'ADMIN_CORS_ORIGINS': ORIGIN,
              'ADMIN_CORS_METHODS': 'GET,POST,OPTIONS', 'ADMIN_CORS_HEADERS': 'content-type,x-csrf-token',
              'ADMIN_CORS_CREDENTIALS': 'true'}
    return ''.join(key + '=' + value + '\n' for key, value in values.items()).encode()


def compose(release, envfile):
    return {'name': 'small-games', 'services': {'management': {
        'image': 'small-games-management:' + release.name, 'container_name': 'small-games-management-1',
        'command': ['node', 'services/management-api/dist/main.js'], 'init': True, 'restart': 'unless-stopped',
        'env_file': [{'path': str(envfile), 'format': 'raw'}], 'networks': ['existing'],
        'labels': {'io.small-games.admin': release.name}, 'security_opt': ['no-new-privileges:true'],
        'cap_drop': ['ALL'], 'logging': {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}},
        'healthcheck': {'test': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:43001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
                        'interval': '5s', 'timeout': '4s', 'retries': 24}}},
        'networks': {'existing': {'external': True, 'name': 'small-games_default'}}}


def compose_command(file, *args):
    return command('docker', 'compose', '--env-file', '/dev/null', '-p', 'small-games', '-f', str(file), *args)


def raw_capability(directory):
    canary = "raw-$HOME-${UNSET}-'quoted'-\"double\"-#hash-\\slash"
    envfile, config = directory / 'raw-canary.env', directory / 'raw-canary.json'
    write_private(envfile, ('CANARY=' + canary + '\n').encode())
    write_private(config, json.dumps({'services': {'probe': {'image': 'unused', 'env_file': [{'path': str(envfile), 'format': 'raw'}]}}}).encode())
    parsed = json.loads(compose_command(config, 'config', '--format', 'json'))
    # Compose config serializes literal dollars as $$ so the emitted model can be reused.
    value = parsed['services']['probe']['environment']['CANARY']
    require(value in (canary, canary.replace('$', '$$')), 'COMPOSE_RAW_UNSUPPORTED')


def https_request(path, deadline):
    remaining = deadline - time.monotonic()
    require(remaining > 0, 'HTTPS_PROBE')
    connection = http.client.HTTPSConnection('admin.nenggongzhiren.cn', timeout=min(5, remaining))
    try:
        connection.request('GET', path)
        response = connection.getresponse()
        body, headers, status = response.read(1048577), response.getheaders(), response.status
        require(len(body) <= 1048576, 'HTTPS_PROBE')
        return status, headers, body
    finally:
        connection.close()


def anonymous_probe(deadline):
    require(https_request('/', deadline)[0] == 200 and https_request('/api/session', deadline)[0] == 401, 'HTTPS_PROBE')


def public_probe_once(oauth, deadline):
    anonymous_probe(deadline)
    status, headers, _ = https_request('/api/auth/github', deadline)
    header = dict((key.lower(), value) for key, value in headers)
    target = urllib.parse.urlsplit(header.get('location', ''))
    query = urllib.parse.parse_qs(target.query, keep_blank_values=True)
    require(status == 302 and target.scheme == 'https' and target.netloc == 'github.com'
            and target.path == '/login/oauth/authorize' and not target.fragment
            and query.get('client_id') == [oauth['clientId']] and query.get('redirect_uri') == [CALLBACK]
            and query.get('scope') == ['user:email'] and query.get('code_challenge_method') == ['S256']
            and len(query.get('state', [])) == 1 and len(query['state'][0]) >= 32
            and len(query.get('code_challenge', [])) == 1 and len(query['code_challenge'][0]) == 43, 'OAUTH_PROBE')
    cookies = [value for key, value in headers if key.lower() == 'set-cookie']
    require(any(value.startswith('__Secure-sg_admin_flow=') and 'Path=/api/' in value
                and 'HttpOnly' in value and 'Secure' in value and 'SameSite=Lax' in value
                and 'domain=' not in value.lower() for value in cookies), 'COOKIE_PROBE')


def retry_probe(probe):
    # Existing Nginx negative DNS caching may retain the previously absent service for 30s.
    deadline = time.monotonic() + 35
    while True:
        try:
            probe(deadline)
            return
        except (Stopped, OSError, http.client.HTTPException):
            require(time.monotonic() < deadline, 'HTTPS_PROBE')
            time.sleep(1)


def public_probe(oauth):
    retry_probe(lambda deadline: public_probe_once(oauth, deadline))


def atomic_pointer(file, target):
    temporary = file.parent / ('.' + file.name + '-' + secrets.token_hex(6))
    temporary.symlink_to(target)
    os.replace(temporary, file)


def admin_pointer_state():
    result = {}
    for file in (BASE / 'current', BASE / 'previous'):
        require(not file.exists() or file.is_symlink(), 'ADMIN_POINTER')
        if file.is_symlink():
            target = file.resolve(strict=True)
            manifest_from(target)
            result[file] = Path(os.readlink(file))
        else:
            result[file] = None
    return result


def restore_admin_pointers(saved, allowed):
    for file, target in saved.items():
        if target is not None:
            atomic_pointer(file, target)
        elif file.is_symlink():
            require(file.resolve() in allowed, 'ADMIN_POINTER_ROLLBACK')
            file.unlink()
        else:
            require(not file.exists(), 'ADMIN_POINTER_ROLLBACK')


def activate(release, password, oauth, trusted_ip):
    saved = admin_pointer_state()
    previous = (BASE / 'current').resolve(strict=True) if (BASE / 'current').is_symlink() else None
    old_service = service('small-games', 'management', optional=True)
    require(not old_service or (previous and old_service['admin'] == previous.name and not old_service['ports']), 'UNKNOWN_MANAGEMENT_SERVICE')
    revision = PRIVATE / release.name
    private_directory(revision)
    raw_capability(revision)
    envfile = revision / 'management.env'
    write_private(envfile, raw_environment(password, oauth, trusted_ip))
    file = revision / 'compose.json'
    write_private(file, (json.dumps(compose(release, envfile)) + '\n').encode())
    compose_command(file, 'config', '--quiet')
    command('docker', 'build', '--pull=false', '-t', 'small-games-management:' + release.name, str(release), timeout=1200)
    try:
        compose_command(file, 'up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '180', 'management')
        current = service('small-games', 'management')
        require(current['admin'] == release.name and not current['ports']
                and set(current['networks']) == {'small-games_default'}, 'MANAGEMENT_BOUNDARY')
        public_probe(oauth)
        if previous:
            atomic_pointer(BASE / 'previous', previous)
        atomic_pointer(BASE / 'current', release)
    except Exception:
        try:
            current = service('small-games', 'management', optional=True)
            if current:
                require(current['admin'] == release.name, 'ROLLBACK_GUARD')
                command('docker', 'rm', '-f', current['id'])
            if previous:
                compose_command(PRIVATE / previous.name / 'compose.json', 'up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '180', 'management')
        finally:
            restore_admin_pointers(saved, {release, previous})
        raise


def rollback():
    saved = admin_pointer_state()
    current, previous = (BASE / 'current').resolve(strict=True), (BASE / 'previous').resolve(strict=True)
    manifest_from(current)
    manifest_from(previous)
    item = service('small-games', 'management')
    require(item['admin'] == current.name and not item['ports'], 'ROLLBACK_GUARD')
    file = PRIVATE / previous.name / 'compose.json'
    private_file(file)
    compose_command(file, 'config', '--quiet')
    proof = json.loads(private_file(PRIVATE / ('backup-' + previous.name) / 'receipt.json'))
    require(proof.get('sourceSHA') == manifest_from(previous)['sourceSHA']
            and all(isinstance(proof.get(key), str) and re.fullmatch(r'[a-f0-9]{64}', proof[key]) for key in ('backupSHA256','oldStateSHA256'))
            and all(proof.get(key) is True for key in ('oldDataUnchanged','isolatedRestoreVerified','leastPrivilegeVerified')), 'ROLLBACK_PROOF')
    try:
        compose_command(file, 'up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '180', 'management')
        retry_probe(anonymous_probe)
        atomic_pointer(BASE / 'current', previous)
        atomic_pointer(BASE / 'previous', current)
    except Exception:
        try:
            compose_command(PRIVATE / current.name / 'compose.json', 'up', '-d', '--no-deps', '--no-build', '--wait', '--wait-timeout', '180', 'management')
        finally:
            restore_admin_pointers(saved, {current, previous})
        raise
    return {'ok': True, 'rolledBack': True, 'sourceSHA': manifest_from(previous)['sourceSHA'],
            'backupSHA256': proof['backupSHA256'], 'oldStateSHA256': proof['oldStateSHA256'],
            'oldDataUnchanged': True, 'isolatedRestoreVerified': True, 'leastPrivilegeVerified': True,
            'backupRetained': True, 'realGithubLoginVerified': False}


def provision(release, config):
    manifest = manifest_from(release)
    require(manifest['sourceSHA'] == config['sourceSHA'], 'SOURCE_MISMATCH')
    private_directory(PRIVATE)
    tag = release.name
    backup_dir = PRIVATE / ('backup-' + tag)
    private_directory(backup_dir)
    protected = {name: service(project, name) for project, name in [
        ('small-games', 'postgres'), ('small-games', 'runtime'), ('small-games', 'kart'),
        ('small-games', 'nginx'), ('company-web', 'web')]}
    require(all(value['running'] for value in protected.values()), 'SERVICE_NOT_RUNNING')
    pg = protected['postgres']['id']
    require(psql(pg, "SELECT current_user='platform_owner' AND current_database()='small_games' AND current_setting('server_version_num')::int BETWEEN 170006 AND 170006 AND EXISTS(SELECT FROM pg_roles WHERE oid=10 AND rolname='platform_owner') AND NOT EXISTS(SELECT FROM pg_roles WHERE rolname='sg_admin_restore');") == 't', 'DATABASE_IDENTITY')
    require(psql(pg, PUBLIC_CHECK) == 't', 'PUBLIC_PRIVILEGES')
    require(psql(pg, "SELECT count(*) FROM runtime.competition_rooms WHERE data->>'status' IN ('waiting','playing') AND expires_at>(extract(epoch from now())*1000)::bigint;") == '0', 'ACTIVE_GAME')
    command('docker', 'exec', protected['kart']['id'], 'node', '-e', "fetch('http://127.0.0.1:43003/health').then(r=>r.json()).then(v=>process.exit(v.rooms===0?0:1)).catch(()=>process.exit(1))")
    ingress = json.loads((Path(config['caddyDirectory']) / 'current/ingress.json').read_bytes())
    trusted_ip = ingress['nginx']['backendIp']
    require(protected['nginx']['networks']['small-games_default']['IPAddress'] == trusted_ip, 'TRUSTED_PROXY')
    pointers = {file: file.resolve(strict=True) for file in [ROOT / 'current', ROOT / 'backend-current', Path(config['caddyDirectory']) / 'current']}
    migration = migration_body((release / 'migrations/001-admin-auth.sql').read_text(encoding='utf-8'))
    fingerprint = (release / 'fingerprint.sql').read_text(encoding='utf-8')
    management = service('small-games', 'management', optional=True)
    if management:
        current = (BASE / 'current').resolve(strict=True)
        manifest_from(current)
        require(management['running'] and management['admin'] == current.name and not management['ports'], 'UNKNOWN_MANAGEMENT_SERVICE')
        protected['management'] = management
    include_admin = psql(pg, "SELECT to_regnamespace('admin_console') IS NOT NULL;") == 't'
    stopped = []
    try:
        for name in (['management'] if management else []) + ['kart', 'runtime']:
            stopped.append(name)
            command('docker', 'stop', '--time', '30', protected[name]['id'])
        require(psql(pg, "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend';") == '0', 'UNKNOWN_DATABASE_WRITER')
        expected = old_state(pg, fingerprint, include_admin)
        write_private(backup_dir / 'before.json', expected.encode())
        roles = command('docker', 'exec', pg, 'pg_dumpall', '-U', 'platform_owner', '--roles-only', '--no-role-passwords')
        write_private(backup_dir / 'roles.sql', roles)
        backup = backup_dir / 'database.dump'
        write_private(backup, command('docker', 'exec', pg, 'pg_dump', '-U', 'platform_owner', '-d', 'small_games', '-Fc', timeout=600))
        password = database_config(pg)['password']
        restore_proof(pg, backup, roles, migration, fingerprint, password, expected, tag, include_admin)
        psql(pg, transaction(password, migration, fingerprint, include_admin))
        require(old_state(pg, fingerprint, include_admin) == expected and psql(pg, PUBLIC_CHECK) == 't'
                and psql(pg, EFFECTIVE_CHECK) == 't', 'PRODUCTION_PERMISSION_PROOF')
        proof = {'sourceSHA': manifest['sourceSHA'],
            'backupSHA256': hashlib.sha256(backup.read_bytes()).hexdigest(), 'oldDataUnchanged': True,
            'oldStateSHA256': hashlib.sha256(expected.encode()).hexdigest(),
            'isolatedRestoreVerified': True, 'leastPrivilegeVerified': True}
        write_private(backup_dir / 'receipt.json', json.dumps(proof).encode())
    finally:
        restart_failed = False
        for name in ['runtime', 'kart', 'management']:
            if name in stopped:
                try:
                    command('docker', 'start', protected[name]['id'])
                except Stopped:
                    restart_failed = True
        for name in ['runtime', 'kart'] + (['management'] if management else []):
            for _ in range(60):
                try:
                    port = {'runtime': '43002', 'kart': '43003', 'management': '43001'}[name]
                    command('docker', 'exec', protected[name]['id'], 'node', '-e', "fetch('http://127.0.0.1:" + port + "/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))", timeout=5)
                    break
                except Stopped:
                    time.sleep(1)
            else:
                restart_failed = True
        require(not restart_failed, 'GAME_RESTART_FAILED')
        require(all(inspect_container(value['id']) == value for value in protected.values()), 'PROTECTED_CONTAINER_CHANGED')
        require(all(file.resolve(strict=True) == target for file, target in pointers.items()), 'PROTECTED_POINTER_CHANGED')
    return password, trusted_ip, proof


def protection_snapshot(caddy):
    containers = {name: service(project, name) for project, name in [
        ('small-games', 'postgres'), ('small-games', 'runtime'), ('small-games', 'kart'),
        ('small-games', 'nginx'), ('company-web', 'web')]}
    pointers = {file: file.resolve(strict=True) for file in [ROOT / 'current', ROOT / 'backend-current', caddy / 'current']}
    return containers, pointers


def assert_protection(snapshot):
    containers, pointers = snapshot
    require(all(inspect_container(value['id']) == value for value in containers.values()), 'PROTECTED_CONTAINER_CHANGED')
    require(all(file.resolve(strict=True) == target for file, target in pointers.items()), 'PROTECTED_POINTER_CHANGED')


def read_payload(stream):
    data = stream.read(16385)
    require(len(data) <= 16384, 'INPUT_TOO_LARGE')
    return json.loads(data)


def interrupted(signum, frame):
    for item in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(item, signal.SIG_IGN)
    raise Stopped('SIGNAL_INTERRUPTED')


def main(args=None, payload=None):
    import fcntl
    args = sys.argv[1:] if args is None else args
    require(len(args) == 1 and args[0] in ('--execute', '--provision-only', '--rollback'), 'ARGUMENTS')
    config = read_payload(sys.stdin.buffer) if payload is None else payload
    require(isinstance(config, dict) and re.fullmatch(r'/opt/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+', config.get('caddyDirectory', '')), 'CONFIG')
    caddy = Path(config['caddyDirectory'])
    require(caddy.resolve() == caddy and caddy != ROOT and caddy.is_dir(), 'CADDY_PATH')
    # Match existing ingress transactions: Caddy lock first, game lock second.
    with contextlib.ExitStack() as stack:
        for file in [caddy / 'deploy.lock', ROOT / 'deploy.lock']:
            require(not file.is_symlink(), 'LOCK_PATH')
            lock = stack.enter_context(file.open('a'))
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        protection = protection_snapshot(caddy)
        try:
            if args[0] == '--rollback':
                receipt = rollback()
            else:
                require(set(config) == ({'caddyDirectory', 'sourceSHA'} if args[0] == '--provision-only' else {'caddyDirectory', 'sourceSHA', 'oauth'}), 'CONFIG')
                release = Path(__file__).resolve().parent
                password, trusted_ip, proof = provision(release, config)
                if args[0] == '--execute':
                    activate(release, password, config['oauth'], trusted_ip)
                receipt = {'ok': True, 'provisioned': True, 'activated': args[0] == '--execute',
                           'sourceSHA': config['sourceSHA'], 'backupSHA256': proof['backupSHA256'],
                           'oldStateSHA256': proof['oldStateSHA256'], 'oldDataUnchanged': True, 'isolatedRestoreVerified': True,
                           'leastPrivilegeVerified': True, 'backupRetained': True, 'realGithubLoginVerified': False}
        finally:
            assert_protection(protection)
    print(json.dumps(receipt))


if __name__ == '__main__':
    try:
        for item in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(item, interrupted)
        main()
    except Exception as error:
        # No SQL, URI, subprocess stderr, OAuth response headers or configuration values.
        print('ADMIN_REMOTE_STOPPED ' + (str(error) if isinstance(error, Stopped) else 'UNEXPECTED_FAILURE'), file=sys.stderr)
        sys.exit(1)
