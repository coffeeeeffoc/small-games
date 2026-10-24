/**
 * Build the real Cocos Engine 3.8.8 from its pinned official source snapshot.
 * This is an engine-source Web build, NOT a Cocos Creator editor export.
 * Default/--check is offline integrity verification. --rebuild needs curl, tar,
 * npm and network access. All npm install scripts are disabled; only the two
 * reviewed engine metadata generators below run. No native SDK is downloaded.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, copyFile, mkdtemp, readdir } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  VERSION,
  COMMIT,
  ARCHIVE_SHA,
  LOCK_SHA,
  CCBUILD,
  FEATURES,
  verifyEngine,
} from './cocos-engine-integrity.mjs';
export { verifyEngine } from './cocos-engine-integrity.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = path.join(root, 'vendor/cocos');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function assert(value, message) {
  if (!value) throw new Error(message);
}
async function run(command, args, { cwd, log } = {}) {
  let fd;
  if (log) fd = openSync(log, 'w');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        stdio: fd === undefined ? 'inherit' : ['ignore', fd, fd],
        shell: process.platform === 'win32' && command === 'npm',
      });
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`${command} failed (${code})${log ? `; inspect ${log}` : ''}`)),
      );
    });
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
export async function rebuildEngine() {
  const work = await mkdtemp(path.join(os.tmpdir(), 'chase-cocos-'));
  console.log(`Building pinned Cocos ${VERSION} in ${work}`);
  const archive = path.join(work, 'engine.tar.gz');
  await run('curl', [
    '--fail',
    '--location',
    '--retry',
    '2',
    '--output',
    archive,
    `https://codeload.github.com/cocos/cocos-engine/tar.gz/${COMMIT}`,
  ]);
  assert(sha(await readFile(archive)) === ARCHIVE_SHA, 'Official engine archive checksum mismatch');
  await run('tar', ['-xzf', archive, '-C', work]);
  const engine = path.join(work, `cocos-engine-${COMMIT}`);
  assert(
    sha(await readFile(path.join(engine, 'package-lock.json'))) === LOCK_SHA,
    'Official package lock checksum mismatch',
  );
  await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: engine,
    log: path.join(work, 'npm.log'),
  });
  const require = createRequire(path.join(engine, 'package.json'));
  assert(
    JSON.parse(
      await readFile(path.join(engine, 'node_modules/@cocos/ccbuild/package.json'), 'utf8'),
    ).version === CCBUILD,
    'Wrong ccbuild version',
  );
  await run(process.execPath, ['scripts/build-debug-infos.js'], { cwd: engine });
  await run(process.execPath, ['scripts/build-const.js'], { cwd: engine });
  const { buildEngine } = require('@cocos/ccbuild');
  const out = path.join(work, 'runtime');
  const previous = process.cwd();
  try {
    process.chdir(engine);
    await buildEngine({
      engine,
      out,
      features: [...FEATURES],
      moduleFormat: 'esm',
      mode: 'BUILD',
      platform: 'HTML5',
      compress: true,
      sourceMap: false,
      targets: { chrome: '80', safari: '13' },
      flags: { DEBUG: false, CULL_MESHOPT: true },
    });
  } finally {
    process.chdir(previous);
  }
  assert(
    JSON.stringify((await readdir(out)).sort()) === JSON.stringify(['cc.js']),
    'Unexpected external engine runtime files',
  );
  await mkdir(vendor, { recursive: true });
  await copyFile(path.join(out, 'cc.js'), path.join(vendor, 'cc.js'));
  await copyFile(path.join(engine, 'LICENSE.md'), path.join(vendor, 'LICENSE'));
  const files = {};
  for (const name of ['cc.js', 'LICENSE']) {
    const bytes = await readFile(path.join(vendor, name));
    files[name] = { sha256: sha(bytes), bytes: bytes.length };
  }
  const info = {
    engine: 'Cocos Engine',
    version: VERSION,
    buildKind: 'official-engine-source-web',
    sourceRepository: 'https://github.com/cocos/cocos-engine',
    sourceBranch: 'v3.8.8',
    sourceCommit: COMMIT,
    sourceArchiveSha256: ARCHIVE_SHA,
    packageLockSha256: LOCK_SHA,
    builder: `@cocos/ccbuild@${CCBUILD}`,
    features: FEATURES,
    moduleFormat: 'esm',
    platform: 'HTML5',
    targets: { chrome: '80', safari: '13' },
    flags: { DEBUG: false, CULL_MESHOPT: true },
    node: process.version,
    files,
  };
  await writeFile(path.join(vendor, 'provenance.json'), JSON.stringify(info, null, 2) + '\n');
  await verifyEngine();
  console.log(
    `Verified real Cocos ${VERSION}: ${files['cc.js'].bytes} bytes. Build scratch/logs retained in ${work}.`,
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--rebuild')) await rebuildEngine();
  else {
    const info = await verifyEngine();
    console.log(`Verified ${info.engine} ${info.version} (${info.sourceCommit.slice(0, 12)})`);
  }
}
