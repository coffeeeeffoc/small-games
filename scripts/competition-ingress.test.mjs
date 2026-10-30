import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  validateIngress,
  renderApiCaddy,
  renderAdminCaddy,
  managementIngressPattern,
  renderIngressNginx,
  renderNginxCompose,
  competitionIngressPattern,
  ingressShellGuard,
  ingressPreflightGuard,
} from './competition-ingress.mjs';
import { bundleConfig, renderBundleCompose } from './deployment-bundle.mjs';
import { deploymentConfig, renderCompose as renderTencentCompose } from './deploy-tencent.mjs';
import {
  renderCaddy,
  renderCompose,
  chooseIngress,
  parseCaddyArgs,
  writeCaddyBundle,
  assertCaddySource,
  backupInstall,
  finishCaddyDeployment,
} from './deploy-caddy.mjs';
import { companyConfig, fileHashes } from './company-deployment.mjs';

const ingress = JSON.parse(
  await readFile(new URL('../infra/caddy/ingress.example.json', import.meta.url), 'utf8'),
);

test('proxy-only retains backup installation while preserving preparation and topology guards', () => {
  assert.deepEqual(parseCaddyArgs(['--proxy-only', '--prepare']), {
    proxyOnly: true,
    action: '--prepare',
  });
  assert.throws(() => parseCaddyArgs(['--proxy-only', '--proxy-only']));
  const config = companyConfig();
  const calls = [];
  assert.match(
    finishCaddyDeployment(config, true, (...args) => calls.push(args)),
    /retained/,
  );
  assert.equal(calls.length, 0);
  finishCaddyDeployment(config, false, (...args) => calls.push(args));
  assert.deepEqual(calls, [[config, backupInstall(config)]]);
});
test('Caddy source guard rejects dirty nonce implementation or declarations at both boundaries', async () => {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(parent, 'small-games-caddy-source-'));
  const git = (args) => {
    const result = spawnSync(
      'git',
      ['-C', directory, '-c', 'core.fsmonitor=false', '-c', 'core.autocrlf=false', ...args],
      { encoding: 'utf8', shell: false, windowsHide: true, timeout: 30000 },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const run = (program, args) => {
    assert.equal(program, 'git');
    return git(args);
  };
  const commit = () =>
    git([
      '-c',
      'user.name=Caddy fixture',
      '-c',
      'user.email=caddy@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ]);
  try {
    git(['init', '--quiet']);
    await mkdir(path.join(directory, 'scripts'));
    for (const file of ['admin-csp.mjs', 'admin-csp.d.mts'])
      await writeFile(path.join(directory, 'scripts', file), 'export {};\n');
    git(['add', '.']);
    commit();
    const candidate = assertCaddySource(undefined, run);
    assert.match(candidate, /^[a-f0-9]{40}$/);
    assert.equal(assertCaddySource(candidate, run), candidate);
    for (const file of ['admin-csp.mjs', 'admin-csp.d.mts']) {
      const target = path.join(directory, 'scripts', file);
      await writeFile(target, 'export const changed = true;\n');
      assert.throws(() => assertCaddySource(undefined, run), /Commit Caddy changes/);
      assert.throws(() => assertCaddySource(candidate, run), /Commit Caddy changes/);
      await writeFile(target, 'export {};\n');
    }
    await writeFile(path.join(directory, 'scripts/admin-csp.mjs'), 'export const next = true;\n');
    git(['add', '.']);
    commit();
    assert.throws(() => assertCaddySource(candidate, run), /HEAD changed/);
    assert.notEqual(assertCaddySource(undefined, run), candidate);
  } finally {
    assert.equal(await realpath(directory), directory);
    assert.equal(path.dirname(directory), parent);
    assert(path.basename(directory).startsWith('small-games-caddy-source-'));
    await rm(directory, { recursive: true, force: false });
  }
});

test('both generic Runtime producers start with trust disabled, keep other services unchanged and satisfy validation', async () => {
  const { validateRuntimeEnvironment } = await import('../services/runtime-api/src/config.ts');
  const bundle = renderBundleCompose(bundleConfig({ DEPLOY_SERVICES: 'runtime,management,kart' }));
  const template = await readFile(
    new URL('../infra/tencent/compose.yaml', import.meta.url),
    'utf8',
  );
  const generic = yaml.load(
    renderTencentCompose(
      template,
      deploymentConfig({
        DEPLOY_MODE: 'internal',
        ECS_HOST: '192.0.2.1',
        ECS_USER: 'ubuntu',
        POSTGRES_PASSWORD: 'a'.repeat(64),
        RUNTIME_DB_PASSWORD: 'b'.repeat(64),
        COMPETITION_INTERNAL_KEY: 'c'.repeat(64),
      }),
    ),
  );
  for (const compose of [bundle, generic]) {
    assert.equal(compose.services.runtime.environment.TRUST_PROXY, '0');
    assert(!Object.hasOwn(compose.services.runtime.environment, 'RUNTIME_TRUSTED_PROXY_IP'));
    assert.equal(compose.services.kart.environment.TRUST_PROXY, '1');
    assert.doesNotThrow(() =>
      validateRuntimeEnvironment({
        ...compose.services.runtime.environment,
        RUNTIME_DATABASE_URL: 'postgres://runtime_app:test@127.0.0.1/test',
        COMPETITION_INTERNAL_KEY: 'a'.repeat(32),
        COMPETITION_ORIGINS: 'http://localhost:8080',
        COMPETITION_PLATFORM_CONFIG: '[]',
      }),
    );
  }
  assert.equal(bundle.services.management.environment.TRUST_PROXY, '1');
});
test('ingress preserves only the approved explicit topology and is sticky across ordinary deployments', () => {
  assert.deepEqual(validateIngress(ingress), ingress);
  assert.deepEqual(chooseIngress(ingress, null), ingress);
  assert.equal(chooseIngress(null, null), null);
  for (const change of [
    { domain: 'admin.nenggongzhiren.cn' },
    { secret: 'not-a-config-field' },
    { network: { ...ingress.network, subnet: '0.0.0.0/0' } },
    { network: { ...ingress.network, caddyIp: '172.30.245.1' } },
    { network: { ...ingress.network, caddyIp: '172.30.245.3' } },
    { network: { ...ingress.network, nginxIp: '172.18.0.4' } },
    { nginx: { ...ingress.nginx, backendIp: 'uniquelocal' } },
    { nginx: { ...ingress.nginx, legacyRelease: '/opt/small-games/releases/../private' } },
  ])
    assert.throws(() => validateIngress({ ...ingress, ...change }));
  assert.throws(
    () =>
      chooseIngress(ingress, {
        ...ingress,
        network: {
          ...ingress.network,
          subnet: '172.30.246.0/29',
          caddyIp: '172.30.246.2',
          nginxIp: '172.30.246.3',
        },
      }),
    /separate reviewed migration/,
  );
  assert.deepEqual(parseCaddyArgs(['--prepare', '--ingress', 'input.json']), {
    action: '--prepare',
    ingress: 'input.json',
  });
  for (const args of [
    ['--ingress'],
    ['--ingress', '--check'],
    ['--check', '--prepare'],
    ['--disable-api'],
  ])
    assert.throws(() => parseCaddyArgs(args));
});

test('public paths cover registered game, identity, TCT and carrom endpoints and reject internal or non-API routes', () => {
  const allowed = new RegExp(competitionIngressPattern);
  for (const suffix of [
    'sessions/guest',
    'sessions/refresh',
    'sessions/upgrade',
    'runs/cops-robbers-realtime/start',
    'me',
    'boards/xiangqi-five',
    'rooms/join',
    'rooms/ABCDEF012345/actions',
    'games/xiangqi-five',
    'games/xiangqi-five/leaderboards/versus',
    'games/xiangqi-five/rooms/ABCDEF012345/ready',
    'games/night-overwatch/rooms',
    'games/night-overwatch/history',
    'games/night-overwatch/wallet',
    'games/night-overwatch/rooms/123456/ready',
    'games/night-overwatch/runs/12345678-1234-1234-1234-123456789abc/resume',
    'games/night-overwatch/rooms/123456/spectate',
    'games/night-overwatch/rooms/123456/connect',
    'games/night-overwatch/rooms/123456/actions',
    'three-choose-two/board',
    'three-choose-two/session/11111111-1111-1111-1111-111111111111/finish',
    'carrom/rooms/join',
    'carrom/rooms/ABCDEF012345/shoot',
  ])
    for (const prefix of ['/small-games/v1/', '/api/competition/v1/'])
      assert(allowed.test(prefix + suffix), prefix + suffix);
  for (const route of [
    '/health',
    '/kart',
    '/releases/',
    '/api/runtime/releases/project',
    '/api/competition/v1/internal',
    '/api/competition/v1/internal/verify',
    '/api/competition/v1/internal/three-choose-two/sessions/x/review',
    '/api/competition/v1/games/chess/internal',
    '/api/competition/v1/games/tower-brake/runs/12345678-1234-1234-1234-123456789abc/resume',
    '/api/competition/v1/games/night-overwatch/runs/invalid/resume',
    '/api/competition/v1/games/night-overwatch/runs/12345678-1234-1234-1234-123456789abc/resume/extra',
    '/api/competition/v1/carrom/rooms/ABCDEF012345/internal',
    '/api/competition/v1/sessions/platform/extra',
    '/api/competition/v1/boards/../internal',
    '/api/competition/v1/%69nternal',
  ])
    for (const candidate of [route, route.replace('/api/competition/v1/', '/small-games/v1/')])
      assert(!allowed.test(candidate), candidate);
});

test('Caddy and Nginx keep host ports, isolate trust, sanitize forwarding and limit by the resolved client', () => {
  const config = { ...companyConfig(), ingress };
  const caddy = renderCaddy(config),
    compose = yaml.load(renderCompose(config));
  assert.match(caddy, /api\.nenggongzhiren\.cn \{/);
  assert.match(caddy, /root \* \/opt\/small-games\/company\/current\/site/);
  assert.deepEqual(compose.services.web.ports, ['80:80', '443:443']);
  assert(
    compose.services.web.volumes.includes(
      '/opt/small-games/admin-console:/opt/small-games/admin-console:ro',
    ),
  );
  assert.match(caddy, /@published file \{\s+root \/opt\/small-games\/admin-console\/current\/site/);
  assert.match(caddy, /root @published \/opt\/small-games\/admin-console\/current\/site/);
  assert.deepEqual(Object.keys(compose.services.web.networks), ['default', 'competition_ingress']);
  assert.equal(
    compose.services.web.networks.competition_ingress.ipv4_address,
    ingress.network.caddyIp,
  );
  assert.equal(compose.networks.competition_ingress.external, true);
  assert.doesNotMatch(JSON.stringify(compose), /small-games_default|docker\.sock|5432/);
  const proxy = renderApiCaddy(ingress);
  for (const header of [
    'Host api.nenggongzhiren.cn',
    'X-Forwarded-For {remote_host}',
    'X-Real-IP {remote_host}',
    'X-Forwarded-Proto https',
    '-Forwarded',
    '-X-Competition-Internal-Key',
  ])
    assert(proxy.includes('header_up ' + header));
  assert.doesNotMatch(proxy, /trusted_proxies|Access-Control|handle_path/);
  const nginx = renderIngressNginx(ingress);
  assert(nginx.includes('listen ' + ingress.network.nginxIp + ':8082;'));
  assert(nginx.includes('set_real_ip_from ' + ingress.network.caddyIp + ';'));
  assert.match(nginx, /map \$realip_remote_addr \$competition_edge_peer/);
  assert.match(nginx, /limit_req_zone \$binary_remote_addr/);
  assert.match(nginx, /limit_req_status 429/);
  assert(nginx.includes('rewrite ^/small-games/v1/(.*)$ /api/competition/v1/$1 break;'));
  const gameLocation = nginx.slice(
    nginx.indexOf('location ~ ^/(?:small-games|api/competition)/v1/'),
  );
  assert(
    gameLocation.indexOf('set $competition_runtime runtime:43002;') <
      gameLocation.indexOf('rewrite ^/small-games/v1/'),
    'break must not skip upstream initialization',
  );
  assert.match(nginx, /proxy_pass http:\/\/\$competition_runtime\/health\/live/);
  assert.doesNotMatch(
    nginx,
    /Access-Control|proxy_add_x_forwarded_for|proxy_set_header X-Forwarded-Proto \$scheme|allow 172/,
  );
  const gateway = yaml.load(renderNginxCompose(ingress));
  assert.deepEqual(Object.keys(gateway.services), ['nginx']);
  assert.deepEqual(gateway.services.nginx.ports, ['127.0.0.1:8080:80']);
  assert.equal(gateway.networks.backend.name, 'small-games_default');
  assert.equal(gateway.services.nginx.networks.backend.ipv4_address, '172.18.0.4');
  assert(
    gateway.services.nginx.volumes.includes(
      ingress.nginx.legacyRelease + '/nginx:/etc/nginx/legacy:ro',
    ),
  );
  assert.doesNotMatch(
    renderNginxCompose(ingress),
    /POSTGRES|PASSWORD|depends_on|build:|5432|43002:/,
  );
  assert.doesNotMatch(
    renderNginxCompose(ingress, { legacy: true }),
    /competition_ingress|\/etc\/nginx\/legacy/,
  );
});

test('immutable package includes both proxy configs, a first-migration rollback and every checksum', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'competition-ingress-'));
  try {
    const target = path.join(folder, 'candidate');
    const adminSite = path.join(folder, 'admin-build');
    await mkdir(path.join(adminSite, 'assets'), { recursive: true });
    for (const [file, body] of Object.entries({
      'index.html': '<script src="/assets/index.js"></script>',
      'mark.svg': '<svg/>',
      'assets/index.js': 'console.log("fixture");',
    }))
      await writeFile(path.join(adminSite, file), body);
    await writeCaddyBundle(
      target,
      { ...companyConfig(), ingress },
      'a'.repeat(40),
      'ingress-test',
      { adminSite },
    );
    const files = await fileHashes(target);
    for (const name of [
      'ingress.json',
      'ingress.py',
      'admin-csp-contract.json',
      'nginx-compose.yaml',
      'nginx-rollback.yaml',
      'nginx/00-legacy.conf',
      'nginx/10-competition-ingress.conf',
      'admin-site/index.html',
      'admin-site/mark.svg',
      'admin-site/assets/index.js',
    ])
      assert(files[name], name);
    for (const line of (await readFile(path.join(target, 'SHA256SUMS'), 'utf8'))
      .trim()
      .split('\n')) {
      const [hash, name] = line.split('  ');
      assert.equal(files[name], hash);
    }
    assert.equal(
      await readFile(path.join(target, 'nginx/00-legacy.conf'), 'utf8'),
      'include /etc/nginx/legacy/*.conf;\n',
    );
    await writeFile(path.join(adminSite, '.env'), 'PRIVATE_FIXTURE=true');
    await assert.rejects(
      writeCaddyBundle(
        path.join(folder, 'rejected'),
        { ...companyConfig(), ingress },
        'a'.repeat(40),
        'rejected',
        { adminSite },
      ),
      /private\/debug admin asset/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('management stays on its sole origin with finite APIs and no SPA API fallback', () => {
  const allowed = new RegExp(managementIngressPattern);
  for (const route of [
    '/api/auth/github',
    '/api/auth/github/callback',
    '/api/session',
    '/api/refresh',
    '/api/logout',
    '/api/control/catalog',
    '/api/control/state',
    '/api/control/revisions',
    '/api/control/revisions/11111111-1111-4111-8111-111111111111/publish',
    '/api/control/rollback',
    '/api/control/members',
    '/api/control/members/11111111-1111-4111-8111-111111111111',
    '/api/control/members/11111111-1111-4111-8111-111111111111/delete',
    '/api/control/roles',
    '/api/control/roles/config-editor/delete',
    '/api/control/audit',
  ])
    assert(allowed.test(route), route);
  for (const route of [
    '/api',
    '/api/users',
    '/api/auth/github/extra',
    '/admin/api/session',
    '/api/admin/session',
    '/api/control',
    '/api/control/internal',
    '/api/control/revisions/not-a-uuid/publish',
    '/api/control/revisions/11111111-1111-4111-8111-111111111111/delete',
    '/api/control/roles/administrator/extra',
  ])
    assert(!allowed.test(route), route);
  const admin = renderAdminCaddy(ingress),
    main = renderCaddy({ ...companyConfig(), ingress });
  assert.match(admin, /admin\.nenggongzhiren\.cn \{/);
  assert.match(admin, /http:\/\/172\.30\.245\.3:8083/);
  assert.match(admin, /@pages path \/ \/login \/config \/games \/members \/roles \/audit\n/);
  assert.equal((admin.match(/templates \{/g) || []).length, 2);
  for (const header of [
    'If-None-Match',
    'If-Modified-Since',
    'If-Match',
    'If-Unmodified-Since',
    'Range',
    'If-Range',
  ])
    assert.equal(admin.split('request_header -' + header + '\n').length, 3);
  assert.doesNotMatch(admin, /unsafe-inline|unsafe-eval|nonce-fixed/);
  assert.match(admin, /status 403/);
  assert(admin.indexOf('handle @api') < admin.indexOf('handle @pages'));
  assert.match(main, /@removedApi path \/api \/api\/\* \/admin\/api \/admin\/api\/\*/);
  assert(main.indexOf('respond @removedApi 404') < main.indexOf('handle @adminPage'));
  assert.match(
    main,
    /handle @adminPage \{\s+route \{\s+uri strip_prefix \/admin\s+redir https:\/\/admin\.nenggongzhiren\.cn\{uri\} 302/,
  );
  const nginx = renderIngressNginx(ingress);
  assert.match(nginx, /proxy_set_header X-Management-Entry admin;/);
  assert.match(nginx, /resolver_timeout 2s;/);
  assert.match(nginx, /error_log \/dev\/null crit;/);
  assert.match(nginx, /location = \/api \{ return 404 '\{"error":"NOT_FOUND"\}'; \}/);
  assert.match(nginx, /error_page 502 503 504 =503 @management_unavailable;/);
  assert.match(
    nginx,
    /location @management_unavailable \{ return 503 '\{"error":"temporarily_unavailable"\}'; \}/,
  );
});

test('legacy deployment guards run before mutation and recheck after acquiring the game lock', async () => {
  const shell = (
    await readFile(new URL('../infra/tencent/deploy.sh', import.meta.url), 'utf8')
  ).replaceAll('\r\n', '\n');
  const tool = (
    await readFile(new URL('./deploy-tencent.mjs', import.meta.url), 'utf8')
  ).replaceAll('\r\n', '\n');
  assert(shell.includes('set +a\n' + ingressShellGuard + 'compose()'));
  assert.equal(shell.split(ingressShellGuard).length, 3);
  assert(shell.lastIndexOf(ingressShellGuard) < shell.indexOf('compose stop nginx'));
  assert(tool.includes('return `set -eu\n' + ingressPreflightGuard + 'docker compose version'));
});

test('proxy transaction exercises preflight, activation, idempotence and both-layer rollback without Docker', () => {
  const file = fileURLToPath(new URL('../infra/caddy/ingress.test.py', import.meta.url));
  const windows = process.platform === 'win32';
  const result = spawnSync(process.env.PYTHON || (windows ? 'python' : 'python3'), ['-B', file], {
    encoding: 'utf8',
    timeout: 60000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
