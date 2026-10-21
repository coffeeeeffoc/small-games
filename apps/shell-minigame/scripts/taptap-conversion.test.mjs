import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  replayOfficialConversion,
  acceptsOfficialConversionProof,
  officialPluginSha256,
} from './taptap-conversion.mjs';
import { inventory, zipInventory, verifyTapProject } from './taptap-package.mjs';
import { tapTapLoginPrefix, verifyTapTapLogin } from './taptap-login.mjs';

const pluginArchive = process.env.TAPTAP_OFFICIAL_PLUGIN_ARCHIVE;
const config = {
  platform: 'taptap',
  game: 'homebound-station',
  appId: 'contract-app',
  apiUrl: '',
  preview: false,
  adsEnabled: true,
  adUnitId: 'contract-reward',
};

test('plain JSON cannot mint an official Cocos conversion proof', () => {
  assert.equal(acceptsOfficialConversionProof({ pluginSha256: officialPluginSha256 }, []), false);
});

test('replay rejects an unpinned archive without executing its contents', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tap-replay-pin-test-'));
  try {
    await mkdir(path.join(root, 'source'));
    await writeFile(path.join(root, 'source/game.js'), 'wx.createCanvas();');
    await writeFile(path.join(root, 'plugin.zip'), 'forged archive');
    await assert.rejects(
      replayOfficialConversion({
        sourceDirectory: path.join(root, 'source'),
        pluginArchive: path.join(root, 'plugin.zip'),
      }),
      /archive|checksum|SHA|pin/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'pinned official Babel conversion, wx compatibility and final official packing agree exactly',
  {
    skip:
      !pluginArchive &&
      'Set TAPTAP_OFFICIAL_PLUGIN_ARCHIVE to the reviewed v1.2.2 ZIP for the real-tool contract',
  },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'tap-real-converter-test-'));
    try {
      const source = path.join(root, 'source');
      await mkdir(path.join(source, 'subpackages/resources'), { recursive: true });
      // This is a converter contract fixture, never represented as a Creator build.
      for (const [file, value] of Object.entries({
        'game.js':
          "require('./adapter'); const value = globalThis.state?.value ?? 1; wx.createCanvas();",
        'adapter.js': 'module.exports = (value = 2) => value ** 2;',
        'game.json': JSON.stringify({
          deviceOrientation: 'portrait',
          subpackages: [{ name: 'resources', root: 'subpackages/resources/' }],
        }),
        'project.config.json': JSON.stringify({ appid: 'touristappid' }),
        'settings.json': '{}',
        'subpackages/resources/game.js': 'module.exports = {};',
        'subpackages/resources/sound.bin': 'local audio bytes',
      }))
        await writeFile(path.join(source, file), value);
      const before = await inventory(source);
      const raw = await replayOfficialConversion({
        sourceDirectory: source,
        pluginArchive,
        outputDirectory: path.join(root, 'raw/game'),
      });
      assert.notEqual(
        await readFile(path.join(raw.directory, 'adapter.js'), 'utf8'),
        await readFile(path.join(source, 'adapter.js'), 'utf8'),
      );
      assert.match(await readFile(path.join(raw.directory, 'game.js'), 'utf8'), /wx\.createCanvas/);
      const stage = await replayOfficialConversion({
        sourceDirectory: source,
        pluginArchive,
        config,
        expectedRawDirectory: raw.directory,
        outputDirectory: path.join(root, 'final/game'),
      });
      assert.equal(stage.receipt.pluginSha256, officialPluginSha256);
      assert.equal(acceptsOfficialConversionProof(stage.proof, stage.files), true);
      assert.deepEqual(zipInventory(await readFile(stage.packageFile)), stage.files);
      assert.deepEqual(await inventory(source), before);
      assert.deepEqual(await inventory(stage.directory), stage.files);
      const prefix = tapTapLoginPrefix(config);
      await verifyTapTapLogin(stage.directory, config);
      await verifyTapProject({
        directory: stage.directory,
        appId: config.appId,
        mode: 'release',
        orientation: 'portrait',
        entryPrefixToIgnore: prefix,
        officialConversionProof: stage.proof,
      });
      await assert.rejects(
        verifyTapProject({
          directory: stage.directory,
          appId: config.appId,
          mode: 'release',
          entryPrefixToIgnore: prefix,
          officialConversionProof: JSON.parse(JSON.stringify(stage.proof)),
        }),
        /no reachable tap API boundary/,
      );
      const originalEntry = await readFile(path.join(stage.directory, 'game.js'), 'utf8');
      assert.equal(originalEntry.split('/* Unity Converter Injection */').length - 1, 1);
      await writeFile(path.join(stage.directory, 'subpackages/resources/sound.bin'), 'tampered');
      assert.equal(
        acceptsOfficialConversionProof(stage.proof, await inventory(stage.directory)),
        false,
      );
      await assert.rejects(
        replayOfficialConversion({
          sourceDirectory: source,
          pluginArchive,
          config,
          expectedFinalDirectory: stage.directory,
        }),
        /match|changed|integrity|differ/i,
      );
      await assert.rejects(
        replayOfficialConversion({
          sourceDirectory: source,
          pluginArchive,
          expectedRawDirectory: source,
        }),
        /match|changed|integrity|differ/i,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
