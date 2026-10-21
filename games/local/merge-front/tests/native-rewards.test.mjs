import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { nativeRewardConfig, installNativeRewards } from '../scripts/native-rewards.mjs';

test('native channel IDs stay distinct from H5 and reject placeholders', () => {
  for (const channel of ['wechat', 'douyin', 'bilibili']) {
    assert.equal(
      nativeRewardConfig(channel, { TAPTAP_MERGE_FRONT_AD_UNIT_ID: 'h5-slot' }).adUnitId,
      '',
    );
    const key = `MERGE_FRONT_${channel.toUpperCase()}_AD_UNIT_ID`;
    assert.equal(nativeRewardConfig(channel, { [key]: 'native-slot' }).adUnitId, 'native-slot');
    assert.throws(() => nativeRewardConfig(channel, { [key]: 'YOUR_AD_UNIT_ID' }));
  }
});

test('native package executes the common provider and grants only SDK completion', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'merge-native-ad-'));
  try {
    for (const [channel, globalName] of [
      ['wechat', 'wx'],
      ['douyin', 'tt'],
      ['bilibili', 'bl'],
    ]) {
      await writeFile(path.join(directory, 'game.js'), '// Creator entry fixture\n');
      await installNativeRewards(directory, channel, {
        [`MERGE_FRONT_${channel.toUpperCase()}_AD_UNIT_ID`]: 'fixture-slot',
      });
      assert.match(
        await readFile(path.join(directory, 'game.js'), 'utf8'),
        /^require\('\.\/merge-rewards.js'\)/,
      );
      for (const completed of [false, true]) {
        let close;
        const context = vm.createContext({
          setTimeout,
          clearTimeout,
          console,
          [globalName]: {
            createRewardedVideoAd: (options) => {
              assert.equal(options.adUnitId, 'fixture-slot');
              return {
                onClose(fn) {
                  close = fn;
                },
                offClose() {},
                onError() {},
                offError() {},
                load: async () => {},
                show: async () => {},
                destroy: async () => {},
              };
            },
          },
        });
        vm.runInContext(await readFile(path.join(directory, 'merge-rewards.js'), 'utf8'), context);
        const ads = context.MergeFrontHost.ads;
        assert(ads.available);
        const pending = ads.offer({ id: 'merge-front:income-boost' });
        await new Promise((resolve) => setImmediate(resolve));
        close({ isEnded: completed });
        assert.equal((await pending).status, completed ? 'completed' : 'dismissed');
        ads.dispose();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
