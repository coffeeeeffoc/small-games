import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  cricketCanvasDefinition as definition,
  defaultCricketEnvelope as content,
} from '@coffeeeeffoc/game-cricket/canvas';
import {
  createNativeAdProvider,
  createNativeGameHost,
  type TouchEvent,
} from '@coffeeeeffoc/native-game-shell';
import { startWechatGame } from '@coffeeeeffoc/platform-wechat';
import { startBilibiliGame } from '@coffeeeeffoc/platform-bilibili';
import { fakeSdk } from './native.fixture.js';
import { startDouyinGame } from '@coffeeeeffoc/platform-douyin';
import {
  buildingPowerCanvasDefinition,
  defaultBuildingPowerEnvelope,
} from '@coffeeeeffoc/game-building-power/canvas';

afterEach(() => vi.useRealTimers());

describe('standalone native Games', () => {
  it.each(['wechat', 'bilibili', 'douyin'] as const)(
    'mounts the building-power public Canvas export and pauses on %s',
    async (platform) => {
      vi.useFakeTimers();
      const fake = fakeSdk();
      const game = {
        definition: buildingPowerCanvasDefinition,
        content: defaultBuildingPowerEnvelope,
      };
      const pending =
        platform === 'bilibili'
          ? startBilibiliGame(fake.sdk, game, '忙碌的电工')
          : platform === 'douyin'
            ? startDouyinGame({ ...fake.sdk, createRewardedVideoAd: undefined }, game)
            : startWechatGame(fake.sdk, game);
      if (platform === 'bilibili') fake.choose('开始游戏');
      const instance = await pending;
      fake.choose('开始第');
      expect(fake.has('暂停')).toBe(true);
      expect(fake.audio.some((clip) => clip.play.mock.calls.length)).toBe(true);
      for (const hide of fake.hides) hide();
      const paused = [...fake.labels];
      await vi.advanceTimersByTimeAsync(5000);
      expect([...fake.labels]).toEqual(paused);
      for (const show of fake.shows) show();
      expect(fake.has('时间已冻结')).toBe(true);
      await instance.dispose();
      expect(fake.shows.size + fake.hides.size).toBe(0);
      expect(fake.audio.every((clip) => clip.destroy.mock.calls.length === 1)).toBe(true);
    },
  );

  it.each([
    [['--platform', 'wechat', '--game', 'cricket'], 'Release needs'],
    [
      ['--platform', 'wechat', '--game', 'cricket', '--app-id', 'invalid', '--preview'],
      'Invalid wechat/cricket AppID',
    ],
    [['--platform', 'unknown', '--game', 'cricket', '--preview'], 'Choose --platform'],
  ])('rejects unsafe release arguments %j before building', (args, message) => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../scripts/build.mjs', import.meta.url)), ...args],
      { encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
  });
  it.each(['wechat', 'bilibili'] as const)(
    'plays, persists, restores and pauses Cricket on %s',
    async (platform) => {
      vi.useFakeTimers();
      const fake = fakeSdk();
      const begin = () => {
        const pending =
          platform === 'wechat'
            ? startWechatGame(fake.sdk, { definition, content })
            : startBilibiliGame(fake.sdk, { definition, content }, '秋声斗蟋');
        if (platform === 'bilibili') fake.choose('开始游戏');
        return pending;
      };
      const instance = await begin();
      fake.choose('揭盖');
      fake.choose('开始蓄力');
      await vi.advanceTimersByTimeAsync(700);
      fake.choose('出击');
      expect(fake.has('恰到好处')).toBe(true);
      expect(fake.audio.some((clip) => clip.play.mock.calls.length)).toBe(true);
      for (const hide of fake.hides) hide();
      const paused = [...fake.labels];
      await vi.advanceTimersByTimeAsync(5000);
      expect([...fake.labels]).toEqual(paused);
      expect(fake.audio.every((clip) => clip.stop.mock.calls.length)).toBe(true);
      for (const show of fake.shows) show();
      await vi.advanceTimersByTimeAsync(45000);
      expect(fake.has('重新上擂')).toBe(true);
      await instance.dispose();
      expect(JSON.parse(fake.records.get(`${platform}:cricket:progress`)!).value).toMatchObject({
        runs: 1,
        bestHits: 1,
      });
      const restored = await begin();
      expect(fake.has('1场')).toBe(true);
      await restored.dispose();
      expect(fake.shows.size + fake.hides.size).toBe(0);
    },
  );

  it.each(['completed', 'dismissed', 'failed', 'unavailable'] as const)(
    'Cricket only revives after %s',
    async (status) => {
      vi.useFakeTimers();
      const fake = fakeSdk();
      const base = createNativeGameHost(fake.sdk, definition.manifest, content, {
        platformId: 'test',
        sessionId: 'reward-check',
      });
      const host = { ...base, ads: { offer: vi.fn(async () => ({ status })) } };
      const instance = await definition.mount(
        {
          canvas: fake.sdk.createCanvas(),
          onTap(listener) {
            const tap = (event: TouchEvent) =>
              listener(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
            fake.sdk.onTouchEnd(tap);
            return () => fake.sdk.offTouchEnd(tap);
          },
        },
        host,
      );
      fake.choose('揭盖');
      await vi.advanceTimersByTimeAsync(45000);
      fake.choose('观看视频');
      await vi.advanceTimersByTimeAsync(0);
      expect(fake.has('开始蓄力')).toBe(status === 'completed');
      expect(fake.has('重新上擂')).toBe(status !== 'completed');
      expect(host.ads.offer).toHaveBeenCalledOnce();
      await instance.dispose();
    },
  );

  it('Bilibili entry gifts use latest launch scene, persist daily, and do not reward shortcut creation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T16:01:00Z'));
    const fake = fakeSdk();
    const pending = startBilibiliGame(fake.sdk, { definition, content }, '秋声斗蟋');
    const key = 'bilibili:cricket:entry-gifts';
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
    const key = 'bilibili:cricket:entry-gifts';
    fake.records.set(key, 'corrupt-save');
    fake.sdk.checkScene = () => {
      throw new Error('unsupported');
    };
    fake.sdk.addShortcut = () => {
      throw new Error('unsupported');
    };
    const pending = startBilibiliGame(fake.sdk, { definition, content }, '秋声斗蟋');
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
