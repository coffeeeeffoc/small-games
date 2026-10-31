"""Protected v2/v3/v4 database boundary. Import is inert; no service lifecycle or secrets."""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import time
import uuid

BASE = Path('/opt/small-games/admin-console/releases')
PRIVATE = Path('/opt/small-games/admin-private')
BASELINE_SHA256 = 'd16a0a06e9da6531b8140fa196dc0fe2a3d91a74cc2fcf877685fe7346f74451'
NIGHT_MIGRATION_SHA256 = '4d34f4dd305387dc3e1c0554ed752f15e1277c03db6074d8914653862f929797'
MIGRATION_SHA256 = 'b114f40c7a0e7255dc2d0c97b166a5c23545297111065479eb002feaa8760f66'
PG_VERSION = '170006'
FIXTURE_LABEL = 'io.small-games.control-fixture'
MARKER = 'SG_CONTROL_JSON '
MARKERS = ('-- sg-control:session-v1\n', '-- sg-control:fingerprint-v1\n', '-- sg-control:contract-v1\n')
SCOPE = "WHERE n.nspname = 'game_control'"
VERSIONS = "(SELECT coalesce(jsonb_agg(version ORDER BY version),'[]'::jsonb) FROM game_control.schema_version)"


class ControlDatabaseError(Exception):
    def __init__(self, code, outcome='unknown', old_data_unchanged=False):
        super().__init__(code)
        self.code = code
        self.outcome = outcome
        self.oldDataUnchanged = old_data_unchanged


def require(value, code):
    if not value:
        raise ControlDatabaseError(code)


def digest(value, length=64):
    return isinstance(value, str) and re.fullmatch(r'[a-f0-9]{' + str(length) + '}', value) is not None


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'CONTROL_INVALID_JSON')
        result[key] = value
    return result


def json_value(value):
    return json.loads(value, object_pairs_hook=unique_object)


def command(*args, **kwargs):
    timeout = kwargs.pop('timeout', 180)
    try:
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=timeout, check=False, **kwargs)
    except subprocess.TimeoutExpired:
        raise ControlDatabaseError('CONTROL_COMMAND_TIMEOUT') from None
    except (OSError, subprocess.SubprocessError):
        raise ControlDatabaseError('CONTROL_COMMAND_FAILED') from None
    if result.returncode:
        error = ControlDatabaseError('CONTROL_COMMAND_FAILED')
        found = re.search(rb'ERROR:\s+([A-Z0-9]{5})\b', result.stderr)
        error.sqlstate = found[1].decode('ascii') if found else None
        raise error
    return result.stdout


def scalar(*args, **kwargs):
    return command(*args, **kwargs).decode('utf-8').strip()


def psql(pg, sql, database='small_games', timeout=600):
    require(isinstance(pg, str) and re.fullmatch(r'[a-f0-9]{64}', pg), 'CONTROL_CONTAINER_ID')
    return scalar('docker', 'exec', '-i', pg, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                  '-v', 'VERBOSITY=sqlstate', '-U', 'platform_owner', '-d', database,
                  input=sql.encode('utf-8'), timeout=timeout)


def inspect_container(identifier):
    require(isinstance(identifier, str) and re.fullmatch(r'[a-f0-9]{64}', identifier), 'CONTROL_CONTAINER_ID')
    projection = '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}},"networkMode":{{json .HostConfig.NetworkMode}},"networks":{{json .NetworkSettings.Networks}},"fixture":{{json (index .Config.Labels "io.small-games.control-fixture")}},"name":{{json .Name}},"memory":{{json .HostConfig.Memory}},"cpu":{{json .HostConfig.NanoCpus}},"tmpfs":{{json (index .HostConfig "Tmpfs")}}}'
    return json_value(command('docker', 'inspect', '--format', projection, identifier))


def check_inventory(items, writers_running=False):
    require(isinstance(items, dict) and set(items) == {'runtime','kart','management','postgres','nginx','web'}, 'CONTROL_INVENTORY')
    for name, expected in items.items():
        require(isinstance(expected, dict), 'CONTROL_INVENTORY')
        actual = inspect_container(expected.get('id'))
        require(all(actual.get(key) == expected.get(key) for key in ('id','image','mounts','ports','networkMode')), 'CONTROL_RESOURCE_CHANGED')
        require(actual['running'] is (writers_running or name in ('postgres','web')), 'CONTROL_WRITER_RUNNING')
        require(set(actual['networks']) == set(expected['networks']), 'CONTROL_RESOURCE_CHANGED')
    return items['postgres']['id']


def private_directory(directory):
    require(directory.resolve(strict=True) == directory, 'CONTROL_PRIVATE_DIRECTORY')
    info = directory.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid()
            and stat.S_IMODE(info.st_mode) == 0o700, 'CONTROL_PRIVATE_DIRECTORY')


def private_metadata(file):
    require(file.resolve(strict=True) == file, 'CONTROL_PRIVATE_FILE')
    info = file.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.geteuid()
            and stat.S_IMODE(info.st_mode) == 0o600, 'CONTROL_PRIVATE_FILE')


def fsync_directory(directory):
    fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def write_private(file, data):
    """Atomic no-replace installation; no chmod/chown of existing resources."""
    private_directory(file.parent)
    temporary = file.with_name('.' + file.name + '-' + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, file)
        temporary.unlink()
        fsync_directory(file.parent)
        private_metadata(file)
    finally:
        if temporary.exists():
            temporary.unlink()


def encoded_json(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + '\n').encode('utf-8')


def sql_json(value):
    return "convert_from(decode('" + encoded_json(value).hex() + "','hex'),'UTF8')::jsonb"


def migration_body(text):
    match = re.fullmatch(r'(?s)(?:--[^\n]*\n)*BEGIN;\n(.*)\nCOMMIT;\s*', text.replace('\r\n', '\n'))
    require(match is not None and not re.search(r'(?im)^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;', match[1]), 'CONTROL_MIGRATION_BOUNDARIES')
    return match[1]


def load_sql(file=None):
    text = (file or Path(__file__).with_name('control-fingerprint.sql')).read_text(encoding='utf-8').replace('\r\n', '\n')
    require(text.startswith(MARKERS[0]) and all(text.count(marker) == 1 for marker in MARKERS), 'CONTROL_SQL_SEGMENTS')
    session, rest = text[len(MARKERS[0]):].split(MARKERS[1])
    fingerprint, contract = rest.split(MARKERS[2])
    require(all(re.fullmatch(r'(?is)SET\s+LOCAL\s+[^;]+;', line.strip()) for line in session.splitlines() if line.strip()), 'CONTROL_SQL_SESSION')
    contract = contract.strip()
    require(contract.startswith('WITH ') and contract.endswith(';') and contract.count(SCOPE) == 1
            and contract.count(VERSIONS) == 1 and not re.search(r'(?i)\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|pg_temp)\b', contract), 'CONTROL_SQL_CONTRACT')
    contract = contract[:-1]
    projection_sha = hashlib.sha256(contract.encode('utf-8')).hexdigest()
    metadata = contract.replace(SCOPE, "WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND (NOT protected_only OR n.nspname<>'game_control')").replace(VERSIONS, "'[]'::jsonb")
    fingerprint += "\nCREATE FUNCTION pg_temp.sg_control_metadata(protected_only boolean) RETURNS jsonb LANGUAGE plpgsql AS $metadata$\nDECLARE result record; BEGIN\n"
    fingerprint += 'SELECT * INTO result FROM (' + metadata + ") projected;\nIF NOT result.supported THEN RAISE EXCEPTION 'CONTROL_UNSUPPORTED_PROFILE'; END IF;\nRETURN result.metadata; END\n$metadata$;\n"
    return {'session': session, 'fingerprint': fingerprint, 'contract': contract, 'projection': projection_sha}


def output_json(text):
    lines = [line for line in text.splitlines() if line]
    require(len(lines) == 1 and lines[0].startswith(MARKER), 'CONTROL_SQL_OUTPUT')
    value = json_value(lines[0][len(MARKER):])
    require(isinstance(value, dict), 'CONTROL_SQL_OUTPUT')
    return value


def state(pg, parts, protected_only=False):
    return output_json(psql(pg, 'BEGIN;\n' + parts['session'] + parts['fingerprint']
        + "\nSELECT '" + MARKER + "'||pg_temp.sg_control_state(" + str(protected_only).lower() + ")::text;\nROLLBACK;"))


def contract_expression(parts):
    return "SELECT jsonb_build_object('supported',supported,'versions',schema_versions,'metadataSha256',encode(sha256(convert_to(metadata::text,'UTF8')),'hex'),'readOnly',current_setting('transaction_read_only')='on') FROM (" + parts['contract'] + ') projected'


def contract_value(value, parts):
    require(isinstance(value, dict) and set(value) == {'supported','versions','metadataSha256','readOnly'}
            and value['supported'] is True and value['versions'] == [4] and digest(value['metadataSha256']), 'CONTROL_CONTRACT_MISMATCH')
    return {'version': 1, 'schema': 'game_control', 'schemaVersion': 4,
            'projectionSha256': parts['projection'], 'metadataSha256': value['metadataSha256']}


def valid_contract(value):
    return (isinstance(value, dict) and set(value) == {'version','schema','schemaVersion','projectionSha256','metadataSha256'}
            and type(value['version']) is int and value['version'] == 1 and value['schema'] == 'game_control'
            and type(value['schemaVersion']) is int and value['schemaVersion'] == 4
            and digest(value['projectionSha256']) and digest(value['metadataSha256']))


def migration_file(release, checksum):
    require(checksum == MIGRATION_SHA256, 'CONTROL_MIGRATION_ARTIFACT')
    bodies = []
    for name, expected in [('002-control-center.sql', BASELINE_SHA256), ('003-night-overwatch-control.sql', NIGHT_MIGRATION_SHA256), ('004-tetracube-control.sql', checksum)]:
        file = release / 'migrations' / name
        require(file.resolve(strict=True) == file and hashlib.sha256(file.read_bytes()).hexdigest() == expected, 'CONTROL_MIGRATION_ARTIFACT')
        bodies.append(migration_body(file.read_text(encoding='utf-8')))
    # Each immutable verifier runs only against the schema versions it understands.
    return """DO $baseline$ DECLARE current_version integer; BEGIN
IF to_regnamespace('game_control') IS NOT NULL THEN SELECT version INTO STRICT current_version FROM game_control.schema_version; END IF;
IF current_version IS NULL OR current_version=2 THEN EXECUTE $baseline_v2$""" + bodies[0] + """$baseline_v2$;
ELSIF current_version NOT IN (3,4) THEN RAISE EXCEPTION 'CONTROL_UNSUPPORTED_VERSION'; END IF;
IF current_version IS NULL OR current_version IN (2,3) THEN EXECUTE $upgrade_v3$""" + bodies[1] + """$upgrade_v3$; END IF;
END $baseline$;
""" + bodies[2]


def verify_control_database(*, pg_id, migration_sha256, expected_contract):
    try:
        require(valid_contract(expected_contract), 'CONTROL_EXPECTED_CONTRACT_REQUIRED')
        migration_file(Path(__file__).resolve().parent, migration_sha256)
        parts = load_sql()
        require(expected_contract['projectionSha256'] == parts['projection'], 'CONTROL_PROJECTION_MISMATCH')
        actual = output_json(psql(pg_id, 'BEGIN READ ONLY;\n' + parts['session'] + "\nSELECT '" + MARKER + "'||result::text FROM (" + contract_expression(parts) + ') q(result);\nCOMMIT;'))
        require(actual.get('readOnly') is True, 'CONTROL_NOT_READ_ONLY')
        contract = contract_value(actual, parts)
        require(contract == expected_contract, 'CONTROL_CONTRACT_MISMATCH')
        return {'controlContract': contract, 'readOnly': True, 'migrationArtifactSha256': migration_sha256}
    except ControlDatabaseError:
        raise
    except Exception:
        raise ControlDatabaseError('CONTROL_VERIFY_FAILED') from None


def transaction_sql(migration, parts, before, expected_full=None, expected_contract=None, fresh=True, source_before=None):
    source_guard = "IF pg_temp.sg_control_state(false) IS DISTINCT FROM " + sql_json(source_before) + " THEN RAISE EXCEPTION 'CONTROL_SOURCE_CHANGED'; END IF;" if source_before is not None else ''
    fresh_guard = "IF to_regnamespace('game_control') IS NOT NULL THEN RAISE EXCEPTION 'CONTROL_ALREADY_PRESENT'; END IF;" if fresh else ''
    full_guard = "IF actual_full IS DISTINCT FROM " + sql_json(expected_full) + " THEN RAISE EXCEPTION 'CONTROL_FULL_CHANGED'; END IF;" if expected_full is not None else ''
    contract_guard = "IF actual_contract->>'metadataSha256' IS DISTINCT FROM '" + expected_contract['metadataSha256'] + "' THEN RAISE EXCEPTION 'CONTROL_CONTRACT_CHANGED'; END IF;" if expected_contract is not None else ''
    return """BEGIN;
SET LOCAL log_statement='none';
SET LOCAL log_min_error_statement='panic';
SET LOCAL log_error_verbosity='terse';
SET LOCAL log_parameter_max_length_on_error=0;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(67602420261016);
SELECT pg_advisory_xact_lock(hashtextextended('game-control:v1',0));
""" + parts['session'] + parts['fingerprint'] + """
DO $pre$ DECLARE item record; BEGIN
IF EXISTS(SELECT FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend') THEN RAISE EXCEPTION 'CONTROL_UNKNOWN_CLIENT'; END IF;
""" + fresh_guard + source_guard + """
FOR item IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind='r'
ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C" LOOP
EXECUTE format('LOCK TABLE ONLY %I.%I IN ACCESS EXCLUSIVE MODE',item.nspname,item.relname);
END LOOP;
IF pg_temp.sg_control_state(true) IS DISTINCT FROM """ + sql_json(before) + """ THEN RAISE EXCEPTION 'CONTROL_SOURCE_CHANGED'; END IF;
END $pre$;
""" + migration + """
CREATE TEMP TABLE sg_cf_result(value jsonb) ON COMMIT DROP;
DO $post$ DECLARE actual_full jsonb; actual_contract jsonb; BEGIN
IF pg_temp.sg_control_state(true) IS DISTINCT FROM """ + sql_json(before) + """ THEN RAISE EXCEPTION 'CONTROL_OLD_CHANGED'; END IF;
actual_full := pg_temp.sg_control_state(false);
""" + full_guard + '\n' + contract_expression(parts).replace('SELECT jsonb_build_object', 'SELECT jsonb_build_object', 1) + ' INTO actual_contract;\n' + """
IF actual_contract->'supported' IS DISTINCT FROM 'true'::jsonb OR actual_contract->'versions' IS DISTINCT FROM '[4]'::jsonb THEN RAISE EXCEPTION 'CONTROL_CONTRACT_INVALID'; END IF;
""" + contract_guard + """
IF EXISTS(SELECT FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend') THEN RAISE EXCEPTION 'CONTROL_UNKNOWN_CLIENT'; END IF;
INSERT INTO pg_temp.sg_cf_result VALUES(jsonb_build_object('full',actual_full,'contract',actual_contract));
END $post$;
SELECT '""" + MARKER + """'||value::text FROM pg_temp.sg_cf_result;
COMMIT;
"""


def normalize_roles_dump(value):
    text = value.decode('utf-8')
    return re.sub(r'(?m)^\\(?:un)?restrict [A-Za-z0-9]{1,256}\r?\n', '', text)


def restore_roles_sql(value):
    text = normalize_roles_dump(value)
    require(len(re.findall(r'(?m)^CREATE ROLE platform_owner;$', text)) == 1, 'CONTROL_RESTORE_ROLES')
    return re.sub(r'(?m)^CREATE ROLE platform_owner;\n', '', text)


def ready(identifier):
    for _ in range(45):
        try:
            # The image's temporary initialization server accepts sockets before the final TCP server.
            command('docker', 'exec', identifier, 'pg_isready', '-h', '127.0.0.1', '-U', 'platform_owner', timeout=5)
            if psql(identifier, 'SELECT 1;', 'postgres', timeout=5) == '1':
                return
        except ControlDatabaseError:
            time.sleep(0.5)
    raise ControlDatabaseError('CONTROL_CLONE_NOT_READY')


def fixture_error(code, identifier, token, name, original=None):
    value = ControlDatabaseError(code, getattr(original,'outcome','unknown'), getattr(original,'oldDataUnchanged',False))
    value.ownedContainerId = identifier if isinstance(identifier,str) and re.fullmatch(r'[a-f0-9]{64}',identifier) else None
    value.probeUUID, value.fixtureUUID, value.probeName = str(uuid.UUID(hex=token)), token, name
    if isinstance(original,ControlDatabaseError):
        value.originalCode = original.code
        value.sqlstate = getattr(original,'sqlstate',None)
    return value


def require_fixture_identity(identifier, image, token, name):
    facts = inspect_container(identifier)
    require(facts['id']==identifier and facts['image']==image and facts['fixture']==token and facts['name']=='/'+name
            and facts['networkMode']=='none' and not facts['ports']
            and facts['memory']==268435456 and facts['cpu']==1000000000
            and facts['tmpfs']=={'/var/lib/postgresql/data':'rw,size=134217728'}
            and len(facts['mounts'])<=1
            and all(mount.get('Type')=='tmpfs' and mount.get('Destination')=='/var/lib/postgresql/data'
                    and mount.get('RW') is True for mount in facts['mounts']), 'CONTROL_CLEANUP_IDENTITY')


@contextlib.contextmanager
def isolated_postgres(image, kind='restore', fixture_uuid=None):
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', image) is not None, 'CONTROL_IMAGE')
    token = fixture_uuid or uuid.uuid4().hex
    require(re.fullmatch(r'[a-f0-9]{32}', token) is not None and kind in ('restore','source'), 'CONTROL_FIXTURE_UUID')
    name = 'sg-control-' + kind + '-' + token
    require(not scalar('docker','ps','-aq','--filter','name=^/' + name + '$'), 'CONTROL_FIXTURE_EXISTS')
    identifier, original, uncertain = None, None, False
    try:
        identifier = scalar('docker','run','-d','--pull=never','--name',name,'--label',FIXTURE_LABEL + '=' + token,
            '--network','none','--memory','256m','--cpus','1','--pids-limit','128','--tmpfs','/var/lib/postgresql/data:rw,size=134217728',
            '-e','POSTGRES_USER=platform_owner','-e','POSTGRES_DB=postgres','-e','POSTGRES_PASSWORD=fixture-not-a-secret',image)
        require(re.fullmatch(r'[a-f0-9]{64}', identifier) is not None, 'CONTROL_FIXTURE_ID')
        require_fixture_identity(identifier,image,token,name)
        ready(identifier)
        yield identifier
    except BaseException as error:
        original = error
        uncertain = identifier is None or re.fullmatch(r'[a-f0-9]{64}',identifier) is None
        if isinstance(error, ControlDatabaseError):
            error.ownedContainerId, error.fixtureUUID = identifier, token
            error.probeUUID, error.probeName = str(uuid.UUID(hex=token)), name
        raise
    finally:
        try:
            if identifier is None or re.fullmatch(r'[a-f0-9]{64}',identifier) is None:
                found = scalar('docker','ps','-aq','--no-trunc','--filter','name=^/' + name + '$','--filter','label=' + FIXTURE_LABEL + '=' + token).splitlines()
                require(len(found) <= 1, 'CONTROL_CLEANUP_IDENTITY')
                identifier = found[0] if found else None
            if identifier is not None:
                require_fixture_identity(identifier,image,token,name)
                command('docker','rm','-f',identifier,timeout=30)
        except BaseException:
            raise fixture_error('CONTROL_FIXTURE_CLEANUP_REQUIRED',identifier,token,name,original) from None
        if uncertain:
            raise fixture_error('CONTROL_FIXTURE_RECOVERY_REQUIRED',identifier,token,name,original) from None


def expect_denied(pg, role, statement):
    require(role in ('management_app','runtime_app'), 'CONTROL_TEST_ROLE')
    psql(pg, "BEGIN; SET SESSION AUTHORIZATION " + role + "; DO $negative$ BEGIN EXECUTE '" + statement.replace("'", "''")
         + "'; RAISE EXCEPTION 'CONTROL_PERMISSION_OVERREACH'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $negative$; ROLLBACK;")


def permission_checks(pg):
    for statement in [
        'SELECT * FROM runtime.competition_players LIMIT 0',
        'CREATE TABLE game_control.forbidden(n integer)', 'CREATE SCHEMA forbidden',
        'CREATE TEMP TABLE forbidden(n integer)', 'SET ROLE runtime_app',
        'UPDATE game_control.schema_version SET version=version',
        'UPDATE game_control.bootstrap SET id=id', 'UPDATE game_control.active_head SET id=id',
        'UPDATE game_control.current_policy SET game_id=game_id',
        'UPDATE game_control.revisions SET reason=reason', 'DELETE FROM game_control.publications',
        'UPDATE game_control.audit SET detail=detail', 'TRUNCATE game_control.roles',
        'TRUNCATE admin_console.admin_sessions',
        "INSERT INTO game_control.application_observations VALUES('00000000-0000-4000-8000-000000000001','runtime','proof',1,repeat('a',64),'applied',0)",
    ]:
        expect_denied(pg, 'management_app', statement)
    for statement in [
        'SELECT * FROM admin_console.schema_version LIMIT 0', 'SELECT * FROM game_control.members LIMIT 0',
        'SELECT * FROM game_control.revisions LIMIT 0', 'SELECT * FROM game_control.application_observations LIMIT 0',
        'UPDATE game_control.current_policy SET state=state', 'DELETE FROM game_control.application_observations',
        'UPDATE game_control.application_observations SET observed_at=observed_at',
        'CREATE TABLE game_control.forbidden(n integer)', 'SET ROLE management_app',
    ]:
        expect_denied(pg, 'runtime_app', statement)
    psql(pg, """BEGIN; SET SESSION AUTHORIZATION management_app;
SELECT count(*) FROM game_control.published_config; SELECT count(*) FROM game_control.application_observations;
UPDATE game_control.bootstrap SET initialized=initialized WHERE false;
UPDATE game_control.active_head SET version=version,revision_id=revision_id WHERE false;
UPDATE game_control.current_policy SET state=state,kill_epoch=kill_epoch,revision=revision WHERE false;
INSERT INTO game_control.roles VALUES('deployment-proof','Proof','["control.read"]',false);
UPDATE game_control.roles SET name='Updated' WHERE id='deployment-proof'; DELETE FROM game_control.roles WHERE id='deployment-proof';
DO $builtin$ DECLARE rejected boolean:=false; BEGIN
BEGIN UPDATE game_control.roles SET name=name WHERE id='administrator';
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Builtin role is immutable' THEN RAISE; END IF; rejected:=true; END;
IF NOT rejected THEN RAISE EXCEPTION 'CONTROL_BUILTIN_MUTABLE'; END IF;
END $builtin$; ROLLBACK;""")
    psql(pg, """BEGIN; SET SESSION AUTHORIZATION runtime_app;
SELECT count(*) FROM game_control.published_config; SELECT count(*) FROM game_control.current_policy;
INSERT INTO game_control.application_observations VALUES('00000000-0000-4000-8000-000000000001','runtime','proof',1,repeat('a',64),'applied',0); ROLLBACK;""")
    psql(pg, """BEGIN; CREATE ROLE sg_control_public_probe NOLOGIN; SET SESSION AUTHORIZATION sg_control_public_probe;
DO $public$ BEGIN PERFORM * FROM game_control.published_config; RAISE EXCEPTION 'CONTROL_PUBLIC_OVERREACH';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $public$; ROLLBACK;""")


def restore_proof(pg, backup, roles, migration, parts, before, directory, observer=None, protected=None):
    image = inspect_container(pg)['image']
    with isolated_postgres(image) as clone:
        require(psql(clone, "SELECT current_setting('server_version_num');", 'postgres') == PG_VERSION, 'CONTROL_PG_VERSION')
        psql(clone, restore_roles_sql(roles), 'postgres')
        private_metadata(backup)
        command('docker','exec','-i',clone,'pg_restore','--exit-on-error','--create','-U','platform_owner','-d','postgres',input=backup.read_bytes(),timeout=600)
        require(state(clone, parts) == before, 'CONTROL_RESTORE_FINGERPRINT')
        if observer:
            observer('restored', clone)
        protected = before if protected is None else protected
        first = output_json(psql(clone, transaction_sql(migration, parts, protected, fresh=False, source_before=before)))
        contract = contract_value(first['contract'], parts)
        second = output_json(psql(clone, transaction_sql(migration, parts, protected, first['full'], contract, fresh=False, source_before=first['full'])))
        require(second == first, 'CONTROL_NOT_IDEMPOTENT')
        permission_checks(clone)
        require(state(clone, parts) == first['full'] and state(clone, parts, True) == protected, 'CONTROL_PERMISSION_CHANGED_STATE')
        if observer:
            observer('migrated', clone)
        write_private(directory / 'control-expected-full.json', encoded_json(first['full']))
        write_private(directory / 'control-expected-protected.json', encoded_json(protected))
        write_private(directory / 'control-expected-contract.json', encoded_json(contract))
        return first['full'], contract


def preflight_control_database(*, release, source_sha, migration_sha256, inventory, writers_running=False):
    """Same deployment owner as the coordinator; only metadata reads and READ ONLY SQL."""
    try:
        private_directory(PRIVATE)
        private_directory(PRIVATE / release.name)
        directory = PRIVATE / release.name
        for file in directory.iterdir():
            require(file.name == 'control-journal.json', 'CONTROL_PRIVATE_NOT_EMPTY')
            private_metadata(file)
        require(isinstance(release, Path) and release.parent == BASE and release.resolve(strict=True) == release
                and re.fullmatch(r'[a-z0-9-]{1,100}', release.name) and digest(source_sha,40), 'CONTROL_RELEASE')
        manifest = json_value((release / 'manifest.json').read_bytes())
        require(manifest.get('sourceSHA') == source_sha and manifest.get('release') == release.name
                and manifest.get('migrationArtifactSha256') == migration_sha256, 'CONTROL_MANIFEST')
        for name in ('control-database.py','control-fingerprint.sql','migrations/002-control-center.sql','migrations/003-night-overwatch-control.sql','migrations/004-tetracube-control.sql'):
            file = release / name
            require(file.resolve(strict=True) == file and manifest['files'].get(name) == hashlib.sha256(file.read_bytes()).hexdigest(), 'CONTROL_RELEASE_HASH')
        migration = migration_file(release, migration_sha256)
        parts = load_sql(release / 'control-fingerprint.sql')
        scalar('docker', 'compose', 'version')
        model = {'services': {'probe': {'image': 'unused', 'env_file': [{'path': '/dev/null', 'format': 'raw'}]}}}
        command('docker', 'compose', '--env-file', '/dev/null', '-f', '-', 'config', '--quiet', input=encoded_json(model))
        pg = check_inventory(inventory, writers_running=writers_running)
        for tool in ('pg_dump', 'pg_dumpall', 'pg_restore'):
            require(re.fullmatch(r'[^\n]+ \(PostgreSQL\) 17\.6(?:\s+[^\n]*)?',
                    scalar('docker', 'exec', pg, tool, '--version')), 'CONTROL_PG_VERSION')
        idle = '' if writers_running else " AND NOT EXISTS(SELECT FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend')"
        require(psql(pg, "BEGIN READ ONLY; SELECT current_setting('transaction_read_only')='on' AND current_user='platform_owner' AND current_database()='small_games' AND current_setting('server_version_num')='170006' AND EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND rolsuper AND rolcanlogin) AND to_regnamespace('admin_console') IS NOT NULL AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('management_app','runtime_app') AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)=2" + idle + '; COMMIT;') == 't', 'CONTROL_DATABASE_IDENTITY')
        profile = parts['contract'].replace(SCOPE, "WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'").replace(VERSIONS, "'[]'::jsonb")
        require(psql(pg, 'BEGIN READ ONLY;\n' + parts['session'] + '\nSELECT supported FROM (' + profile + ') projected; COMMIT;') == 't', 'CONTROL_UNSUPPORTED_PROFILE')
        size = psql(pg, "BEGIN READ ONLY; SELECT pg_database_size(current_database()); COMMIT;")
        require(re.fullmatch(r'[0-9]+', size), 'CONTROL_DATABASE_IDENTITY')
        require(shutil.disk_usage(directory).free >= max(67108864, int(size) * 3), 'CONTROL_DISK_SPACE')
        return migration, parts, pg, directory
    except BaseException as original:
        code = original.code if isinstance(original, ControlDatabaseError) else 'CONTROL_PREFLIGHT_FAILED'
        error = ControlDatabaseError(code, 'not_committed', True)
        error.mutationReached = False
        raise error from None


def provision_control_database(*, release, source_sha, migration_sha256, inventory):
    submitted, committed, preserved = False, False, False
    before, pg, parts = None, None, None
    try:
        migration, parts, pg, directory = preflight_control_database(
            release=release, source_sha=source_sha, migration_sha256=migration_sha256, inventory=inventory)
        before = state(pg, parts)
        protected = state(pg, parts, True)
        write_private(directory / 'control-before.json', encoded_json(before))
        roles = command('docker','exec',pg,'pg_dumpall','-U','platform_owner','--roles-only','--no-role-passwords',timeout=600)
        write_private(directory / 'control-roles.sql', roles)
        backup = directory / 'control-database.dump'
        write_private(backup, command('docker','exec',pg,'pg_dump','-U','platform_owner','-d','small_games','--format=custom',timeout=600))
        require(state(pg, parts) == before, 'CONTROL_SOURCE_CHANGED')
        full, contract = restore_proof(pg, backup, roles, migration, parts, before, directory, protected=protected)
        check_inventory(inventory)
        require(state(pg, parts) == before, 'CONTROL_SOURCE_CHANGED')
        backup_sha = hashlib.sha256(backup.read_bytes()).hexdigest()
        old_sha = hashlib.sha256(encoded_json(before)).hexdigest()
        proof = {'version':1, 'release':release.name, 'sourceSHA':source_sha,
                 'migrationArtifactSha256':migration_sha256, 'backupSHA256':backup_sha,
                 'oldStateSHA256':old_sha, 'controlContract':contract,
                 'isolatedRestoreVerified':True, 'oldDataUnchanged':True, 'leastPrivilegeVerified':True}
        payload = encoded_json(proof)
        write_private(directory / 'control-precommit.json', payload)
        write_private(directory / 'control-precommit.sha256', (hashlib.sha256(payload).hexdigest() + '\n').encode('ascii'))
        submitted = True
        output = psql(pg, transaction_sql(migration, parts, protected, full, contract, fresh=False, source_before=before))
        committed, preserved = True, True
        actual = output_json(output)
        require(actual['full'] == full and contract_value(actual['contract'],parts) == contract, 'CONTROL_PRODUCTION_PROOF')
        check_inventory(inventory)
        require(state(pg,parts) == full and state(pg,parts,True) == protected, 'CONTROL_POSTCOMMIT_STATE')
        return {'outcome':'committed', 'oldDataUnchanged':True, 'isolatedRestoreVerified':True,
                'leastPrivilegeVerified':True, 'backupSHA256':backup_sha, 'oldStateSHA256':old_sha,
                'controlContract':contract, 'migrationArtifactSha256':migration_sha256}
    except BaseException as original:
        outcome = 'committed' if committed else ('unknown' if submitted else 'not_committed')
        if not submitted and before is None:
            preserved = True  # Only preflight reads / temporary fingerprint setup have run.
        elif not submitted:
            try:
                preserved = state(pg,parts) == before
            except BaseException:
                preserved = False
        code = original.code if isinstance(original,ControlDatabaseError) else 'CONTROL_DATABASE_FAILED'
        error = ControlDatabaseError(code,outcome,preserved)
        error.mutationReached = submitted
        for name in ('ownedContainerId','fixtureUUID','probeUUID','probeName','originalCode','sqlstate'):
            if hasattr(original,name):
                setattr(error,name,getattr(original,name))
        raise error from None


def player_session_migration(release):
    manifest = json_value((release / 'manifest.json').read_bytes())
    file = release / 'migrations/014-player-sessions.sql'
    require(file.is_file() and file.resolve(strict=True) == file, 'CONTROL_MIGRATION_ARTIFACT')
    migration = file.read_bytes()
    checksum = hashlib.sha256(migration).hexdigest()
    require(manifest['files'].get('migrations/014-player-sessions.sql') == checksum, 'CONTROL_RELEASE_HASH')
    return manifest, checksum, migration_body(migration.decode('utf-8'))


def player_session_metadata(pg, parts):
    query = parts['contract'].replace(SCOPE, "WHERE n.nspname = 'runtime'").replace(VERSIONS, "'[]'::jsonb")
    result = output_json(psql(pg, "BEGIN READ ONLY;" + parts['session'] + "SELECT '" + MARKER + "'||jsonb_build_object('supported',supported,'metadata',metadata)::text FROM (" + query + ") q;COMMIT;"))
    require(result['supported'] is True, 'CONTROL_UNSUPPORTED_PROFILE')
    return hashlib.sha256(encoded_json(result['metadata'])).hexdigest()


def player_session_transaction(migration, parts, before, after):
    guard = "IF EXISTS(SELECT FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND backend_type='client backend') THEN RAISE EXCEPTION 'CONTROL_UNKNOWN_CLIENT'; END IF;"
    return "BEGIN;" + parts['session'] + parts['fingerprint'] + """
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(67602420261016);
DO $pre$ DECLARE item record; BEGIN
""" + guard + """
FOR item IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind='r'
ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C" LOOP
EXECUTE format('LOCK TABLE ONLY %I.%I IN ACCESS EXCLUSIVE MODE',item.nspname,item.relname);
END LOOP;
IF pg_temp.sg_control_state(false) IS DISTINCT FROM """ + sql_json(before) + """ THEN RAISE EXCEPTION 'CONTROL_SOURCE_CHANGED'; END IF;
END $pre$;
""" + migration + """
DO $post$ BEGIN
IF pg_temp.sg_control_state(false) IS DISTINCT FROM """ + sql_json(after) + """ THEN RAISE EXCEPTION 'CONTROL_PRODUCTION_PROOF'; END IF;
""" + guard + "END $post$;COMMIT;"


def provision_player_sessions(release, pg):
    """014 runs after 002 under the same stopped-writer barrier, with its own restore proof."""
    directory = PRIVATE / release.name
    private_directory(directory)
    manifest, checksum, migration = player_session_migration(release)
    parts = load_sql(release / 'control-fingerprint.sql')
    plan_file, completed = directory / 'player-sessions-precommit.json', directory / 'player-sessions-complete.json'
    if completed.exists():
        private_metadata(completed)
        proof = json_value(completed.read_bytes())
        require(proof.get('migrationSHA256') == checksum and proof.get('sourceSHA') == manifest['sourceSHA'], 'CONTROL_RELEASE_HASH')
        require(proof.get('metadataSHA256') == player_session_metadata(pg, parts), 'CONTROL_CONTRACT_MISMATCH')
        return proof
    if plan_file.exists():
        private_metadata(plan_file)
        proof = json_value(plan_file.read_bytes())
        require(proof.get('migrationSHA256') == checksum and proof.get('sourceSHA') == manifest['sourceSHA'], 'CONTROL_RELEASE_HASH')
    else:
        before = state(pg, parts)
        backup, roles_file = directory / 'player-sessions.dump', directory / 'player-sessions-roles.sql'
        if not roles_file.exists():
            write_private(roles_file, command('docker', 'exec', pg, 'pg_dumpall', '-U', 'platform_owner', '--roles-only', '--no-role-passwords'))
        if not backup.exists():
            write_private(backup, command('docker', 'exec', pg, 'pg_dump', '-U', 'platform_owner', '-d', 'small_games', '--format=custom'))
        private_metadata(backup)
        private_metadata(roles_file)
        with isolated_postgres(inspect_container(pg)['image']) as clone:
            psql(clone, restore_roles_sql(roles_file.read_bytes()), 'postgres')
            command('docker', 'exec', '-i', clone, 'pg_restore', '--exit-on-error', '--create', '-U', 'platform_owner', '-d', 'postgres', input=backup.read_bytes())
            require(state(clone, parts) == before, 'CONTROL_RESTORE_FINGERPRINT')
            psql(clone, 'BEGIN;' + migration + 'COMMIT;')
            after = state(clone, parts)
            psql(clone, player_session_transaction(migration, parts, after, after))
            require(state(clone, parts) == after, 'CONTROL_NOT_IDEMPOTENT')
            metadata = player_session_metadata(clone, parts)
        proof = {'sourceSHA': manifest['sourceSHA'], 'migrationSHA256': checksum, 'before': before, 'after': after,
                 'metadataSHA256': metadata, 'backupSHA256': hashlib.sha256(backup.read_bytes()).hexdigest()}
        write_private(plan_file, encoded_json(proof))
    actual = state(pg, parts)
    require(actual in (proof['before'], proof['after']), 'CONTROL_SOURCE_CHANGED')
    if actual == proof['before']:
        psql(pg, player_session_transaction(migration, parts, proof['before'], proof['after']))
    require(state(pg, parts) == proof['after'], 'CONTROL_PRODUCTION_PROOF')
    require(player_session_metadata(pg, parts) == proof['metadataSHA256'], 'CONTROL_CONTRACT_MISMATCH')
    write_private(completed, encoded_json(proof))
    return proof
