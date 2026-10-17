import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { root, loadConfig, fileHashes } from './company-deployment.mjs';
import { childEnvironment, sshArguments } from './deploy-admin.mjs';
import { selectedBackendBuildCommands, backendPackages } from './backend-build.mjs';
import { prepareSelectedBackend } from './deployment-bundle.mjs';
import { deploymentCommand } from './deployment-progress.mjs';
import { pnpmInvocation } from './validate-push.mjs';

const allowed = ['runtime', 'kart', 'tianxia'],
  remoteRoot = '/opt/small-games/backend-updates';
export function backendRunnerInput(source, authoritySource, mode, payload) {
  assert(['--check', '--execute', '--rollback'].includes(mode), 'ARGUMENTS');
  const body = JSON.stringify(payload);
  assert(Buffer.byteLength(body) <= 8192, 'ARGUMENTS');
  const base64 = (value) => Buffer.from(value, 'utf8').toString('base64');
  return [
    'import base64,json,types',
    "helper={'__name__':'image_authority_reviewed'}",
    `exec(compile(base64.b64decode('${base64(authoritySource)}'),'image-authority-reviewed','exec'),helper)`,
    "ns={'__name__':'backend_reviewed'}",
    `exec(compile(base64.b64decode('${base64(source)}'),'backend-current-runner','exec'),ns)`,
    "ns['IMAGE_AUTHORITY']=types.SimpleNamespace(**helper)",
    `ns['entry'](${JSON.stringify([mode])},json.loads(base64.b64decode('${base64(body)}')))`,
    '',
  ].join('\n');
}
export function backendInput(args) {
  const { values } = parseArgs({
    args,
    options: {
      services: { type: 'string' },
      prepare: { type: 'boolean' },
      check: { type: 'boolean' },
      rollback: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) return { mode: 'help' };
  const services = (values.services ?? '').split(',');
  assert(
    services.length &&
      new Set(services).size === services.length &&
      services.every((name) => allowed.includes(name)),
    'BACKEND_SELECTION',
  );
  assert([values.prepare, values.check, values.rollback].filter(Boolean).length <= 1, 'ARGUMENTS');
  if (values.rollback) assert(/^[a-z0-9-]{1,100}$/.test(values.rollback), 'ARGUMENTS');
  return {
    mode: values.prepare
      ? 'prepare'
      : values.check
        ? 'check'
        : values.rollback
          ? 'rollback'
          : 'execute',
    services,
    release: values.rollback,
  };
}
export function backendDockerfile(services) {
  assert(services.length && services.every((name) => allowed.includes(name)), 'BACKEND_SELECTION');
  const entry = {
    runtime: 'services/runtime-api/dist/main.js',
    kart: 'services/kart-server/src/main.ts',
    tianxia: 'services/tianxia-server/src/main.mjs',
  }[services.includes('runtime') ? 'runtime' : services[0]];
  return `FROM node:24.21.0-bookworm-slim\nWORKDIR /app\nRUN npm install -g pnpm@12.6.0\nCOPY --chown=node:node backend/ ./\nRUN pnpm ${services.map((name) => '--filter ' + backendPackages[name] + '...').join(' ')} install --prod --frozen-lockfile --ignore-scripts && mkdir -p /app/outbox /app/results && chown node:node /app/outbox /app/results\nENV NODE_ENV=production\nUSER node\nCMD ["node",${JSON.stringify(entry)}]\n`;
}
export async function writeBackendBundle(
  destination,
  { head, release, services },
  workspace = root,
) {
  assert(/^[a-f0-9]{40}$/.test(head) && /^[a-z0-9-]{1,100}$/.test(release), 'SOURCE');
  backendDockerfile(services);
  await mkdir(destination);
  await prepareSelectedBackend(path.join(destination, 'backend'), services, workspace);
  await cp(
    path.join(workspace, 'infra/backend-update/deploy.py'),
    path.join(destination, 'deploy.py'),
    { force: false, errorOnExist: true },
  );
  await cp(
    path.join(workspace, 'infra/deployment/image-authority.py'),
    path.join(destination, 'image-authority.py'),
    { force: false, errorOnExist: true },
  );
  await writeFile(path.join(destination, 'Dockerfile'), backendDockerfile(services));
  const files = await fileHashes(destination);
  assert(
    !Object.keys(files).some((name) => /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|sql)$/i.test(name)),
    'BUNDLE_UNSAFE',
  );
  const manifest = {
    version: 1,
    sourceSHA: head,
    release,
    services,
    scope: 'selected-existing-backends',
    qualityChecks: 'not-run',
    databaseMigrations: false,
    files,
  };
  await writeFile(
    path.join(destination, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return manifest;
}
const git = (args) => {
  const result = spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], {
    cwd: root,
    env: childEnvironment(),
    shell: false,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 30000,
  });
  if (result.error || result.status !== 0) throw Error('GIT_FAILED');
  return result.stdout.trim();
};
function sourceGuard(head) {
  assert.equal(git(['rev-parse', 'HEAD']), head, 'HEAD_CHANGED');
  assert.equal(git(['status', '--porcelain']), '', 'DIRTY_TREE');
  assert.equal(
    git(['ls-remote', 'origin', 'refs/heads/dev']).split(/\s+/)[0],
    head,
    'REMOTE_CHANGED',
  );
}
export function backendReceipt(text, selection) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error('REMOTE_RECEIPT');
  }
  assert(
    value && typeof value === 'object' && !Array.isArray(value) && value.ok === true,
    'REMOTE_RECEIPT',
  );
  const keys = [
    'ok',
    'mode',
    'sourceSHA',
    'release',
    'services',
    'recreateCompanions',
    'healthVerified',
    'databaseReplaced',
    'schemaChanged',
    'backupCreated',
    'backupSHA256',
    'isolatedRestoreVerified',
    'activeImages',
    'imageCapabilities',
  ];
  assert(
    Object.keys(value).length === keys.length &&
      Object.keys(value).every((key) => keys.includes(key)),
    'REMOTE_RECEIPT',
  );
  assert(
    ['execute', 'rollback'].includes(value.mode) &&
      typeof value.sourceSHA === 'string' &&
      /^[a-f0-9]{40}$/.test(value.sourceSHA) &&
      typeof value.release === 'string' &&
      /^[a-z0-9-]{1,100}$/.test(value.release),
    'REMOTE_RECEIPT',
  );
  assert.deepEqual(value.services, selection, 'REMOTE_RECEIPT');
  assert(
    Array.isArray(value.recreateCompanions) &&
      value.recreateCompanions.length <= 1 &&
      value.recreateCompanions.every((name) => name === 'kart') &&
      (!value.recreateCompanions.length ||
        (selection.includes('runtime') && !selection.includes('kart'))),
    'REMOTE_RECEIPT',
  );
  assert(
    value.healthVerified === true &&
      value.databaseReplaced === false &&
      value.schemaChanged === false &&
      value.isolatedRestoreVerified === false &&
      typeof value.backupCreated === 'boolean' &&
      (value.backupCreated
        ? typeof value.backupSHA256 === 'string' && /^[a-f0-9]{64}$/.test(value.backupSHA256)
        : value.backupSHA256 === null),
    'REMOTE_RECEIPT',
  );
  assert(
    value.activeImages &&
      typeof value.activeImages === 'object' &&
      !Array.isArray(value.activeImages),
    'REMOTE_RECEIPT',
  );
  assert.deepEqual(
    Object.keys(value.activeImages).sort(),
    [...selection, ...value.recreateCompanions].sort(),
    'REMOTE_RECEIPT',
  );
  assert(
    Object.values(value.activeImages).every(
      (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value),
    ),
    'REMOTE_RECEIPT',
  );
  const floors = {
    runtime: { control: 1, authenticatedGameScope: 1 },
    kart: { control: 1, identityRecheck: 1 },
  };
  assert(
    value.imageCapabilities &&
      typeof value.imageCapabilities === 'object' &&
      !Array.isArray(value.imageCapabilities),
    'REMOTE_RECEIPT',
  );
  assert.deepEqual(
    Object.keys(value.imageCapabilities).sort(),
    Object.keys(value.activeImages)
      .filter((name) => Object.hasOwn(floors, name))
      .sort(),
    'REMOTE_RECEIPT',
  );
  for (const [name, proof] of Object.entries(value.imageCapabilities)) {
    assert(proof && typeof proof === 'object' && !Array.isArray(proof), 'REMOTE_RECEIPT');
    assert.deepEqual(
      Object.keys(proof).sort(),
      ['image', ...Object.keys(floors[name])].sort(),
      'REMOTE_RECEIPT',
    );
    assert.equal(proof.image, value.activeImages[name], 'REMOTE_RECEIPT');
    for (const [key, minimum] of Object.entries(floors[name]))
      assert(Number.isSafeInteger(proof[key]) && proof[key] >= minimum, 'REMOTE_RECEIPT');
  }
  return value;
}
export async function main(args = process.argv.slice(2)) {
  const input = backendInput(args);
  if (input.mode === 'help') {
    console.log(
      'pnpm deploy:backend --services=runtime[,kart,tianxia] [--prepare|--check|--rollback=release]\n只更新已存在的选定后端，不创建数据库、不执行迁移、不部署官网或游戏；Runtime的Kart namespace依赖会明确重建。',
    );
    return;
  }
  const config = await loadConfig(),
    env = childEnvironment();
  const run = (program, args, options = {}) =>
    deploymentCommand(program, args, { cwd: root, env, prefix: 'BACKEND', ...options });
  const currentRunner = async (mode, payload) =>
    backendRunnerInput(
      await readFile(path.join(root, 'infra/backend-update/deploy.py'), 'utf8'),
      await readFile(path.join(root, 'infra/deployment/image-authority.py'), 'utf8'),
      mode,
      payload,
    );
  if (input.mode === 'check') {
    const text = await run('ssh', sshArguments(config, 'python3 -'), {
      stage: 'read_only_preflight',
      input: await currentRunner('--check', {
        services: input.services,
        caddyDirectory: config.caddyDirectory,
      }),
      timeout: 60000,
    });
    const result = JSON.parse(text);
    assert(
      result.ok === true && result.readOnly === true && result.composeContextVerified === true,
      'REMOTE_RECEIPT',
    );
    assert.deepEqual(result.services, input.services);
    console.log(JSON.stringify(result));
    return;
  }
  if (input.mode === 'rollback') {
    sourceGuard(git(['rev-parse', 'HEAD']));
    const text = await run('ssh', sshArguments(config, 'python3 -'), {
      stage: 'rollback',
      remote: true,
      timeout: 900000,
      input: await currentRunner('--rollback', {
        release: input.release,
        services: input.services,
        caddyDirectory: config.caddyDirectory,
      }),
    });
    console.log(JSON.stringify(backendReceipt(text, input.services)));
    return;
  }
  const head = git(['rev-parse', 'HEAD']);
  sourceGuard(head);
  console.log(
    `BACKEND_SCOPE ${input.services.join(',')} quality_checks=not-run database_migrations=none`,
  );
  for (const command of await selectedBackendBuildCommands(input.services, root)) {
    const p = pnpmInvocation(env);
    await run(p.command, [...p.prefix, ...command], {
      stage: 'build_' + command[1].split('/').at(-1).replaceAll('-', '_'),
      timeout: 300000,
    });
  }
  sourceGuard(head);
  const release = `${head.slice(0, 12)}-${Date.now()}-${randomBytes(3).toString('hex')}`,
    parent = path.join(root, 'outputs/backend-deploy');
  await mkdir(parent, { recursive: true });
  const directory = path.join(parent, release),
    manifest = await writeBackendBundle(directory, { head, release, services: input.services });
  const archive = directory + '.tar.gz';
  await run('tar', ['-czf', archive, '-C', directory, '.'], { stage: 'archive' });
  const hash = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  await writeFile(archive + '.sha256', hash + '\n');
  if (input.mode === 'prepare') {
    console.log(`BACKEND_PREPARED ${directory}`);
    return manifest;
  }
  await run('ssh', sshArguments(config, 'bash -s'), {
    stage: 'upload_prepare',
    input: `set -eu\numask 077\nmkdir -p '${remoteRoot}/incoming' '${remoteRoot}/releases'\ntest ! -e '${remoteRoot}/releases/${release}'\n`,
  });
  await run(
    'scp',
    [
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=15',
      ...(config.key ? ['-i', config.key] : []),
      '-P',
      config.port,
      archive,
      `${config.user}@${config.host}:${remoteRoot}/incoming/${release}.tar.gz`,
    ],
    { stage: 'upload', timeout: 300000 },
  );
  await run('ssh', sshArguments(config, 'bash -s'), {
    stage: 'archive_verify',
    input: `set -eu\numask 077\nprintf '%s  %s\\n' '${hash}' '${remoteRoot}/incoming/${release}.tar.gz' | sha256sum -c - >/dev/null\nmkdir '${remoteRoot}/releases/${release}'\ntar -xzf '${remoteRoot}/incoming/${release}.tar.gz' -C '${remoteRoot}/releases/${release}'\n`,
  });
  sourceGuard(head);
  const text = await run('ssh', sshArguments(config, 'python3 -'), {
    stage: 'remote_update',
    remote: true,
    timeout: 2700000,
    input: await currentRunner('--execute', {
      release,
      sourceSHA: head,
      services: input.services,
      caddyDirectory: config.caddyDirectory,
    }),
  });
  const receipt = backendReceipt(text, input.services);
  assert.equal(receipt.sourceSHA, head, 'REMOTE_RECEIPT');
  await writeFile(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error) => {
    const allowed = new Set([
      'BACKEND_SELECTION',
      'ARGUMENTS',
      'GIT_FAILED',
      'TIMEOUT',
      'SSH_FAILED',
      'REMOTE_FAILED',
      'REMOTE_RECEIPT',
    ]);
    console.error(
      `BACKEND_DEPLOY_STOPPED ${allowed.has(error.message) ? error.message : 'CONFIGURATION_OR_BUILD_FAILED'}`,
    );
    process.exitCode = 1;
  });
