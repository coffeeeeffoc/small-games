import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { backendInput, backendDockerfile, backendReceipt } from './deploy-backend.mjs';
import { remoteDiagnostic } from './deployment-progress.mjs';

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
  };
  assert.deepEqual(backendReceipt(JSON.stringify(receipt), ['runtime']), receipt);
  for (const changes of [
    { oauth: 'CANARY' },
    { services: ['kart'] },
    { isolatedRestoreVerified: true },
    { databaseReplaced: true },
    { schemaChanged: true },
    { activeImages: { runtime: 'tag:mutable', kart: receipt.activeImages.kart } },
    { recreateCompanions: ['management'] },
    { backupSHA256: null },
  ])
    assert.throws(() => backendReceipt(JSON.stringify({ ...receipt, ...changes }), ['runtime']));
});
test('backend failure and rollback contracts use isolated mocks only', () => {
  const file = fileURLToPath(new URL('../infra/backend-update/deploy.test.py', import.meta.url)),
    windows = process.platform === 'win32';
  const result = spawnSync(
    windows ? 'wsl.exe' : 'python3',
    windows
      ? ['--exec', 'bash', '-c', 'exec python3 "$(wslpath -u "$1")"', 'backend-contract', file]
      : [file],
    { encoding: 'utf8', timeout: 60000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
