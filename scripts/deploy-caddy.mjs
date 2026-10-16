import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  validateIngress,
  renderApiCaddy,
  renderIngressNginx,
  renderNginxCompose,
} from './competition-ingress.mjs';
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
${config.ingress ? renderApiCaddy(config.ingress) : ''}http:// {
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
    image: ${config.ingress ? validateIngress(config.ingress).caddyImage : 'caddy:2.11.7-alpine'}
    restart: unless-stopped
    read_only: true
    ports: ['80:80', '443:443']
    volumes:
      - ${config.directory}:${config.directory}:ro
      - ./caddy:/etc/caddy:ro
      - caddy_data:/data
      - caddy_config:/config
    tmpfs: ['/tmp']
${config.ingress ? `    networks:\n      default: {}\n      competition_ingress:\n        ipv4_address: ${config.ingress.network.caddyIp}\n` : ''}    healthcheck:
      test: ['CMD', 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1:8081/health']
      interval: 3s
      timeout: 2s
      retries: 20
    logging:
      driver: json-file
      options:
        max-size: '5m'
        max-file: '3'
${config.ingress ? `networks:\n  competition_ingress:\n    external: true\n    name: ${config.ingress.network.name}\n` : ''}volumes:
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
  if (config.ingress) {
    const ingress = validateIngress(config.ingress);
    await writeFile(
      path.join(destination, 'ingress.json'),
      JSON.stringify(ingress, null, 2) + '\n',
    );
    await mkdir(path.join(destination, 'nginx'));
    await writeFile(
      path.join(destination, 'nginx/00-legacy.conf'),
      'include /etc/nginx/legacy/*.conf;\n',
    );
    await writeFile(
      path.join(destination, 'nginx/10-competition-ingress.conf'),
      renderIngressNginx(ingress),
    );
    await writeFile(path.join(destination, 'nginx-compose.yaml'), renderNginxCompose(ingress));
    await writeFile(
      path.join(destination, 'nginx-rollback.yaml'),
      renderNginxCompose(ingress, { legacy: true }),
    );
  }
  const manifest = {
    release,
    sourceSha: sha,
    createdAt: new Date().toISOString(),
    domains: [config.domain, config.www, ...(config.ingress ? [config.ingress.domain] : [])],
  };
  await writeFile(path.join(destination, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const name of [
    'deploy.sh',
    'backup.py',
    'company-caddy-backup.service',
    'company-caddy-backup.timer',
    ...(config.ingress ? ['ingress.py'] : []),
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
  const parsedArgs = parseCaddyArgs(args);
  if (args.includes('--help')) {
    console.log(
      'pnpm deploy:caddy            Deploy independent Caddy and local daily backups\npnpm deploy:caddy --prepare  Package only\npnpm deploy:caddy --check    Read-only container and volume checks\nUse pnpm deploy:company for ordinary website updates.',
    );
    return;
  }
  const config = await loadConfig();
  // A read failure is fatal: never turn an existing API off because SSH/config was unavailable.
  const active = config.host ? readActiveIngress(config) : null;
  config.ingress = chooseIngress(
    active,
    parsedArgs.ingress ? JSON.parse(await readFile(parsedArgs.ingress, 'utf8')) : null,
  );
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
    'scripts/competition-ingress.mjs',
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

export function parseCaddyArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === '--ingress') {
      assert(
        !result.ingress && args[i + 1] && !args[i + 1].startsWith('--'),
        'Provide one ingress JSON path',
      );
      result.ingress = args[++i];
    } else {
      assert(
        ['--check', '--prepare', '--help'].includes(argument) && !result.action,
        'Use deploy:caddy [--check|--prepare|--help] [--ingress path.json]',
      );
      result.action = argument;
    }
  }
  return result;
}

export function chooseIngress(active, requested) {
  const previous = active ? validateIngress(active) : null;
  const next = requested ? validateIngress(requested) : previous;
  if (previous && requested)
    assert.deepEqual(
      next,
      previous,
      'Active topology changes require a separate reviewed migration',
    );
  return next;
}

export function readActiveIngress(config) {
  const output = ssh(
    config,
    `set -eu\ncurrent='${config.caddyDirectory}/current'\nif [ -e "$current/ingress.json" ]; then\n  cat "$current/ingress.json"\nelse\n  if [ -e '/opt/small-games/ingress-managed' ] || [ -L '/opt/small-games/ingress-managed' ]; then\n    echo 'Managed ingress state is incomplete; inspect its transaction journal.' >&2; exit 1\n  fi\n  printf 'null\\n'\nfi\n`,
    { capture: true },
  );
  return JSON.parse(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Caddy deployment stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
