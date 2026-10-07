import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp, symlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { digest, inventory } from './taptap-package.mjs';
import { adaptationRecipeSha256 } from './night-native-project.mjs';
import { installTapTapLogin } from './taptap-login.mjs';
import {
  buildTapTapCocosTarget,
  verifyConvertedCocosPackage,
  verifyTapTapCocosArtifact,
  tapCocosPlugin,
  prepareTapTapCocosLogin,
} from './taptap-cocos.mjs';

// These are synthetic integrity fixtures, not an official plugin or Creator run.
async function withFixture(fn) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'tap-cocos-audit-'));
  try {
    const gameRoot = path.join(base, 'game'),
      sourceDirectory = path.join(base, 'source'),
      convertedDirectory = path.join(base, 'converted'),
      pluginDirectory = path.join(base, 'plugin');
    for (const directory of [gameRoot, sourceDirectory, convertedDirectory, pluginDirectory])
      await mkdir(directory);
    const currentSourceHash = 'a'.repeat(64),
      files = {
        'build-info.json': JSON.stringify({
          creator: '3.8.8',
          target: 'wechatgame',
          sourceHash: currentSourceHash,
        }),
        'game.js': "require('./settings.js');require('./engine.js');wx.createCanvas();",
        'game.json': JSON.stringify({ deviceOrientation: 'landscape' }),
        'project.config.json': JSON.stringify({ appid: '' }),
        'settings.js': '/* synthetic settings fixture */',
        'engine.js': '/* synthetic engine fixture */',
        'scene.bin': Buffer.from([8, 8, 8]),
        'engine.wasm': Buffer.from([0, 97, 115, 109]),
      };
    for (const [name, bytes] of Object.entries(files))
      await writeFile(path.join(sourceDirectory, name), bytes);
    await cp(sourceDirectory, convertedDirectory, { recursive: true });
    await writeFile(
      path.join(convertedDirectory, 'game.js'),
      "require('./settings.js');require('./engine.js');tap.createCanvas();",
    );
    await writeFile(
      path.join(pluginDirectory, 'package.json'),
      JSON.stringify({ name: 'actual-name-not-in-public-docs', version: '1.2.2' }),
    );
    await writeFile(
      path.join(pluginDirectory, 'index.js'),
      'synthetic test fixture, not a converter',
    );
    await installTapTapLogin(convertedDirectory, {
      platform: 'taptap',
      game: 'carding-car',
      appId: '',
      apiUrl: '',
      preview: true,
    });
    await fn({
      base,
      gameRoot,
      sourceDirectory,
      convertedDirectory,
      pluginDirectory,
      currentSourceHash,
      game: 'carding-car',
      verifiedSourceInventory: await inventory(sourceDirectory),
    });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}
test('converted Creator import preserves binary resources and never claims tool authentication', () =>
  withFixture(async (options) => {
    const result = await verifyConvertedCocosPackage(options);
    assert.equal(result.sourceHash, options.currentSourceHash);
    assert.equal(result.creator, '3.8.8');
    assert.equal(result.plugin.suppliedPackageName, 'actual-name-not-in-public-docs');
    assert.equal(result.plugin.name, 'taptap-minigame-tools');
    assert.equal(result.plugin.authenticityVerified, false);
    assert.equal(result.plugin.manifestSchemaVerified, false);
    assert.equal(result.officialToolVerified, false);
    assert.equal(result.realDeviceVerified, false);
    assert.equal(result.conversionReceipt, 'unverified');
    assert.ok(result.preservedResources.some((file) => file.source === 'engine.wasm'));
  }));
test('source inventory and current project fingerprint are checked independently', () =>
  withFixture(async (options) => {
    await assert.rejects(
      verifyConvertedCocosPackage({ ...options, currentSourceHash: 'b'.repeat(64) }),
      /provenance mismatch/,
    );
    await writeFile(path.join(options.sourceDirectory, 'scene.bin'), 'changed');
    await assert.rejects(verifyConvertedCocosPackage(options), /source integrity mismatch/);
  }));
test('a missing or incompatible actual plugin stays an explicit blocker', () =>
  withFixture(async (options) => {
    await assert.rejects(
      verifyConvertedCocosPackage({ ...options, pluginDirectory: undefined }),
      /absolute local path/,
    );
    await writeFile(
      path.join(options.pluginDirectory, 'package.json'),
      JSON.stringify({ version: '0.0.1' }),
    );
    await assert.rejects(verifyConvertedCocosPackage(options), /documented v1.2.2/);
  }));
test('a copied WeChat build and unrelated game replacing Creator resources are rejected', () =>
  withFixture(async (options) => {
    await cp(
      path.join(options.sourceDirectory, 'game.js'),
      path.join(options.convertedDirectory, 'game.js'),
    );
    await installTapTapLogin(options.convertedDirectory, {
      platform: 'taptap',
      game: 'carding-car',
      appId: '',
      apiUrl: '',
      preview: true,
    });
    await assert.rejects(verifyConvertedCocosPackage(options), /entry was not converted/);
    await writeFile(
      path.join(options.convertedDirectory, 'game.js'),
      (await readFile(path.join(options.sourceDirectory, 'game.js'), 'utf8')) +
        '\n// copied without real engine conversion',
    );
    await installTapTapLogin(options.convertedDirectory, {
      platform: 'taptap',
      game: 'carding-car',
      appId: '',
      apiUrl: '',
      preview: true,
    });
    await assert.rejects(verifyConvertedCocosPackage(options), /no reachable tap API boundary/);
    await writeFile(path.join(options.convertedDirectory, 'game.js'), 'tap.createCanvas();');
    await installTapTapLogin(options.convertedDirectory, {
      platform: 'taptap',
      game: 'carding-car',
      appId: '',
      apiUrl: '',
      preview: true,
    });
    await writeFile(path.join(options.convertedDirectory, 'engine.wasm'), 'foreign binary');
    await assert.rejects(verifyConvertedCocosPackage(options), /resource missing or changed/);
  }));
test('reviewed resource relocation preserves exact bytes and cannot omit original resources', () =>
  withFixture(async (options) => {
    await mkdir(path.join(options.convertedDirectory, 'assets'));
    await cp(
      path.join(options.convertedDirectory, 'scene.bin'),
      path.join(options.convertedDirectory, 'assets/scene.bin'),
    );
    await rm(path.join(options.convertedDirectory, 'scene.bin'));
    await assert.rejects(verifyConvertedCocosPackage(options), /resource missing or changed/);
    const result = await verifyConvertedCocosPackage({
      ...options,
      resourceMappings: { 'scene.bin': 'assets/scene.bin' },
    });
    assert.equal(
      result.preservedResources.find((file) => file.source === 'scene.bin').destination,
      'assets/scene.bin',
    );
    await assert.rejects(
      verifyConvertedCocosPackage({ ...options, resourceMappings: { 'scene.bin': '../outside' } }),
      /Unsafe/,
    );
  }));
test('configured identity must match real converted config and preview remains empty', () =>
  withFixture(async (options) => {
    await assert.rejects(
      verifyConvertedCocosPackage({ ...options, mode: 'release' }),
      /configured AppID/,
    );
    await assert.rejects(
      verifyConvertedCocosPackage({ ...options, appId: 'public_id', mode: 'release' }),
      /server login API URL/,
    );
    await writeFile(
      path.join(options.convertedDirectory, 'game.json'),
      JSON.stringify({ deviceOrientation: 'landscape', appId: 'public_id' }),
    );
    await writeFile(
      path.join(options.convertedDirectory, 'project.config.json'),
      JSON.stringify({ appid: 'public_id' }),
    );
    const apiUrl = 'https://runtime.example.invalid';
    await installTapTapLogin(options.convertedDirectory, {
      platform: 'taptap',
      game: 'carding-car',
      appId: 'public_id',
      apiUrl,
      preview: false,
    });
    const result = await verifyConvertedCocosPackage({
      ...options,
      appId: 'public_id',
      apiUrl,
      mode: 'release',
    });
    assert.equal(result.mode, 'release');
  }));
test('standalone artifact audit rejects changed native recipes, source fingerprints and importer code', () =>
  withFixture(async (options) => {
    const result = await verifyConvertedCocosPackage(options),
      target = path.join(options.base, 'artifact');
    await mkdir(target);
    await cp(options.convertedDirectory, path.join(target, 'game'), { recursive: true });
    const hashes = Object.fromEntries(
      await Promise.all(
        [
          'taptap-cocos.mjs',
          'taptap-package.mjs',
          'night-native-project.mjs',
          'taptap-login.mjs',
          '../../../platforms/taptap/login.cjs',
        ].map(async (file) => [file, digest(await readFile(new URL(file, import.meta.url)))]),
      ),
    );
    const manifest = {
      ...result,
      platform: 'taptap',
      game: 'night-overwatch',
      mode: 'preview',
      appId: '',
      canonicalSourceHash: 'c'.repeat(64),
      adaptationRecipeSha256,
      importScriptHashes: hashes,
    };
    for (const changed of [
      { adaptationRecipeSha256: 'b'.repeat(64) },
      { sourceHash: '' },
      { importScriptHashes: { ...hashes, 'taptap-package.mjs': 'd'.repeat(64) } },
    ]) {
      await writeFile(
        path.join(target, 'cocos-provenance.json'),
        JSON.stringify({ ...manifest, ...changed }),
      );
      await assert.rejects(
        verifyTapTapCocosArtifact(target),
        /native source fingerprint, adaptation recipe or importer changed/,
      );
    }
  }));
test('Cocos launcher reports missing official conversion without fabricating any output', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'tap-cocos-blocked-'));
  try {
    const selected = { id: 'carding-car', cocos: true, directory: 'games/local/carding-car' };
    await assert.rejects(
      buildTapTapCocosTarget(
        selected,
        { platform: 'taptap', appId: '', preview: true },
        { env: {}, outputRoot },
      ),
      /Creator 3.8.x.*official tap-minigame-ts v1.2.2.*No TapTap artifact/,
    );
    await assert.rejects(inventory(path.join(outputRoot, 'taptap/carding-car')), /ENOENT/);
    assert.equal(tapCocosPlugin.version, '1.2.2');
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
test('login staging preserves converted inputs and prepares a separate project before official packing', () =>
  withFixture(async (options) => {
    const before = await inventory(options.convertedDirectory),
      output = path.join(options.base, 'login-stage');
    const config = {
      platform: 'taptap',
      game: 'carding-car',
      appId: 'public_id',
      apiUrl: 'https://runtime.example.invalid',
      preview: false,
    };
    const result = await prepareTapTapCocosLogin({
      convertedDirectory: options.convertedDirectory,
      outputDirectory: output,
      config,
    });
    assert.equal(result.status, 'login-source-staged-awaiting-official-packing');
    assert.equal(result.officialToolVerified, false);
    assert.equal(result.publicConfig.platform, 'taptap');
    assert.equal(result.publicConfig.appId, 'public_id');
    assert.deepEqual(await inventory(options.convertedDirectory), before);
    const sourceEntry = await readFile(path.join(options.convertedDirectory, 'game.js'), 'utf8');
    assert.match(sourceEntry, /"appId":""/);
    assert.match(await readFile(path.join(output, 'game.js'), 'utf8'), /"appId":"public_id"/);
    assert.equal(
      JSON.parse(await readFile(path.join(output, 'project.config.json'), 'utf8')).appid,
      'public_id',
    );
    await verifyConvertedCocosPackage({
      ...options,
      convertedDirectory: output,
      appId: config.appId,
      apiUrl: config.apiUrl,
      mode: 'release',
    });
    await writeFile(path.join(output, 'tap-login.js'), '// foreign helper');
    await assert.rejects(
      verifyConvertedCocosPackage({
        ...options,
        convertedDirectory: output,
        appId: config.appId,
        apiUrl: config.apiUrl,
        mode: 'release',
      }),
      /login bootstrap differs/,
    );
  }));
test('login staging rejects source overlap before deletion or mutation', () =>
  withFixture(async (options) => {
    const before = await inventory(options.convertedDirectory);
    await assert.rejects(
      prepareTapTapCocosLogin({
        convertedDirectory: options.convertedDirectory,
        outputDirectory: path.join(options.convertedDirectory, 'stage'),
        config: { platform: 'taptap', game: 'carding-car', appId: '', apiUrl: '', preview: true },
      }),
      /independent paths/,
    );
    assert.deepEqual(await inventory(options.convertedDirectory), before);
  }));

test('real Creator preview metadata is normalized only in the independent login copy', () =>
  withFixture(async (options) => {
    await writeFile(
      path.join(options.convertedDirectory, 'project.config.json'),
      JSON.stringify({ appid: 'touristappid' }),
    );
    const before = await inventory(options.convertedDirectory);
    const output = path.join(options.base, 'creator-preview');
    await prepareTapTapCocosLogin({
      convertedDirectory: options.convertedDirectory,
      outputDirectory: output,
      config: { platform: 'taptap', game: 'carding-car', appId: '', apiUrl: '', preview: true },
    });
    assert.equal(
      JSON.parse(await readFile(path.join(output, 'project.config.json'), 'utf8')).appid,
      '',
    );
    assert.deepEqual(await inventory(options.convertedDirectory), before);
    await writeFile(path.join(options.convertedDirectory, 'game.js'), 'wx.createCanvas();');
    await assert.rejects(
      prepareTapTapCocosLogin({
        convertedDirectory: options.convertedDirectory,
        outputDirectory: path.join(options.base, 'invalid-runtime'),
        config: { platform: 'taptap', game: 'carding-car', appId: '', apiUrl: '', preview: true },
      }),
      /no reachable tap API boundary/,
    );
  }));
test('login staging refuses an independent nonempty destination without changing either input', () =>
  withFixture(async (options) => {
    const output = path.join(options.base, 'existing-project');
    await mkdir(output);
    await writeFile(path.join(output, 'keep.txt'), 'existing user content');
    const beforeOutput = await inventory(output),
      beforeSource = await inventory(options.convertedDirectory);
    await assert.rejects(
      prepareTapTapCocosLogin({
        convertedDirectory: options.convertedDirectory,
        outputDirectory: output,
        config: { platform: 'taptap', game: 'carding-car', appId: '', apiUrl: '', preview: true },
      }),
      /new directory or an existing empty directory/,
    );
    assert.deepEqual(await inventory(output), beforeOutput);
    assert.deepEqual(await inventory(options.convertedDirectory), beforeSource);
  }));
test('login staging accepts an existing empty directory and retains that directory', () =>
  withFixture(async (options) => {
    const output = path.join(options.base, 'empty-stage');
    await mkdir(output);
    const original = await lstat(output),
      beforeSource = await inventory(options.convertedDirectory);
    const result = await prepareTapTapCocosLogin({
      convertedDirectory: options.convertedDirectory,
      outputDirectory: output,
      config: { platform: 'taptap', game: 'carding-car', appId: '', apiUrl: '', preview: true },
    });
    assert.equal(result.status, 'login-source-staged-awaiting-official-packing');
    assert.equal((await lstat(output)).ino, original.ino);
    assert.deepEqual(await inventory(options.convertedDirectory), beforeSource);
  }));
test('misconfigured input inside managed output is rejected before any source deletion', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'tap-cocos-output-input-'));
  try {
    const source = path.join(outputRoot, 'taptap/carding-car/source');
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, 'keep.bin'), 'important source');
    await assert.rejects(
      buildTapTapCocosTarget(
        { id: 'carding-car', cocos: true, directory: 'games/local/carding-car' },
        { platform: 'taptap', appId: '', preview: true },
        { outputRoot, env: { MINIGAME_CARDING_CAR_TAPTAP_SOURCE_DIR: source } },
      ),
      /independent paths/,
    );
    assert.equal((await inventory(source)).length, 1);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
test('receipt-derived source and linked output ancestors are checked before cleanup', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'tap-cocos-receipt-input-'));
  try {
    const source = path.join(outputRoot, 'taptap/carding-car/source');
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, 'keep.bin'), 'real source');
    const receipt = path.join(outputRoot, 'source-inventory.json');
    await writeFile(receipt, JSON.stringify({ sourceDirectory: source }));
    const selected = { id: 'carding-car', cocos: true, directory: 'games/local/carding-car' },
      config = { platform: 'taptap', appId: '', preview: true };
    await assert.rejects(
      buildTapTapCocosTarget(selected, config, {
        outputRoot,
        env: { MINIGAME_CARDING_CAR_TAPTAP_SOURCE_INVENTORY: receipt },
      }),
      /independent paths/,
    );
    assert.equal((await inventory(source)).length, 1);
    const linked = path.join(outputRoot, 'linked');
    await symlink(outputRoot, linked, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(
      buildTapTapCocosTarget(selected, config, { outputRoot: linked, env: {} }),
      /output path contains a symlink/,
    );
    assert.equal((await inventory(source)).length, 1);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
