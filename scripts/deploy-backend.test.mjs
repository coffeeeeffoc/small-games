import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backendInput,
  backendDockerfile,
  backendReceipt,
  backendRunnerInput,
  platformConfiguration,
  readPlatformConfiguration,
  writeBackendBundle,
} from './deploy-backend.mjs';
import { remoteDiagnostic, deploymentCommand } from './deployment-progress.mjs';

test('backend progress accepts only finite stages and redacts unknown remote errors', () => {
  assert.deepEqual(remoteDiagnostic('BACKEND_REMOTE_STAGE context_guard'), {
    stage: 'context_guard',
  });
  assert.deepEqual(remoteDiagnostic('BACKEND_REMOTE_STOPPED KART_NAMESPACE'), {
    failure: 'KART_NAMESPACE',
  });
  assert.equal(remoteDiagnostic('BACKEND_REMOTE_STAGE PRIVATE_CANARY'), null);
  assert.equal(remoteDiagnostic('BACKEND_REMOTE_STOPPED password=PRIVATE_CANARY'), null);
  assert.deepEqual(remoteDiagnostic('BACKEND_REMOTE_STOPPED SECRET_CANARY'), {
    failure: 'REMOTE_GUARD_FAILED',
  });
  assert.deepEqual(remoteDiagnostic('BACKEND_REMOTE_OWNED_PROBE ' + 'a'.repeat(64)), {
    ownedContainerId: 'a'.repeat(64),
  });
  const uuid = '12345678-1234-4234-8234-123456789abc';
  assert.deepEqual(remoteDiagnostic('BACKEND_REMOTE_PROBE_UUID ' + uuid), { probeUUID: uuid });
  assert.deepEqual(remoteDiagnostic('BACKEND_REMOTE_PROBE_PID 2147483647'), {
    probeProcessId: 2147483647,
  });
  for (const text of [
    'BACKEND_REMOTE_OWNED_PROBE ' + 'a'.repeat(63),
    'BACKEND_REMOTE_OWNED_PROBE ' + 'a'.repeat(65),
    'BACKEND_REMOTE_OWNED_PROBE ' + 'G'.repeat(64),
    'BACKEND_REMOTE_PROBE_UUID secret=CANARY',
    'UNKNOWN_REMOTE_OWNED_PROBE ' + 'a'.repeat(64),
    'BACKEND_REMOTE_PROBE_PID 0',
    'BACKEND_REMOTE_PROBE_PID -1',
    'BACKEND_REMOTE_PROBE_PID 01',
    'BACKEND_REMOTE_PROBE_PID 2147483648',
    'BACKEND_REMOTE_PROBE_PID 12345678901',
    'BACKEND_REMOTE_PROBE_PID PRIVATE_CANARY',
    'UNKNOWN_REMOTE_PROBE_PID 1234',
  ])
    assert.equal(remoteDiagnostic(text), null);
});

test('backend selection is explicit and excludes admin, empty entries and unrelated targets', () => {
  assert.deepEqual(backendInput(['--services=runtime', '--prepare']), {
    mode: 'prepare',
    services: ['runtime'],
    release: undefined,
  });
  assert.deepEqual(backendInput(['--services=kart,tianxia', '--check']).services, [
    'kart',
    'tianxia',
  ]);
  for (const args of [
    [],
    ['--services=all'],
    ['--services=management'],
    ['--services=runtime,'],
    ['--services=runtime,runtime'],
    ['--services=runtime', '--check', '--prepare'],
  ])
    assert.throws(() => backendInput(args));
  assert.equal(backendInput(['--help']).mode, 'help');
});
test('private platform credentials are a bounded file input for Runtime execution only', async (t) => {
  const config = {
    platform: 'taptap',
    appId: 'app-fixture',
    secret: 'PRIVATE_CANARY_${DOLLAR}',
    games: ['night-overwatch'],
  };
  const text = JSON.stringify(config);
  assert.deepEqual(platformConfiguration(text), config);
  const input = backendInput(['--services=runtime', '--platform-config-file=private.json']);
  assert.equal(input.platformConfigFile, 'private.json');
  for (const file of ['', '  '])
    assert.throws(() => backendInput(['--services=runtime', '--platform-config-file=' + file]));
  assert.deepEqual(
    platformConfiguration(JSON.stringify({ ...config, games: ['vibeJam-myself-history-guess'] }))
      .games,
    ['vibeJam-myself-history-guess'],
  );
  for (const args of [
    ['--services=kart'],
    ['--services=runtime', '--prepare'],
    ['--services=runtime', '--check'],
    ['--services=runtime', '--rollback=old'],
  ])
    assert.throws(() => backendInput([...args, '--platform-config-file=private.json']));
  for (const value of [
    null,
    [],
    { ...config, extra: 'PRIVATE_CANARY' },
    { ...config, games: [] },
    { ...config, games: ['night-overwatch', 'night-overwatch'] },
    { ...config, secret: 'short' },
    { ...config, platform: 'unknown' },
    { ...config, secret: 'PRIVATE_CANARY\nUNSAFE' },
  ]) {
    assert.throws(() => platformConfiguration(JSON.stringify(value)), /^Error: PLATFORM_CONFIG$/);
  }
  assert.throws(() => platformConfiguration('PRIVATE_CANARY'), /^Error: PLATFORM_CONFIG$/);
  const folder = await mkdtemp(path.join(tmpdir(), 'platform-config-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'private.json');
  await writeFile(file, text, { mode: 0o600 });
  assert.deepEqual(await readPlatformConfiguration(file), config);
  const workspace = path.join(folder, 'workspace');
  const dist = path.join(workspace, 'services/runtime-api/dist');
  await mkdir(dist, { recursive: true });
  const unsafe = path.join(dist, 'private.json');
  await writeFile(unsafe, text);
  await assert.rejects(readPlatformConfiguration(unsafe, workspace), /^Error: PLATFORM_CONFIG$/);
  const rootPrivate = path.join(workspace, '.env.platform.local');
  await writeFile(rootPrivate, text, { mode: 0o600 });
  assert.deepEqual(await readPlatformConfiguration(rootPrivate, workspace), config);
  await writeFile(file, 'x'.repeat(8193));
  await assert.rejects(readPlatformConfiguration(file), /^Error: PLATFORM_CONFIG$/);
  await assert.rejects(readPlatformConfiguration(folder), /^Error: PLATFORM_CONFIG$/);
  const source = await readFile(new URL('./deploy-backend.mjs', import.meta.url), 'utf8');
  const bundle = source.slice(
    source.indexOf('export async function writeBackendBundle'),
    source.indexOf('const git ='),
  );
  assert(!bundle.includes('platformConfig'));
  assert(source.includes('...(platformConfig ? { platformConfig } : {})'));
});

test('selected backend image is readable by node and has a runnable default without installing other services', () => {
  const runtime = backendDockerfile(['runtime']);
  assert(runtime.includes('COPY --chown=node:node'));
  assert(runtime.includes('CMD ["node","services/runtime-api/dist/main.js"]'));
  assert(runtime.includes('--filter @coffeeeeffoc/runtime-api...'));
  assert(!/management-api|kart-server|bootstrap|COPY \.env/.test(runtime));
  assert(backendDockerfile(['kart']).includes('CMD ["node","services/kart-server/src/main.ts"]'));
  assert(
    backendDockerfile(['tianxia']).includes('CMD ["node","services/tianxia-server/src/main.mjs"]'),
  );
});

test('selected backend bundle seals the reviewed shared helper alongside the runner', async (t) => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'backend-authority-bundle-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const workspace = path.join(temporary, 'source');
  const put = async (file, value) => {
    const target = path.join(workspace, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, value);
  };
  for (const [file, value] of Object.entries({
    'package.json': '{}',
    'pnpm-lock.yaml': 'lockfileVersion: 9.0',
    'pnpm-workspace.yaml': 'packages: []',
    'services/kart-server/package.json': JSON.stringify({ name: '@coffeeeeffoc/kart-server' }),
    'services/kart-server/src/main.ts': 'export const fixture = true;',
    'games/local/carding-car/assets/scripts/fixture.ts': 'export const fixture = true;',
    'infra/backend-update/deploy.py': 'reviewed-runner\n',
    'infra/deployment/image-authority.py': 'reviewed-authority\n',
  }))
    await put(file, value);
  const output = path.join(temporary, 'bundle');
  const manifest = await writeBackendBundle(
    output,
    {
      head: 'a'.repeat(40),
      release: 'candidate',
      services: ['kart'],
    },
    workspace,
  );
  for (const [file, expected] of [
    ['deploy.py', 'reviewed-runner\n'],
    ['image-authority.py', 'reviewed-authority\n'],
  ]) {
    assert.equal(await readFile(path.join(output, file), 'utf8'), expected);
    assert.equal(manifest.files[file], createHash('sha256').update(expected).digest('hex'));
  }
  assert.deepEqual(manifest.services, ['kart']);
  assert.equal(manifest.databaseMigrations, false);
  assert.equal(manifest.qualityChecks, 'not-run');
});
test('backend receipt accepts only finite source and image evidence, without fake isolated restore', () => {
  const receipt = {
    ok: true,
    mode: 'execute',
    sourceSHA: 'a'.repeat(40),
    release: 'candidate',
    services: ['runtime'],
    recreateCompanions: ['kart'],
    healthVerified: true,
    databaseReplaced: false,
    schemaChanged: false,
    backupCreated: true,
    backupSHA256: 'b'.repeat(64),
    isolatedRestoreVerified: false,
    activeImages: { runtime: 'sha256:' + 'c'.repeat(64), kart: 'sha256:' + 'd'.repeat(64) },
    imageCapabilities: {
      runtime: {
        image: 'sha256:' + 'c'.repeat(64),
        control: 1,
        authenticatedGameScope: 1,
        controlCatalog: 4,
      },
      kart: {
        image: 'sha256:' + 'd'.repeat(64),
        control: 1,
        identityRecheck: 1,
        authenticatedGameScope: 1,
      },
    },
  };
  assert.deepEqual(backendReceipt(JSON.stringify(receipt), ['runtime']), receipt);
  for (const controlCatalog of [undefined, 3, 5, true, '4']) {
    const changed = structuredClone(receipt);
    changed.imageCapabilities.runtime.controlCatalog = controlCatalog;
    assert.throws(() => backendReceipt(JSON.stringify(changed), ['runtime']));
  }
  for (const changes of [
    { oauth: 'CANARY' },
    { services: ['kart'] },
    { isolatedRestoreVerified: true },
    { databaseReplaced: true },
    { schemaChanged: true },
    { activeImages: { runtime: 'tag:mutable', kart: receipt.activeImages.kart } },
    { recreateCompanions: ['management'] },
    { backupSHA256: null },
    { imageCapabilities: {} },
    { imageCapabilities: { ...receipt.imageCapabilities, management: { control: 1 } } },
    {
      imageCapabilities: {
        ...receipt.imageCapabilities,
        runtime: { ...receipt.imageCapabilities.runtime, authenticatedGameScope: true },
      },
    },
    {
      imageCapabilities: {
        ...receipt.imageCapabilities,
        runtime: { ...receipt.imageCapabilities.runtime, authenticatedGameScope: 0 },
      },
    },
    {
      imageCapabilities: {
        ...receipt.imageCapabilities,
        runtime: { ...receipt.imageCapabilities.runtime, image: receipt.activeImages.kart },
      },
    },
  ])
    assert.throws(() => backendReceipt(JSON.stringify({ ...receipt, ...changes }), ['runtime']));
});
test('backend failure and rollback contracts use isolated mocks only', () => {
  const windows = process.platform === 'win32';
  for (const name of [
    '../infra/backend-update/deploy.test.py',
    '../infra/deployment/image-authority.test.py',
  ]) {
    const file = fileURLToPath(new URL(name, import.meta.url));
    const posix = windows && name.includes('backend-update');
    const result = spawnSync(
      posix ? 'wsl.exe' : windows ? 'python' : 'python3',
      posix
        ? ['--exec', 'bash', '-c', 'exec python3 -B "$(wslpath -u "$1")"', 'backend-contract', file]
        : ['-B', file],
      { encoding: 'utf8', timeout: 60000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
});

test('current runner carries reviewed helper and passes historical release only as data', () => {
  const source =
    "def entry(args,payload):\n assert args==['--rollback']\n assert payload['release']=='historical'\n assert IMAGE_AUTHORITY.marker=='current'\n print('CURRENT_RUNNER_OK')\n";
  const script = backendRunnerInput(source, "marker='current'\n", '--rollback', {
    release: 'historical',
    services: ['runtime'],
    caddyDirectory: '/opt/small-games/caddy',
  });
  assert(!script.includes('releases/historical/deploy.py'));
  const windows = process.platform === 'win32';
  const result = spawnSync(
    windows ? 'wsl.exe' : 'python3',
    windows ? ['--exec', 'python3', '-'] : ['-'],
    { input: script, encoding: 'utf8', timeout: 30000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'CURRENT_RUNNER_OK');
  assert.throws(() => backendRunnerInput(source, '', '--unknown', {}));
  assert.throws(() =>
    backendRunnerInput(source, '', '--rollback', { oversized: 'x'.repeat(8193) }),
  );
});

test('safe ownership diagnostics survive failure without forwarding arbitrary stderr', async () => {
  const lines = [];
  const id = 'a'.repeat(64),
    uuid = '12345678-1234-4234-8234-123456789abc';
  const stderr = `BACKEND_REMOTE_OWNED_PROBE ${id}\nBACKEND_REMOTE_PROBE_UUID ${uuid}\nBACKEND_REMOTE_PROBE_PID 1234\nBACKEND_REMOTE_PROBE_PID PRIVATE_CANARY\nPRIVATE_CANARY\nBACKEND_REMOTE_STOPPED AUTHORITY_PROBE_CLEANUP_FAILED\n`;
  await assert.rejects(
    deploymentCommand(
      process.execPath,
      ['-e', `process.stderr.write(${JSON.stringify(stderr)});process.exitCode=1`],
      { prefix: 'BACKEND', remote: true, output: (line) => lines.push(line), timeout: 10000 },
    ),
    (error) => {
      assert.equal(error.ownedContainerId, id);
      assert.equal(error.probeUUID, uuid);
      assert.equal(error.probeProcessId, 1234);
      assert.equal(error.remoteFailure, 'AUTHORITY_PROBE_CLEANUP_FAILED');
      return true;
    },
  );
  assert(!lines.join('\n').includes('PRIVATE_CANARY'));
});
