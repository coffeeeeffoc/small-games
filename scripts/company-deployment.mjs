import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const root = fileURLToPath(new URL('../', import.meta.url));
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const directoryPattern = /^\/(?:[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_-]+$/;

export function companyConfig(env = {}) {
  const config = {
    domain: env.COMPANY_DOMAIN || 'nenggongzhiren.cn',
    www: env.COMPANY_WWW_DOMAIN || 'www.nenggongzhiren.cn',
    icp: env.COMPANY_ICP || '沪ICP备2026053115号-1',
    host: env.ECS_HOST || '',
    user: env.ECS_USER || 'ubuntu',
    port: env.ECS_SSH_PORT || '22',
    key: env.ECS_SSH_KEY || '',
    directory: env.COMPANY_DEPLOY_DIR || '/opt/small-games/company',
    caddyDirectory: env.CADDY_DEPLOY_DIR || '/opt/small-games/caddy',
  };
  assert(
    domainPattern.test(config.domain) && domainPattern.test(config.www),
    'Invalid company domain',
  );
  assert(config.domain !== config.www, 'The two company domains must differ');
  assert(
    /^沪ICP备\d+号-\d+$/.test(config.icp),
    'Provide the complete website ICP number, including -1',
  );
  assert(
    !config.host || /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(config.host),
    'Invalid ECS_HOST',
  );
  assert(/^[a-z_][a-z0-9_-]*$/.test(config.user), 'Invalid ECS_USER');
  assert(
    /^\d+$/.test(config.port) && +config.port > 0 && +config.port <= 65535,
    'Invalid ECS_SSH_PORT',
  );
  assert(directoryPattern.test(config.directory), 'Invalid COMPANY_DEPLOY_DIR');
  assert(directoryPattern.test(config.caddyDirectory), 'Invalid CADDY_DEPLOY_DIR');
  assert(
    !`${config.directory}/`.startsWith(`${config.caddyDirectory}/`) &&
      !`${config.caddyDirectory}/`.startsWith(`${config.directory}/`),
    'Website and Caddy directories must be separate',
  );
  return config;
}

export function toolEnvironment(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) =>
        !/SECRET|TOKEN|PASSWORD|_KEY$|DATABASE_URL|INTERNAL_KEY|^COS_|^ECS_|^COMPANY_|^CADDY_/i.test(
          name,
        ),
    ),
  );
}

export async function loadConfig() {
  let env = {};
  for (const filename of ['.env.tencent.local', '.env.company.local']) {
    try {
      env = { ...env, ...parseEnv(await readFile(path.join(root, filename), 'utf8')) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return companyConfig({ ...env, ...process.env });
}

export async function archiveBundle(destination) {
  const archive = `${destination}.tar.gz`;
  command('tar', ['-czf', archive, '-C', destination, '.']);
  const archiveHash = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  return { archive, archiveHash };
}

export async function uploadBundle(config, bundle, directory, arguments_) {
  const { archive, archiveHash, manifest } = bundle;
  const remoteArchive = `${directory}/incoming/${manifest.release}.tar.gz`;
  const releaseDir = `${directory}/releases/${manifest.release}`;
  ssh(config, `set -eu\numask 077\nmkdir -p '${directory}/incoming' '${directory}/releases'\n`);
  command('scp', [
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=15',
    '-o',
    'StrictHostKeyChecking=yes',
    ...(config.key ? ['-i', config.key] : []),
    '-P',
    config.port,
    archive,
    `${config.user}@${config.host}:${remoteArchive}`,
  ]);
  ssh(
    config,
    `set -eu\nprintf '%s  %s\\n' '${archiveHash}' '${remoteArchive}' | sha256sum -c -\nmkdir '${releaseDir}'\ntar -xzf '${remoteArchive}' -C '${releaseDir}'\nchmod -R a+rX '${releaseDir}'\nbash '${releaseDir}/deploy.sh' '${directory}' ${arguments_}\n`,
  );
}

export function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    env: toolEnvironment(),
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${path.basename(program)} failed (${result.status}): ${result.stderr || ''}`);
  return result.stdout?.trim();
}

export async function fileHashes(directory, prefix = '') {
  const result = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const relative = `${prefix}${entry.name}`;
    assert(!entry.isSymbolicLink(), `Symlinks are not allowed in a release: ${relative}`);
    assert(/^[a-zA-Z0-9_./-]+$/.test(relative), `Unexpected release filename: ${relative}`);
    if (entry.isDirectory())
      Object.assign(result, await fileHashes(path.join(directory, entry.name), `${relative}/`));
    else {
      assert(entry.isFile(), `Unexpected release entry: ${relative}`);
      result[relative] = createHash('sha256')
        .update(await readFile(path.join(directory, entry.name)))
        .digest('hex');
    }
  }
  return result;
}

export function ssh(config, script) {
  assert(config.host, 'Set ECS_HOST in .env.tencent.local or .env.company.local');
  return command(
    'ssh',
    [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=15',
      '-o',
      'ServerAliveInterval=15',
      '-o',
      'ServerAliveCountMax=3',
      '-o',
      'StrictHostKeyChecking=yes',
      ...(config.key ? ['-i', config.key] : []),
      '-p',
      config.port,
      `${config.user}@${config.host}`,
      'bash -s',
    ],
    { input: script, stdio: ['pipe', 'inherit', 'inherit'] },
  );
}
