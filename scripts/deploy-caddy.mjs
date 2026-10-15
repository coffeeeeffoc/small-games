import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  root,
  command,
  fileHashes,
  loadConfig,
  archiveBundle,
  uploadBundle,
  ssh,
} from './company-deployment.mjs';

export function renderCaddy(config) {
  return `${config.domain} {
    root * ${config.directory}/current/site
    header X-Content-Type-Options nosniff
    header Referrer-Policy strict-origin-when-cross-origin
    header Cache-Control no-cache
    file_server {
        hide .*
    }
}
${config.www} {
    redir https://${config.domain}{uri} permanent
}
http:// {
    respond 404
}
http://:8081 {
    bind 127.0.0.1
    respond /health "Caddy OK" 200
}
`;
}

export function renderCompose(config) {
  return `name: company-web
services:
  web:
    image: caddy:2.11.7-alpine
    restart: unless-stopped
    read_only: true
    ports: ['80:80', '443:443']
    volumes:
      - ${config.directory}:${config.directory}:ro
      - ./caddy:/etc/caddy:ro
      - caddy_data:/data
      - caddy_config:/config
    tmpfs: ['/tmp']
    healthcheck:
      test: ['CMD', 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1:8081/health']
      interval: 3s
      timeout: 2s
      retries: 20
    logging:
      driver: json-file
      options:
        max-size: '5m'
        max-file: '3'
volumes:
  caddy_data:
    external: true
    name: company-web_caddy_data
  caddy_config:
    external: true
    name: company-web_caddy_config
`;
}

export async function writeCaddyBundle(destination, config, sha, release) {
  assert(/^[a-f0-9]{40}$/.test(sha) && /^[a-z0-9-]+$/.test(release), 'Invalid release identity');
  await mkdir(destination, { recursive: false });
  await mkdir(path.join(destination, 'caddy'));
  await writeFile(path.join(destination, 'caddy/Caddyfile'), renderCaddy(config));
  await writeFile(path.join(destination, 'compose.yaml'), renderCompose(config));
  await writeFile(path.join(destination, 'website-directory'), config.directory + '\n');
  const manifest = {
    release,
    sourceSha: sha,
    createdAt: new Date().toISOString(),
    domains: [config.domain, config.www],
  };
  await writeFile(path.join(destination, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const name of [
    'deploy.sh',
    'backup.py',
    'company-caddy-backup.service',
    'company-caddy-backup.timer',
  ]) {
    const body = (await readFile(path.join(root, 'infra/caddy', name), 'utf8'))
      .replaceAll('\r\n', '\n')
      .replaceAll('@CADDY_DEPLOY_DIR@', config.caddyDirectory);
    await writeFile(path.join(destination, name), body);
  }
  await writeFile(
    path.join(destination, 'SHA256SUMS'),
    Object.entries(await fileHashes(destination))
      .map(([file, hash]) => `${hash}  ${file}`)
      .join('\n') + '\n',
  );
  return manifest;
}

export function backupInstall(config) {
  return `set -eu
release=$(readlink -f '${config.caddyDirectory}/current')
cd "$release"
sha256sum -c SHA256SUMS
sudo install -d -m 700 /var/backups/company-caddy
sudo install -d -m 755 /usr/local/lib/company-caddy-backup
sudo install -m 644 backup.py /usr/local/lib/company-caddy-backup/backup.py
sudo install -m 644 company-caddy-backup.service company-caddy-backup.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/company-caddy-backup.service /etc/systemd/system/company-caddy-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now company-caddy-backup.timer
sudo systemctl start company-caddy-backup.service
sudo systemctl show company-caddy-backup.service -p Result -p ExecMainStatus
systemctl list-timers company-caddy-backup.timer --all --no-pager
`;
}

export async function main(args = process.argv.slice(2)) {
  assert(
    args.length <= 1 && args.every((arg) => ['--check', '--prepare', '--help'].includes(arg)),
    'Use pnpm deploy:caddy [--check|--prepare|--help]',
  );
  if (args.includes('--help')) {
    console.log(
      'pnpm deploy:caddy            Deploy independent Caddy and local daily backups\npnpm deploy:caddy --prepare  Package only\npnpm deploy:caddy --check    Read-only container and volume checks\nUse pnpm deploy:company for ordinary website updates.',
    );
    return;
  }
  const config = await loadConfig();
  if (args.includes('--check')) {
    ssh(
      config,
      `set -eu\ndocker compose version\ndocker ps --format '{{.Names}} {{.Ports}}'\ndocker volume inspect company-web_caddy_data company-web_caddy_config --format '{{.Name}} {{.Driver}}'\ntest -f '${config.directory}/current/site/release.json'\n`,
    );
    return;
  }
  const relevant = [
    'scripts/company-deployment.mjs',
    'scripts/deploy-caddy.mjs',
    'infra/caddy',
    'package.json',
  ];
  assert(
    !command('git', ['status', '--porcelain', '--', ...relevant], { capture: true }),
    'Commit Caddy changes before preparing an identifiable release.',
  );
  const sha = command('git', ['rev-parse', 'HEAD'], { capture: true });
  const release = `${new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14)}-${sha.slice(0, 12)}-${randomBytes(3).toString('hex')}`;
  const output = path.join(root, 'outputs/caddy-deploy');
  await mkdir(output, { recursive: true });
  const destination = path.join(output, release);
  const manifest = await writeCaddyBundle(destination, config, sha, release);
  assert.equal(
    command('git', ['rev-parse', 'HEAD'], { capture: true }),
    sha,
    'HEAD changed while preparing Caddy',
  );
  assert(
    !command('git', ['status', '--porcelain', '--', ...relevant], { capture: true }),
    'Caddy sources changed while preparing',
  );
  const bundle = { ...(await archiveBundle(destination)), manifest };
  console.log(`Prepared ${bundle.archive}\nsource=${sha}\nsha256=${bundle.archiveHash}`);
  if (args.includes('--prepare')) return;
  await uploadBundle(
    config,
    bundle,
    config.caddyDirectory,
    `'${config.directory}' '${config.domain}' '${config.www}'`,
  );
  ssh(config, backupInstall(config));
  console.log(
    'Independent Caddy and private daily backups deployed. Ordinary website releases no longer update this container.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Caddy deployment stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
