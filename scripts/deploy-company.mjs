import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { pnpmInvocation } from './validate-push.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const templateDir = path.join(root, 'infra/company');
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
    tls: env.COMPANY_TLS_DIR || '/opt/small-games/certs/company',
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
  assert(directoryPattern.test(config.tls), 'Invalid COMPANY_TLS_DIR');
  assert(
    config.directory !== config.tls && !config.tls.startsWith(`${config.directory}/`),
    'Certificates must be outside the release directory',
  );
  return config;
}

export function toolEnvironment(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) =>
        !/SECRET|TOKEN|PASSWORD|_KEY$|DATABASE_URL|INTERNAL_KEY|^COS_|^ECS_|^COMPANY_/i.test(name),
    ),
  );
}

function command(program, args, options = {}) {
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

export function renderNginx(config) {
  return `server {
    listen 80 default_server;
    server_name _;
    return 404;
}
server {
    listen 80;
    server_name ${config.domain} ${config.www};
    return 308 https://$host$request_uri;
}
server {
    listen 443 ssl default_server;
    ssl_reject_handshake on;
}
server {
    listen 443 ssl;
    server_name ${config.domain} ${config.www};
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    root /usr/share/nginx/html;
    index index.html;
    server_tokens off;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    location / {
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-cache";
    }
    location ~ /\\. { deny all; }
}
server {
    listen 8081;
    server_name localhost;
    root /usr/share/nginx/html;
    location = /release.json { }
    location / { return 404; }
}
`;
}

export function renderCompose(config) {
  return `name: company-web
services:
  web:
    image: nginx:1.28-alpine
    restart: unless-stopped
    entrypoint: ['nginx', '-g', 'daemon off;']
    read_only: true
    ports: ['80:80', '443:443']
    volumes:
      - ./site:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ${config.tls}:/etc/nginx/certs:ro
    tmpfs: ['/var/cache/nginx', '/var/run', '/tmp']
    healthcheck:
      test: ['CMD', 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1:8081/release.json']
      interval: 3s
      timeout: 2s
      retries: 20
    logging:
      driver: json-file
      options:
        max-size: '5m'
        max-file: '3'
`;
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

export async function writeBundle(destination, source, config, sha, release) {
  assert(/^[a-f0-9]{40}$/.test(sha) && /^[a-z0-9-]+$/.test(release), 'Invalid release identity');
  const html = await readFile(path.join(source, 'index.html'), 'utf8');
  assert(
    html.includes(config.icp) && html.includes('https://beian.miit.gov.cn/'),
    'The built ICP footer does not match COMPANY_ICP',
  );
  // Copy only the public build. No repository env files, SSH keys, TLS keys or backend files.
  const files = await fileHashes(source);
  assert(
    !Object.keys(files).some((name) => /(?:^|\/)\.|\.(?:pem|key|map)$/i.test(name)),
    'Unexpected private/debug file in website output',
  );
  await mkdir(destination, { recursive: false });
  await cp(source, path.join(destination, 'site'), { recursive: true });
  const manifest = {
    release,
    sourceSha: sha,
    createdAt: new Date().toISOString(),
    domains: [config.domain, config.www],
    icp: config.icp,
    files,
  };
  await writeFile(
    path.join(destination, 'site/release.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  await writeFile(path.join(destination, 'nginx.conf'), renderNginx(config));
  await writeFile(path.join(destination, 'compose.yaml'), renderCompose(config));
  await writeFile(
    path.join(destination, 'deploy.sh'),
    (await readFile(path.join(templateDir, 'deploy.sh'), 'utf8')).replaceAll('\r\n', '\n'),
  );
  const hashes = await fileHashes(destination);
  await writeFile(
    path.join(destination, 'SHA256SUMS'),
    Object.entries(hashes)
      .map(([file, hash]) => `${hash}  ${file}`)
      .join('\n') + '\n',
  );
  return manifest;
}

function ssh(config, script) {
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

export function remoteCheck(config) {
  return `set -eu
for executable in docker curl openssl getent ss flock sha256sum tar; do command -v "$executable" >/dev/null; done
docker compose version
docker ps --format '{{.Names}} {{.Ports}}'
test -d '${path.posix.dirname(config.directory)}' && test -w '${path.posix.dirname(config.directory)}'
if [ -d '${config.directory}' ]; then test -w '${config.directory}'; fi
expected=$(getent ahostsv4 '${config.host}' | awk '{print $1}' | sort -u)
test -n "$expected"
for domain in '${config.domain}' '${config.www}'; do
  resolved=$(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u)
  test -n "$resolved" || { printf 'Missing DNS A record: %s\\n' "$domain" >&2; exit 1; }
  [ "$resolved" = "$expected" ] || { printf 'DNS does not point exclusively to this server: %s (%s)\\n' "$domain" "$resolved" >&2; exit 1; }
done
test -r '${config.tls}/fullchain.pem' && test -r '${config.tls}/privkey.pem' || { echo 'Missing readable company fullchain.pem / privkey.pem' >&2; exit 1; }
openssl x509 -in '${config.tls}/fullchain.pem' -noout -checkend 604800
openssl x509 -in '${config.tls}/fullchain.pem' -noout -checkhost '${config.domain}' | grep -F 'does match certificate'
openssl x509 -in '${config.tls}/fullchain.pem' -noout -checkhost '${config.www}' | grep -F 'does match certificate'
cert_key=$(openssl x509 -in '${config.tls}/fullchain.pem' -pubkey -noout | openssl sha256)
private_key=$(openssl pkey -in '${config.tls}/privkey.pem' -passin pass: -pubout | openssl sha256)
[ "$cert_key" = "$private_key" ] || { echo 'TLS certificate/key mismatch' >&2; exit 1; }
echo 'Company SSH, DNS and certificate checks passed. Public firewall reachability is checked after deployment.'
`;
}

async function prepare(config) {
  const relevant = [
    'apps/company-web',
    'scripts/deploy-company.mjs',
    'infra/company',
    'package.json',
    'pnpm-lock.yaml',
  ];
  const dirty = command('git', ['status', '--porcelain', '--', ...relevant], { capture: true });
  assert(!dirty, 'Commit website/deployment changes before preparing an identifiable release.');
  const sha = command('git', ['rev-parse', 'HEAD'], { capture: true });
  const pnpm = pnpmInvocation();
  command(pnpm.command, [...pnpm.prefix, '--filter', '@coffeeeeffoc/company-web', 'test']);
  assert.equal(
    command('git', ['rev-parse', 'HEAD'], { capture: true }),
    sha,
    'HEAD changed while building',
  );
  assert(
    !command('git', ['status', '--porcelain', '--', ...relevant], { capture: true }),
    'Sources changed while building',
  );
  const release = `${new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14)}-${sha.slice(0, 12)}-${randomBytes(3).toString('hex')}`;
  const output = path.join(root, 'outputs/company-deploy');
  await mkdir(output, { recursive: true });
  const destination = path.join(output, release);
  const manifest = await writeBundle(
    destination,
    path.join(root, 'apps/company-web/dist'),
    config,
    sha,
    release,
  );
  const archive = `${destination}.tar.gz`;
  command('tar', ['-czf', archive, '-C', destination, '.']);
  const archiveHash = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  await writeFile(`${archive}.sha256`, `${archiveHash}  ${path.basename(archive)}\n`);
  console.log(`Prepared ${archive}\nsource=${sha}\nsha256=${archiveHash}`);
  return { archive, archiveHash, manifest };
}

export async function main(args = process.argv.slice(2)) {
  assert(
    args.length <= 1 &&
      args.every((arg) => ['--check', '--prepare', '--rollback', '--help'].includes(arg)),
    'Use pnpm deploy:company [--check|--prepare|--rollback|--help]',
  );
  if (args.includes('--help')) {
    console.log(
      'pnpm deploy:company            Build, test, upload, deploy HTTPS and verify both domains\npnpm deploy:company --prepare  Build/test/package only, no server changes\npnpm deploy:company --check    Read-only SSH/DNS/TLS checks\npnpm deploy:company --rollback Restore the previous company release\nConfiguration: .env.tencent.local (SSH fallback), .env.company.local, environment (highest priority)',
    );
    return;
  }
  let env = {};
  for (const filename of ['.env.tencent.local', '.env.company.local']) {
    try {
      env = { ...env, ...parseEnv(await readFile(path.join(root, filename), 'utf8')) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const config = companyConfig({ ...env, ...process.env });
  if (args.includes('--prepare')) {
    await prepare(config);
    return;
  }
  if (config.key) await stat(config.key);
  if (args.includes('--rollback')) {
    ssh(
      config,
      `set -eu\nbash '${config.directory}/current/deploy.sh' '${config.directory}' rollback '${config.domain}' '${config.www}'\n`,
    );
    return;
  }
  ssh(config, remoteCheck(config));
  if (args.includes('--check')) return;
  const { archive, archiveHash, manifest } = await prepare(config);
  const remoteArchive = `${config.directory}/incoming/${manifest.release}.tar.gz`;
  ssh(
    config,
    `set -eu\numask 077\nmkdir -p '${config.directory}/incoming' '${config.directory}/releases'\n`,
  );
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
  const releaseDir = `${config.directory}/releases/${manifest.release}`;
  ssh(
    config,
    `set -eu\nprintf '%s  %s\\n' '${archiveHash}' '${remoteArchive}' | sha256sum -c -\nmkdir '${releaseDir}'\ntar -xzf '${remoteArchive}' -C '${releaseDir}'\nchmod -R a+rX '${releaseDir}'\nbash '${releaseDir}/deploy.sh' '${config.directory}' deploy '${config.domain}' '${config.www}'\n`,
  );
  for (const domain of [config.domain, config.www]) {
    const response = await fetch(`https://${domain}/release.json`, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
    assert(
      response.ok,
      `Public verification failed: ${domain} HTTP ${response.status}; remote health passed, check DNS/firewall`,
    );
    assert.equal(
      (await response.json()).release,
      manifest.release,
      `Public release mismatch: ${domain}`,
    );
  }
  console.log(
    `Company deployed and publicly verified: https://${config.domain}/ and https://${config.www}/ (${manifest.release})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Company deployment stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
