import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import yaml from 'js-yaml';
import {
  deploymentConfig,
  renderNginx,
  renderCompose,
  tunnelArgs,
  prepareSite,
} from './deploy-tencent.mjs';

const sample = {
  DEPLOY_MODE: 'public',
  ECS_HOST: '192.0.2.1',
  ECS_USER: 'ubuntu',
  GAME_DOMAIN: 'games.example.com',
  COS_BUCKET: 'arcade-1250000000',
  COS_REGION: 'ap-shanghai',
  COS_SECRET_ID: 'test-id',
  COS_SECRET_KEY: 'test-secret',
  POSTGRES_PASSWORD: 'a'.repeat(64),
  RUNTIME_DB_PASSWORD: 'b'.repeat(64),
  COMPETITION_INTERNAL_KEY: 'c'.repeat(64),
};

test('deployment rejects missing secrets, command/config injection and traversal before remote actions', () => {
  const config = deploymentConfig(sample);
  assert.equal(config.COS_HOST, 'arcade-1250000000.cos.ap-shanghai.myqcloud.com');
  for (const [key, value] of [
    ['COS_SECRET_KEY', ''],
    ['POSTGRES_PASSWORD', 'password'],
    ['ECS_HOST', '-oProxyCommand=evil'],
    ['GAME_DOMAIN', 'example.com; return 200;'],
    ['COS_PREFIX', '../private'],
    ['ECS_DEPLOY_DIR', '/opt/../../etc'],
    ['ECS_TLS_DIR', '/tmp/$(id)'],
    ['ECS_SSH_PORT', '65536'],
    ['DEPLOY_MODE', 'invalid'],
  ])
    assert.throws(
      () => deploymentConfig({ ...sample, [key]: value }),
      (error) => error.message.includes(key),
    );
  assert.throws(() => renderNginx('', config, '../escape'));
});

test('internal deployment isolates ports, serves local files, and needs no COS/domain/TLS', async () => {
  const internal = { ...sample, DEPLOY_MODE: 'internal' };
  for (const key of Object.keys(internal))
    if (key.startsWith('COS_') || key === 'GAME_DOMAIN') delete internal[key];
  const config = deploymentConfig(internal);
  const template = await readFile(
    new URL('../infra/tencent/nginx.conf.template', import.meta.url),
    'utf8',
  );
  const nginx = renderNginx(template, config, 'release-test');
  assert.doesNotMatch(
    nginx,
    /ssl_certificate|listen 443|game_cos|myqcloud|include .*extra|return 308|\$\{/,
  );
  assert.match(nginx, /listen 80 default_server/);
  assert.match(nginx, /root \/srv\/site/);
  assert.match(nginx, /proxy_set_header Upgrade \$http_upgrade/);
  const composeTemplate = await readFile(
    new URL('../infra/tencent/compose.yaml', import.meta.url),
    'utf8',
  );
  const compose = yaml.load(renderCompose(composeTemplate, config));
  assert.deepEqual(
    Object.values(compose.services).flatMap((s) => s.ports ?? []),
    ['127.0.0.1:8080:80'],
  );
  assert.deepEqual(compose.services.nginx.volumes, [
    './nginx:/etc/nginx/conf.d:ro',
    './site:/srv/site:ro',
  ]);
  assert.equal(compose.services.runtime.environment.COMPETITION_ORIGINS, '${APP_ORIGIN:?required}');
  assert.equal(compose.services.kart.environment.KART_ALLOWED_ORIGINS, '${APP_ORIGIN:?required}');
  assert.equal(config.APP_ORIGIN, 'http://localhost:8080');
  assert.ok(tunnelArgs(config).includes('127.0.0.1:8080:127.0.0.1:8080'));
  assert.deepEqual(
    yaml.load(renderCompose(composeTemplate, deploymentConfig(sample))).services.nginx.ports,
    ['80:80', '443:443'],
  );
});

test('Nginx keeps runtime variables and public/internal route boundaries; only Nginx publishes ports', async () => {
  const template = await readFile(
    new URL('../infra/tencent/nginx.conf.template', import.meta.url),
    'utf8',
  );
  const rendered = renderNginx(template, deploymentConfig(sample), 'release-test');
  assert.ok(!rendered.includes('${'));
  assert.match(rendered, /\/releases\/release-test\/\$is_args\$args/);
  assert.match(rendered, /proxy_set_header X-Real-IP \$remote_addr/);
  assert.match(rendered, /location \^~ \/api\/competition\/v1\/internal\/ \{ return 404; \}/);
  assert.match(rendered, /proxy_ssl_verify on/);
  assert.match(rendered, /proxy_pass https:\/\/game_cos;/);
  assert.ok(!rendered.includes(sample.COS_SECRET_KEY));
  const compose = yaml.load(
    await readFile(new URL('../infra/tencent/compose.yaml', import.meta.url), 'utf8'),
  );
  assert.deepEqual(
    Object.entries(compose.services)
      .filter(([, service]) => service.ports)
      .map(([name]) => name),
    ['nginx'],
  );
  assert.ok(compose.services.postgres.volumes.includes('postgres-data:/var/lib/postgresql/data'));
  assert.ok(compose.services.kart.volumes.includes('kart-outbox:/app/outbox'));
  assert.equal(compose.services.kart.network_mode, 'service:runtime');
  assert.equal(
    compose.services.kart.environment.COMPETITION_API_URL,
    'http://127.0.0.1:43002/api/competition/v1',
  );
});

test('every HTML entry gets current same-origin endpoints without changing source or other assets', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tencent-site-'));
  try {
    const source = path.join(directory, 'source'),
      destination = path.join(directory, 'release');
    await mkdir(path.join(source, 'games/kart'), { recursive: true });
    const html =
      '<!doctype html><html><head lang="zh"><script src="./game.js"></script></head><body></body></html>';
    await writeFile(path.join(source, 'index.html'), html);
    await writeFile(path.join(source, 'games/kart/index.html'), html);
    await writeFile(path.join(source, 'game.js'), 'original bytes');
    assert.equal(await prepareSite(source, destination), 2);
    assert.equal(await readFile(path.join(source, 'index.html'), 'utf8'), html);
    assert.equal(await readFile(path.join(destination, 'game.js'), 'utf8'), 'original bytes');
    for (const file of ['index.html', 'games/kart/index.html']) {
      const output = await readFile(path.join(destination, file), 'utf8');
      assert.ok(output.indexOf('data-tencent-runtime') < output.indexOf('src="./game.js"'));
      const script = output.match(/<script data-tencent-runtime>(.*?)<\/script>/)[1];
      const context = {
        location: { origin: 'https://games.example.com', host: 'games.example.com' },
        __COMPETITION_CONFIG__: { apiUrl: 'https://old.invalid', game: 'kart' },
      };
      vm.runInNewContext(script, context);
      assert.equal(
        context.__COMPETITION_CONFIG__.apiUrl,
        'https://games.example.com/api/competition/v1',
      );
      assert.equal(context.__COMPETITION_CONFIG__.game, 'kart');
      assert.equal(context.__kartServerUrl, 'wss://games.example.com/kart');
      context.location = {
        origin: 'http://localhost:8080',
        host: 'localhost:8080',
        protocol: 'http:',
      };
      vm.runInNewContext(script, context);
      assert.equal(
        context.__COMPETITION_CONFIG__.apiUrl,
        'http://localhost:8080/api/competition/v1',
      );
      assert.equal(context.__kartServerUrl, 'ws://localhost:8080/kart');
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
