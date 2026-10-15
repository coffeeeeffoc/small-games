import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  companyConfig,
  fileHashes,
  remoteCheck,
  renderCompose,
  renderCaddy,
  toolEnvironment,
  writeBundle,
} from './deploy-company.mjs';

test('online Caddy backups restore privately, validate keys, rotate safely and reject unstable input', () => {
  const file = fileURLToPath(new URL('../infra/company/backup.test.py', import.meta.url));
  const windows = process.platform === 'win32';
  const result = spawnSync(
    windows ? 'wsl.exe' : 'python3',
    windows
      ? ['--exec', 'bash', '-c', 'exec python3 "$(wslpath -u "$1")"', 'caddy-backup-test', file]
      : [file],
    { encoding: 'utf8', timeout: 60000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 4 tests/);
});

test('remote deployment transaction restores prior releases and isolates first/config/port/checksum failures', () => {
  const file = fileURLToPath(new URL('../infra/company/deploy.test.sh', import.meta.url));
  const windows = process.platform === 'win32';
  const result = spawnSync(
    windows ? 'wsl.exe' : 'bash',
    windows
      ? ['--exec', 'bash', '-c', 'exec bash "$(wslpath -u "$1")"', 'company-deploy-test', file]
      : [file],
    { encoding: 'utf8', timeout: 60000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PASS activate and explicit rollback/);
});

test('company configuration needs no game/COS secrets and rejects command/path injection', () => {
  const config = companyConfig({
    ECS_HOST: '192.0.2.10',
    POSTGRES_PASSWORD: 'must-not-leak',
    COS_SECRET_KEY: 'must-not-leak',
  });
  assert.equal(config.icp, '沪ICP备2026053115号-1');
  assert.equal(config.domain, 'nenggongzhiren.cn');
  assert.equal(config.www, 'www.nenggongzhiren.cn');
  assert(!JSON.stringify(config).includes('must-not-leak'));
  for (const invalid of [
    { ECS_HOST: '-oProxyCommand=evil' },
    { ECS_USER: 'ubuntu;id' },
    { ECS_SSH_PORT: '0' },
    { COMPANY_DOMAIN: 'example.com;id' },
    { COMPANY_WWW_DOMAIN: 'nenggongzhiren.cn' },
    { COMPANY_DEPLOY_DIR: '/opt/../etc' },
    { COMPANY_DEPLOY_DIR: '/opt/company\nwhoami' },
    { COMPANY_ICP: '沪ICP备2026053115号' },
  ])
    assert.throws(() => companyConfig(invalid));
});

test('website subprocesses do not inherit deployment/application credentials', () => {
  assert.deepEqual(
    toolEnvironment({
      PATH: '/bin',
      SystemRoot: 'C:/Windows',
      npm_execpath: '/pnpm',
      OPENAI_API_KEY: 'secret',
      ECS_SSH_KEY: 'private',
      COS_SECRET_KEY: 'private',
      RUNTIME_DATABASE_URL: 'private',
      COMPANY_TLS_DIR: 'private',
      GH_TOKEN: 'private',
    }),
    { PATH: '/bin', SystemRoot: 'C:/Windows', npm_execpath: '/pnpm' },
  );
});

test('Caddy manages only company domains and persists certificates outside immutable releases', () => {
  const config = companyConfig();
  const compose = renderCompose(config);
  const caddy = renderCaddy(config);
  assert.match(compose, /name: company-web/);
  assert.match(compose, /ports: \['80:80', '443:443'\]/);
  assert.doesNotMatch(compose, /postgres|runtime:|kart:|COS_|8080|external:|docker.sock/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /image: caddy:2\.11\.7-alpine/);
  assert.match(compose, /caddy_data:\/data/);
  assert.match(compose, /caddy_config:\/config/);
  assert.match(compose, /\.\/caddy:\/etc\/caddy:ro/);
  assert.match(caddy, /^nenggongzhiren\.cn \{/);
  assert.match(
    caddy,
    /www\.nenggongzhiren\.cn \{\s+redir https:\/\/nenggongzhiren\.cn\{uri\} permanent/,
  );
  assert.match(caddy, /http:\/\/ \{\s+respond 404/);
  assert.match(caddy, /bind 127\.0\.0\.1/);
  assert.match(caddy, /hide \.\*/);
  assert.doesNotMatch(caddy, /reverse_proxy|browse|api\.|admin\.|tls internal|auto_https off/);
});

test('preflight checks DNS without requiring a manually installed certificate or changing services', () => {
  const script = remoteCheck(companyConfig({ ECS_HOST: '192.0.2.10' }));
  assert.match(script, /getent ahostsv4 '192.0.2.10'/);
  assert.match(script, /Caddy will obtain certificates after startup/);
  assert.doesNotMatch(script, /fullchain\.pem|privkey\.pem|openssl x509/);
  assert.doesNotMatch(script, /mkdir|docker (?:run|pull|stop)|compose (?:up|down)|\bsudo\b/);
});

test('release packages only validated public output and hashes every deployable file', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'company-package-'));
  try {
    const source = path.join(temporary, 'source');
    await mkdir(source);
    await writeFile(
      path.join(source, 'index.html'),
      '<a href="https://beian.miit.gov.cn/">沪ICP备2026053115号-1</a>',
    );
    await writeFile(path.join(source, 'app.js'), 'document.title="company";');
    await writeFile(path.join(temporary, '.env.tencent.local'), 'POSTGRES_PASSWORD=secret');
    const destination = path.join(temporary, 'release');
    const manifest = await writeBundle(
      destination,
      source,
      companyConfig(),
      'a'.repeat(40),
      'release-test',
    );
    assert.equal(manifest.sourceSha, 'a'.repeat(40));
    assert.deepEqual(Object.keys(manifest.files).sort(), ['app.js', 'index.html']);
    assert.deepEqual((await readdir(destination)).sort(), [
      'SHA256SUMS',
      'caddy',
      'compose.yaml',
      'deploy.sh',
      'site',
    ]);
    for (const line of (await readFile(path.join(destination, 'SHA256SUMS'), 'utf8'))
      .trim()
      .split('\n')) {
      const [expected, relative] = line.split('  ');
      assert.equal(
        createHash('sha256')
          .update(await readFile(path.join(destination, relative)))
          .digest('hex'),
        expected,
      );
    }
    assert.equal((await fileHashes(destination))['site/index.html'], manifest.files['index.html']);
    assert.doesNotMatch(await readFile(path.join(destination, 'deploy.sh'), 'utf8'), /\r/);
    await writeFile(path.join(source, '.env'), 'SECRET=bad');
    await assert.rejects(
      writeBundle(path.join(temporary, 'unsafe'), source, companyConfig(), 'a'.repeat(40), 'test'),
      /private\/debug/,
    );
    await rm(path.join(source, '.env'));
    await writeFile(path.join(source, 'index.html'), '<p>wrong filing</p>');
    await assert.rejects(
      writeBundle(
        path.join(temporary, 'wrong-icp'),
        source,
        companyConfig(),
        'a'.repeat(40),
        'test',
      ),
      /ICP footer/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
