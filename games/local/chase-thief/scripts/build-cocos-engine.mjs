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
const VERSION = '3.8.8';
const COMMIT = '411f98df047c25902f93440d4b22925c2fb65461';
const ARCHIVE_SHA = 'f8cddbb7ffac468922f71391f86d5c715e2c26406c97dd421668026789138c50';
const LOCK_SHA = '12269fb637c5987375797a2f095b015f19fe55d08b5903c403ef1abeec19dfd6';
const CCBUILD = '2.3.16';
const FEATURES = [
  'base',
  'gfx-webgl',
  'gfx-webgl2',
  '3d',
  'primitive',
  'animation',
  'skeletal-animation',
  '2d',
  'ui',
  'graphics',
  'tween',
  'audio',
  'legacy-pipeline',
];
const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = path.join(root, 'vendor/cocos');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function assert(value, message) {
  if (!value) throw new Error(message);
}
export async function verifyEngine(directory = vendor) {
  const info = JSON.parse(await readFile(path.join(directory, 'provenance.json'), 'utf8'));
  assert(
    info.engine === 'Cocos Engine' && info.version === VERSION && info.sourceCommit === COMMIT,
    'Unexpected Cocos provenance',
  );
  assert(
    info.sourceArchiveSha256 === ARCHIVE_SHA &&
      info.packageLockSha256 === LOCK_SHA &&
      info.builder === `@cocos/ccbuild@${CCBUILD}`,
    'Unpinned engine source or builder',
  );
  assert(
    info.buildKind === 'official-engine-source-web' &&
      JSON.stringify(info.features) === JSON.stringify(FEATURES),
    'Unexpected engine feature set',
  );
  for (const [file, expected] of Object.entries(info.files)) {
    assert(['cc.js', 'LICENSE'].includes(file), 'Unexpected engine manifest entry');
    const bytes = await readFile(path.join(directory, file));
    assert(
      sha(bytes) === expected.sha256 && bytes.length === expected.bytes,
      `Cocos integrity mismatch: ${file}; rebuild from pinned sources`,
    );
  }
  assert(info.files['cc.js'] && info.files.LICENSE, 'Incomplete engine manifest');
  return info;
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
      features: FEATURES,
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
