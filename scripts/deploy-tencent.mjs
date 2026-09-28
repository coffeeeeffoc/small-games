import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const templates = path.join(root, 'infra/tencent');

export function deploymentConfig(env) {
  const config = {
    ECS_SSH_PORT: '22',
    ECS_DEPLOY_DIR: '/opt/small-games',
    ECS_TLS_DIR: '/opt/small-games/certs',
    COS_PREFIX: 'small-games',
    COS_PYTHON: 'python',
    ...env,
  };
  const patterns = {
    ECS_HOST: /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/,
    ECS_USER: /^[a-z_][a-z0-9_-]*$/,
    GAME_DOMAIN: /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/,
    COS_BUCKET: /^[a-z0-9][a-z0-9-]*-[0-9]+$/,
    COS_REGION: /^[a-z]+-[a-z]+(?:-[0-9]+)?$/,
    COS_PREFIX: /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/,
    ECS_DEPLOY_DIR: /^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/,
    ECS_TLS_DIR: /^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/,
    POSTGRES_PASSWORD: /^[a-f0-9]{64}$/,
    RUNTIME_DB_PASSWORD: /^[a-f0-9]{64}$/,
    COMPETITION_INTERNAL_KEY: /^[a-f0-9]{64}$/,
    COS_SECRET_ID: /^[^\r\n]+$/,
    COS_SECRET_KEY: /^[^\r\n]+$/,
  };
  const invalid = Object.entries(patterns)
    .filter(([key, pattern]) => !pattern.test(config[key] || ''))
    .map(([key]) => key);
  if (
    !/^\d+$/.test(config.ECS_SSH_PORT) ||
    +config.ECS_SSH_PORT < 1 ||
    +config.ECS_SSH_PORT > 65535
  )
    invalid.push('ECS_SSH_PORT');
  if (invalid.length)
    throw new Error(
      `Missing/invalid variables: ${invalid.join(', ')}. See infra/tencent/.env.example`,
    );
  config.COS_HOST = `${config.COS_BUCKET}.cos.${config.COS_REGION}.myqcloud.com`;
  return config;
}

export function renderNginx(template, config, release) {
  if (!/^[a-z0-9-]+$/.test(release)) throw new Error('Invalid release ID');
  const values = { ...config, RELEASE_ID: release };
  return template.replace(/\$\{([A-Z_]+)\}/g, (_, key) => {
    if (values[key] === undefined) throw new Error(`Unknown template variable: ${key}`);
    return values[key];
  });
}

async function run(command, args, { cwd = root, env = process.env } = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.once('error', () =>
      reject(new Error(`Cannot start ${path.basename(command)}; check local prerequisites.`)),
    );
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed (${code})`)),
    );
  });
}

// No COS/database secrets in build tools, tar, SSH or Docker's build context.
function toolEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(COS_|POSTGRES_PASSWORD$|RUNTIME_DB_PASSWORD$|COMPETITION_INTERNAL_KEY$|STUDIO_ADMIN_PASSWORD$|ARTIFACT_SIGNING_PRIVATE_KEY$)/.test(
          key,
        ),
    ),
  );
}

async function pnpm(args) {
  if (!process.env.npm_execpath)
    throw new Error('Run with pnpm deploy:tencent so the pinned pnpm executable is available.');
  await run(process.execPath, [process.env.npm_execpath, ...args], { env: toolEnvironment() });
}

export async function prepareSite(source, destination) {
  await cp(source, destination, { recursive: true, dereference: false });
  const config =
    '<script data-tencent-runtime>globalThis.__COMPETITION_CONFIG__=Object.assign({},globalThis.__COMPETITION_CONFIG__,{apiUrl:location.origin+"/api/competition/v1"});globalThis.__kartServerUrl="wss://"+location.host+"/kart";</script>';
  let pages = 0;
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Static release must not contain symlinks');
      if (entry.isDirectory()) await visit(filename);
      else if (entry.name.endsWith('.html')) {
        const html = await readFile(filename, 'utf8');
        if (!/<head(?:\s[^>]*)?>/i.test(html)) throw new Error(`Missing HTML head: ${filename}`);
        await writeFile(
          filename,
          html.replace(/<head(?:\s[^>]*)?>/i, (head) => head + config),
        );
        pages++;
      }
    }
  }
  await stat(path.join(destination, 'index.html'));
  await visit(destination);
  return pages;
}

export async function prepareBackend(destination, workspace = root) {
  const copy = async (name) => {
    const target = path.join(destination, name);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(workspace, name), target, { recursive: true });
  };
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) await copy(name);
  // Preserve all workspace manifests for frozen-lockfile validation, but never ship all game assets.
  for (const group of [
    'apps',
    'packages',
    'platforms',
    'services',
    'tools',
    'games/local',
    'games/submodules',
  ]) {
    let entries;
    try {
      entries = await readdir(path.join(workspace, group), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries.filter((item) => item.isDirectory())) {
      try {
        await copy(`${group}/${entry.name}/package.json`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  for (const name of [
    'ad-config',
    'content-schema',
    'game-artifact',
    'game-contract',
    'release-contract',
    'service-kit',
  ])
    await copy(`packages/${name}/dist`);
  for (const name of [
    'services/runtime-api/dist',
    'services/runtime-api/rules',
    'services/kart-server/src',
    'games/local/carding-car/assets/scripts',
    'games/local/cops-robbers/src',
    'games/local/cops-robbers-realtime/src',
    'games/local/letters-words2/engine.js',
    'games/local/vibeJam-myself-history-guess/src',
    'games/local/vibeJam-myself-history-guess/public',
    'games/submodules/xiangqi-five/game.js',
  ])
    await copy(name);
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (args.includes('--help')) {
    console.log(
      'pnpm deploy:tencent [--check | --prepare]\nReads .env.tencent.local (environment overrides file). Default: build, upload COS, deploy over SSH.',
    );
    return;
  }
  if (args.some((arg) => !['--check', '--prepare'].includes(arg)) || args.length > 1)
    throw new Error('Use --check, --prepare, or no arguments.');
  let local = {};
  try {
    local = parseEnv(await readFile(path.join(root, '.env.tencent.local'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const config = deploymentConfig({ ...local, ...process.env });
  if (config.ECS_SSH_KEY) await stat(config.ECS_SSH_KEY);
  if (args.includes('--check')) {
    console.log(
      `Configuration OK: https://${config.GAME_DOMAIN}, COS ${config.COS_BUCKET}/${config.COS_PREFIX}, SSH ${config.ECS_USER}@${config.ECS_HOST}. No remote requests made.`,
    );
    return;
  }
  const sshOptions = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new'];
  if (config.ECS_SSH_KEY) sshOptions.push('-i', config.ECS_SSH_KEY);
  const remote = `${config.ECS_USER}@${config.ECS_HOST}`;
  const ssh = (command) =>
    run('ssh', [...sshOptions, '-p', config.ECS_SSH_PORT, remote, command], {
      env: toolEnvironment(),
    });
  if (!args.includes('--prepare')) {
    await run(config.COS_PYTHON, ['-c', 'import qcloud_cos'], { env: toolEnvironment() });
    await ssh('docker compose version');
  }
  const release = `${new Date().toISOString().replace(/[-:.]/g, '').toLowerCase()}-${randomBytes(4).toString('hex')}`;
  const stage = path.join(root, '.scratch/tencent', release);
  const bundle = path.join(stage, 'server');
  await mkdir(path.join(bundle, 'nginx'), { recursive: true, mode: 0o700 });
  await mkdir(path.join(bundle, 'migrations'), { recursive: true });
  await pnpm(['check:games']);
  await pnpm(['build:pages']);
  await pnpm(['check:games', '--artifacts']);
  await pnpm([
    'exec',
    'turbo',
    'run',
    'build',
    '--filter=@coffeeeeffoc/runtime-api...',
    '--concurrency=1',
  ]);
  await pnpm(['--filter', '@coffeeeeffoc/kart-server', 'typecheck']);
  const pages = await prepareSite(path.join(root, 'apps/shell-web/dist'), path.join(stage, 'site'));
  await prepareBackend(path.join(bundle, 'backend'));
  for (const file of ['Dockerfile', 'compose.yaml', 'bootstrap.sql', 'deploy.sh'])
    await cp(path.join(templates, file), path.join(bundle, file));
  for (const file of ['010-competition.sql', '011-competition-profiles.sql'])
    await cp(path.join(root, 'infra/migrations', file), path.join(bundle, 'migrations', file));
  await writeFile(
    path.join(bundle, 'nginx/game.conf'),
    renderNginx(
      await readFile(path.join(templates, 'nginx.conf.template'), 'utf8'),
      config,
      release,
    ),
  );
  const serverConfig = Object.fromEntries(
    [
      'ECS_DEPLOY_DIR',
      'ECS_TLS_DIR',
      'GAME_DOMAIN',
      'POSTGRES_PASSWORD',
      'RUNTIME_DB_PASSWORD',
      'COMPETITION_INTERNAL_KEY',
    ].map((key) => [key, config[key]]),
  );
  serverConfig.RELEASE_ID = release;
  // All values above are restricted to shell/Compose-safe characters by deploymentConfig.
  await writeFile(
    path.join(bundle, '.env'),
    Object.entries(serverConfig)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  // Keep server runtime secrets out of the Docker build context even though they travel over SSH.
  await writeFile(path.join(bundle, '.dockerignore'), '*\n!Dockerfile\n!backend/\n!backend/**\n');
  console.log(`Prepared ${pages} HTML pages and server bundle: ${stage}`);
  if (args.includes('--prepare')) return;
  const uploadEnv = { ...toolEnvironment() };
  for (const key of [
    'COS_REGION',
    'COS_BUCKET',
    'COS_PREFIX',
    'COS_SECRET_ID',
    'COS_SECRET_KEY',
    'COS_SESSION_TOKEN',
  ])
    if (config[key]) uploadEnv[key] = config[key];
  await run(
    config.COS_PYTHON,
    [path.join(templates, 'upload.py'), path.join(stage, 'site'), release],
    { env: uploadEnv },
  );
  const archive = path.join(stage, 'server.tar.gz');
  await run('tar', ['-czf', archive, '-C', bundle, '.'], { env: toolEnvironment() });
  const remoteDirectory = `${config.ECS_DEPLOY_DIR}/releases/${release}`;
  await ssh(`umask 077 && mkdir -p '${remoteDirectory}'`);
  await run(
    'scp',
    [
      ...sshOptions,
      '-P',
      config.ECS_SSH_PORT,
      archive,
      `${remote}:${remoteDirectory}/server.tar.gz`,
    ],
    { env: toolEnvironment() },
  );
  await ssh(
    `cd '${remoteDirectory}' && umask 077 && tar -xzf server.tar.gz && chmod 600 .env && bash deploy.sh`,
  );
  console.log(`Deployment complete: https://${config.GAME_DOMAIN}/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
