import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileHashes, loadConfig, root } from './company-deployment.mjs';
import { prepareSelectedBackend } from './deployment-bundle.mjs';
import { selectedBackendBuildCommands } from './backend-build.mjs';
import { deploymentCommand } from './deployment-progress.mjs';
import { pnpmInvocation } from './validate-push.mjs';

export const ADMIN_ORIGIN = 'https://admin.nenggongzhiren.cn';
export const ADMIN_CALLBACK = `${ADMIN_ORIGIN}/api/auth/github/callback`;
export const ADMIN_EMAIL = '1521152077@qq.com';
const remoteRoot = '/opt/small-games/admin-console';
const shaPattern = /^[a-f0-9]{40}$/;
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

async function sendPublicBundle(config, directory, manifest) {
  const archive = `${directory}.tar.gz`;
  await run('tar', ['-czf', archive, '-C', directory, '.'], { stage: 'archive' });
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

export async function main(args = process.argv.slice(2)) {
  const input = await executionInput(args);
  if (input.mode === '--help') {
    console.log(
      'pnpm deploy:admin [--execute|--provision-only|--rollback]\n仅用户本人执行默认入口读取 .env.admin.local；provision-only/rollback 不读取 OAuth 文件。',
    );
    return;
  }
  const config = await loadConfig();
  if (!config.host) stop('SSH_FAILED');
  if (config.key)
    try {
      await stat(config.key);
    } catch {
      stop('SSH_FAILED');
    }
  // Harmless prerequisites fail before candidate builds or remote filesystem writes.
  await run('ssh', sshArguments(config, 'bash -s'), {
    stage: 'preflight',
    timeout: 60000,
    remote: true,
    input: `set -eu\ncommand -v docker >/dev/null\ncommand -v python3 >/dev/null\ndocker compose version >/dev/null\ntest -w '/opt/small-games'\ntest -f '${config.caddyDirectory}/current/ingress.json'\ntest -L '/opt/small-games/backend-current'\n${input.mode === '--execute' ? `web=$(docker ps -q --filter label=com.docker.compose.project=company-web --filter label=com.docker.compose.service=web)\ntest "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/opt/small-games/admin-console"}}{{.Source}} {{.RW}}{{end}}{{end}}' "$web")" = '/opt/small-games/admin-console false' || { printf 'ADMIN_REMOTE_STOPPED UI_MOUNT_REQUIRED\\n' >&2; exit 1; }\n` : ''}`,
  });
  if (input.mode === '--rollback') {
    const text = await run(
      'ssh',
      sshArguments(config, `python3 '${remoteRoot}/current/deploy.py' --rollback`),
      {
        stage: 'rollback',
        timeout: 600000,
        remote: true,
        input: JSON.stringify({ caddyDirectory: config.caddyDirectory }),
      },
    );
    console.log(JSON.stringify(remoteReceipt(text, input.mode)));
    return;
  }
  const head = git(['rev-parse', 'HEAD']);
  if (!shaPattern.test(head)) stop('HEAD_CHANGED');
  sameCandidate(head);
  console.log('ADMIN_SCOPE admin-web,management quality_checks=not-run');
  const provisionOnly = input.mode === '--provision-only';
  if (!provisionOnly) {
    for (const command of [
      ...(await selectedBackendBuildCommands(['management'], root)),
      ['--filter', '@coffeeeeffoc/admin-web', 'build'],
    ]) {
      const pnpm = pnpmInvocation(childEnvironment());
      await run(pnpm.command, [...pnpm.prefix, ...command], {
        stage: `build_${command[1].split('/').at(-1).replaceAll('-', '_')}`,
        timeout: 300000,
      });
    }
  }
  sameCandidate(head);
  const release = `${head.slice(0, 12)}-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const parent = path.join(root, 'outputs/admin-deploy');
  await mkdir(parent, { recursive: true });
  const directory = path.join(parent, release);
  const manifest = await writeAdminBundle(directory, { head, release, provisionOnly });
  const releaseDir = await sendPublicBundle(config, directory, manifest);
  sameCandidate(head);
  console.log('ADMIN_STAGE protected_remote_transaction');
  const text = await run(
    'ssh',
    sshArguments(config, `python3 '${releaseDir}/deploy.py' ${input.mode}`),
    {
      stage: 'protected_remote_transaction',
      timeout: 2700000,
      remote: true,
      input: JSON.stringify({
        caddyDirectory: config.caddyDirectory,
        sourceSHA: head,
        oauth: input.oauth,
      }),
    },
  );
  const receipt = remoteReceipt(text, input.mode);
  if (receipt.sourceSHA !== head) stop('REMOTE_FAILED');
  await writeFile(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(
      `ADMIN_DEPLOY_STOPPED ${errors.has(error.message) ? error.message : 'UNEXPECTED_FAILURE'}`,
    );
    process.exitCode = 1;
  });
}
