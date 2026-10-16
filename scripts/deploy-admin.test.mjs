import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_BASE,
  ADMIN_ORIGIN,
  ADMIN_CALLBACK,
  ADMIN_EMAIL,
  childEnvironment,
  parseAdminFile,
  executionInput,
  sshArguments,
  candidateProof,
  remoteReceipt,
  writeAdminBundle,
} from './deploy-admin.mjs';

test('raw user configuration preserves punctuation and accepts CRLF while fixed policy fails closed', () => {
  const secret = '$HOME-${X}-"quoted"-\'single\'-#hash-\\slash';
  assert.deepEqual(
    parseAdminFile(`ADMIN_GITHUB_CLIENT_ID=canary-id\r\nADMIN_GITHUB_CLIENT_SECRET=${secret}\r\n`),
    { clientId: 'canary-id', clientSecret: secret },
  );
  for (const text of [
    '',
    'ADMIN_GITHUB_CLIENT_ID=x',
    'ADMIN_GITHUB_CLIENT_ID=x\nADMIN_GITHUB_CLIENT_SECRET=a\nADMIN_GITHUB_CLIENT_SECRET=b',
    'ADMIN_GITHUB_CLIENT_ID="x"\nADMIN_GITHUB_CLIENT_SECRET=y',
    'ADMIN_GITHUB_CLIENT_ID=x\nADMIN_GITHUB_CLIENT_SECRET=a\rb',
    'ADMIN_GITHUB_CLIENT_ID=x\nADMIN_GITHUB_CLIENT_SECRET="a\nb"',
    'UNKNOWN=x',
    `ADMIN_GITHUB_CLIENT_ID=x\nADMIN_GITHUB_CLIENT_SECRET=y\nADMIN_ORIGIN=https://evil.example`,
  ])
    assert.throws(() => parseAdminFile(text));
  assert.deepEqual(
    parseAdminFile(
      `ADMIN_GITHUB_CLIENT_ID=x\nADMIN_GITHUB_CLIENT_SECRET=y\nADMIN_ORIGIN=${ADMIN_ORIGIN}\nADMIN_GITHUB_CALLBACK=${ADMIN_CALLBACK}\nADMIN_ALLOWED_EMAILS=${ADMIN_EMAIL}\nMANAGEMENT_CAPABILITIES=admin\n`,
    ),
    { clientId: 'x', clientSecret: 'y' },
  );
});

test('provision-only, rollback and help never read the local OAuth file', async () => {
  const forbidden = () => {
    throw new Error('MUST_NOT_READ');
  };
  for (const mode of ['--provision-only', '--rollback', '--help'])
    assert.deepEqual(await executionInput([mode], forbidden), { mode });
  await assert.rejects(executionInput([], forbidden), /ADMIN_FILE/);
  await assert.rejects(executionInput(['--unknown'], forbidden), /ARGUMENTS/);
  await assert.rejects(
    executionInput([], async () => ''),
    /OAUTH_REQUIRED/,
  );
});

test('every nested build/validation child is isolated before credentials can be inherited', () => {
  const source = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    SAFE_CANARY: 'public',
  };
  for (const key of [
    'ADMIN_GITHUB_CLIENT_ID',
    'ADMIN_GITHUB_CLIENT_SECRET',
    'MANAGEMENT_CAPABILITIES',
    'MANAGEMENT_DATABASE_URL',
    'GH_TOKEN',
    'ECS_SSH_KEY',
  ])
    Object.defineProperty(source, key, {
      enumerable: true,
      get() {
        throw new Error('SECRET_ACCESSED');
      },
    });
  const env = childEnvironment(source);
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['-e','console.log(JSON.stringify(Object.keys(process.env).filter(k=>/^(ADMIN_|MANAGEMENT_)/i.test(k))))'],{encoding:'utf8'});process.stdout.write(r.stdout);process.exit(r.status);`,
    ],
    { env, encoding: 'utf8', shell: false },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

test('SSH uses exact host checking, no secrets in argv and rejects missing host', () => {
  const args = sshArguments(
    { host: '192.0.2.10', user: 'ubuntu', port: '22', key: '/private/key' },
    "python3 '/public/deploy.py' --execute",
  );
  assert(args.includes('StrictHostKeyChecking=yes') && args.includes('BatchMode=yes'));
  assert(!args.join(' ').includes('CLIENT_SECRET'));
  assert.throws(() => sshArguments({ host: '' }, ''), /SSH_FAILED/);
});

test('candidate proof covers fixed pre-admin base and exact checked head, never hand-filled environment', () => {
  const head = 'a'.repeat(40);
  const proof = { base: ADMIN_BASE, head, count: 1 };
  assert.deepEqual(
    candidateProof(`other logs\nADMIN_CANDIDATE_PROOF ${JSON.stringify(proof)}\n`, head),
    proof,
  );
  for (const value of [
    { ...proof, base: 'b'.repeat(40) },
    { ...proof, head: 'c'.repeat(40) },
    { ...proof, count: 0 },
  ])
    assert.throws(() => candidateProof(`ADMIN_CANDIDATE_PROOF ${JSON.stringify(value)}`, head));
  assert.throws(() =>
    candidateProof(
      `ADMIN_CANDIDATE_PROOF ${JSON.stringify(proof)}\nADMIN_CANDIDATE_PROOF ${JSON.stringify(proof)}`,
      head,
    ),
  );
});

test('remote completion requires exact mode, booleans, source and private-proof hashes', () => {
  const base = {
    ok: true,
    provisioned: true,
    activated: false,
    sourceSHA: 'a'.repeat(40),
    oldDataUnchanged: true,
    isolatedRestoreVerified: true,
    leastPrivilegeVerified: true,
    backupRetained: true,
    realGithubLoginVerified: false,
    backupSHA256: 'b'.repeat(64),
    oldStateSHA256: 'c'.repeat(64),
  };
  assert.deepEqual(remoteReceipt(JSON.stringify(base), '--provision-only'), base);
  assert.throws(() => remoteReceipt(JSON.stringify(base), '--execute'));
  for (const key of Object.keys(base)) {
    const missing = { ...base };
    delete missing[key];
    assert.throws(() => remoteReceipt(JSON.stringify(missing), '--provision-only'));
    assert.throws(() =>
      remoteReceipt(
        JSON.stringify({
          ...base,
          [key]: typeof base[key] === 'boolean' ? String(base[key]) : 'bad',
        }),
        '--provision-only',
      ),
    );
  }
  assert.throws(() =>
    remoteReceipt(JSON.stringify({ ...base, oauth: 'must-not-echo' }), '--provision-only'),
  );
  for (const key of ['sourceSHA', 'backupSHA256', 'oldStateSHA256'])
    for (const bad of [[base[key]], { value: base[key] }])
      assert.throws(() =>
        remoteReceipt(JSON.stringify({ ...base, [key]: bad }), '--provision-only'),
      );
  const { provisioned, activated, ...rollback } = base;
  assert.deepEqual(remoteReceipt(JSON.stringify({ ...rollback, rolledBack: true }), '--rollback'), {
    ...rollback,
    rolledBack: true,
  });
});

test('provision bundle contains only hashed public helpers, never local OAuth or generic bootstrap', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'admin-public-bundle-'));
  try {
    const fixture = path.join(temporary, 'source');
    await mkdir(path.join(fixture, 'infra/admin-console/migrations'), { recursive: true });
    for (const name of ['deploy.py', 'fingerprint.sql', 'migrations/001-admin-auth.sql'])
      await writeFile(path.join(fixture, 'infra/admin-console', name), 'public fixture');
    await writeFile(path.join(fixture, '.env.admin.local'), 'PRIVATE_CANARY=must-not-copy');
    const target = path.join(temporary, 'release');
    const head = 'a'.repeat(40);
    await writeAdminBundle(
      target,
      {
        head,
        release: 'fixture',
        proof: { base: ADMIN_BASE, head, count: 1 },
        provisionOnly: true,
      },
      fixture,
    );
    assert.deepEqual((await readdir(target)).sort(), [
      'deploy.py',
      'fingerprint.sql',
      'manifest.json',
      'migrations',
    ]);
    assert(
      !JSON.stringify(
        JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8')),
      ).includes('PRIVATE_CANARY'),
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('remote Python contract uses no real configuration or production Docker', () => {
  const file = fileURLToPath(new URL('../infra/admin-console/deploy.test.py', import.meta.url));
  const windows = process.platform === 'win32';
  const result = spawnSync(
    windows ? 'wsl.exe' : 'python3',
    windows
      ? ['--exec', 'bash', '-c', 'exec python3 "$(wslpath -u "$1")"', 'admin-contract', file]
      : [file],
    { encoding: 'utf8', timeout: 60000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
