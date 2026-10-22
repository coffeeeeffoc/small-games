import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { activeGun, gunDirection } from './duel-actions.js';
import { direction } from './duel-types.js';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { defaultCastleCannonEnvelope } from './index.js';
import { createDuelSession } from './duel-session.js';
import { newProgress } from './progress.js';
import { CAMPAIGN } from './campaign.js';
const host = () =>
  createInMemoryGameHost({
    session: {
      gameId: 'castle-cannon',
      gameVersion: '1.0.0',
      adAuthority: 'none',
      capabilities: ['content', 'storage', 'advertising', 'telemetry'],
    },
    content: defaultCastleCannonEnvelope,
  });
describe('对战输入与旧存档', () => {
  it.each(['silent', 'error', 'old-version', 'queue-error', 'queue-stalled'])(
    '匹配事件流 %s 时超时或失败后静默进入本地玩法',
    async (failure) => {
      const s = await createDuelSession(host(), () => {});
      const streams: FakeStream[] = [];
      class FakeStream {
        onmessage: ((event: { data: string }) => void) | null = null;
        onerror: (() => void) | null = null;
        onopen: (() => void) | null = null;
        close = vi.fn();
        constructor() {
          streams.push(this);
        }
      }
      vi.useFakeTimers();
      vi.stubGlobal('location', { origin: 'https://castle.test', protocol: 'https:' });
      vi.stubGlobal('EventSource', FakeStream);
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementation(async () => new Response(JSON.stringify({ token: 'a'.repeat(48) }))),
      );
      try {
        s.action('start');
        await vi.advanceTimersByTimeAsync(0);
        expect(streams).toHaveLength(1);
        expect(s.v.screen).toBe('matching');
        if (failure.startsWith('queue-'))
          streams[0]!.onmessage?.({ data: JSON.stringify({ kind: 'waiting', seconds: 8 }) });
        if (failure === 'error') streams[0]!.onerror?.();
        if (failure === 'queue-error') streams[0]!.onerror?.();
        if (failure === 'old-version')
          streams[0]!.onmessage?.({
            data: JSON.stringify({
              kind: 'state',
              side: 0,
              mode: 'bot',
              matchId: 'old',
              state: { ...s.v.duel, version: 'duel-v1' },
            }),
          });
        await vi.advanceTimersByTimeAsync(failure.startsWith('queue-') ? 13001 : 5001);
        expect(s.v.screen).toBe('playing');
        expect(s.v.mode).toBe('practice');
        expect(s.v.message).toBe('');
        expect(streams[0]!.close).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        await s.dispose();
        vi.unstubAllGlobals();
        vi.useRealTimers();
      }
    },
  );
  it('双方视角右拖炮口向右、上拖炮口向上，额外触点不抢瞄准', async () => {
    const s = await createDuelSession(host(), () => {});
    try {
      for (const side of [0, 1] as const) {
        s.practice();
        s.v.side = side;
        const gun = activeGun(s.v.duel.fighters[side])!,
          d = direction(side);
        const camera = new PerspectiveCamera(52, 16 / 9, 0.2, 550);
        camera.position.set(gun.position.x - 5 * d, gun.position.y + 4.5, gun.position.z + 2 * d);
        camera.lookAt(gun.position.x + 32 * d, gun.position.y + 1.5, gun.position.z - d);
        camera.updateMatrixWorld(true);
        const projected = () => {
          const vector = gunDirection(side, gun);
          return new Vector3(
            gun.position.x + vector.x * 3,
            gun.position.y + 2.05 + vector.y * 3,
            gun.position.z + vector.z * 3,
          ).project(camera);
        };
        const before = projected();
        s.input('down', 1, 470, 320, null);
        s.input('down', 2, 440, 300, null);
        s.input('move', 2, 200, 100, null);
        expect(gun.pitch).toBe(38);
        expect(gun.yaw).toBe(0);
        s.input('move', 1, 510, 280, null);
        s.input('up', 1, 510, 280, null);
        expect(projected().x).toBeGreaterThan(before.x);
        expect(projected().y).toBeGreaterThan(before.y);
      }
    } finally {
      await s.dispose();
    }
  });
  it('切炮取消未完成蓄力并收起望远镜，不在抵达后误射', async () => {
    const s = await createDuelSession(host(), () => {});
    try {
      s.practice();
      s.input('down', 1, 850, 460, 'fire');
      s.v.scope = true;
      s.action('station:wall');
      expect(s.v.scope).toBe(false);
      expect(s.v.duel.fighters[0].guns[0].charge).toBeNull();
      s.input('up', 1, 850, 460, 'fire');
      expect(s.v.duel.fighters[0].lastShot).toBeNull();
    } finally {
      await s.dispose();
    }
  });
  it('联网不可用静默进入本地玩法，再战继续本地模式且无残留提示', async () => {
    const s = await createDuelSession(host(), () => {});
    vi.stubGlobal('location', { origin: 'https://castle.test', protocol: 'https:' });
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    try {
      s.action('start');
      await expect.poll(() => s.v.screen).toBe('playing');
      expect(s.v.mode).toBe('practice');
      expect(s.v.message).toBe('');
      s.v.duel.fighters[1].hp = 0;
      s.tick(0.1);
      expect(s.v.screen).toBe('result');
      s.v.message = '旧提示';
      s.action('rematch');
      expect(s.v.screen).toBe('playing');
      expect(s.v.message).toBe('');
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      await s.dispose();
      vi.unstubAllGlobals();
    }
  });
  it('战役开发跳关仅由统一开发开关开放，不写进度或奖励', async () => {
    const h = host(),
      normal = await createDuelSession(h, () => {});
    normal.previewCampaign(119);
    expect(normal.v.screen).toBe('home');
    await normal.dispose();
    const developer = await createDuelSession(h, () => {}, true);
    developer.previewCampaign(119);
    expect(developer.v.campaignLevel).toBe(119);
    developer.v.duel.fighters[1].hp = 0;
    developer.tick(0.1);
    expect(developer.v.p.unlocked).toBe(0);
    expect(developer.v.p.materials).toBe(0);
    await developer.dispose();
    expect(await h.storage.read('castle-cannon:progress')).toBeNull();
  });
  it('战役不能跳过锁定关，首胜下一关、重试和读档保持正常进度', async () => {
    const h = host(),
      s = await createDuelSession(h, () => {});
    s.action('campaign');
    s.action('campaign-level:119');
    expect(s.v.screen).toBe('campaign');
    s.action('campaign-level:0');
    expect(s.v.screen).toBe('playing');
    expect(s.v.campaignLevel).toBe(0);
    s.input('down', 99, 850, 460, 'fire');
    s.v.duel.fighters[1].hp = 0;
    s.tick(0.1);
    expect(s.v.duel.fighters[0].guns[0].charge).toBeNull();
    expect(s.v.p.unlocked).toBe(1);
    expect(s.v.p.materials).toBe(4);
    s.tick(0.1);
    expect(s.v.p.materials).toBe(4);
    s.action('campaign-retry');
    s.v.duel.fighters[1].hp = 0;
    s.tick(0.1);
    expect(s.v.p.materials).toBe(4);
    s.action('campaign-next');
    expect(s.v.campaignLevel).toBe(1);
    s.action('pause');
    s.pause();
    s.resume();
    expect(s.v.screen).toBe('paused');
    const time = s.v.duel.time;
    s.tick(0.2);
    expect(s.v.duel.time).toBe(time);
    s.action('resume');
    s.tick(0.2);
    expect(s.v.duel.time).toBeGreaterThan(time);
    await s.dispose();
    const restored = await createDuelSession(h, () => {});
    expect(restored.v.p.cleared).toEqual([CAMPAIGN[0]!.id]);
    expect(restored.v.p.unlocked).toBe(1);
    expect(await h.storage.read('castle-cannon:duel-records:practice')).toBeNull();
    await restored.dispose();
  });
  it('保留旧解锁、材料与外观，练习战绩隔离并且只结算一次', async () => {
    const h = host();
    const old = {
      ...newProgress(),
      materials: 80,
      owned: [0, 1],
      skin: 1,
      cleared: ['courtyard'],
      sound: false,
    };
    await h.storage.write('castle-cannon:progress', old);
    const s = await createDuelSession(h, () => {});
    expect(s.v.p.materials).toBe(80);
    expect(s.v.p.skin).toBe(1);
    expect(s.v.p.sound).toBe(false);
    s.practice();
    s.v.duel.fighters[1].hp = 0;
    s.tick(0.1);
    s.tick(0.1);
    await s.dispose();
    const records = (await h.storage.read('castle-cannon:duel-records:practice'))?.value;
    expect(records).toHaveLength(1);
    expect((await h.storage.read('castle-cannon:progress'))?.value).toEqual(old);
    expect(await h.storage.read('castle-cannon:duel-records:human')).toBeNull();
  });
  it('多点趴下与取消不误发射，望远镜拖动不改变仰角', async () => {
    const s = await createDuelSession(host(), () => {});
    s.practice(true);
    s.input('down', 1, 850, 460, 'fire');
    s.tick(0.2);
    s.input('down', 2, 260, 470, 'crouch');
    s.input('up', 1, 850, 460, 'fire');
    expect(s.v.duel.fighters[0].lastShot).toBeNull();
    expect(s.v.duel.fighters[0].crouched).toBe(true);
    s.cancel();
    expect(s.v.duel.fighters[0].crouched).toBe(false);
    s.action('scope');
    const pitch = s.v.duel.fighters[0].guns[0].pitch;
    s.input('down', 3, 480, 250, null);
    s.input('move', 3, 520, 260, null);
    s.input('up', 3, 520, 260, null);
    expect(s.v.scopeX).toBeGreaterThan(0);
    expect(s.v.duel.fighters[0].guns[0].pitch).toBe(pitch);
    s.v.duel.fighters[1].hp = 0;
    s.tick(0.1);
    await s.dispose();
  });
});
