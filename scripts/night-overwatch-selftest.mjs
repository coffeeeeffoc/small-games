// A local, isolated TapTap test stack. Sakura Frp terminates public HTTPS at the loopback gateway.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gameDefaults from '../infra/builds/five-taptap-h5.mjs';
import { pnpmInvocation } from './validate-push.mjs';
import { verifyPrebuilt } from '../games/local/night-overwatch/scripts/artifact.mjs';
import { verifyNightBackup, migrateNightWallets } from './night-overwatch-backup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = path.join(root, '.scratch/night-overwatch-selftest');
const app = 'night-overwatch',
  project = 'night-overwatch-taptap-test';
const usage =
  'node scripts/night-overwatch-selftest.mjs start|pack|plan https://<your-frp-host:port> [loopback-port]';
const [operation, publicHost = process.env.NIGHT_H5_PUBLIC_ORIGIN, portText = '43003'] =
  process.argv.slice(2);
if (!['start', 'pack', 'plan'].includes(operation) || !publicHost) throw Error(usage);
const origin = new URL(publicHost);
if (
  origin.protocol !== 'https:' ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password
)
  throw Error('Supply an HTTPS origin without credentials or path.');
const port = Number(portText);
assert(Number.isInteger(port) && port >= 1024 && port < 65536, 'Invalid loopback port.');
const apiUrl = origin.origin + '/api/competition/v1';
const target = gameDefaults.targets.find((t) => t.platform === 'taptap' && t.type === 'h5');
const appId = target.tapIdentityAppIds[app],
  adUnit = target.adUnits[app];
assert(
  appId && adUnit,
  'Night Overwatch TapTap identity and rewarded placement must be configured.',
);
const h5 = {
  version: 2,
  games: [app],
  targets: [
    {
      platform: 'taptap',
      type: 'h5',
      tapIdentityAppIds: { [app]: appId },
      adUnits: { [app]: adUnit },
    },
  ],
  ads: [true],
  backend: [true],
  apiUrl,
};
const invoke = (command, args, { env = process.env, input, capture = false } = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    input,
    encoding: 'utf8',
    stdio: [input === undefined ? 'ignore' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'],
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw Error(command + ' failed (' + (result.status ?? 'spawn') + ').');
  return result.stdout;
};
if (operation === 'plan') {
  // No filesystem changes and no account or Docker access.
  console.log(
    JSON.stringify(
      { game: app, apiUrl, port, services: ['postgres', 'runtime', 'gateway'], appId, adUnit },
      null,
      2,
    ),
  );
} else {
  await mkdir(work, { recursive: true });
  if (operation === 'pack') {
    const config = path.join(work, 'h5.json');
    await writeFile(config, JSON.stringify(h5, null, 2));
    const gameRoot = path.join(root, 'games/local/night-overwatch');
    const current = await verifyPrebuilt(gameRoot).then(
      () => true,
      () => false,
    );
    invoke(process.execPath, ['scripts/build-games.mjs', '--config', path.relative(root, config)], {
      env: current ? { ...process.env, NIGHT_OVERWATCH_PREBUILT_DIR: gameRoot } : process.env,
    });
  } else {
    const endpoint =
      process.env.DOCKER_HOST ||
      invoke('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {
        capture: true,
      }).trim();
    assert(
      [
        'npipe:////./pipe/dockerDesktopLinuxEngine',
        'npipe:////./pipe/docker_engine',
        'unix:///var/run/docker.sock',
      ].includes(endpoint),
      'Select a local Docker context before starting the phone test.',
    );
    const server = invoke('docker', ['version', '--format', '{{.Server.Version}}'], {
      capture: true,
    }).trim();
    assert(
      Number.parseInt(server, 10) >= 28,
      'Docker Desktop with Linux Engine 28+ must be running.',
    );
    const envFile = path.join(work, 'database.env');
    const keys = [
      'POSTGRES_PASSWORD',
      'RUNTIME_DB_PASSWORD',
      'MANAGEMENT_DB_PASSWORD',
      'COMPETITION_INTERNAL_KEY',
    ];
    try {
      await writeFile(
        envFile,
        keys.map((k) => k + '=' + randomBytes(32).toString('hex')).join('\n') + '\n',
        { flag: 'wx', mode: 0o600 },
      );
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const privateEnv = Object.fromEntries(
      (await readFile(envFile, 'utf8'))
        .trim()
        .split(/\r?\n/)
        .map((l) => l.split('=')),
    );
    assert(
      keys.every((k) => /^[a-f0-9]{64}$/.test(privateEnv[k])),
      'Local database settings invalid; do not replace them while the volume exists.',
    );
    const release = 'night-' + Date.now() + '-' + randomBytes(2).toString('hex');
    const bundle = path.join(work, release);
    const pnpm = pnpmInvocation();
    invoke(pnpm.command, [...pnpm.prefix, 'run', 'deployment:bundle'], {
      env: {
        ...process.env,
        DEPLOY_SERVICES: 'runtime',
        DEPLOY_FRONTEND: '0',
        DEPLOY_RELEASE: release,
        DEPLOY_OUTPUT_DIR: bundle,
      },
    });
    const composeFile = path.join(bundle, 'compose.yaml');
    const cfg = JSON.parse(await readFile(composeFile, 'utf8'));
    assert.deepEqual(Object.keys(cfg.services).sort(), ['gateway', 'postgres', 'runtime']);
    assert(!cfg.services.runtime.ports && !cfg.services.postgres.ports);
    cfg.services.gateway.ports = ['127.0.0.1:' + port + ':80'];
    const browserOrigins = [
      'https://ma-h5-al.tapimg.com',
      'http://127.0.0.1:4318',
      'http://localhost:4318',
    ];
    cfg.services.runtime.environment.COMPETITION_ORIGINS = browserOrigins.join(',');
    await writeFile(composeFile, JSON.stringify(cfg, null, 2));
    const nginx = path.join(bundle, 'nginx.conf');
    const before = await readFile(nginx, 'utf8');
    const route = 'location /api/competition/v1/ {';
    // The existing generator retains its deny rules, stripped internal header, rate limiter, and health endpoints.
    assert.equal(
      before.split(route).length,
      2,
      'Unexpected generated gateway; refusing to expose it.',
    );
    await writeFile(
      nginx,
      before.replace(
        route,
        'location ~ ^/api/competition/v1/(?:me$|sessions/(?:guest|platform|refresh|upgrade|logout)$|games/night-overwatch(?:/|$)) {',
      ),
    );
    const manifestPath = path.join(bundle, 'manifest.json'),
      manifestSource = await readFile(manifestPath, 'utf8'),
      manifest = JSON.parse(manifestSource);
    const overrides = [];
    for (const file of manifest.files) {
      const hash = createHash('sha256')
        .update(await readFile(path.join(bundle, file.path)))
        .digest('hex');
      if (['compose.yaml', 'nginx.conf'].includes(file.path)) {
        overrides.push({ path: file.path, before: file.sha256, after: hash });
        file.sha256 = hash;
      } else assert.equal(hash, file.sha256, 'Bundle input changed: ' + file.path);
    }
    manifest.localSelftest = {
      version: 1,
      baseManifestSha256: createHash('sha256').update(manifestSource).digest('hex'),
      overrides,
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    const env = {
      ...process.env,
      ...privateEnv,
      APP_ORIGIN: 'https://ma-h5-al.tapimg.com',
      COMPETITION_PLATFORM_CONFIG: '[]',
    };
    const compose = (args, input) =>
      invoke(
        'docker',
        ['compose', '-p', project, '--env-file', envFile, '-f', composeFile, ...args],
        { env, input },
      );
    compose(['config', '--quiet']);
    compose(['build', 'runtime']);
    const identity = JSON.parse(
      await readFile(path.join(root, '.env.night-taptap-platform.local'), 'utf8'),
    );
    assert(
      identity.platform === 'taptap' &&
        identity.appId === appId &&
        typeof identity.secret === 'string' &&
        identity.secret.length >= 16,
      'Missing or mismatched private TapTap server credential.',
    );
    const postgres = project + '-postgres-1',
      runtime = project + '-runtime-1';
    const existing = invoke('docker', ['ps', '-a', '--format', '{{.Names}}'], {
      capture: true,
    }).split(/\r?\n/);
    let backup;
    if (existing.includes(postgres)) {
      if (existing.includes(runtime)) invoke('docker', ['stop', runtime], { capture: true });
      try {
        backup = await verifyNightBackup({ postgres, work, image: cfg.services.runtime.image });
      } catch (error) {
        if (existing.includes(runtime)) invoke('docker', ['start', runtime], { capture: true });
        throw error;
      }
    }
    compose(['up', '-d', '--wait', '--wait-timeout', '180', 'postgres']);
    const sql = [
      'bootstrap.sql',
      ...(await readdir(path.join(bundle, 'migrations')))
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => 'migrations/' + f),
    ];
    for (const file of sql)
      compose(
        [
          'exec',
          '-T',
          'postgres',
          'psql',
          '-qX',
          '-U',
          'platform_owner',
          '-d',
          'small_games',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        await readFile(path.join(bundle, file), 'utf8'),
      );
    const migrated = migrateNightWallets({
      postgres,
      image: cfg.services.runtime.image,
      password: privateEnv.POSTGRES_PASSWORD,
    });
    console.log('Local legacy migration: ' + JSON.stringify(migrated));
    env.COMPETITION_PLATFORM_CONFIG = JSON.stringify([
      { platform: 'taptap', appId, secret: identity.secret, games: [app] },
    ]);
    compose(['up', '-d', '--no-build', '--wait', '--wait-timeout', '180', 'runtime']);
    env.COMPETITION_PLATFORM_CONFIG = '[]';
    compose(['run', '--rm', '--no-deps', 'gateway', 'nginx', '-t']);
    compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'gateway']);
    await writeFile(path.join(work, 'h5.json'), JSON.stringify(h5, null, 2));
    await writeFile(
      path.join(work, 'current.json'),
      JSON.stringify(
        {
          release,
          bundle,
          composeFile,
          backup,
          image: cfg.services.runtime.image,
          migrated,
          apiUrl,
          port,
        },
        null,
        2,
      ),
    );
    const gateway = 'http://127.0.0.1:' + port;
    for (const base of [gateway, origin.origin]) {
      const get = (suffix, opts) =>
        fetch(base + suffix, { signal: AbortSignal.timeout(15000), ...opts });
      assert((await get('/health/runtime')).ok, 'Runtime health failed at ' + base);
      assert.equal(
        (await get('/api/competition/v1/games/night-overwatch')).status,
        401,
        'Expected authenticated game API at ' + base,
      );
      if (base === gateway) {
        const guest = await get('/api/competition/v1/sessions/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game: app }),
        });
        assert(guest.ok, 'Guest login failed at ' + base);
        const { token } = await guest.json();
        assert(
          (
            await get('/api/competition/v1/games/night-overwatch/assets', {
              headers: { Authorization: 'Bearer ' + token },
            })
          ).ok,
          'Authenticated assets unavailable at ' + base,
        );
      }
      assert.equal(
        (await get('/api/competition/v1/games/night-overwatch/assets')).status,
        401,
        'Expected authenticated assets at ' + base,
      );
      assert.equal(
        (await get('/api/competition/v1/games/other')).status,
        404,
        'Other game exposed at ' + base,
      );
      assert.equal(
        (await get('/api/competition/v1/internal')).status,
        404,
        'Internal API exposed at ' + base,
      );
      for (const browserOrigin of browserOrigins) {
        const preflight = await get('/api/competition/v1/games/night-overwatch/assets', {
          method: 'OPTIONS',
          headers: {
            Origin: browserOrigin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type',
          },
        });
        assert(
          preflight.ok && preflight.headers.get('access-control-allow-origin') === browserOrigin,
          'TapTap CORS preflight failed at ' + base,
        );
      }
      assert.equal(
        (
          await get('/api/competition/v1/games/night-overwatch/assets', {
            method: 'OPTIONS',
            headers: {
              Origin: 'https://unapproved.invalid',
              'Access-Control-Request-Method': 'POST',
            },
          })
        ).headers.get('access-control-allow-origin'),
        null,
      );
    }
    console.log('Verified local and public runtimes. H5 API: ' + apiUrl);
  }
}
