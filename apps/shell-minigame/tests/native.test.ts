import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { GameDefinition } from '@coffeeeeffoc/game-contract';
import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import { createNativeAdProvider } from '@coffeeeeffoc/native-game-shell';
import { startBilibiliGame } from '@coffeeeeffoc/platform-bilibili';
import { fakeSdk } from './native.fixture.js';

afterEach(() => vi.useRealTimers());

const content = { gameId: 'fixture-game', schemaVersion: 1, revision: 0, payload: {} };
const definition: GameDefinition<CanvasGameTarget> = {
  manifest: {
    gameId: 'fixture-game',
    version: '1.0.0',
    gameContractVersion: 1,
    contentSchemaVersion: 1,
    capabilities: [],
    loadModes: ['in-process'],
    entry: 'game.js',
    integrity: 'fixture',
  },
  async mount() {
    return { pause() {}, resume() {}, async dispose() {} };
  },
};

describe('standalone native Games', () => {
  it.each([
    [['--platform', 'wechat', '--game', 'moss-garden'], 'Release needs'],
    [
      ['--platform', 'wechat', '--game', 'moss-garden', '--app-id', 'invalid', '--preview'],
      'Invalid wechat/moss-garden AppID',
    ],
    [['--platform', 'unknown', '--game', 'moss-garden', '--preview'], 'Choose --platform'],
  ])('rejects unsafe release arguments %j before building', (args, message) => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../scripts/build.mjs', import.meta.url)), ...args],
      { encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
  });
  it('Bilibili entry gifts use latest launch scene, persist daily, and do not reward shortcut creation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T16:01:00Z'));
    const fake = fakeSdk();
    const pending = startBilibiliGame(fake.sdk, { definition, content }, 'Fixture game');
    const key = 'bilibili:fixture-game:entry-gifts';
    fake.choose('添加桌面');
    expect(fake.records.has(key)).toBe(false);
    for (const show of fake.shows) show({ scene: '021036' });
    for (const show of fake.shows) show({ scene: '021036' });
    expect(JSON.parse(fake.records.get(key)!).count).toBe(1);
    for (const show of fake.shows) show({ scene: '10002' });
    expect(JSON.parse(fake.records.get(key)!).count).toBe(2);
    vi.setSystemTime(new Date('2026-09-18T16:01:00Z'));
    for (const show of fake.shows) show({ scene: '021036' });
    expect(JSON.parse(fake.records.get(key)!).count).toBe(3);
    expect(fake.sdk.launchSuccess).toHaveBeenCalledOnce();
    fake.choose('开始游戏');
    const instance = await pending;
    await instance.dispose();
  });

  it.each([true, false, undefined])(
    'shared SDK ad provider validates completion %s',
    async (isEnded) => {
      const fake = fakeSdk();
      let close!: (result?: { isEnded?: boolean }) => void;
      const destroy = vi.fn();
      fake.sdk.createRewardedVideoAd = () => ({
        load: async () => undefined,
        show: async () => {
          close({ isEnded });
          close({ isEnded: true });
        },
        destroy,
        onClose: (listener) => {
          close = listener;
        },
        offClose() {},
        onError() {},
        offError() {},
      });
      await expect(
        createNativeAdProvider(fake.sdk, 'test-placement').show({ opportunityId: 'test' }),
      ).resolves.toEqual({ status: isEnded === true ? 'completed' : 'dismissed' });
      expect(destroy).toHaveBeenCalledOnce();
    },
  );

  it('preserves unreadable Bilibili saves and tolerates unsupported entry APIs', async () => {
    const fake = fakeSdk();
    const key = 'bilibili:fixture-game:entry-gifts';
    fake.records.set(key, 'corrupt-save');
    fake.sdk.checkScene = () => {
      throw new Error('unsupported');
    };
    fake.sdk.addShortcut = () => {
      throw new Error('unsupported');
    };
    const pending = startBilibiliGame(fake.sdk, { definition, content }, 'Fixture game');
    fake.choose('添加桌面');
    expect(fake.has('暂时无法添加桌面')).toBe(true);
    for (const show of fake.shows) show({ scene: '10002' });
    expect(fake.records.get(key)).toBe('corrupt-save');
    fake.choose('开始游戏');
    const instance = await pending;
    await instance.dispose();
    await instance.dispose();
    expect(fake.shows.size + fake.hides.size).toBe(0);
  });
});
