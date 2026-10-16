import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pnpmInvocation } from './validate-push.mjs';

import {
  root,
  command,
  fileHashes,
  ssh,
  loadConfig,
  uploadBundle,
  archiveBundle,
  sshProgress,
} from './company-deployment.mjs';
import { deploymentCommand } from './deployment-progress.mjs';
import { toolEnvironment } from './company-deployment.mjs';
export { companyConfig, toolEnvironment, fileHashes } from './company-deployment.mjs';
const templateDir = path.join(root, 'infra/company');
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

export function remoteCheck(config) {
  return `set -eu
for executable in docker curl openssl getent ss flock sha256sum tar; do command -v "$executable" >/dev/null; done
docker compose version
docker ps --format '{{.Names}} {{.Ports}}'
test -d '${path.posix.dirname(config.directory)}' && test -w '${path.posix.dirname(config.directory)}'
if [ -d '${config.directory}' ]; then test -w '${config.directory}'; fi
test "$(cat '${config.caddyDirectory}/current/website-directory')" = '${config.directory}' || { echo 'Deploy independent Caddy first.' >&2; exit 1; }
expected=$(getent ahostsv4 '${config.host}' | awk '{print $1}' | sort -u)
test -n "$expected"
for domain in '${config.domain}' '${config.www}'; do
  resolved=$(getent ahostsv4 "$domain" | awk '{print $1}' | sort -u)
  test -n "$resolved" || { printf 'Missing DNS A record: %s\\n' "$domain" >&2; exit 1; }
  [ "$resolved" = "$expected" ] || { printf 'DNS does not point exclusively to this server: %s (%s)\\n' "$domain" "$resolved" >&2; exit 1; }
done
echo 'Company SSH and DNS checks passed. Website publishing requires the independent Caddy deployment.'
`;
}

async function prepare(config) {
  const relevant = [
    'apps/company-web',
    'scripts/deploy-company.mjs',
    'scripts/company-deployment.mjs',
    'scripts/deployment-progress.mjs',
    'infra/company',
    'package.json',
    'pnpm-lock.yaml',
  ];
  const dirty = command('git', ['status', '--porcelain', '--', ...relevant], { capture: true });
  assert(!dirty, 'Commit website/deployment changes before preparing an identifiable release.');
  const sha = command('git', ['rev-parse', 'HEAD'], { capture: true });
  const pnpm = pnpmInvocation();
  await deploymentCommand(
    pnpm.command,
    [...pnpm.prefix, '--filter', '@coffeeeeffoc/company-web', 'build'],
    {
      cwd: root,
      env: toolEnvironment(),
      prefix: 'COMPANY',
      stage: 'build_company_web',
      timeout: 180000,
    },
  );
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
  const { archive, archiveHash } = await archiveBundle(destination);
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
      'pnpm deploy:company            Build/upload website only, switch release and verify HTTPS\npnpm deploy:company --prepare  Build/package only, no server changes\npnpm deploy:company --check    Read-only SSH/DNS checks\npnpm deploy:company --rollback Restore the previous company release\nConfiguration: .env.tencent.local (SSH fallback), .env.company.local, environment (highest priority)',
    );
    return;
  }
  const config = await loadConfig();
  if (args.includes('--prepare')) {
    await prepare(config);
    return;
  }
  if (config.key) await stat(config.key);
  if (args.includes('--rollback')) {
    await sshProgress(
      config,
      `set -eu\nbash -s -- '${config.directory}' rollback '${config.domain}' '${config.www}' '${config.caddyDirectory}' <<'COMPANY_DEPLOY_SCRIPT'\n${(await readFile(path.join(templateDir, 'deploy.sh'), 'utf8')).replaceAll('\r\n', '\n')}\nCOMPANY_DEPLOY_SCRIPT\n`,
    );
    return;
  }
  console.log('COMPANY_SCOPE company-web quality_checks=not-run');
  await sshProgress(config, remoteCheck(config), 'preflight');
  if (args.includes('--check')) return;
  const { archive, archiveHash, manifest } = await prepare(config);
  await uploadBundle(
    config,
    { archive, archiveHash, manifest },
    config.directory,
    `deploy '${config.domain}' '${config.www}' '${config.caddyDirectory}'`,
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
