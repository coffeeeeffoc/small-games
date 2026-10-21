import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_ORIGIN,
  ADMIN_CALLBACK,
  ADMIN_EMAIL,
  childEnvironment,
  parseAdminFile,
  executionInput,
  sshArguments,
  adminDockerfile,
  remoteReceipt,
  writeAdminBundle,
  controlInput,
  controlExecution,
  controlReceipt,
  controlServices,
  controlDatabaseReasons,
  writeControlBundle,
  readControlBundle,
  archiveControlBundle,
  main,
} from './deploy-admin.mjs';
import { adminTemplatePrefix, adminNonceMetaMarkup } from './admin-csp.mjs';
import { selectedBackendBuildCommands } from './backend-build.mjs';
import { deploymentCommand, remoteDiagnostic } from './deployment-progress.mjs';

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

test('admin compiles only runtime exports and its API, without game UI, Cocos or quality gates', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const commands = await selectedBackendBuildCommands(['management'], root);
  assert(
    commands.some((command) => command.join(' ') === '--filter @coffeeeeffoc/management-api build'),
  );
  assert(
    !commands.some((command) =>
      /turbo|test|lint|validate|carding|overwatch|game-(cultivation|cricket|office|arena|building-power)/.test(
        command.join(' '),
      ),
    ),
  );
  const source = await readFile(new URL('./deploy-admin.mjs', import.meta.url), 'utf8');
  assert(!/validatePush|ADMIN_BASE|--validate-child|candidateProof/.test(source));
  assert.match(adminDockerfile, /COPY --chown=node:node backend\/ \.\//);
  assert.match(adminDockerfile, /USER node/);
});

test('progress exposes finite remote stages and failures, never child secrets or stderr', async () => {
  const output = [];
  await assert.rejects(
    deploymentCommand(
      process.execPath,
      [
        '-e',
        "console.error('CANARY_SECRET');console.error('ADMIN_REMOTE_STAGE service_start');console.error('ADMIN_REMOTE_STOPPED COMMAND_FAILED');process.exit(1)",
      ],
      {
        prefix: 'ADMIN',
        stage: 'transaction',
        remote: true,
        output: (line) => output.push(line),
        heartbeat: 100,
      },
    ),
    (error) => error.message === 'REMOTE_FAILED' && error.remoteStage === 'service_start',
  );
  assert(!output.join('\n').includes('CANARY_SECRET'));
  assert(output.some((line) => line.includes('reason=COMMAND_FAILED')));
  assert.equal(remoteDiagnostic('ADMIN_REMOTE_STAGE CANARY_SECRET'), null);
  assert.equal(remoteDiagnostic('ADMIN_REMOTE_STOPPED TOKEN=secret'), null);
  const timeoutOutput = [];
  await assert.rejects(
    deploymentCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      timeout: 100,
      heartbeat: 30,
      output: (line) => timeoutOutput.push(line),
    }),
    /TIMEOUT/,
  );
  assert(timeoutOutput.some((line) => line.includes('category=TIMEOUT')));
  const start = Date.now();
  await assert.rejects(
    deploymentCommand(
      process.execPath,
      ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
      {
        timeout: 800,
        heartbeat: 100,
        output: () => {},
      },
    ),
    /TIMEOUT/,
  );
  assert(
    Date.now() - start < 6000,
    'A child ignoring SIGTERM must still terminate within the grace period',
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

test('control CLI closes legacy modes before config and prepare never reads SSH or OAuth', async () => {
  const forbidden = () => {
    throw new Error('PRIVATE_READER_CALLED');
  };
  for (const args of [[], ['--execute'], ['--provision-only'], ['--prepare-control', '--rollback']])
    await assert.rejects(
      main(args, { loadConfig: forbidden, prepare: forbidden }),
      /CONTROL_MODE_REQUIRED/,
    );
  const prepared = {
    directory: '/public/fixture',
    manifest: { release: 'fixture', sourceSHA: 'a'.repeat(40) },
  };
  assert.deepEqual(
    await main(['--prepare-control'], { loadConfig: forbidden, prepare: async () => prepared }),
    prepared,
  );
  assert.deepEqual(controlInput(['--recover-control=old-release']), {
    mode: '--recover-control',
    bundle: 'old-release',
  });
  assert.deepEqual(controlInput(['--recover-control=old-release', '--root-precondition']), {
    mode: '--recover-control',
    bundle: 'old-release',
    recoveryEvidence: 'root-precondition-v1',
  });
  for (const mode of ['--adopt-control=old-release', '--prepare-control', '--rollback'])
    assert.throws(() => controlInput([mode, '--root-precondition']), /ARGUMENTS/);
  assert.throws(() => controlInput(['--adopt-control=../release']), /ARGUMENTS/);
});

async function controlWorkspace(folder) {
  const workspace = path.join(folder, 'source');
  for (const name of [
    'infra/admin-console/control-deploy.py',
    'infra/admin-console/control-database.py',
    'infra/admin-console/control-fingerprint.sql',
    'infra/admin-console/deploy.py',
    'infra/backend-update/deploy.py',
    'infra/deployment/image-authority.py',
    'infra/admin-console/migrations/002-control-center.sql',
    'infra/migrations/014-player-sessions.sql',
  ]) {
    await mkdir(path.dirname(path.join(workspace, name)), { recursive: true });
    const realDatabaseSources = new Set([
      'infra/admin-console/control-database.py',
      'infra/admin-console/control-fingerprint.sql',
      'infra/admin-console/migrations/002-control-center.sql',
    ]);
    await writeFile(
      path.join(workspace, name),
      realDatabaseSources.has(name)
        ? await readFile(new URL('../' + name, import.meta.url))
        : `# explicit public fixture ${name}\n`,
    );
  }
  await mkdir(path.join(workspace, 'apps/admin-web/dist/assets'), { recursive: true });
  await writeFile(
    path.join(workspace, 'apps/admin-web/dist/index.html'),
    `${adminTemplatePrefix}\n<html>${adminNonceMetaMarkup}</html>`,
  );
  await writeFile(path.join(workspace, 'apps/admin-web/dist/assets/app.js'), 'public fixture');
  return workspace;
}

test('v2 public bundles bind 002, CSP and exactly three selected backend commands', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'admin-control-bundle-'));
  try {
    const workspace = await controlWorkspace(folder);
    const directory = path.join(folder, 'candidate');
    const selected = [];
    const manifest = await writeControlBundle(
      directory,
      { head: 'a'.repeat(40), release: 'candidate' },
      workspace,
      async (target, services) => {
        selected.push(services);
        await mkdir(target);
        await writeFile(path.join(target, 'public.txt'), 'backend');
      },
    );
    assert.deepEqual(selected, [controlServices]);
    assert.deepEqual(await readControlBundle(directory), manifest);
    assert.equal(manifest.controlSchemaVersion, 2);
    assert(!Object.keys(manifest.files).some((name) => /001|bootstrap|management\.env/.test(name)));
    const dockerfile = await readFile(path.join(directory, 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /runtime-api.*kart-server.*management-api/);
    const archive = await archiveControlBundle(directory, manifest);
    assert((await readFile(archive)).length > 0);
    await rm(path.join(workspace, 'infra/admin-console/control-database.py'));
    await assert.rejects(
      writeControlBundle(
        path.join(folder, 'missing'),
        { head: 'a'.repeat(40), release: 'missing', runnerOnly: true },
        workspace,
      ),
      /DATABASE_HELPER_REQUIRED/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('unlisted env/key, nested links and changed public hashes cause zero remote calls', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'admin-control-unsafe-'));
  try {
    const workspace = await controlWorkspace(folder);
    const directory = path.join(folder, 'candidate');
    await writeControlBundle(
      directory,
      { head: 'a'.repeat(40), release: 'candidate', runnerOnly: true },
      workspace,
    );
    let remote = 0;
    const rejectBeforeRemote = () =>
      main(['--adopt-control=candidate'], {
        readBundle: () => readControlBundle(directory),
        loadConfig: () => {
          remote++;
          throw new Error('REMOTE_CALLED');
        },
        prepare: () => {
          throw new Error('BUILD_CALLED');
        },
      });
    for (const name of ['.env', 'private.key', 'unknown.txt']) {
      await writeFile(path.join(directory, name), 'PRIVATE_CANARY');
      await assert.rejects(rejectBeforeRemote(), /BUNDLE_UNSAFE/);
      await rm(path.join(directory, name));
    }
    await mkdir(path.join(directory, 'nested'));
    await symlink(
      workspace,
      path.join(directory, 'nested/link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await assert.rejects(rejectBeforeRemote(), /BUNDLE_UNSAFE/);
    await rm(path.join(directory, 'nested'), { recursive: true });
    const manifestFile = path.join(directory, 'manifest.json');
    const originalManifest = await readFile(manifestFile);
    const privateFile = path.join(folder, 'private-canary');
    await writeFile(privateFile, 'PRIVATE_CANARY_NOT_JSON');
    await rm(manifestFile);
    // Windows file symlinks require an OS privilege; a directory junction still
    // proves lstat rejects the manifest before any read. Hardlinks below cover
    // a regular-file target on every platform, with invalid JSON as the canary.
    await symlink(
      process.platform === 'win32' ? folder : privateFile,
      manifestFile,
      process.platform === 'win32' ? 'junction' : 'file',
    );
    await assert.rejects(rejectBeforeRemote(), /BUNDLE_UNSAFE/);
    await rm(manifestFile);
    await link(privateFile, manifestFile);
    await assert.rejects(rejectBeforeRemote(), /BUNDLE_UNSAFE/);
    await rm(manifestFile);
    await writeFile(manifestFile, originalManifest);
    await writeFile(path.join(directory, 'control-deploy.py'), 'changed');
    await assert.rejects(rejectBeforeRemote(), /BUNDLE_UNSAFE/);
    assert.equal(remote, 0);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('recover uses a freshly reviewed runner when dev advanced; historical bundle is data only', async () => {
  const old = { sourceSHA: 'a'.repeat(40), release: 'old' };
  const current = { sourceSHA: 'b'.repeat(40), release: 'current' };
  const options = [];
  const result = await controlExecution(
    { mode: '--recover-control', bundle: 'old' },
    async (option) => {
      options.push(option);
      return { directory: '/public/current' };
    },
    async (directory) =>
      directory.endsWith('/old') || directory.endsWith('\\old') ? old : current,
    '/workspace',
  );
  assert.deepEqual(result.target.manifest, old);
  assert.deepEqual(result.runner.manifest, current);
  assert.deepEqual(options, [{ services: ['management'], runnerOnly: true }]);
  const source = await readFile(new URL('./deploy-admin.mjs', import.meta.url), 'utf8');
  assert.match(source, /payload\.targetRelease = target\.manifest\.release/);
  assert.match(source, /python3 '\$\{releaseDir\}\/control-deploy\.py'/);
});

test('control receipt requires complete typed evidence and distinguishes runner from target SHA', () => {
  const value = {
    ok: true,
    mode: 'recover',
    runnerSourceSHA: 'a'.repeat(40),
    sourceSHA: 'b'.repeat(40),
    release: 'target',
    services: [...controlServices],
    activeImages: Object.fromEntries(
      controlServices.map((name) => [name, 'sha256:' + 'c'.repeat(64)]),
    ),
    controlContract: {
      version: 1,
      schema: 'game_control',
      schemaVersion: 2,
      projectionSha256: 'd'.repeat(64),
      metadataSha256: 'e'.repeat(64),
    },
    migrationArtifactSha256: 'f'.repeat(64),
    controlEnabled: true,
    remoteConfigReused: true,
    internalHealthVerified: true,
    publicHtmlVerified: true,
    anonymousSessionVerified: true,
    oauthStartVerified: true,
    realGithubLoginVerified: false,
    backupSHA256: '1'.repeat(64),
    oldStateSHA256: '2'.repeat(64),
  };
  assert.deepEqual(controlReceipt(JSON.stringify(value), 'recover', value.runnerSourceSHA), value);
  for (const key of Object.keys(value)) {
    const missing = { ...value };
    delete missing[key];
    assert.throws(
      () => controlReceipt(JSON.stringify(missing), 'recover', value.runnerSourceSHA),
      /REMOTE_FAILED/,
    );
  }
  for (const key of ['sourceSHA', 'migrationArtifactSha256', 'backupSHA256', 'oldStateSHA256'])
    for (const bad of [[value[key]], { value: value[key] }])
      assert.throws(
        () =>
          controlReceipt(
            JSON.stringify({ ...value, [key]: bad }),
            'recover',
            value.runnerSourceSHA,
          ),
        /REMOTE_FAILED/,
      );
  assert.throws(() =>
    controlReceipt(
      JSON.stringify({ ...value, realGithubLoginVerified: true }),
      'recover',
      value.runnerSourceSHA,
    ),
  );
});

test('recover executes the current runner and guards current dev even for an old source target', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'admin-control-runner-'));
  try {
    const current = {
      release: 'current',
      sourceSHA: 'a'.repeat(40),
      migrationArtifactSha256: 'f'.repeat(64),
    };
    const historical = { ...current, release: 'historical', sourceSHA: 'b'.repeat(40) };
    const receipt = {
      ok: true,
      mode: 'recover',
      runnerSourceSHA: current.sourceSHA,
      sourceSHA: historical.sourceSHA,
      release: historical.release,
      services: [...controlServices],
      activeImages: Object.fromEntries(
        controlServices.map((name) => [name, 'sha256:' + 'c'.repeat(64)]),
      ),
      controlContract: {
        version: 1,
        schema: 'game_control',
        schemaVersion: 2,
        projectionSha256: 'd'.repeat(64),
        metadataSha256: 'e'.repeat(64),
      },
      migrationArtifactSha256: 'f'.repeat(64),
      controlEnabled: true,
      remoteConfigReused: true,
      internalHealthVerified: true,
      publicHtmlVerified: true,
      anonymousSessionVerified: true,
      oauthStartVerified: true,
      realGithubLoginVerified: false,
      backupSHA256: '1'.repeat(64),
      oldStateSHA256: '2'.repeat(64),
    };
    const guards = [],
      calls = [],
      uploaded = [];
    const directory = path.join(folder, 'current');
    const result = await main(['--recover-control=historical', '--root-precondition'], {
      prepare: async (options) => {
        assert.equal(options.runnerOnly, true);
        return { directory };
      },
      readBundle: async (file) => (file === directory ? current : historical),
      loadConfig: async () => ({
        host: '192.0.2.10',
        user: 'fixture',
        port: '22',
        caddyDirectory: '/opt/company',
      }),
      sameCandidate: (sha) => guards.push(sha),
      sendBundle: async (_config, file, value) => {
        uploaded.push([file, value]);
        return '/opt/public/current';
      },
      run: async (_program, args, options) => {
        calls.push([args, options]);
        return options.stage === 'protected_remote_transaction' ? JSON.stringify(receipt) : '';
      },
    });
    assert.deepEqual(result, receipt);
    assert.deepEqual(guards, [current.sourceSHA, current.sourceSHA]);
    assert.deepEqual(uploaded, [[directory, current]]);
    assert.match(
      calls[1][0].at(-1),
      /^python3 '\/opt\/public\/current\/control-deploy.py' --recover$/,
    );
    const payload = JSON.parse(calls[1][1].input);
    assert.equal(payload.sourceSHA, current.sourceSHA);
    assert.equal(payload.targetRelease, historical.release);
    assert.equal(payload.recoveryEvidence, 'root-precondition-v1');
    assert.match(payload.targetManifestSHA256, /^[a-f0-9]{64}$/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('database failures preserve a finite cause and outcome without forwarding raw secrets', async () => {
  const python = await readFile(
    new URL('../infra/admin-console/control-deploy.py', import.meta.url),
    'utf8',
  );
  const reasons = [
    ...python.match(/DATABASE_REASONS = frozenset\(\{([\s\S]*?)\}\)/)[1].matchAll(/'([^']+)'/g),
  ].map((match) => match[1]);
  assert.deepEqual([...controlDatabaseReasons].sort(), reasons.sort());
  for (const outcome of [
    'DATABASE_PREFLIGHT_FAILED',
    'DATABASE_NOT_COMMITTED',
    'DATABASE_OUTCOME_UNKNOWN',
  ])
    for (const reason of controlDatabaseReasons) {
      const code = `${outcome}__${reason}`;
      assert.deepEqual(remoteDiagnostic(`ADMIN_REMOTE_STOPPED ${code}`, 'ADMIN'), {
        failure: code,
      });
    }
  assert.deepEqual(
    remoteDiagnostic('ADMIN_REMOTE_STOPPED DATABASE_PREFLIGHT_FAILED__PRIVATE_CANARY', 'ADMIN'),
    { failure: 'REMOTE_GUARD_FAILED' },
  );
  assert.equal(
    remoteDiagnostic('ADMIN_REMOTE_STOPPED CONTROL_COMMAND_FAILED secret=value', 'ADMIN'),
    null,
  );
});

test('admin owned-probe diagnostics preserve only strict metadata for the matching caller', async () => {
  const id = 'a'.repeat(64),
    uuid = '12345678-1234-1234-1234-123456789012';
  const output = [];
  await assert.rejects(
    deploymentCommand(
      process.execPath,
      [
        '-e',
        `console.error('PRIVATE_CANARY');console.error('BACKEND_REMOTE_PROBE_PID 99');console.error('ADMIN_REMOTE_OWNED_PROBE ${id}');console.error('ADMIN_REMOTE_PROBE_UUID ${uuid}');console.error('ADMIN_REMOTE_PROBE_PID 42');console.error('ADMIN_REMOTE_STOPPED AUTHORITY_PROBE_RECOVERY_REQUIRED');process.exit(1)`,
      ],
      { prefix: 'ADMIN', remote: true, output: (line) => output.push(line) },
    ),
    (error) =>
      error.ownedContainerId === id && error.probeUUID === uuid && error.probeProcessId === 42,
  );
  assert(!output.join('\n').includes('PRIVATE_CANARY'));
  for (const line of [
    'ADMIN_REMOTE_PROBE_PID 2147483648',
    'ADMIN_REMOTE_PROBE_PID 0',
    'ADMIN_REMOTE_PROBE_UUID bad',
    'ADMIN_REMOTE_OWNED_PROBE PRIVATE_CANARY',
  ])
    assert.equal(remoteDiagnostic(line, 'ADMIN'), null);
  assert.equal(remoteDiagnostic('BACKEND_REMOTE_PROBE_PID 42', 'ADMIN'), null);
});

test('control coordinator mocks never operate real services or migrations', () => {
  const file = fileURLToPath(
    new URL('../infra/admin-console/control-deploy.test.py', import.meta.url),
  );
  const result = spawnSync(
    process.platform === 'win32' ? 'wsl.exe' : 'python3',
    process.platform === 'win32'
      ? [
          '--exec',
          'bash',
          '-c',
          'export PYTHONDONTWRITEBYTECODE=1; exec python3 "$(wslpath -u "$1")"',
          'control-contract',
          file,
        ]
      : ['-B', file],
    { encoding: 'utf8', timeout: 60000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('control database contracts stay finite and never implicitly run PostgreSQL', () => {
  const file = fileURLToPath(
    new URL('../infra/admin-console/control-database.test.py', import.meta.url),
  );
  const result = spawnSync(
    process.platform === 'win32' ? 'wsl.exe' : 'python3',
    process.platform === 'win32'
      ? [
          '--exec',
          'bash',
          '-c',
          'export PYTHONDONTWRITEBYTECODE=1; exec python3 "$(wslpath -u "$1")"',
          'control-database-contract',
          file,
        ]
      : ['-B', file],
    { encoding: 'utf8', timeout: 60000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('pre-migration recovery reports restored services without claiming control adoption', () => {
  const value = {
    ok: true,
    mode: 'recover',
    outcome: 'restored-before-migration',
    release: 'previous',
    sourceSHA: 'a'.repeat(40),
    runnerSourceSHA: 'b'.repeat(40),
    migrationArtifactSha256: 'c'.repeat(64),
    controlEnabled: false,
    internalHealthVerified: true,
    restoredImages: Object.fromEntries(
      ['runtime', 'kart', 'management'].map((name) => [name, 'sha256:' + 'd'.repeat(64)]),
    ),
  };
  assert.deepEqual(controlReceipt(JSON.stringify(value), 'recover', value.runnerSourceSHA), value);
  for (const patch of [
    { controlEnabled: true },
    { internalHealthVerified: false },
    { mode: 'adopt' },
    { restoredImages: {} },
  ])
    assert.throws(() =>
      controlReceipt(JSON.stringify({ ...value, ...patch }), 'recover', value.runnerSourceSHA),
    );
});
