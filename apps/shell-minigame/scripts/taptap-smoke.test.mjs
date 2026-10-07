import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { inventory } from './nine-games-build.mjs';
import { nineGames } from './nine-games-targets.mjs';
import { createTapTapRequire, runTapTapSmoke, verifyTapTapPackage } from './taptap-smoke.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const selected = nineGames.find(({ id }) => id === 'cops-robbers');

test('CommonJS companions use exact packaged bytes and preserve no-DOM errors and containment', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'taptap-commonjs-smoke-'));
  try {
    const artifact = path.join(directory, 'artifact');
    await mkdir(artifact);
    await writeFile(
      path.join(artifact, 'tap-login.js'),
      'globalThis.loads=(globalThis.loads||0)+1;module.exports={tap,status:"unconfigured"};',
    );
    await writeFile(path.join(artifact, 'foreign.js'), 'module.exports=wx;');
    await writeFile(path.join(directory, 'outside.js'), 'module.exports="outside";');
    const linkedDirectory = path.join(artifact, 'linked');
    await symlink(directory, linkedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    const tap = { platform: 'taptap' },
      context = vm.createContext({ tap });
    const require = createTapTapRequire(artifact, context);
    const first = require('./tap-login.js');
    assert.equal(first.tap, tap);
    assert.equal(require('./tap-login.js'), first);
    assert.equal(context.loads, 1, 'Companion state is cached exactly once');
    assert.throws(() => require('node:fs'), /only loads relative/);
    assert.throws(() => require('../outside.js'), /stay inside/);
    assert.throws(() => require('./linked/outside.js'), /symlinks/);
    assert.throws(() => require('./missing.js'), /ENOENT/);
    assert.throws(() => require('./foreign.js'), /wx is not defined/);
    assert.throws(
      () => require('./foreign.js'),
      /wx is not defined/,
      'A failed module cannot return a swallowed cached success',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
async function proof(directory, platform = 'taptap') {
  const sourceFiles = await Promise.all(
    ['platforms/taptap/build.mjs', `${selected.directory}/${selected.entry}`].map(
      async (relative) => ({
        path: relative,
        sha256: createHash('sha256')
          .update(await readFile(path.join(repo, relative)))
          .digest('hex'),
      }),
    ),
  );
  await writeFile(
    path.join(directory, 'game.js'),
    'const raw = typeof tap === "undefined" ? undefined : tap;\n',
  );
  for (const [filename, value] of Object.entries({
    'game.json': { deviceOrientation: 'portrait' },
    'project.config.json': { compileType: 'game' },
    'release.json': {
      game: selected.id,
      platform,
      nativeRuntimeVerified: false,
      officialToolsVerified: false,
      deviceVerified: false,
    },
  }))
    await writeFile(path.join(directory, filename), JSON.stringify(value));
  await writeFile(
    path.join(directory, 'artifact-manifest.json'),
    JSON.stringify({
      game: selected.id,
      platform,
      sourceFiles,
      files: await inventory(directory),
      officialToolsVerified: false,
      deviceVerified: false,
    }),
  );
}

test('TapTap smoke rejects an integrity-valid package carrying another platform identity', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'taptap-foreign-smoke-'));
  try {
    await proof(directory, 'wechat');
    await assert.rejects(
      verifyTapTapPackage(directory, selected),
      /renamed other-platform package/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('TapTap smoke checks package bytes and current source provenance before runtime', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'taptap-integrity-smoke-'));
  try {
    await proof(directory);
    await verifyTapTapPackage(directory, selected);
    await writeFile(path.join(directory, 'game.js'), 'tap.createCanvas();\n');
    await assert.rejects(verifyTapTapPackage(directory, selected), /Artifact integrity mismatch/);
    await proof(directory);
    const manifest = JSON.parse(
      await readFile(path.join(directory, 'artifact-manifest.json'), 'utf8'),
    );
    manifest.sourceFiles[0].sha256 = '0'.repeat(64);
    await writeFile(path.join(directory, 'artifact-manifest.json'), JSON.stringify(manifest));
    await assert.rejects(verifyTapTapPackage(directory, selected), /Stale input platforms\/taptap/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('A Cocos blocker never hides an unknown missing build or a stale package directory', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'taptap-cocos-smoke-'));
  const options = { output, games: ['carding-car'] };
  try {
    await assert.rejects(runTapTapSmoke(options), /no build status/);
    const entry = {
      game: 'night-overwatch',
      platform: 'taptap',
      status: 'blocked',
      reason: 'requires Creator 3.8.x with official tap-minigame-ts v1.2.2 conversion',
      officialTools: 'unrun',
      device: 'unrun',
    };
    const statusFile = path.join(output, 'taptap-build-status.json');
    await writeFile(statusFile, JSON.stringify({ results: [entry] }));
    await assert.rejects(runTapTapSmoke(options), /matching game\/platform/);
    entry.game = 'carding-car';
    await writeFile(statusFile, JSON.stringify({ results: [entry] }));
    const target = path.join(output, 'taptap/carding-car');
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'game.js'), 'wx.createCanvas();');
    await assert.rejects(runTapTapSmoke(options), /ENOENT.*cocos-provenance/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
