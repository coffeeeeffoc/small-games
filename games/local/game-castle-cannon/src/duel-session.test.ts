import { describe, expect, it } from 'vitest';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { defaultCastleCannonEnvelope } from './index.js';
import { createDuelSession } from './duel-session.js';
import { newProgress } from './progress.js';
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
