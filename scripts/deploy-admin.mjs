import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileHashes, loadConfig, root } from './company-deployment.mjs';
import { prepareSelectedBackend } from './deployment-bundle.mjs';
import { selectedBackendBuildCommands } from './backend-build.mjs';
import { adminFailures, deploymentCommand } from './deployment-progress.mjs';
import { pnpmInvocation } from './validate-push.mjs';
import {
  adminBaseCsp,
  adminTemplatePrefix,
  adminNonceMetaMarkup,
  adminUiPaths,
  renderAdminDocument,
} from './admin-csp.mjs';

export const ADMIN_ORIGIN = 'https://admin.nenggongzhiren.cn';
export const ADMIN_CALLBACK = `${ADMIN_ORIGIN}/api/auth/github/callback`;
export const ADMIN_EMAIL = '1521152077@qq.com';
const remoteRoot = '/opt/small-games/admin-console';
const shaPattern = /^[a-f0-9]{40}$/;
// Register only this caller's finite database vocabulary with the shared redactor.
export const controlDatabaseReasons = [
  'CONTROL_PRIVATE_DIRECTORY',
  'CONTROL_PRIVATE_FILE',
  'CONTROL_PRIVATE_NOT_EMPTY',
  'CONTROL_RELEASE',
  'CONTROL_MANIFEST',
  'CONTROL_RELEASE_HASH',
  'CONTROL_MIGRATION_ARTIFACT',
  'CONTROL_MIGRATION_BOUNDARIES',
  'CONTROL_SQL_SEGMENTS',
  'CONTROL_SQL_SESSION',
  'CONTROL_SQL_CONTRACT',
  'CONTROL_CONTAINER_ID',
  'CONTROL_INVENTORY',
  'CONTROL_RESOURCE_CHANGED',
  'CONTROL_WRITER_RUNNING',
  'CONTROL_DATABASE_IDENTITY',
  'CONTROL_PG_VERSION',
  'CONTROL_UNSUPPORTED_PROFILE',
  'CONTROL_DISK_SPACE',
  'CONTROL_COMMAND_TIMEOUT',
  'CONTROL_COMMAND_FAILED',
  'CONTROL_PREFLIGHT_FAILED',
  'CONTROL_DATABASE_FAILED',
  'CONTROL_SOURCE_CHANGED',
  'CONTROL_POSTCOMMIT_STATE',
  'CONTROL_FIXTURE_CLEANUP_REQUIRED',
  'CONTROL_FIXTURE_RECOVERY_REQUIRED',
];
for (const code of [
  'DATABASE_PREFLIGHT_FAILED',
  'DATABASE_NOT_COMMITTED',
  'DATABASE_OUTCOME_UNKNOWN',
])
  for (const reason of controlDatabaseReasons) adminFailures.add(`${code}__${reason}`);
for (const code of [
  'PREMIGRATION_RESTORED',
  'ROOT_PRECONDITION_UNPROVEN',
  'DATABASE_OUTCOME_UNKNOWN',
])
  adminFailures.add(code);
const errors = new Set([
  'ARGUMENTS',
  'ADMIN_FILE',
  'ADMIN_FIELD',
  'OAUTH_REQUIRED',
  'FIXED_POLICY',
  'TOOL_FAILED',
  'HEAD_CHANGED',
  'DIRTY_TREE',
  'REMOTE_CHANGED',
  'BASE_NOT_ANCESTOR',
  'CANDIDATE_FAILED',
  'BUNDLE_UNSAFE',
  'SSH_FAILED',
  'REMOTE_FAILED',
  'HTTPS_FAILED',
  'TIMEOUT',
  'CONTROL_MODE_REQUIRED',
  'DATABASE_HELPER_REQUIRED',
]);
const stop = (code) => {
  throw new Error(code);
};
export const adminDockerfile = `FROM node:24.21.0-bookworm-slim
WORKDIR /app
RUN npm install -g pnpm@12.6.0
COPY --chown=node:node backend/ ./
RUN pnpm --filter @coffeeeeffoc/management-api... install --prod --frozen-lockfile --ignore-scripts
ENV NODE_ENV=production
USER node
CMD ["node","services/management-api/dist/main.js"]
`;

export function childEnvironment(env = process.env) {
  // Filter names before accessing values, including in provision-only mode.
  return Object.fromEntries(
    Object.keys(env)
      .filter(
        (key) =>
          !/^(ADMIN_|MANAGEMENT_|ECS_|COMPANY_|CADDY_|S3_|STUDIO_|GIT_(?:DIR|WORK_TREE|INDEX_FILE|CONFIG))/i.test(
            key,
          ) && !/SECRET|TOKEN|PASSWORD|_KEY$|DATABASE_URL|INTERNAL_KEY|^COS_/i.test(key),
      )
      .map((key) => [key, env[key]]),
  );
}

export function parseAdminFile(text) {
  const result = {};
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const found = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!found || Object.hasOwn(result, found[1]) || /[\r\0]/.test(found[2])) stop('ADMIN_FIELD');
    result[found[1]] = found[2];
  }
  const allowed = [
    'ADMIN_GITHUB_CLIENT_ID',
    'ADMIN_GITHUB_CLIENT_SECRET',
    'ADMIN_ORIGIN',
    'ADMIN_GITHUB_CALLBACK',
    'ADMIN_ALLOWED_EMAILS',
    'MANAGEMENT_CAPABILITIES',
  ];
  if (Object.keys(result).some((key) => !allowed.includes(key))) stop('ADMIN_FIELD');
  for (const [key, expected] of Object.entries({
    ADMIN_ORIGIN,
    ADMIN_GITHUB_CALLBACK: ADMIN_CALLBACK,
    ADMIN_ALLOWED_EMAILS: ADMIN_EMAIL,
    MANAGEMENT_CAPABILITIES: 'admin',
  })) {
    if (result[key] !== undefined && result[key] !== expected) stop('FIXED_POLICY');
  }
  if (
    !/^[A-Za-z0-9_-]{1,256}$/.test(result.ADMIN_GITHUB_CLIENT_ID || '') ||
    !(result.ADMIN_GITHUB_CLIENT_SECRET || '').length
  )
    stop('OAUTH_REQUIRED');
  if (result.ADMIN_GITHUB_CLIENT_SECRET.length > 4096) stop('ADMIN_FIELD');
  return {
    clientId: result.ADMIN_GITHUB_CLIENT_ID,
    clientSecret: result.ADMIN_GITHUB_CLIENT_SECRET,
  };
}

export async function executionInput(
  args,
  read = () => readFile(path.join(root, '.env.admin.local'), 'utf8'),
) {
  if (
    args.length > 1 ||
    args.some((arg) => !['--execute', '--provision-only', '--rollback', '--help'].includes(arg))
  )
    stop('ARGUMENTS');
  const mode = args[0] || '--execute';
  if (mode !== '--execute') return { mode };
  let text;
  try {
    text = await read();
  } catch {
    stop('ADMIN_FILE');
  }
  return { mode, oauth: parseAdminFile(text) };
}

export function sshArguments(config, command) {
  if (!config.host) stop('SSH_FAILED');
  return [
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ConnectTimeout=15',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=3',
    ...(config.key ? ['-i', config.key] : []),
    '-p',
    config.port,
    `${config.user}@${config.host}`,
    command,
  ];
}

const run = (program, args, options = {}) =>
  deploymentCommand(program, args, {
    env: childEnvironment(),
    cwd: root,
    prefix: 'ADMIN',
    ...options,
  });
const git = (args) => {
  const result = spawnSync('git', ['-c', 'core.fsmonitor=false', ...args], {
    cwd: root,
    shell: false,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 30000,
    env: {
      ...childEnvironment(),
      GIT_TERMINAL_PROMPT: '0',
      GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes',
    },
  });
  if (result.error || result.status !== 0) stop('TOOL_FAILED');
  return result.stdout.trim();
};
function sameCandidate(head) {
  if (git(['rev-parse', 'HEAD']) !== head) stop('HEAD_CHANGED');
  if (git(['status', '--porcelain'])) stop('DIRTY_TREE');
  if (git(['ls-remote', 'origin', 'refs/heads/dev']).split(/\s+/)[0] !== head)
    stop('REMOTE_CHANGED');
}

export async function writeAdminBundle(
  destination,
  { head, release, provisionOnly },
  workspace = root,
) {
  if (!shaPattern.test(head) || !/^[a-z0-9-]+$/.test(release)) stop('CANDIDATE_FAILED');
  await mkdir(destination);
  if (!provisionOnly) {
    await prepareSelectedBackend(path.join(destination, 'backend'), ['management'], workspace);
    const site = path.join(workspace, 'apps/admin-web/dist');
    const assets = await fileHashes(site);
    if (
      !assets['index.html'] ||
      Object.keys(assets).some(
        (name) => !/^(?:index\.html|mark\.svg|assets\/[A-Za-z0-9._-]+\.(?:js|css))$/.test(name),
      )
    )
      stop('BUNDLE_UNSAFE');
    await cp(site, path.join(destination, 'site'), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
  for (const name of ['deploy.py', 'fingerprint.sql', 'migrations/001-admin-auth.sql']) {
    const target = path.join(destination, name);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(workspace, 'infra/admin-console', name), target, {
      errorOnExist: true,
      force: false,
    });
  }
  if (!provisionOnly) {
    await writeFile(path.join(destination, 'Dockerfile'), adminDockerfile);
  }
  const files = await fileHashes(destination);
  if (Object.keys(files).some((name) => /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key)$/i.test(name)))
    stop('BUNDLE_UNSAFE');
  const manifest = {
    version: 1,
    sourceSHA: head,
    release,
    scope: ['management', 'admin-web'],
    qualityChecks: 'not-run',
    provisionOnly,
    files,
  };
  await writeFile(
    path.join(destination, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return manifest;
}

export async function archiveControlBundle(directory, manifest) {
  const checked = await readControlBundle(directory);
  if (JSON.stringify(checked) !== JSON.stringify(manifest)) stop('BUNDLE_UNSAFE');
  const archive = `${directory}.tar.gz`;
  // Git hooks can resolve GNU tar on Windows, where C: in -f denotes a remote host.
  // Keep the archive name local for both GNU tar and Windows bsdtar.
  const archiveDirectory = path.dirname(path.resolve(archive));
  const archiveName = path.basename(archive);
  const files = ['manifest.json', ...Object.keys(manifest.files).sort()];
  const listFile = `${directory}.tar-files`;
  await writeFile(listFile, files.join('\n') + '\n');
  await run(
    'tar',
    ['-czf', archiveName, '-C', path.resolve(directory), '-T', path.resolve(listFile)],
    { stage: 'archive', cwd: archiveDirectory },
  );
  // Inspect the archive itself, not only the mutable source directory. Never upload
  // bytes that were substituted between validation and tar reading a public file.
  const inspect = (args) => {
    const result = spawnSync('tar', args, {
      cwd: archiveDirectory,
      shell: false,
      env: childEnvironment(),
      windowsHide: true,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 30000,
    });
    if (result.error || result.status !== 0) stop('BUNDLE_UNSAFE');
    return result.stdout;
  };
  const entries = inspect(['-tzf', archiveName]).toString('utf8').trimEnd().split(/\r?\n/);
  if (JSON.stringify(entries.sort()) !== JSON.stringify([...files].sort())) stop('BUNDLE_UNSAFE');
  for (const name of files) {
    const expected =
      name === 'manifest.json'
        ? createHash('sha256')
            .update(JSON.stringify(manifest, null, 2) + '\n')
            .digest('hex')
        : manifest.files[name];
    if (
      createHash('sha256')
        .update(inspect(['-xOf', archiveName, '--', name]))
        .digest('hex') !== expected
    )
      stop('BUNDLE_UNSAFE');
  }
  if (JSON.stringify(await readControlBundle(directory)) !== JSON.stringify(manifest))
    stop('BUNDLE_UNSAFE');
  return archive;
}

async function sendPublicBundle(config, directory, manifest) {
  const archive = await archiveControlBundle(directory, manifest);
  const digest = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  const releaseDir = `${remoteRoot}/releases/${manifest.release}`;
  await run('ssh', sshArguments(config, 'bash -s'), {
    stage: 'upload_prepare',
    input: `set -eu\numask 077\nmkdir -p '${remoteRoot}/incoming' '${remoteRoot}/releases'\ntest ! -e '${releaseDir}'\ntest ! -e '${remoteRoot}/incoming/${manifest.release}.tar.gz'\n`,
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
      `${config.user}@${config.host}:${remoteRoot}/incoming/${manifest.release}.tar.gz`,
    ],
    { stage: 'upload', timeout: 300000 },
  );
  await run('ssh', sshArguments(config, 'bash -s'), {
    stage: 'archive_verify',
    input: `set -eu\numask 077\nprintf '%s  %s\\n' '${digest}' '${remoteRoot}/incoming/${manifest.release}.tar.gz' | sha256sum -c - >/dev/null\nmkdir '${releaseDir}'\ntar -xzf '${remoteRoot}/incoming/${manifest.release}.tar.gz' -C '${releaseDir}'\n`,
  });
  return releaseDir;
}

export function remoteReceipt(text, mode) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    stop('REMOTE_FAILED');
  }
  const keys = [
    'ok',
    'provisioned',
    'activated',
    'rolledBack',
    'oldDataUnchanged',
    'isolatedRestoreVerified',
    'leastPrivilegeVerified',
    'realGithubLoginVerified',
    'sourceSHA',
    'backupRetained',
    'backupSHA256',
    'oldStateSHA256',
  ];
  const expected =
    mode === '--rollback'
      ? [...keys.filter((key) => !['provisioned', 'activated'].includes(key))]
      : keys.filter((key) => key !== 'rolledBack');
  if (
    !['--execute', '--provision-only', '--rollback'].includes(mode) ||
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== expected.length ||
    Object.keys(value).some((key) => !expected.includes(key)) ||
    typeof value.sourceSHA !== 'string' ||
    !shaPattern.test(value.sourceSHA) ||
    typeof value.backupSHA256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.backupSHA256) ||
    typeof value.oldStateSHA256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.oldStateSHA256) ||
    [
      'ok',
      'oldDataUnchanged',
      'isolatedRestoreVerified',
      'leastPrivilegeVerified',
      'backupRetained',
    ].some((key) => value[key] !== true) ||
    value.realGithubLoginVerified !== false ||
    (mode === '--rollback'
      ? value.rolledBack !== true
      : value.provisioned !== true || value.activated !== (mode === '--execute'))
  )
    stop('REMOTE_FAILED');
  return value;
}

export const controlServices = Object.freeze(['runtime', 'kart', 'management']);
export const controlCspContract = Object.freeze({
  version: 1,
  kind: 'nonce-v1',
  prefix: adminTemplatePrefix,
  meta: adminNonceMetaMarkup,
  baseCsp: adminBaseCsp,
  paths: [...adminUiPaths],
});
const controlHelpers = {
  'control-deploy.py': 'infra/admin-console/control-deploy.py',
  'control-database.py': 'infra/admin-console/control-database.py',
  'control-fingerprint.sql': 'infra/admin-console/control-fingerprint.sql',
  'legacy-tools.py': 'infra/admin-console/deploy.py',
  'backend-context.py': 'infra/backend-update/deploy.py',
  'image-authority.py': 'infra/deployment/image-authority.py',
  'migrations/002-control-center.sql': 'infra/admin-console/migrations/002-control-center.sql',
  'migrations/003-night-overwatch-control.sql':
    'infra/admin-console/migrations/003-night-overwatch-control.sql',
  'migrations/014-player-sessions.sql': 'infra/migrations/014-player-sessions.sql',
};

export function controlInput(args) {
  const rootPrecondition = args.length === 2 && args[1] === '--root-precondition';
  if (args.length !== 1 && !rootPrecondition) stop('CONTROL_MODE_REQUIRED');
  if (rootPrecondition && !/^--recover-control=[a-z0-9-]{1,100}$/.test(args[0])) stop('ARGUMENTS');
  if (['--prepare-control', '--reuse-remote-config', '--rollback', '--help'].includes(args[0]))
    return { mode: args[0] };
  const found = /^(--adopt-control|--recover-control)=([a-z0-9-]{1,100})$/.exec(args[0]);
  if (found)
    return {
      mode: found[1],
      bundle: found[2],
      ...(rootPrecondition ? { recoveryEvidence: 'root-precondition-v1' } : {}),
    };
  stop(['--execute', '--provision-only'].includes(args[0]) ? 'CONTROL_MODE_REQUIRED' : 'ARGUMENTS');
}

export function controlDockerfile(services) {
  if (
    JSON.stringify(services) !== JSON.stringify(controlServices) &&
    JSON.stringify(services) !== '["management"]'
  )
    stop('BUNDLE_UNSAFE');
  const packages = {
    runtime: '@coffeeeeffoc/runtime-api',
    kart: '@coffeeeeffoc/kart-server',
    management: '@coffeeeeffoc/management-api',
  };
  return `FROM node:24.21.0-bookworm-slim\nWORKDIR /app\nRUN npm install -g pnpm@12.6.0\nCOPY --chown=node:node backend/ ./\nRUN pnpm ${services.map((name) => '--filter ' + packages[name] + '...').join(' ')} install --prod --frozen-lockfile --ignore-scripts && mkdir -p /app/outbox && chown node:node /app/outbox\nENV NODE_ENV=production\nUSER node\nCMD ["node","services/management-api/dist/main.js"]\n`;
}

async function requireControlHelpers(workspace) {
  for (const relative of Object.values(controlHelpers)) {
    let facts;
    try {
      facts = await lstat(path.join(workspace, relative));
    } catch {
      stop('DATABASE_HELPER_REQUIRED');
    }
    if (!facts.isFile() || facts.isSymbolicLink()) stop('BUNDLE_UNSAFE');
  }
}

export async function writeControlBundle(
  destination,
  { head, release, services = controlServices, runnerOnly = false },
  workspace = root,
  pack = prepareSelectedBackend,
) {
  if (!shaPattern.test(head) || !/^[a-z0-9-]{1,100}$/.test(release)) stop('CANDIDATE_FAILED');
  await requireControlHelpers(workspace);
  if (!runnerOnly) controlDockerfile(services);
  await mkdir(destination);
  for (const [name, relative] of Object.entries(controlHelpers)) {
    const target = path.join(destination, name);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(workspace, relative), target, { force: false, errorOnExist: true });
  }
  await writeFile(
    path.join(destination, 'admin-csp-contract.json'),
    JSON.stringify(controlCspContract, null, 2) + '\n',
  );
  if (!runnerOnly) {
    await pack(path.join(destination, 'backend'), services, workspace);
    const site = path.join(workspace, 'apps/admin-web/dist');
    const assets = await fileHashes(site);
    if (
      !assets['index.html'] ||
      Object.keys(assets).some(
        (name) => !/^(?:index\.html|mark\.svg|assets\/[A-Za-z0-9._-]+\.(?:js|css))$/.test(name),
      )
    )
      stop('BUNDLE_UNSAFE');
    renderAdminDocument(await readFile(path.join(site, 'index.html'), 'utf8'));
    await cp(site, path.join(destination, 'site'), {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: async (file) => {
        if ((await lstat(file)).isSymbolicLink()) stop('BUNDLE_UNSAFE');
        return true;
      },
    });
    await writeFile(path.join(destination, 'Dockerfile'), controlDockerfile(services));
  }
  const files = await fileHashes(destination);
  if (Object.keys(files).some((name) => /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key)$/i.test(name)))
    stop('BUNDLE_UNSAFE');
  const manifest = {
    version: 2,
    release,
    sourceSHA: head,
    kind: runnerOnly ? 'control-runner' : 'control-application',
    services: runnerOnly ? [] : [...services],
    scope: 'admin-control',
    qualityChecks: 'not-run',
    controlSchemaVersion: 3,
    migrationArtifactSha256: files['migrations/003-night-overwatch-control.sql'],
    cspContractSha256: files['admin-csp-contract.json'],
    adminHtml: runnerOnly
      ? null
      : { contract: 'nonce-v1', templateSha256: files['site/index.html'] },
    files,
  };
  await writeFile(
    path.join(destination, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return manifest;
}

function localCandidate(expected) {
  const head = git(['rev-parse', 'HEAD']);
  if (!shaPattern.test(head) || (expected && head !== expected)) stop('HEAD_CHANGED');
  if (git(['status', '--porcelain'])) stop('DIRTY_TREE');
  return head;
}

export async function prepareControl({ services = controlServices, runnerOnly = false } = {}) {
  // This branch deliberately has no loadConfig, SSH, ls-remote or OAuth reader.
  const head = localCandidate();
  await requireControlHelpers(root);
  if (!runnerOnly)
    for (const command of [
      ...(await selectedBackendBuildCommands(services, root)),
      ['--filter', '@coffeeeeffoc/admin-web', 'build'],
    ]) {
      const pnpm = pnpmInvocation(childEnvironment());
      await run(pnpm.command, [...pnpm.prefix, ...command], {
        stage: 'build_control',
        timeout: 300000,
      });
    }
  localCandidate(head);
  const release = `${head.slice(0, 12)}-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const parent = path.join(root, 'outputs/admin-deploy');
  await mkdir(parent, { recursive: true });
  const directory = path.join(parent, release);
  const manifest = await writeControlBundle(directory, { head, release, services, runnerOnly });
  localCandidate(head);
  return { directory, manifest };
}

export async function readControlBundle(directory) {
  if (
    (await lstat(directory)).isSymbolicLink() ||
    (await realpath(directory)) !== path.resolve(directory)
  )
    stop('BUNDLE_UNSAFE');
  const manifestFacts = await lstat(path.join(directory, 'manifest.json'));
  if (!manifestFacts.isFile() || manifestFacts.isSymbolicLink() || manifestFacts.nlink !== 1)
    stop('BUNDLE_UNSAFE');
  const text = await readFile(path.join(directory, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(text);
  const keys = [
    'version',
    'release',
    'sourceSHA',
    'kind',
    'services',
    'scope',
    'qualityChecks',
    'controlSchemaVersion',
    'migrationArtifactSha256',
    'cspContractSha256',
    'adminHtml',
    'files',
  ];
  if (
    !manifest ||
    Array.isArray(manifest) ||
    Object.keys(manifest).sort().join() !== keys.sort().join() ||
    text !== JSON.stringify(manifest, null, 2) + '\n' ||
    manifest.version !== 2 ||
    typeof manifest.sourceSHA !== 'string' ||
    !shaPattern.test(manifest.sourceSHA) ||
    typeof manifest.release !== 'string' ||
    !/^[a-z0-9-]{1,100}$/.test(manifest.release) ||
    manifest.release !== path.basename(directory) ||
    !manifest.files ||
    Array.isArray(manifest.files) ||
    typeof manifest.files !== 'object' ||
    manifest.scope !== 'admin-control' ||
    manifest.qualityChecks !== 'not-run' ||
    manifest.controlSchemaVersion !== 3 ||
    !['control-application', 'control-runner'].includes(manifest.kind)
  )
    stop('BUNDLE_UNSAFE');
  if (
    manifest.kind === 'control-runner'
      ? JSON.stringify(manifest.services) !== '[]' || manifest.adminHtml !== null
      : ![JSON.stringify(controlServices), '["management"]'].includes(
          JSON.stringify(manifest.services),
        ) ||
        JSON.stringify(manifest.adminHtml) !==
          JSON.stringify({
            contract: 'nonce-v1',
            templateSha256: manifest.files['site/index.html'],
          }) ||
        !manifest.files.Dockerfile ||
        !manifest.files['site/index.html']
  )
    stop('BUNDLE_UNSAFE');
  const actual = [];
  const walk = async (relative = '') => {
    for (const entry of await readdir(path.join(directory, relative))) {
      const name = relative ? `${relative}/${entry}` : entry;
      const facts = await lstat(path.join(directory, name));
      if (facts.isSymbolicLink() || /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key)$/i.test(name))
        stop('BUNDLE_UNSAFE');
      if (facts.isDirectory()) await walk(name);
      else if (facts.isFile() && facts.nlink === 1) actual.push(name);
      else stop('BUNDLE_UNSAFE');
    }
  };
  await walk();
  if (
    JSON.stringify(actual.sort()) !==
    JSON.stringify(['manifest.json', ...Object.keys(manifest.files)].sort())
  )
    stop('BUNDLE_UNSAFE');
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (
      !/^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(name) ||
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
      path.isAbsolute(name) ||
      typeof expected !== 'string' ||
      !/^[a-f0-9]{64}$/.test(expected)
    )
      stop('BUNDLE_UNSAFE');
    let target = directory;
    for (const part of name.split('/')) {
      target = path.join(target, part);
      if ((await lstat(target)).isSymbolicLink()) stop('BUNDLE_UNSAFE');
    }
    if (
      createHash('sha256')
        .update(await readFile(target))
        .digest('hex') !== expected
    )
      stop('BUNDLE_UNSAFE');
  }
  if (
    Object.keys(controlHelpers)
      .filter((name) => name !== 'migrations/014-player-sessions.sql')
      .some((name) => !manifest.files[name]) ||
    manifest.migrationArtifactSha256 !==
      manifest.files['migrations/003-night-overwatch-control.sql'] ||
    manifest.cspContractSha256 !== manifest.files['admin-csp-contract.json'] ||
    (await readFile(path.join(directory, 'admin-csp-contract.json'), 'utf8')) !==
      JSON.stringify(controlCspContract, null, 2) + '\n'
  )
    stop('BUNDLE_UNSAFE');
  return manifest;
}

export async function controlExecution(
  input,
  prepare = prepareControl,
  read = readControlBundle,
  workspace = root,
) {
  const target = input.bundle
    ? { directory: path.join(workspace, 'outputs/admin-deploy', input.bundle) }
    : null;
  if (target) target.manifest = await read(target.directory);
  const runner =
    input.mode === '--adopt-control'
      ? target
      : await prepare({
          services: ['management'],
          runnerOnly: ['--rollback', '--recover-control'].includes(input.mode),
        });
  runner.manifest = await read(runner.directory);
  return { runner, target };
}

export function controlReceipt(text, mode, runnerSourceSHA) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    stop('REMOTE_FAILED');
  }
  if (value?.outcome === 'restored-before-migration') {
    const expected = [
      'ok',
      'mode',
      'outcome',
      'release',
      'sourceSHA',
      'runnerSourceSHA',
      'migrationArtifactSha256',
      'controlEnabled',
      'internalHealthVerified',
      'restoredImages',
    ];
    if (
      mode !== 'recover' ||
      value.mode !== mode ||
      value.ok !== true ||
      value.controlEnabled !== false ||
      value.internalHealthVerified !== true ||
      Object.keys(value).sort().join(',') !== expected.sort().join(',') ||
      value.runnerSourceSHA !== runnerSourceSHA ||
      typeof value.sourceSHA !== 'string' ||
      !shaPattern.test(value.sourceSHA) ||
      typeof value.release !== 'string' ||
      !/^[a-z0-9-]{1,100}$/.test(value.release) ||
      typeof value.migrationArtifactSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.migrationArtifactSha256) ||
      !value.restoredImages ||
      Object.keys(value.restoredImages).sort().join(',') !== 'kart,management,runtime' ||
      Object.values(value.restoredImages).some(
        (image) => typeof image !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(image),
      )
    )
      stop('REMOTE_FAILED');
    return value;
  }
  const keys = [
    'ok',
    'mode',
    'runnerSourceSHA',
    'sourceSHA',
    'release',
    'services',
    'activeImages',
    'controlContract',
    'migrationArtifactSha256',
    'controlEnabled',
    'remoteConfigReused',
    'internalHealthVerified',
    'publicHtmlVerified',
    'anonymousSessionVerified',
    'oauthStartVerified',
    'realGithubLoginVerified',
    'backupSHA256',
    'oldStateSHA256',
  ];
  const contract = value?.controlContract;
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    value.mode !== mode ||
    value.runnerSourceSHA !== runnerSourceSHA ||
    typeof value.sourceSHA !== 'string' ||
    !shaPattern.test(value.sourceSHA) ||
    typeof value.release !== 'string' ||
    !/^[a-z0-9-]{1,100}$/.test(value.release) ||
    [
      'ok',
      'controlEnabled',
      'remoteConfigReused',
      'internalHealthVerified',
      'publicHtmlVerified',
      'anonymousSessionVerified',
      'oauthStartVerified',
    ].some((key) => value[key] !== true) ||
    value.realGithubLoginVerified !== false ||
    ['backupSHA256', 'oldStateSHA256', 'migrationArtifactSha256'].some(
      (key) => typeof value[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value[key]),
    ) ||
    !contract ||
    Array.isArray(contract) ||
    Object.keys(contract).sort().join(',') !==
      'metadataSha256,projectionSha256,schema,schemaVersion,version' ||
    contract.version !== 1 ||
    contract.schema !== 'game_control' ||
    contract.schemaVersion !== 3 ||
    ['projectionSha256', 'metadataSha256'].some(
      (key) => typeof contract[key] !== 'string' || !/^[a-f0-9]{64}$/.test(contract[key]),
    ) ||
    !value.activeImages ||
    Array.isArray(value.activeImages) ||
    Object.keys(value.activeImages).sort().join(',') !== 'kart,management,runtime' ||
    Object.values(value.activeImages).some(
      (image) => typeof image !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(image),
    ) ||
    JSON.stringify(value.services) !==
      JSON.stringify(['adopt', 'recover'].includes(mode) ? controlServices : ['management'])
  )
    stop('REMOTE_FAILED');
  return value;
}

export async function main(args = process.argv.slice(2), dependencies = {}) {
  const input = controlInput(args); // No legacy executionInput/OAuth reader on any CLI route.
  if (input.mode === '--help') {
    console.log(
      'pnpm deploy:admin --prepare-control | --adopt-control=<bundle> | --recover-control=<bundle> [--root-precondition] | --reuse-remote-config | --rollback\nprepare纯本地；root-precondition仅恢复已核实的2026-10-17首守卫故障；所有模式均不读取OAuth文件，旧001安装入口关闭。',
    );
    return;
  }
  const prepare = dependencies.prepare ?? prepareControl;
  if (input.mode === '--prepare-control') {
    const prepared = await prepare();
    console.log(
      JSON.stringify({
        prepared: true,
        release: prepared.manifest.release,
        sourceSHA: prepared.manifest.sourceSHA,
        directory: prepared.directory,
        remoteExecuted: false,
      }),
    );
    return prepared;
  }
  // Validate every local artifact before even a harmless SSH call.
  const { runner: prepared, target } = await controlExecution(
    input,
    prepare,
    dependencies.readBundle ?? readControlBundle,
  );
  const manifest = prepared.manifest;
  (dependencies.sameCandidate ?? sameCandidate)(manifest.sourceSHA);
  const execute = dependencies.run ?? run;
  const config = await (dependencies.loadConfig ?? loadConfig)();
  if (!config.host) stop('SSH_FAILED');
  if (config.key) {
    try {
      await stat(config.key);
    } catch {
      stop('SSH_FAILED');
    }
  }
  await execute('ssh', sshArguments(config, 'bash -s'), {
    stage: 'preflight',
    remote: true,
    timeout: 60000,
    input: `set -eu\ncommand -v docker >/dev/null\ncommand -v python3 >/dev/null\ndocker compose version >/dev/null\ntest -f '${config.caddyDirectory}/current/ingress.json'\ntest -L '${remoteRoot}/current'\n`,
  });
  const modes = {
    '--adopt-control': 'adopt',
    '--recover-control': 'recover',
    '--reuse-remote-config': 'reuse',
    '--rollback': 'rollback',
  };
  const mode = modes[input.mode];
  const releaseDir = await (dependencies.sendBundle ?? sendPublicBundle)(
    config,
    prepared.directory,
    manifest,
  );
  (dependencies.sameCandidate ?? sameCandidate)(manifest.sourceSHA);
  const payload = { caddyDirectory: config.caddyDirectory, sourceSHA: manifest.sourceSHA };
  if (mode === 'recover') {
    if (input.recoveryEvidence) payload.recoveryEvidence = input.recoveryEvidence;
    payload.targetRelease = target.manifest.release;
    payload.targetManifestSHA256 = createHash('sha256')
      .update(JSON.stringify(target.manifest, null, 2) + '\n')
      .digest('hex');
  }
  const text = await execute(
    'ssh',
    sshArguments(config, `python3 '${releaseDir}/control-deploy.py' --${mode}`),
    {
      stage: 'protected_remote_transaction',
      timeout: 2700000,
      remote: true,
      input: JSON.stringify(payload),
    },
  );
  const receipt = controlReceipt(text, mode, manifest.sourceSHA);
  if (
    receipt.migrationArtifactSha256 !== manifest.migrationArtifactSha256 ||
    (mode !== 'rollback' &&
      (receipt.sourceSHA !== (target?.manifest.sourceSHA ?? manifest.sourceSHA) ||
        receipt.release !== (target?.manifest.release ?? manifest.release)))
  )
    stop('REMOTE_FAILED');
  await writeFile(`${prepared.directory}.receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(
      `ADMIN_DEPLOY_STOPPED ${errors.has(error.message) ? error.message : 'UNEXPECTED_FAILURE'}`,
    );
    process.exitCode = 1;
  });
}
