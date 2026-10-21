import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import {
  backendBuildCommands,
  buildEnvironment,
  bundleConfig,
  prepareBundleSite,
  prepareSelectedBackend,
  renderBundleCompose,
  renderBundleNginx,
} from './deployment-bundle.mjs';
import { validateDeploymentEnvironment } from '../infra/deployment/validate-env.mjs';

test('service selection is explicit, excludes unknown services and prevents unbacked kart settlement', () => {
  assert.deepEqual(bundleConfig({}).services, ['runtime', 'kart', 'tianxia']);
  assert.equal(bundleConfig({}).adMode, 'mock');
  assert.equal(bundleConfig({ DEPLOY_H5_AD_MODE: 'off' }).adMode, 'off');
  assert.throws(() => bundleConfig({ DEPLOY_H5_AD_MODE: 'host' }), /DEPLOY_H5_AD_MODE/);
  assert.throws(
    () => bundleConfig({ DEPLOY_H5_AD_MODE: '</script><script>attack()</script>' }),
    /DEPLOY_H5_AD_MODE/,
  );
  assert.throws(() => bundleConfig({ DEPLOY_SERVICES: 'kart' }), /requires runtime/);
  for (const input of [
    { DEPLOY_SERVICES: 'runtime,shell' },
    { DEPLOY_FRONTEND: 'false' },
    { DEPLOY_RELEASE: '../escape' },
    { DEPLOY_SERVICES: '', DEPLOY_FRONTEND: '0' },
  ])
    assert.throws(() => bundleConfig(input));
  assert.equal(bundleConfig({ DEPLOY_SERVICES: '' }).frontend, true);
  assert.deepEqual(backendBuildCommands(['kart', 'tianxia']), [
    ['--filter', '@coffeeeeffoc/kart-server', 'build'],
    ['--filter', '@coffeeeeffoc/tianxia-server', 'build'],
  ]);
  assert.ok(
    !backendBuildCommands(['runtime', 'kart'])
      .flat()
      .includes('--filter=@coffeeeeffoc/kart-server...'),
  );
});

test('build processes receive public configuration and toolchain settings without server credentials', () => {
  const environment = buildEnvironment({
    PATH: '/bin',
    HOME: '/home/test',
    HTTPS_PROXY: 'http://proxy:8080',
    NODE_EXTRA_CA_CERTS: '/ca.pem',
    VITE_PUBLIC_API_URL: 'https://games.example.com',
    KART_PREBUILT_DIR: '/approved-artifact',
    HOMEBOUND_STATION_PREBUILT_DIR: '/station-artifact',
    TAPTAP_HOMEBOUND_STATION_AD_UNIT_ID: 'station-ad',
    WECHAT_APP_ID: 'public-id',
    WECHAT_APP_SECRET: 'secret',
    PRIVATE_API_KEY: 'secret',
    VITE_APP_SECRET: 'secret',
    RUNTIME_DATABASE_URL: 'postgres://private',
    COMPETITION_PLATFORM_CONFIG: '[{"secret":"private"}]',
    COMPETITION_INTERNAL_KEY: 'private',
    S3_SECRET_ACCESS_KEY: 'private',
    STUDIO_ADMIN_PASSWORD: 'private',
    DEPLOY_SERVICES: 'runtime',
  });
  assert.deepEqual(
    Object.keys(environment).sort(),
    [
      'HOME',
      'HTTPS_PROXY',
      'KART_PREBUILT_DIR',
      'HOMEBOUND_STATION_PREBUILT_DIR',
      'TAPTAP_HOMEBOUND_STATION_AD_UNIT_ID',
      'NODE_EXTRA_CA_CERTS',
      'PATH',
      'VITE_PUBLIC_API_URL',
      'WECHAT_APP_ID',
    ].sort(),
  );
  assert.ok(!JSON.stringify(environment).includes('secret'));
});

test('compose isolates ports and identities, checks dependency readiness and persists game results', () => {
  const config = bundleConfig({ DEPLOY_SERVICES: 'runtime,management,kart,tianxia' });
  const compose = renderBundleCompose(config);
  assert.deepEqual(
    Object.values(compose.services)
      .flatMap((service) => service.ports ?? [])
      .sort(),
    ['127.0.0.1:43001:43001', '127.0.0.1:8080:80'],
  );
  assert.equal(compose.services.kart.network_mode, 'service:runtime');
  assert.equal(compose.services.runtime.depends_on.postgres.condition, 'service_healthy');
  assert.equal(compose.services.gateway.depends_on.kart.condition, 'service_healthy');
  assert.ok(compose.services.runtime.environment.RUNTIME_DATABASE_URL.includes('runtime_app:'));
  assert.equal(compose.services.runtime.environment.TRUST_PROXY, '0');
  assert.equal(compose.services.management.environment.TRUST_PROXY, '1');
  assert.equal(compose.services.kart.environment.TRUST_PROXY, '1');
  assert(!Object.hasOwn(compose.services.runtime.environment, 'RUNTIME_TRUSTED_PROXY_IP'));
  assert.ok(
    compose.services.management.environment.MANAGEMENT_DATABASE_URL.includes('management_app:'),
  );
  assert.deepEqual(compose.services.kart.volumes, ['kart-outbox:/app/outbox']);
  assert.deepEqual(compose.services.tianxia.volumes, ['tianxia-results:/app/results']);
  const nginx = renderBundleNginx(config);
  assert.match(nginx, /location \^~ \/api\/competition\/v1\/internal\/ \{ return 404; \}/);
  assert.match(nginx, /proxy_set_header X-Competition-Internal-Key ''/);
  assert.match(nginx, /proxy_pass http:\/\/tianxia:43004\//);
  const standalone = renderBundleCompose(
    bundleConfig({ DEPLOY_SERVICES: 'tianxia', DEPLOY_FRONTEND: '0' }),
  );
  assert.ok(!standalone.services.postgres && !standalone.services.runtime);
  assert.deepEqual(standalone.services.gateway.volumes, [
    './nginx.conf:/etc/nginx/conf.d/default.conf:ro',
  ]);
});

test('deployment rejects bad credentials/origins before starting containers without echoing values', () => {
  const valid = {
    POSTGRES_PASSWORD: 'a'.repeat(64),
    RUNTIME_DB_PASSWORD: 'b'.repeat(64),
    MANAGEMENT_DB_PASSWORD: 'c'.repeat(64),
    COMPETITION_INTERNAL_KEY: 'd'.repeat(64),
    APP_ORIGIN: 'https://games.example.com',
  };
  assert.doesNotThrow(() => validateDeploymentEnvironment(['runtime', 'kart'], valid));
  assert.doesNotThrow(() => validateDeploymentEnvironment(['tianxia'], {}));
  for (const invalid of [
    { RUNTIME_DB_PASSWORD: 'private-value' },
    { APP_ORIGIN: 'https://games.example.com/path' },
    { APP_ORIGIN: 'http://public.example.com' },
    { COMPETITION_PLATFORM_CONFIG: '{"secret":"private-value"' },
    {
      COMPETITION_PLATFORM_CONFIG:
        '[{"platform":"alipay","appId":"a","secret":"private-value-123"}]',
    },
  ]) {
    assert.throws(
      () => validateDeploymentEnvironment(['runtime'], { ...valid, ...invalid }),
      (error) => !error.message.includes('private-value') && /variables/.test(error.message),
    );
  }
});

test('frontend copy configures only selected endpoints and leaves original assets unchanged', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'deployment-site-'));
  try {
    const source = path.join(temporary, 'source');
    await mkdir(path.join(source, 'games/one'), { recursive: true });
    const html = '<!doctype html><html><head><title>Game</title></head><body></body></html>';
    await writeFile(path.join(source, 'index.html'), html);
    await writeFile(path.join(source, 'games/one/index.html'), html);
    await writeFile(path.join(source, 'bundle.js'), 'unchanged');
    const destination = path.join(temporary, 'site');
    assert.equal(await prepareBundleSite(source, destination, ['runtime']), 2);
    const output = await readFile(path.join(destination, 'index.html'), 'utf8');
    const context = { location: { origin: 'https://games.example.com' } };
    vm.runInNewContext(output.match(/<script data-deployment-runtime>(.*?)<\/script>/)[1], context);
    assert.equal(
      context.__COMPETITION_CONFIG__.apiUrl,
      'https://games.example.com/api/competition/v1',
    );
    assert.equal(context.__kartServerUrl, undefined);
    assert.equal(context.SmallGamesPublishingConfig.adMode, 'mock');
    const disabled = path.join(temporary, 'off');
    await prepareBundleSite(source, disabled, [], 'off');
    const disabledHtml = await readFile(path.join(disabled, 'index.html'), 'utf8');
    const disabledContext = {};
    vm.runInNewContext(
      disabledHtml.match(/<script data-deployment-runtime>(.*?)<\/script>/)[1],
      disabledContext,
    );
    assert.equal(disabledContext.SmallGamesPublishingConfig.adMode, 'off');
    assert.equal(disabledContext.__COMPETITION_CONFIG__, undefined);
    assert.equal(await readFile(path.join(source, 'index.html'), 'utf8'), html);
    assert.equal(await readFile(path.join(destination, 'bundle.js'), 'utf8'), 'unchanged');
    // Windows junctions exercise the same refusal without symlink privileges.
    await symlink(
      path.join(source, process.platform === 'win32' ? 'games/one' : 'index.html'),
      path.join(source, 'unsafe-link'),
      process.platform === 'win32' ? 'junction' : 'file',
    );
    await assert.rejects(prepareBundleSite(source, path.join(temporary, 'unsafe'), []), /symlinks/);
    await assert.rejects(stat(path.join(temporary, 'unsafe/unsafe-link')), { code: 'ENOENT' });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('backend packaging copies selected runtime code and frozen manifests, never local env or unrelated services', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'deployment-backend-'));
  const put = async (filename, contents) => {
    await mkdir(path.dirname(path.join(temporary, 'source', filename)), { recursive: true });
    await writeFile(path.join(temporary, 'source', filename), contents);
  };
  try {
    await put('package.json', '{}');
    await put('pnpm-lock.yaml', 'lockfileVersion: 9.0');
    await put('pnpm-workspace.yaml', 'packages: []');
    await put('.env', 'SUPER_SECRET=never-copy');
    await put(
      'services/tianxia-server/package.json',
      JSON.stringify({
        name: '@coffeeeeffoc/tianxia-server',
        dependencies: {
          '@coffeeeeffoc/tianxia-chalu': 'workspace:*',
          '@coffeeeeffoc/source-library': 'workspace:*',
        },
      }),
    );
    await put(
      'packages/source-library/package.json',
      JSON.stringify({ name: '@coffeeeeffoc/source-library', exports: { '.': './src/index.ts' } }),
    );
    await put('packages/source-library/src/index.ts', 'export const sourceOnly = true;');
    await put('services/tianxia-server/src/main.mjs', 'export const entry = true;');
    await put(
      'games/local/tianxia-chalu/package.json',
      JSON.stringify({ name: '@coffeeeeffoc/tianxia-chalu' }),
    );
    await put('games/local/tianxia-chalu/src/core/index.mjs', 'export const engine = true;');
    await put('games/local/tianxia-chalu/src/content/levels.mjs', 'export default [];');
    await put(
      'services/management-api/package.json',
      JSON.stringify({ name: '@coffeeeeffoc/management-api' }),
    );
    await put('services/management-api/dist/main.js', 'do not copy');
    const output = path.join(temporary, 'bundle');
    await prepareSelectedBackend(output, ['tianxia'], path.join(temporary, 'source'));
    assert.equal(
      await readFile(path.join(output, 'services/tianxia-server/src/main.mjs'), 'utf8'),
      'export const entry = true;',
    );
    await stat(path.join(output, 'services/management-api/package.json'));
    await stat(path.join(output, 'packages/source-library/src/index.ts'));
    await assert.rejects(stat(path.join(output, '.env')), { code: 'ENOENT' });
    await assert.rejects(stat(path.join(output, 'services/management-api/dist')), {
      code: 'ENOENT',
    });
    await rm(path.join(temporary, 'source/services/tianxia-server/src/main.mjs'));
    await assert.rejects(
      prepareSelectedBackend(
        path.join(temporary, 'incomplete'),
        ['tianxia'],
        path.join(temporary, 'source'),
      ),
      { code: 'ENOENT' },
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('runtime bundle includes multiplayer carrom physics and level data without shipping the game UI', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'deployment-carrom-'));
  const workspace = path.join(temporary, 'workspace');
  const put = async (filename, contents = 'export const included = true;') => {
    await mkdir(path.dirname(path.join(workspace, filename)), { recursive: true });
    await writeFile(path.join(workspace, filename), contents);
  };
  try {
    await put('package.json', '{}');
    await put('pnpm-lock.yaml', 'lockfileVersion: 9.0');
    await put('pnpm-workspace.yaml', 'packages: []');
    await put(
      'services/runtime-api/package.json',
      JSON.stringify({ name: '@coffeeeeffoc/runtime-api' }),
    );
    for (const filename of [
      'services/runtime-api/dist/main.js',
      'services/runtime-api/rules/carrom.mjs',
      'games/local/three-choose-two/src/index.js',
      'games/local/cage-rescue/src/core.mjs',
      'games/local/cage-rescue/src/levels.mjs',
      'games/local/tower-brake/engine.mjs',
      'games/local/tower-brake/levels.mjs',
      'games/local/carrom-club/src/core.mjs',
      'games/local/carrom-club/src/content.mjs',
      'games/local/carrom-club/src/friends-core.mjs',
      'games/local/carrom-club/src/friends-content.mjs',
      'games/local/flick-arena/src/core.mjs',
      'games/local/cops-robbers/src/engine.js',
      'games/local/cops-robbers-realtime/src/engine.js',
      'games/local/letters-words2/engine.js',
      'games/local/vibeJam-myself-history-guess/src/index.js',
      'games/local/vibeJam-myself-history-guess/public/data.json',
      'games/submodules/xiangqi-five/game.js',
      'games/local/carrom-club/src/main.mjs',
    ])
      await put(filename);
    const destination = path.join(temporary, 'bundle');
    await prepareSelectedBackend(destination, ['runtime'], workspace);
    for (const filename of ['core.mjs', 'content.mjs', 'friends-core.mjs', 'friends-content.mjs'])
      await stat(path.join(destination, 'games/local/carrom-club/src', filename));
    await assert.rejects(stat(path.join(destination, 'games/local/carrom-club/src/main.mjs')), {
      code: 'ENOENT',
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('runtime-only bundles can load the actual Flick multiplayer rule and its core', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'flick-runtime-bundle-'));
  const source = path.join(temporary, 'source');
  const put = async (name, value = '') => {
    const target = path.join(source, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, value);
  };
  try {
    await put('package.json', '{"private":true,"type":"module"}');
    await put('pnpm-lock.yaml');
    await put('pnpm-workspace.yaml');
    await put('services/runtime-api/package.json', '{"name":"@coffeeeeffoc/runtime-api"}');
    await put('services/runtime-api/dist/main.js', 'export {};');
    for (const name of [
      'games/local/three-choose-two/src/index.js',
      'games/local/cage-rescue/src/core.mjs',
      'games/local/cage-rescue/src/levels.mjs',
      'games/local/tower-brake/engine.mjs',
      'games/local/tower-brake/levels.mjs',
      'games/local/carrom-club/src/core.mjs',
      'games/local/carrom-club/src/content.mjs',
      'games/local/carrom-club/src/friends-core.mjs',
      'games/local/carrom-club/src/friends-content.mjs',
      'games/local/cops-robbers/src/index.js',
      'games/local/cops-robbers-realtime/src/index.js',
      'games/local/letters-words2/engine.js',
      'games/local/vibeJam-myself-history-guess/src/index.js',
      'games/local/vibeJam-myself-history-guess/public/index.html',
      'games/submodules/xiangqi-five/game.js',
    ])
      await put(name);
    for (const name of [
      'services/runtime-api/rules/flick.mjs',
      'games/local/flick-arena/src',
      'services/runtime-api/rules/ranked-games.mjs',
      'games/local/cage-rescue/src/core.mjs',
      'games/local/cage-rescue/src/levels.mjs',
      'games/local/tower-brake/engine.mjs',
      'games/local/tower-brake/levels.mjs',
    ]) {
      const target = path.join(source, name);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(new URL('../' + name, import.meta.url), target, { recursive: true });
    }
    const output = path.join(temporary, 'bundle');
    await prepareSelectedBackend(output, ['runtime'], source);
    const { default: rule } = await import(
      pathToFileURL(path.join(output, 'services/runtime-api/rules/flick.mjs')).href
    );
    assert.equal(rule.id, 'flick-arena');
    assert.equal(rule.roomSize('party4'), 4);
    const { rankedRules } = await import(
      pathToFileURL(path.join(output, 'services/runtime-api/rules/ranked-games.mjs')).href
    );
    assert.deepEqual(
      rankedRules.map((item) => item.id),
      ['cage-rescue', 'tower-brake'],
    );
    for (const item of rankedRules) assert.equal(item.create('endless', 7).game.mode, 'endless');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
