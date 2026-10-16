import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createPortReservation } from 'node:net';
import { mkdtemp, mkdir, lstat, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { renderAdminCaddy, adminDomain } from './competition-ingress.mjs';

const version = '2.11.7';
const assets = {
  win32: [
    'caddy_2.11.7_windows_amd64.zip',
    '0a1edc0b799512051c57071ce0e798d3f2cf67dc98171366f1d2b326072e3b06',
    'caddy.exe',
  ],
  linux: [
    'caddy_2.11.7_linux_amd64.tar.gz',
    '727b91701a392de6ebc5027509f548bf39979e5216340d0faed8fa5e69c84f8b',
    'caddy',
  ],
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const childEnvironment = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|TMPDIR|LANG|LC_[A-Z_]+)$/i.test(
        key,
      ),
    ),
  );
const quoted = (value) => JSON.stringify(value.replaceAll('\\', '/'));

async function ordinaryDirectory(directory) {
  await mkdir(directory, { recursive: true });
  const info = await lstat(directory);
  assert(info.isDirectory() && !info.isSymbolicLink(), 'Tool directory cannot be a link');
  assert.equal(await realpath(directory), directory);
}
async function verifiedArchive(filename, digest) {
  const parent = await realpath(tmpdir());
  const cache = path.join(parent, 'small-games-public-tools');
  await ordinaryDirectory(cache);
  const archive = path.join(cache, filename);
  try {
    const info = await lstat(archive);
    assert(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'Unsafe tool archive');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(
      `https://github.com/caddyserver/caddy/releases/download/v${version}/${filename}`,
      { signal: AbortSignal.timeout(60000) },
    );
    assert.equal(response.status, 200, 'Official Caddy archive unavailable');
    assert(
      Number(response.headers.get('content-length') || 0) < 100_000_000,
      'Unexpected tool archive size',
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(
      bytes.length < 100_000_000 && sha256(bytes) === digest,
      'Official Caddy archive digest mismatch',
    );
    try {
      await writeFile(archive, bytes, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  const bytes = await readFile(archive);
  assert.equal(sha256(bytes), digest, 'Cached Caddy archive digest mismatch');
  return bytes;
}
async function freePort() {
  const reservation = createPortReservation();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

/** An actual pinned Caddy process, with only owned loopback resources and no TLS/admin ports. */
export async function startAdminCaddy(site, { apiHandler } = {}) {
  assert(
    process.arch === 'x64' && assets[process.platform],
    'Caddy fixture requires reviewed x64 Windows/Linux',
  );
  const [archiveName, archiveSha256, executableName] = assets[process.platform];
  const archiveBytes = await verifiedArchive(archiveName, archiveSha256);
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(parent, 'small-games-admin-caddy-'));
  let child,
    api,
    exited,
    closed = false;
  let childOutput = '';
  const close = async () => {
    if (closed) return;
    closed = true;
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
    if (exited)
      await Promise.race([
        exited,
        delay(8000, undefined, { ref: false }).then(() => {
          throw new Error('Owned Caddy did not exit');
        }),
      ]);
    if (api?.listening)
      await new Promise((resolve, reject) =>
        api.close((error) => (error ? reject(error) : resolve())),
      );
    assert.equal(await realpath(directory), directory);
    assert.equal(path.dirname(directory), parent);
    assert(path.basename(directory).startsWith('small-games-admin-caddy-'));
    const info = await lstat(directory);
    assert(info.isDirectory() && !info.isSymbolicLink());
    await rm(directory, { recursive: true, force: false, maxRetries: 3 });
  };
  try {
    const archive = path.join(directory, archiveName);
    await writeFile(archive, archiveBytes, { flag: 'wx' });
    execFileSync('tar', ['-xf', archive, '-C', directory, executableName], {
      windowsHide: true,
      timeout: 30000,
      stdio: 'pipe',
      env: childEnvironment(),
    });
    const executable = path.join(directory, executableName);
    const reported = execFileSync(executable, ['version'], {
      windowsHide: true,
      timeout: 10000,
      encoding: 'utf8',
      env: childEnvironment(),
    }).trim();
    assert(reported.startsWith(`v${version} `), 'Unexpected Caddy runtime');
    const executableSha256 = sha256(await readFile(executable));
    api = createServer(
      apiHandler ||
        ((_request, response) => {
          response.writeHead(401, { 'Content-Type': 'application/json' });
          response.end('{"error":"authentication_required"}');
        }),
    );
    await new Promise((resolve, reject) => {
      api.once('error', reject);
      api.listen(0, '127.0.0.1', resolve);
    });
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    const ingress = JSON.parse(
      await readFile(new URL('../infra/caddy/ingress.example.json', import.meta.url), 'utf8'),
    );
    let config = renderAdminCaddy(ingress);
    const replace = (before, after, expected = 1) => {
      assert.equal(config.split(before).length - 1, expected, 'Caddy fixture contract changed');
      config = config.replaceAll(before, after);
    };
    replace(`${adminDomain} {`, `${url} {`);
    replace('/srv/admin', quoted(await realpath(site)));
    replace('/opt/small-games/admin-console/current/site', quoted(await realpath(site)), 2);
    replace(`http://${ingress.network.nginxIp}:8083`, `http://127.0.0.1:${api.address().port}`);
    const prelude = `{
 admin off
 auto_https off
 persist_config off
 storage file_system {
  root ${quoted(path.join(directory, 'storage'))}
 }
 log {
  level ERROR
 }
}
`;
    const configPath = path.join(directory, 'Caddyfile');
    await writeFile(configPath, prelude + config, { flag: 'wx' });
    child = spawn(executable, ['run', '--config', configPath, '--adapter', 'caddyfile'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: directory,
      env: {
        ...childEnvironment(),
        XDG_CONFIG_HOME: path.join(directory, 'config'),
        XDG_DATA_HOME: path.join(directory, 'data'),
      },
    });
    exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (bytes) => {
        childOutput = (childOutput + bytes).slice(-4000);
      });
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw new Error(`Caddy fixture exited: ${childOutput}`);
      try {
        const response = await fetch(url + '/api/session', { signal: AbortSignal.timeout(500) });
        await response.arrayBuffer();
        ready = true;
        break;
      } catch {
        await delay(100);
      }
    }
    assert(ready, 'Owned Caddy loopback listener unavailable');
    return { url, runtime: { version, archiveSha256, executableSha256 }, close };
  } catch (error) {
    await close();
    throw error;
  }
}
