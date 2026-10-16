#!/usr/bin/env python3
"""Fail-closed, proxy-only ingress transaction. Never loads a Compose .env or touches a database."""

import fcntl
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import signal
import subprocess
import sys

LABEL = 'io.small-games.competition-ingress'
DOMAIN = 'api.nenggongzhiren.cn'
ADMIN_DOMAIN = 'admin.nenggongzhiren.cn'
NETWORK = 'small-games-competition-ingress'
NGINX_IMAGE = 'sha256:dc73b49f5124cf2ee538dfbdfbd121f0b4ccdcb20fea30f3a81bd477c02e2bb5'
CADDY_IMAGE = 'sha256:f77f856a30f0004200b36b322d61da17fade31e24875699d77fb968399b9eb77'
LEGACY_CONFIG_HASH = '4c9431eb59ee3c032b3982af13c4f01fa9a796736eb33c3034efa8c515d71aef'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def command(*args):
    # Never print command stderr: Docker/runtime errors can contain sensitive configuration.
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    require(result.returncode == 0, f'Ingress command failed: {args[0]} {args[1] if len(args) > 1 else ""}')
    return result.stdout.strip()


def config_from(path):
    value = json.loads(path.read_text())
    require(set(value) == {'version', 'domain', 'deploymentDirectory', 'network', 'nginx', 'caddyImage'}, 'Invalid ingress fields')
    require(value['version'] == 1 and value['domain'] == DOMAIN and value['deploymentDirectory'] == '/opt/small-games', 'Unapproved ingress target')
    require(value['caddyImage'] == CADDY_IMAGE, 'Unreviewed Caddy image')
    network, nginx = value['network'], value['nginx']
    require(set(network) == {'name', 'subnet', 'caddyIp', 'nginxIp'} and network['name'] == NETWORK, 'Invalid ingress network')
    subnet = ipaddress.IPv4Network(network['subnet'], strict=True)
    private = [ipaddress.IPv4Network(item) for item in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')]
    require(24 <= subnet.prefixlen <= 29 and any(subnet.subnet_of(item) for item in private), 'Invalid private ingress subnet')
    ips = [ipaddress.IPv4Address(network[key]) for key in ('caddyIp', 'nginxIp')]
    require(ips[0] != ips[1] and all(ip in subnet and int(subnet.network_address) + 1 < int(ip) < int(subnet.broadcast_address) for ip in ips), 'Invalid ingress addresses')
    require(set(nginx) == {'image', 'legacyRelease', 'backendIp'} and nginx['image'] == NGINX_IMAGE, 'Invalid Nginx descriptor')
    require(re.fullmatch(r'/opt/small-games/releases/[a-z0-9-]+', nginx['legacyRelease']) is not None, 'Invalid legacy release')
    backend = ipaddress.IPv4Address(nginx['backendIp'])
    require(backend not in subnet and any(backend in item for item in private), 'Invalid backend address')
    return value


def inspect_container(identifier):
    # Explicit projection deliberately excludes .Config.Env and arbitrary labels.
    projection = '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"running":{{json .State.Running}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}},"networks":{{json .NetworkSettings.Networks}},"restart":{{json .HostConfig.RestartPolicy.Name}},"health":{{json .Config.Healthcheck}},"logging":{{json .HostConfig.LogConfig}},"namespace":{{json .HostConfig.NetworkMode}}}'
    return json.loads(command('docker', 'inspect', '--format', projection, identifier))


def service(project, name):
    identifiers = command('docker', 'ps', '-q', '--filter', f'label=com.docker.compose.project={project}', '--filter', f'label=com.docker.compose.service={name}').splitlines()
    require(len(identifiers) == 1, f'Expected exactly one running {project}/{name}')
    value = inspect_container(identifiers[0])
    require(value['running'], f'{name} is not running')
    return value


def networks():
    projection = '{"id":{{json .Id}},"name":{{json .Name}},"driver":{{json .Driver}},"internal":{{json .Internal}},"ipam":{{json .IPAM.Config}},"members":{{json .Containers}},"owner":{{json (index .Labels "io.small-games.competition-ingress")}}}'
    return [json.loads(command('docker', 'network', 'inspect', '--format', projection, item)) for item in command('docker', 'network', 'ls', '-q').splitlines()]


def mount_map(container):
    mounts = container['mounts']
    require(all(item['Type'] == 'bind' and not item['RW'] for item in mounts), 'Unexpected writable or non-bind Nginx mount')
    require(len({item['Destination'] for item in mounts}) == len(mounts), 'Duplicate Nginx mounts')
    return {item['Destination']: item['Source'] for item in mounts}


def preflight(config, base, old):
    nginx, caddy = service('small-games', 'nginx'), service('company-web', 'web')
    require(nginx['image'] == NGINX_IMAGE and caddy['image'] == CADDY_IMAGE, 'Cached image identity differs from reviewed deployment')
    require(set(caddy['ports']) == {'80/tcp', '443/tcp'} and all(binding['HostPort'] == port.split('/')[0] and binding['HostIp'] in ('', '0.0.0.0', '::') for port, bindings in caddy['ports'].items() for binding in bindings), 'Unexpected Caddy host ports')
    require(nginx['ports'] == {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '8080'}]}, 'Unexpected Nginx host ports')
    require(nginx['restart'] == 'unless-stopped', 'Unexpected Nginx restart policy')
    require(nginx['health'] == {'Test': ['CMD', 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1:8080/health'], 'Interval': 5000000000, 'Timeout': 3000000000, 'Retries': 12}, 'Unexpected Nginx health check')
    require(nginx['logging'] == {'Type': 'json-file', 'Config': {'max-size': '10m', 'max-file': '3'}}, 'Unexpected Nginx logging')
    legacy = Path(config['nginx']['legacyRelease'])
    require(legacy.resolve() == legacy and (legacy / 'nginx').is_dir() and (legacy / 'site').is_dir(), 'Legacy release is missing or redirected')
    files = sorted((legacy / 'nginx').iterdir())
    require(files and all(item.is_file() and not item.is_symlink() and re.fullmatch(r'[A-Za-z0-9_-]+\.conf', item.name) for item in files), 'Unexpected legacy Nginx configuration layout')
    require(len(files) == 1 and files[0].name == 'game.conf' and hashlib.sha256(files[0].read_bytes()).hexdigest() == LEGACY_CONFIG_HASH, 'Legacy Nginx bytes differ from the reviewed inventory')
    expected_mounts = {'/srv/site': str(legacy / 'site')}
    if old and (old / 'ingress.json').is_file():
        require(config_from(old / 'ingress.json') == config, 'Topology changes require a separate reviewed migration')
        expected_mounts.update({'/etc/nginx/conf.d': str(old / 'nginx'), '/etc/nginx/legacy': str(legacy / 'nginx')})
        expected_networks = {'small-games_default', NETWORK}
    else:
        expected_mounts['/etc/nginx/conf.d'] = str(legacy / 'nginx')
        expected_networks = {'small-games_default'}
    require(mount_map(nginx) == expected_mounts and set(nginx['networks']) == expected_networks, 'Nginx is not the expected unmanaged/managed layout')
    require(nginx['networks']['small-games_default']['IPAddress'] == config['nginx']['backendIp'], 'Nginx backend IP changed; re-inventory before deploying')
    require(set(caddy['networks']) == ({'company-web_default', NETWORK} if NETWORK in expected_networks else {'company-web_default'}), 'Unexpected Caddy network membership')
    if NETWORK in expected_networks:
        require(nginx['networks'][NETWORK]['IPAddress'] == config['network']['nginxIp'] and caddy['networks'][NETWORK]['IPAddress'] == config['network']['caddyIp'], 'Managed ingress IP changed')
    all_networks = networks()
    desired = ipaddress.IPv4Network(config['network']['subnet'])
    existing = [item for item in all_networks if item['name'] == NETWORK]
    require(len(existing) <= 1, 'Duplicate ingress network')
    allowed_ids = {nginx['id'], caddy['id']}
    for item in all_networks:
        if item['name'] == NETWORK:
            require(item['driver'] == 'bridge' and item['internal'] and item['owner'] == 'v1', 'Foreign network owns ingress name')
            require(item['ipam'] == [{'Subnet': str(desired), 'Gateway': str(desired.network_address + 1)}], 'Ingress network IPAM differs')
            require(set(item['members']) <= allowed_ids, 'Unapproved container joined ingress network')
            continue
        for entry in item['ipam'] or []:
            subnet = ipaddress.ip_network(entry['Subnet'])
            require(subnet.version != 4 or not subnet.overlaps(desired), 'Ingress subnet overlaps another Docker network')
    backend = next((item for item in all_networks if item['name'] == 'small-games_default'), None)
    require(backend and backend['driver'] == 'bridge', 'Expected existing backend bridge')
    require(any(ipaddress.IPv4Address(config['nginx']['backendIp']) in ipaddress.ip_network(entry['Subnet']) for entry in backend['ipam'] if ':' not in entry['Subnet']), 'Backend IP outside existing bridge')
    for route in json.loads(command('ip', '-j', '-4', 'route', 'show', 'table', 'all')):
        destination = route.get('dst', 'default')
        if destination == 'default':
            continue
        subnet = ipaddress.IPv4Network(destination, strict=False)
        if existing and subnet.subnet_of(desired) and route.get('dev') == 'br-' + existing[0]['id'][:12]:
            continue
        require(not subnet.overlaps(desired), 'Ingress subnet overlaps a host route')
    protected = {name: service('small-games', name) for name in ('runtime', 'kart', 'postgres')}
    require(protected['kart']['namespace'] == 'container:' + protected['runtime']['id'], 'Kart does not share the active Runtime namespace')
    # Test only two public configuration fields; never inspect/print the environment array.
    runtime_check = "process.exit(process.env.TRUST_PROXY==='1'&&process.env.RUNTIME_TRUSTED_PROXY_IP===" + json.dumps(config['nginx']['backendIp']) + '?0:1)'
    try:
        command('docker', 'exec', protected['runtime']['id'], 'node', '-e', runtime_check)
    except RuntimeError:
        raise RuntimeError('Active Runtime must enable exact RUNTIME_TRUSTED_PROXY_IP before ingress activation') from None
    return {'nginx': nginx, 'caddy': caddy, 'protected': protected, 'networkExisted': bool(existing), 'legacyHashes': {item.name: hashlib.sha256(item.read_bytes()).hexdigest() for item in files}}


def compose(release, service_name, *arguments):
    project, filename = ('company-web', 'compose.yaml') if service_name == 'web' else ('small-games', 'nginx-compose.yaml')
    return command('docker', 'compose', '--project-name', project, '--env-file', '/dev/null', '-f', str(release / filename), *arguments)


def validate_candidates(target, config, old=None):
    # No production network, fixed IP, host ports or certificate volumes in validators.
    command('docker', 'image', 'inspect', CADDY_IMAGE, NGINX_IMAGE, '--format', '{{.Id}}')
    if old:
        require(compose(old, 'web', 'config', '--services') == 'web', 'Caddy rollback contains another service')
        image = compose(old, 'web', 'config', '--images')
        require(re.fullmatch(r'[A-Za-z0-9:._/@-]+', image) is not None, 'Invalid rollback image reference')
        require(command('docker', 'image', 'inspect', image, '--format', '{{.Id}}') == CADDY_IMAGE, 'Cached Caddy rollback image changed')
    compose(target, 'web', 'config', '--quiet')
    require(compose(target, 'nginx', 'config', '--services') == 'nginx', 'Nginx candidate contains another service')
    compose(target, 'nginx', 'config', '--quiet')
    command('docker', 'run', '--rm', '--network', 'none', '--pull', 'never', '--read-only', '--tmpfs', '/data', '--tmpfs', '/config', '--tmpfs', '/tmp', '-v', str(target / 'caddy') + ':/etc/caddy:ro', '-v', str(target / 'admin-site') + ':/srv/admin:ro', '--entrypoint', 'caddy', CADDY_IMAGE, 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile')
    legacy = config['nginx']['legacyRelease']
    # nginx -t also binds listen sockets. Permit the unchanged production IP only
    # inside this isolated network namespace; no host sysctl, port or capability changes.
    command('docker', 'run', '--rm', '--network', 'none', '--sysctl', 'net.ipv4.ip_nonlocal_bind=1', '--pull', 'never', '--read-only', '--add-host', 'runtime:127.0.0.1', '--add-host', 'kart:127.0.0.1', '--tmpfs', '/var/cache/nginx', '--tmpfs', '/var/run', '--tmpfs', '/tmp', '-v', str(target / 'nginx') + ':/etc/nginx/conf.d:ro', '-v', legacy + '/nginx:/etc/nginx/legacy:ro', '-v', legacy + '/site:/srv/site:ro', '--entrypoint', 'nginx', NGINX_IMAGE, '-t')


def check_protected(snapshot, website, company_body, static_pointer, backend_pointer, config):
    for name, before in snapshot['protected'].items():
        require(service('small-games', name) == before, f'Protected {name} container changed')
    require((website / 'current/site/release.json').read_text() == company_body, 'Company release changed during ingress activation')
    root = Path(config['deploymentDirectory'])
    require((root / 'current').resolve() == static_pointer and (root / 'backend-current').resolve() == backend_pointer, 'Protected static/backend pointer changed')
    require({item.name: hashlib.sha256(item.read_bytes()).hexdigest() for item in (Path(config['nginx']['legacyRelease']) / 'nginx').iterdir()} == snapshot['legacyHashes'], 'Legacy Nginx configuration changed')


def curl(host, path, *arguments):
    return command('curl', '--noproxy', '*', '--silent', '--show-error', '--connect-timeout', '5', '--max-time', '15', '--resolve', f'{host}:443:127.0.0.1', *arguments, f'https://{host}{path}')


def response(host, path, *arguments):
    raw = curl(host, path, '-D', '-', *arguments).replace('\r\n', '\n')
    head, separator, body = raw.partition('\n\n')
    lines = head.splitlines()
    require(separator and lines and re.fullmatch(r'HTTP/[\d.]+ \d{3}.*', lines[0]), 'Invalid HTTPS response')
    headers = dict(line.split(':', 1) for line in lines[1:] if ':' in line)
    return int(lines[0].split()[1]), {key.lower(): value.strip() for key, value in headers.items()}, body


def verify_public(config, domain, www, company_body):
    for host in (domain, www):
        require(curl(host, '/release.json', '--fail', '--location', '--resolve', f'{domain}:443:127.0.0.1') == company_body.strip(), 'Company HTTPS content changed')
    health = json.loads(curl(DOMAIN, '/health', '--fail', '--retry', '12', '--retry-all-errors', '--retry-delay', '2'))
    require(health == {'service': 'runtime', 'status': 'ok'}, 'Public health is not minimal/live')
    prefixes = ('/small-games/v1', '/api/competition/v1')
    for prefix in prefixes:
        for game in ('cops-robbers', 'cops-robbers-realtime', 'xiangqi-five'):
            definition = json.loads(curl(DOMAIN, f'{prefix}/games/{game}?probe=a%2Fb&repeat=one&repeat=two', '--fail'))
            board = json.loads(curl(DOMAIN, f'{prefix}/games/{game}/leaderboards/versus', '--fail'))
            require(definition.get('game') == game and definition.get('capabilities', {}).get('multiplayer') is True, 'Game definition changed')
            require(board.get('game') == game and board.get('boardType') == 'versus' and isinstance(board.get('top'), list), 'Game leaderboard changed')
        status, headers, body = response(DOMAIN, f'{prefix}/me')
        require(status == 401 and json.loads(body).get('error') == 'SESSION_EXPIRED' and 'location' not in headers, 'Anonymous API contract changed')
        # A valid profile body reaches authentication; a lost body fails validation. Neither can write without a credential.
        status, headers, body = response(DOMAIN, f'{prefix}/me?probe=body', '-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', '{"nickname":"Ingress probe"}')
        require(status == 401 and json.loads(body).get('error') == 'SESSION_EXPIRED' and 'location' not in headers, 'API POST body or method changed')
        status, headers, _ = response(DOMAIN, f'{prefix}/games/xiangqi-five', '-X', 'OPTIONS', '-H', 'Origin: http://localhost:8080', '-H', 'Access-Control-Request-Method: POST', '-H', 'Access-Control-Request-Headers: authorization,content-type')
        require(status == 204 and headers.get('access-control-allow-origin') == 'http://localhost:8080' and 'access-control-allow-credentials' not in headers, 'Public preflight policy changed')
    denied = ('/', '/health/live', '/health/runtime', '/health/kart', '/kart', '/releases/', '/internal', '/api/competition/v1/internal', '/api/competition/v1/internal/settle', '/api/competition/v1/games/xiangqi-five/internal', '/api/runtime/releases/project', '/api/competition/v1/%69nternal', '/api/competition/v1/games/../internal')
    for path in denied:
        require(curl(DOMAIN, path, '--path-as-is', '-o', '/dev/null', '-w', '%{http_code}') == '404', 'A non-public route was exposed')
    for prefix in prefixes:
        for suffix in ('/internal', '/internal/settle', '/%69nternal', '/games/../internal', '//me'):
            require(curl(DOMAIN, prefix + suffix, '--path-as-is', '-o', '/dev/null', '-w', '%{http_code}') == '404', 'A forbidden API alias was exposed')
    for host, path in ((DOMAIN, '/admin/'), (DOMAIN, '/api/session'), (domain, '/api/session'), (domain, '/admin/api/session'), (domain, '/admin/api'), (www, '/api/session'), (www, '/admin/api/session')):
        status, headers, _ = response(host, path)
        require(status == 404 and 'location' not in headers, 'A removed API alias redirected or became public')
    require(curl(DOMAIN, '/api/competition/v1/games/xiangqi-five', '-H', 'Origin: https://unapproved-origin.invalid', '-o', '/dev/null', '-w', '%{http_code}') == '403', 'Existing CORS rejection changed')
    require(curl(DOMAIN, '/small-games/v1/games/xiangqi-five', '-H', 'Origin: https://unapproved-origin.invalid', '-o', '/dev/null', '-w', '%{http_code}') == '403', 'Canonical CORS rejection changed')
    status, headers, _ = response(domain, '/admin/login?a=1&a=2&next=%2F')
    require(status == 302 and headers.get('location') == f'https://{ADMIN_DOMAIN}/login?a=1&a=2&next=%2F', 'Admin page redirect changed its query')
    curl(ADMIN_DOMAIN, '/', '--fail', '--retry', '12', '--retry-all-errors', '--retry-delay', '2', '--retry-max-time', '60')
    site = Path(__file__).resolve().parent / 'admin-site'
    expected = (site / 'index.html').read_text()
    for path, wanted in (('/', 200), ('/login', 200), ('/forbidden', 403)):
        status, headers, body = response(ADMIN_DOMAIN, path)
        require(status == wanted and body.strip() == expected.strip() and headers.get('cache-control') == 'no-store', 'Admin HTTPS page differs from its actual build')
    assets = set(re.findall(r"""(?:src|href)=["'](/assets/[A-Za-z0-9._-]+\.(?:js|css))["']""", expected))
    require(assets and any(asset.endswith('.js') for asset in assets), 'Admin build has no script asset')
    for asset in sorted(assets):
        status, _, body = response(ADMIN_DOMAIN, asset)
        require(status == 200 and body.strip() == (site / asset.lstrip('/')).read_text().strip(), 'Admin public asset differs from its actual build')
    for path in ('/api/unknown', '/api', '/assets/missing.js'):
        status, headers, _ = response(ADMIN_DOMAIN, path)
        require(status == 404 and 'location' not in headers, 'Admin API or asset fell back to the SPA')
    status, headers, body = response(ADMIN_DOMAIN, '/api/session')
    require(headers.get('content-type', '').startswith('application/json') and 'location' not in headers, 'Admin API did not return JSON')
    require((status == 503 and json.loads(body) == {'error': 'temporarily_unavailable'}) or (status == 401 and json.loads(body) == {'error': 'authentication_required'}), 'Admin unavailable/anonymous contract changed')
    return {'gamePrefixes': list(prefixes), 'adminUiAndAssets': 'passed', 'management': 'unavailable' if status == 503 else 'anonymous-session-only', 'realGithubLoginVerified': False}


def atomic_pointer(path, destination):
    temporary = path.with_name(path.name + '.next')
    require(not temporary.exists() and not temporary.is_symlink(), 'Stale transaction pointer; inspect manually')
    temporary.symlink_to(destination)
    temporary.replace(path)


def deploy(base, website, domain, www):
    target = Path(__file__).resolve().parent
    config = config_from(target / 'ingress.json')
    root = Path(config['deploymentDirectory'])
    require(target.parent == base / 'releases', 'Candidate outside immutable releases')
    require(base != root and website != root, 'Ingress directories overlap deployment root')
    # The caller already holds Caddy's lock. Every code path takes the game lock second.
    with (root / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        old = (base / 'current').resolve(strict=True)
        require(old.parent == base / 'releases' and (old / 'compose.yaml').is_file(), 'Ingress requires an existing independent Caddy deployment')
        marker = root / 'ingress-managed'
        if marker.exists() or marker.is_symlink():
            require(marker.is_symlink() and marker.readlink() == base / 'current/ingress.json', 'Foreign ingress marker')
            require((old / 'ingress.json').is_file(), 'Managed marker without active ingress; inspect failed transaction')
        snapshot = preflight(config, base, old)
        validate_candidates(target, config, old)
        company_body = (website / 'current/site/release.json').read_text()
        static_pointer, backend_pointer = (root / 'current').resolve(strict=True), (root / 'backend-current').resolve(strict=True)
        # Backup is verified and restored privately before any network/service mutation.
        receipt = json.loads(command('sudo', '-n', 'python3', str(target / 'backup.py'), '--preflight', str(base)))
        require(re.fullmatch(r'caddy-\d{8}T\d{6}Z-[a-f0-9]{6}\.tar\.gz', receipt['archive']) and re.fullmatch('[a-f0-9]{64}', receipt['sha256']), 'Invalid pre-activation backup receipt')
        journal = {'source': target.name, 'previous': str(old), 'backup': receipt, 'snapshot': snapshot}
        state = base / 'transactions'
        state.mkdir(mode=0o700, exist_ok=True)
        journal_path = state / (target.name + '.json')
        with journal_path.open('x') as stream:
            stream.write(json.dumps(journal, sort_keys=True) + '\n')
        journal_path.chmod(0o600)
        marker_existed = marker.is_symlink()
        network_created = False
        nginx_attempted = caddy_attempted = False
        previous = base / 'previous'
        old_previous = previous.readlink() if previous.is_symlink() else None
        require(not previous.exists() or previous.is_symlink(), 'Unexpected previous pointer')
        def interrupted(_number, _frame):
            raise RuntimeError('Ingress activation interrupted')
        prior_signals = {number: signal.signal(number, interrupted) for number in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM)}
        try:
            if not marker_existed:
                marker.symlink_to(base / 'current/ingress.json')
            if not snapshot['networkExisted']:
                subnet = ipaddress.IPv4Network(config['network']['subnet'])
                network_created = True
                command('docker', 'network', 'create', '--driver', 'bridge', '--internal', '--subnet', str(subnet), '--gateway', str(subnet.network_address + 1), '--label', LABEL + '=v1', NETWORK)
            nginx_attempted = True
            compose(target, 'nginx', 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '90', 'nginx')
            caddy_attempted = True
            compose(target, 'web', 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '90', 'web')
            journal['acceptance'] = verify_public(config, domain, www, company_body)
            check_protected(snapshot, website, company_body, static_pointer, backend_pointer, config)
            preflight(config, base, target)
            atomic_pointer(previous, old)
            atomic_pointer(base / 'current', target)
            journal['status'] = 'active'
            journal_path.write_text(json.dumps(journal, sort_keys=True) + '\n')
            print('CADDY_INGRESS_ACTIVE=' + str(target))
        except BaseException:
            # Recover both proxies, even when one of the rollback commands fails.
            errors = []
            for name, attempted in (('web', caddy_attempted), ('nginx', nginx_attempted)):
                if not attempted:
                    continue
                try:
                    if name == 'nginx' and not (old / 'nginx-compose.yaml').is_file():
                        command('docker', 'compose', '--project-name', 'small-games', '--env-file', '/dev/null', '-f', str(target / 'nginx-rollback.yaml'), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '90', 'nginx')
                    else:
                        compose(old, name, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '90', name)
                except BaseException:
                    errors.append(name)
            try:
                if (base / 'current').resolve() != old:
                    atomic_pointer(base / 'current', old)
                if old_previous is None:
                    if previous.is_symlink():
                        previous.unlink()
                elif not previous.is_symlink() or previous.readlink() != old_previous:
                    atomic_pointer(previous, old_previous)
                check_protected(snapshot, website, company_body, static_pointer, backend_pointer, config)
                if network_created:
                    matching = [item for item in networks() if item['name'] == NETWORK]
                    if matching:
                        require(len(matching) == 1 and not matching[0]['members'] and matching[0]['owner'] == 'v1', 'New bridge still has members')
                        command('docker', 'network', 'rm', NETWORK)
            except BaseException:
                errors.append('protected state/network/pointers')
            if not errors and not marker_existed:
                marker.unlink()
            journal['status'], journal['rollbackErrors'] = 'rolled-back' if not errors else 'rollback-failed', errors
            journal_path.write_text(json.dumps(journal, sort_keys=True) + '\n')
            if errors:
                raise RuntimeError('INGRESS ROLLBACK FAILED: ' + ', '.join(errors) + '; marker retained, inspect private transaction journal') from None
            raise RuntimeError('Ingress activation failed; both proxies and prior pointers restored') from None
        finally:
            for number, handler in prior_signals.items():
                signal.signal(number, handler)


if __name__ == '__main__':
    try:
        require(len(sys.argv) == 5, 'Usage: ingress.py caddy-directory website-directory domain www')
        deploy(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4])
    except BaseException as error:
        print(str(error) if isinstance(error, RuntimeError) else 'Ingress stopped before completion; inspect private transaction journal', file=sys.stderr)
        sys.exit(1)
