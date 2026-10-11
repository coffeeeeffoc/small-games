import { describe, expect, it } from 'vitest';
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
