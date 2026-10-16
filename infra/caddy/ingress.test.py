import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

# Deterministic unit fixtures never take a real deployment lock on Windows.
if sys.platform == 'win32':
    sys.modules['fcntl'] = types.SimpleNamespace(LOCK_EX=1, LOCK_NB=2, flock=lambda *_: None)

spec = importlib.util.spec_from_file_location('ingress', Path(__file__).with_name('ingress.py'))
ingress = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingress)
EXAMPLE = json.loads(Path(__file__).with_name('ingress.example.json').read_text())


class IngressTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        if sys.platform == 'win32':
            # Model only the transaction's symlink pointers. Do not request Windows
            # symlink privileges or weaken production Path/lock behavior.
            links = {}
            original = {name:getattr(Path,name) for name in ('resolve','exists','is_symlink','symlink_to','readlink','replace','unlink','open')}
            def resolve(path, strict=False):
                for parent in (path, *path.parents):
                    if parent in links:
                        return resolve(links[parent] / path.relative_to(parent),strict)
                return original['resolve'](path,strict=strict)
            def replace(path,target):
                if path in links:
                    links[Path(target)] = links.pop(path)
                    return Path(target)
                return original['replace'](path,target)
            def unlink(path,missing_ok=False):
                if path in links:
                    del links[path]
                else:
                    original['unlink'](path,missing_ok=missing_ok)
            replacements = {
                'resolve':resolve,
                'open':lambda path,*args,**kwargs:original['open'](resolve(path),*args,**kwargs),
                'exists':lambda path:original['exists'](resolve(path)) if path in links else original['exists'](path),
                'is_symlink':lambda path:path in links or original['is_symlink'](path),
                'symlink_to':lambda path,target,target_is_directory=False:links.__setitem__(path,Path(target)),
                'readlink':lambda path:links[path] if path in links else original['readlink'](path),
                'replace':replace,
                'unlink':unlink,
            }
            for name,replacement in replacements.items():
                operation=patch.object(Path,name,replacement)
                operation.start()
                self.addCleanup(operation.stop)
        self.base, self.website = self.root / 'caddy', self.root / 'company'
        self.old, self.target = self.base / 'releases/old', self.base / 'releases/new'
        self.old.mkdir(parents=True)
        self.target.mkdir()
        self.config = copy.deepcopy(EXAMPLE)
        self.config['deploymentDirectory'] = str(self.root / 'games')
        self.config['nginx']['legacyRelease'] = str(self.root / 'legacy')
        self.games = Path(self.config['deploymentDirectory'])
        for directory in (self.games, self.website / 'release/site', self.root / 'legacy/nginx', self.root / 'legacy/site', self.games / 'static', self.games / 'backend'):
            directory.mkdir(parents=True, exist_ok=True)
        (self.website / 'release/site/release.json').write_text('{"company":"unchanged"}\n')
        (self.root / 'legacy/nginx/game.conf').write_text('server { listen 80; }\n')
        (self.old / 'compose.yaml').write_text('old Caddy')
        (self.target / 'ingress.json').write_text(json.dumps(self.config))
        (self.target / 'compose.yaml').write_text('new Caddy')
        (self.base / 'current').symlink_to(self.old, target_is_directory=True)
        (self.website / 'current').symlink_to(self.website / 'release', target_is_directory=True)
        (self.games / 'current').symlink_to(self.games / 'static', target_is_directory=True)
        (self.games / 'backend-current').symlink_to(self.games / 'backend', target_is_directory=True)
        self.events = []
        self.failure = None
        self.rollback_failure = False

    def command(self, *args):
        self.events.append(args)
        if args[0] == 'sudo':
            if self.failure == 'backup':
                raise RuntimeError('backup failed')
            return json.dumps({'archive':'caddy-20261016T120000Z-abcdef.tar.gz', 'sha256':'a' * 64})
        return ''

    def compose(self, release, name, *args):
        self.events.append(('compose', str(release), name, *args))
        if release == self.target and name == self.failure:
            raise RuntimeError('activation failed')
        if release == self.old and self.rollback_failure:
            raise RuntimeError('rollback failed')
        return ''

    def activate(self):
        fake_signal = types.SimpleNamespace(SIGHUP=1, SIGINT=2, SIGTERM=15, signal=lambda *_: None)
        snapshot = {'protected':{}, 'networkExisted':(self.old / 'ingress.json').is_file()}
        with patch.object(ingress, '__file__', str(self.target / 'ingress.py')), patch.object(ingress, 'config_from', return_value=self.config), patch.object(ingress, 'preflight', return_value=snapshot), patch.object(ingress, 'validate_candidates', side_effect=lambda *_: self.events.append(('validate',))), patch.object(ingress, 'check_protected', side_effect=lambda *_: self.events.append(('protected',))), patch.object(ingress, 'verify_public', side_effect=RuntimeError('TLS failed') if self.failure == 'tls' else lambda *_: self.events.append(('https',))), patch.object(ingress, 'networks', return_value=[{'name':ingress.NETWORK,'members':{},'owner':'v1'}]), patch.object(ingress, 'command', side_effect=self.command), patch.object(ingress, 'compose', side_effect=self.compose), patch.object(ingress, 'signal', fake_signal):
            ingress.deploy(self.base, self.website, 'nenggongzhiren.cn', 'www.nenggongzhiren.cn')

    def test_activation_is_proxy_only_backup_first_and_second_deploy_keeps_api(self):
        self.activate()
        self.assertEqual((self.base / 'current').resolve(), self.target)
        self.assertTrue((self.games / 'ingress-managed').is_symlink())
        backup = next(i for i, event in enumerate(self.events) if event[0] == 'sudo')
        mutations = [i for i, event in enumerate(self.events) if event[0] == 'compose' or event[:3] == ('docker','network','create')]
        self.assertTrue(all(backup < i for i in mutations))
        proxies = [event[2] for event in self.events if event[0] == 'compose']
        self.assertEqual(proxies, ['nginx','web'])
        self.old = self.target
        self.target = self.base / 'releases/newer'
        self.target.mkdir()
        (self.target / 'ingress.json').write_text(json.dumps(self.config))
        (self.old / 'nginx-compose.yaml').write_text('managed Nginx')
        self.activate()
        self.assertEqual((self.base / 'current').resolve(), self.target)
        self.assertEqual(sum(event[:3] == ('docker','network','create') for event in self.events), 1)
        self.assertFalse(any('postgres' in event or 'runtime' in event or 'down' in event or '--remove-orphans' in event for event in self.events))

    def test_backup_failure_changes_no_network_service_or_pointer(self):
        self.failure = 'backup'
        with self.assertRaisesRegex(RuntimeError, 'backup failed'):
            self.activate()
        self.assertEqual((self.base / 'current').resolve(), self.old)
        self.assertFalse((self.games / 'ingress-managed').is_symlink())
        self.assertFalse(any(event[0] == 'compose' or event[:3] == ('docker','network','create') for event in self.events))

    def test_each_failure_restores_both_attempted_layers_and_removes_only_new_empty_bridge(self):
        for failure in ('nginx','web','tls'):
            with self.subTest(failure=failure):
                # Each candidate has a unique immutable identity, including a failed attempt.
                self.target = self.base / ('releases/failure-' + failure)
                self.target.mkdir()
                self.events = []
                self.failure = failure
                with self.assertRaisesRegex(RuntimeError, 'both proxies and prior pointers restored'):
                    self.activate()
                self.assertEqual((self.base / 'current').resolve(), self.old)
                self.assertFalse((self.games / 'ingress-managed').is_symlink())
                self.assertIn(('docker','network','rm',ingress.NETWORK), self.events)
                rollback = [event for event in self.events if event[:2] == ('docker','compose')]
                self.assertTrue(rollback and 'nginx-rollback.yaml' in ' '.join(rollback[0]))
                if failure != 'nginx':
                    self.assertTrue(any(event[:3] == ('compose',str(self.old),'web') for event in self.events))

    def test_rollback_failure_still_attempts_other_layer_and_retains_guard(self):
        self.failure, self.rollback_failure = 'tls', True
        with self.assertRaisesRegex(RuntimeError, 'ROLLBACK FAILED'):
            self.activate()
        self.assertTrue((self.games / 'ingress-managed').is_symlink())
        self.assertTrue(any(event[:2] == ('docker','compose') for event in self.events))
        journal = json.loads((self.base / 'transactions/new.json').read_text())
        self.assertEqual(journal['status'],'rollback-failed')

    def containers(self, managed=False):
        def network(ip):
            return {'IPAddress':ip}
        nginx = {'id':'nginx','name':'/small-games-nginx-1','image':ingress.NGINX_IMAGE,'ports':{'80/tcp':[{'HostIp':'127.0.0.1','HostPort':'8080'}]},'restart':'unless-stopped','health':{'Test':['CMD','wget','-q','-O','/dev/null','http://127.0.0.1:8080/health'],'Interval':5000000000,'Timeout':3000000000,'Retries':12},'logging':{'Type':'json-file','Config':{'max-size':'10m','max-file':'3'}},'networks':{'small-games_default':network('172.18.0.4')},'mounts':[{'Destination':'/srv/site','Source':str(self.root / 'legacy/site'),'Type':'bind','RW':False}]}
        caddy = {'id':'caddy','image':ingress.CADDY_IMAGE,'networks':{'company-web_default':network('172.19.0.2')},'ports':{'80/tcp':[{'HostIp':'','HostPort':'80'}],'443/tcp':[{'HostIp':'','HostPort':'443'}]}}
        nginx['mounts'].append({'Destination':'/etc/nginx/conf.d','Source':str(self.old / 'nginx') if managed else str(self.root / 'legacy/nginx'),'Type':'bind','RW':False})
        if managed:
            nginx['mounts'].append({'Destination':'/etc/nginx/legacy','Source':str(self.root / 'legacy/nginx'),'Type':'bind','RW':False})
            nginx['networks'][ingress.NETWORK] = network('172.30.245.3')
            caddy['networks'][ingress.NETWORK] = network('172.30.245.2')
        return {'nginx':nginx,'web':caddy,'runtime':{'id':'runtime'},'kart':{'id':'kart','namespace':'container:runtime'},'postgres':{'id':'postgres'}}

    def test_preflight_rejects_foreign_network_overlap_and_allows_only_owned_bridge_local_routes(self):
        owned_id = 'abcdef0123456789'
        backend = {'name':'small-games_default','driver':'bridge','ipam':[{'Subnet':'172.18.0.0/16'}]}
        owned = {'id':owned_id,'name':ingress.NETWORK,'driver':'bridge','internal':True,'owner':'v1','ipam':[{'Subnet':'172.30.245.0/29','Gateway':'172.30.245.1'}],'members':{'nginx':{},'caddy':{}}}
        (self.old / 'ingress.json').write_text('{}')
        routes = [{'dst':'172.30.245.0/29','dev':'br-'+owned_id[:12]},{'dst':'172.30.245.1','dev':'br-'+owned_id[:12]},{'dst':'172.30.245.7','dev':'br-'+owned_id[:12]}]
        containers = self.containers(True)
        def execute(*args):
            self.events.append(args)
            return json.dumps(routes) if args[0] == 'ip' else ''
        with patch.object(ingress,'service',side_effect=lambda project,name:containers[name]), patch.object(ingress,'config_from',return_value=self.config), patch.object(ingress,'LEGACY_CONFIG_HASH',hashlib.sha256((self.root / 'legacy/nginx/game.conf').read_bytes()).hexdigest()), patch.object(ingress,'command',side_effect=execute), patch.object(ingress,'networks',return_value=[backend,owned]):
            self.assertTrue(ingress.preflight(self.config,self.base,self.old)['networkExisted'])
            routes.append({'dst':'172.30.245.1','dev':'eth0'})
            with self.assertRaisesRegex(RuntimeError,'host route'):
                ingress.preflight(self.config,self.base,self.old)
            routes.pop()
            owned['members']['foreign'] = {}
            with self.assertRaisesRegex(RuntimeError,'Unapproved container'):
                ingress.preflight(self.config,self.base,self.old)
            del owned['members']['foreign']
            owned['owner'] = 'someone-else'
            with self.assertRaisesRegex(RuntimeError,'Foreign network'):
                ingress.preflight(self.config,self.base,self.old)
            owned['owner'] = 'v1'
            backend['ipam'] = [{'Subnet':'172.30.0.0/16'}]
            with self.assertRaisesRegex(RuntimeError,'overlaps another Docker'):
                ingress.preflight(self.config,self.base,self.old)
        self.assertFalse(any('create' in event or 'up' in event for event in self.events))

    def test_validators_have_no_real_network_ports_or_certificate_mounts(self):
        with patch.object(ingress,'command',side_effect=lambda *args:self.events.append(args) or ''), patch.object(ingress,'compose',side_effect=lambda release,name,*args:'nginx' if '--services' in args else ''):
            ingress.validate_candidates(self.target,self.config)
        validators = [event for event in self.events if event[:2] == ('docker','run')]
        self.assertEqual(len(validators),2)
        for event in validators:
            self.assertIn('--read-only',event)
            self.assertIn('none',event)
            self.assertNotIn('-p',event)
            self.assertNotIn('company-web_caddy_data',' '.join(event))
        self.assertIn('runtime:127.0.0.1',validators[1])
        self.assertIn('net.ipv4.ip_nonlocal_bind=1',validators[1])
        self.assertNotIn('--sysctl',validators[0])
        for event in validators:
            self.assertNotIn('--privileged',event)
            self.assertNotIn('--cap-add',event)

    def test_public_acceptance_covers_canonical_routes_admin_assets_and_unavailable_backend(self):
        site = self.target / 'admin-site'
        (site / 'assets').mkdir(parents=True)
        html = '<div id="root"></div><script src="/assets/index.js"></script>'
        (site / 'index.html').write_text(html)
        (site / 'assets/index.js').write_text('console.log("fixture");')
        seen = []
        broken = set()
        management_status = 503
        def fetch(host, path, *args):
            seen.append((host, path, args))
            if host == ingress.ADMIN_DOMAIN and path == '/':
                return html
            if path == '/release.json':
                return '{"company":"unchanged"}'
            if path == '/health':
                return '{"service":"runtime","status":"ok"}'
            if '%{http_code}' in args:
                return '403' if 'Origin: https://unapproved-origin.invalid' in args else '404'
            if '/leaderboards/versus' in path:
                game = path.split('/games/')[1].split('/')[0]
                return json.dumps({'game':game, 'boardType':'versus', 'top':[]})
            if '/games/' in path:
                game = path.split('/games/')[1].split('?')[0]
                return json.dumps({'game':game, 'capabilities':{'multiplayer':True}})
            raise AssertionError((host, path))
        def read_response(host, path, *args):
            seen.append((host, path, args))
            if (host, path) in broken:
                return 500, {}, ''
            if host == 'nenggongzhiren.cn' and path == '/admin/login?a=1&a=2&next=%2F':
                return 302, {'location':f'https://{ingress.ADMIN_DOMAIN}/login?a=1&a=2&next=%2F'}, ''
            if host == ingress.ADMIN_DOMAIN:
                if path in ('/', '/login', '/forbidden'):
                    return (403 if path == '/forbidden' else 200), {'cache-control':'no-store'}, html
                if path == '/assets/index.js':
                    return 200, {}, 'console.log("fixture");'
                if path == '/api/session':
                    error = 'temporarily_unavailable' if management_status == 503 else 'authentication_required'
                    return management_status, {'content-type':'application/json'}, json.dumps({'error':error})
            if host == ingress.DOMAIN:
                if 'OPTIONS' in args:
                    self.assertIn('Origin: http://localhost:8080', args)
                    return 204, {'access-control-allow-origin':'http://localhost:8080'}, ''
                if '/me' in path:
                    if 'POST' in args:
                        self.assertEqual(json.loads(args[-1]), {'nickname':'Ingress probe'})
                    return 401, {'content-type':'application/json'}, '{"error":"SESSION_EXPIRED"}'
            return 404, {}, ''
        with patch.object(ingress, '__file__', str(self.target / 'ingress.py')), patch.object(ingress, 'curl', side_effect=fetch), patch.object(ingress, 'response', side_effect=read_response):
            result = ingress.verify_public(self.config, 'nenggongzhiren.cn', 'www.nenggongzhiren.cn', '{"company":"unchanged"}')
            self.assertEqual(result['management'], 'unavailable')
            self.assertFalse(result['realGithubLoginVerified'])
            self.assertEqual(result['gamePrefixes'], ['/small-games/v1', '/api/competition/v1'])
            management_status = 401
            self.assertEqual(ingress.verify_public(self.config, 'nenggongzhiren.cn', 'www.nenggongzhiren.cn', '{"company":"unchanged"}')['management'], 'anonymous-session-only')
            for failing in ((ingress.DOMAIN, '/small-games/v1/me'), (ingress.ADMIN_DOMAIN, '/login'), (ingress.ADMIN_DOMAIN, '/assets/index.js')):
                broken.add(failing)
                with self.assertRaises(RuntimeError):
                    ingress.verify_public(self.config, 'nenggongzhiren.cn', 'www.nenggongzhiren.cn', '{"company":"unchanged"}')
                broken.clear()
        for prefix in ('/small-games/v1', '/api/competition/v1'):
            self.assertTrue(any(path == prefix + '/me?probe=body' and 'POST' in args for _, path, args in seen))
            self.assertTrue(any(path.startswith(prefix + '/games/') and 'repeat=one&repeat=two' in path for _, path, _ in seen))


if __name__ == '__main__':
    unittest.main()
