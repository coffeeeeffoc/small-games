import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inventory, verifyConvertedPackage } from './kuaishou-cocos-import.mjs';

// Synthetic verification fixtures only: these are NOT SDKs, official adapters or Creator artifacts.
async function fixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'ks-verification-fixture-'));
  const sourceDirectory = path.join(base, 'source'),
    convertedDirectory = path.join(base, 'converted');
  const gameRoot = path.join(base, 'game');
  await mkdir(gameRoot);
  const currentSourceHash = 'a'.repeat(64);
  const sourceFiles = {
    'build-info.json': JSON.stringify({
      creator: '3.8.8',
      sourceHash: currentSourceHash,
      platform: 'wechatgame',
    }),
    'game.js': "require('./src/settings.js');require('./engine.js');",
    'game.json': JSON.stringify({
      deviceOrientation: 'landscape',
      subpackages: [{ name: 'resources', root: 'subpackages/resources/' }],
    }),
    'src/settings.js': 'synthetic settings',
    'engine.js': 'synthetic engine',
    'subpackages/resources/game.js': 'synthetic subpackage entry',
    'subpackages/resources/scene.bin': Buffer.from([0, 9, 7]),
    'subpackages/resources/model.glb': Buffer.from([3, 8, 8]),
    'subpackages/resources/audio.wav': Buffer.from([8, 8, 8]),
    'engine.wasm': Buffer.from([0, 97, 115, 109]),
  };
  for (const root of [sourceDirectory, convertedDirectory])
    for (const [file, contents] of Object.entries(sourceFiles)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), contents);
    }
  await writeFile(
    path.join(convertedDirectory, 'game.js'),
    "require('./kwaiadapter.js');\n" + sourceFiles['game.js'],
  );
  await writeFile(
    path.join(convertedDirectory, 'kwaiadapter.js'),
    '/* synthetic validation fixture, not an SDK */ ks.getSystemInfoSync();',
  );
  await writeFile(
    path.join(convertedDirectory, 'tool-project.json'),
    JSON.stringify({ appId: 'kwai_game_test_appid' }),
  );
  return {
    base,
    sourceDirectory,
    convertedDirectory,
    gameRoot,
    currentSourceHash,
    verifiedSourceInventory: await inventory(sourceDirectory),
    projectConfigurationFile: 'tool-project.json',
    appIdField: 'appId',
  };
}
async function withFixture(fn) {
  const value = await fixture();
  try {
    await fn(value);
  } finally {
    await rm(value.base, { recursive: true, force: true });
  }
}
test('synthetic converted fixture verifies integrity but cannot authenticate official tool or device', () =>
  withFixture(async (options) => {
    const result = await verifyConvertedPackage(options);
    assert.equal(result.directory, options.convertedDirectory);
    assert.equal(result.previewOnly, true);
    assert.equal(result.officialToolVerified, false);
    assert.equal(result.realDeviceVerified, false);
    assert.equal(result.conversionReceipt, 'unverified');
    assert.equal(
      result.files.some((file) => file.path === 'engine.wasm'),
      true,
    );
  }));
test('release rejects missing and official preview IDs; configured identity must match actual configuration', () =>
  withFixture(async (options) => {
    await assert.rejects(
      verifyConvertedPackage({ ...options, mode: 'release' }),
      /Release requires/,
    );
    await assert.rejects(
      verifyConvertedPackage({ ...options, mode: 'release', appId: 'kwai_game_test_appid' }),
      /Release requires/,
    );
    await assert.rejects(
      verifyConvertedPackage({ ...options, appId: 'real_public_id' }),
      /AppID mismatch/,
    );
    await writeFile(
      path.join(options.convertedDirectory, 'tool-project.json'),
      JSON.stringify({ appId: 'real_public_id' }),
    );
    const result = await verifyConvertedPackage({
      ...options,
      mode: 'release',
      appId: 'real_public_id',
    });
    assert.equal(result.previewOnly, false);
  }));
test('trusted inventory rejects tampered Creator source and provenance', () =>
  withFixture(async (options) => {
    await writeFile(path.join(options.sourceDirectory, 'engine.wasm'), 'changed');
    await assert.rejects(verifyConvertedPackage(options), /source integrity/);
    await assert.rejects(
      verifyConvertedPackage({ ...options, verifiedSourceInventory: [] }),
      /Trusted staged/,
    );
  }));
test('source hash mismatch rejects otherwise intact source', () =>
  withFixture(async (options) => {
    await assert.rejects(
      verifyConvertedPackage({ ...options, currentSourceHash: 'b'.repeat(64) }),
      /provenance mismatch/,
    );
  }));
test('converted binaries may neither disappear nor change', () =>
  withFixture(async (options) => {
    await writeFile(
      path.join(options.convertedDirectory, 'subpackages/resources/model.glb'),
      'changed',
    );
    await assert.rejects(verifyConvertedPackage(options), /resource missing or changed/);
    await writeFile(
      path.join(options.convertedDirectory, 'subpackages/resources/model.glb'),
      Buffer.from([3, 8, 8]),
    );
    await rm(path.join(options.convertedDirectory, 'engine.wasm'));
    await assert.rejects(verifyConvertedPackage(options), /resource missing or changed/);
  }));
test('rename-only package and missing SDK boundary are rejected', () =>
  withFixture(async (options) => {
    await writeFile(
      path.join(options.convertedDirectory, 'game.js'),
      "require('./src/settings.js');require('./engine.js');",
    );
    await assert.rejects(verifyConvertedPackage(options), /require existing/);
    await writeFile(
      path.join(options.convertedDirectory, 'game.js'),
      "require('./kwaiadapter.js');require('./src/settings.js');require('./engine.js');",
    );
    await writeFile(
      path.join(options.convertedDirectory, 'kwaiadapter.js'),
      '/* no runtime API */',
    );
    await assert.rejects(verifyConvertedPackage(options), /API boundary/);
    await rm(path.join(options.convertedDirectory, 'kwaiadapter.js'));
    await assert.rejects(verifyConvertedPackage(options), /require existing/);
  }));
test('conversion cannot substitute unrelated game entry or change orientation', () =>
  withFixture(async (options) => {
    await writeFile(
      path.join(options.convertedDirectory, 'game.js'),
      "require('./kwaiadapter.js');require('./unrelated.js');",
    );
    await assert.rejects(verifyConvertedPackage(options), /entry differs/);
    await writeFile(
      path.join(options.convertedDirectory, 'game.json'),
      JSON.stringify({ deviceOrientation: 'portrait' }),
    );
    await assert.rejects(verifyConvertedPackage(options), /orientation mismatch/);
  }));
test('unsafe subpackage paths and symbolic links are rejected', () =>
  withFixture(async (options) => {
    await writeFile(
      path.join(options.convertedDirectory, 'game.json'),
      JSON.stringify({
        deviceOrientation: 'landscape',
        subpackages: [{ name: 'resources', root: '../escape' }],
      }),
    );
    await assert.rejects(verifyConvertedPackage(options), /Unsafe package path/);
    await symlink(
      path.join(options.sourceDirectory, 'engine.wasm'),
      path.join(options.convertedDirectory, 'linked.wasm'),
    );
    await assert.rejects(verifyConvertedPackage(options), /symlink/);
  }));
test('official 6 MiB main and 30 MiB combined budget is enforced independently', () =>
  withFixture(async (options) => {
    await writeFile(
      path.join(options.convertedDirectory, 'oversize.bin'),
      Buffer.alloc(6 * 1024 * 1024),
    );
    await assert.rejects(verifyConvertedPackage(options), /budget exceeded/);
    await rm(path.join(options.convertedDirectory, 'oversize.bin'));
    await writeFile(
      path.join(options.convertedDirectory, 'subpackages/resources/oversize.bin'),
      Buffer.alloc(30 * 1024 * 1024),
    );
    await assert.rejects(verifyConvertedPackage(options), /budget exceeded/);
  }));
