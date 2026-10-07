import { describe, it, expect, vi } from 'vitest';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { createSession } from './session.js';
import { defaultCastleCannonEnvelope } from './index.js';
import { shoot, step } from './rules.js';
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
describe('session input, storage and rewards', () => {
  it('switching ammunition preserves a held aim until release', async () => {
    const s = await createSession(host(), () => {});
    s.action('start');
    s.input('down', 1, 590, 280, null);
    s.action('blast');
    s.input('up', 1, 590, 280, null);
    expect(s.v.b.shots[0].ammo).toBe('blast');
    await s.dispose();
  });
  it('release during reload gives explicit feedback; cancel recovers without firing', async () => {
    const s = await createSession(host(), () => {});
    s.action('start');
    const release = () => {
      s.input('down', 1, 200, 350, null);
      s.input('move', 1, 590, 280, null);
      s.input('up', 1, 590, 280, null);
    };
    release();
    expect(s.v.b.events.filter((e) => e.type === 'solid')).toHaveLength(1);
    release();
    expect(s.v.feedback).toMatch(/正在装填/);
    expect(s.v.b.events.filter((e) => e.type === 'solid')).toHaveLength(1);
    s.tick(3);
    s.input('down', 1, 680, 160, null);
    s.input('cancel', 1, 680, 160, null);
    expect(s.v.feedback).toMatch(/取消/);
    s.input('up', 1, 680, 160, null);
    expect(s.v.b.events.filter((e) => e.type === 'solid')).toHaveLength(1);
    s.input('down', 1, 680, 160, null);
    s.input('up', 1, 680, 160, null);
    expect(s.v.b.events.filter((e) => e.type === 'solid')).toHaveLength(2);
    s.action('retry');
    expect(s.v.feedback).toBe('');
    await s.dispose();
  });

  it('cancel, multitouch, pause and repeated retry do not shoot or advance', async () => {
    const s = await createSession(host(), () => {});
    s.action('start');
    s.input('down', 1, 590, 280, null);
    s.input('up', 2, 680, 160, null);
    expect(s.v.b.shots).toHaveLength(0);
    s.input('cancel', 1, 590, 280, null);
    s.input('up', 1, 590, 280, null);
    expect(s.v.b.shots).toHaveLength(0);
    s.input('down', 1, 200, 350, null);
    s.input('move', 1, 590, 280, null);
    s.input('up', 1, 590, 280, null);
    expect(s.v.b.shots).toHaveLength(1);
    s.pause();
    s.tick(5);
    expect(s.v.b.time).toBe(0);
    s.resume();
    s.tick(0.5);
    expect(s.v.b.modules[0].hp).toBe(0);
    s.action('pause');
    s.tick(10);
    expect(s.v.b.time).toBeCloseTo(0.5);
    s.action('resume');
    s.tick(1);
    expect(s.v.b.time).toBeCloseTo(1.5);
    for (let i = 0; i < 4; i++) {
      s.action('retry');
      expect(s.v.b.modules[0].hp).toBe(3);
      expect(s.v.b.time).toBe(0);
      expect(s.v.b.units).toHaveLength(12);
    }
    await s.dispose();
  });
  it('win unlocks next castle and survives host storage remount; rewards idempotent', async () => {
    const h = host(),
      s = await createSession(h, () => {});
    s.action('start');
    shoot(s.v.b, 'solid', 680, 160);
    step(s.v.b, 3);
    shoot(s.v.b, 'solid', 590, 280);
    s.tick(40);
    expect(s.v.screen).toBe('result');
    expect(s.v.p.unlocked).toBe(1);
    expect(s.v.p.materials).toBe(4);
    await s.dispose();
    const restored = await createSession(h, () => {});
    expect(restored.v.p.materials).toBe(4);
    expect(restored.v.level).toBe(1);
    restored.action('level:2');
    expect(restored.v.screen).toBe('home');
    await restored.dispose();
  });
  it('dev trials and unavailable storage remain playable with no normal rewards', async () => {
    const h = host();
    vi.spyOn(h.storage, 'read').mockRejectedValue(new Error('blocked'));
    vi.spyOn(h.storage, 'write').mockRejectedValue(new Error('blocked'));
    const s = await createSession(h, () => {}, true);
    s.practice(2);
    expect(s.v.practice).toBe(true);
    expect(s.v.level).toBe(2);
    s.action('retry');
    expect(s.v.practice).toBe(true);
    expect(s.v.p.unlocked).toBe(0);
    await s.dispose();
  });
  it('unavailable ads never grant materials or fake a retry', async () => {
    const h = host(),
      offer = vi.spyOn(h.ads, 'offer');
    const s = await createSession(h, () => {});
    s.action('start');
    s.tick(70);
    s.action('ad-retry');
    expect(offer).not.toHaveBeenCalled();
    expect(s.v.b.result).toBe('lost');
    s.action('retry');
    expect(s.v.b.result).toBe('playing');
    await s.dispose();
  });
});

describe('optional configured host advertising', () => {
  it('completed retry grants three reinforcements once, cancelled and failed offers grant nothing', async () => {
    const h = createInMemoryGameHost({
      session: {
        gameId: 'castle-cannon',
        gameVersion: '1.0.0',
        adAuthority: 'host',
        capabilities: ['content', 'storage', 'advertising', 'telemetry'],
      },
      content: defaultCastleCannonEnvelope,
      offer: async () => ({ status: 'completed' }),
    });
    const s = await createSession(h, () => {}, false, true);
    s.action('start');
    s.tick(70);
    s.action('ad-retry');
    await new Promise((r) => setTimeout(r, 0));
    expect(s.v.b.units).toHaveLength(15);
    expect(s.v.adRetry).toBe(true);
    s.tick(70);
    s.action('ad-retry');
    await new Promise((r) => setTimeout(r, 0));
    expect(s.v.b.result).toBe('lost');
    await s.dispose();
  });
  it('bonus materials are per castle and survive remount', async () => {
    const h = createInMemoryGameHost({
      session: {
        gameId: 'castle-cannon',
        gameVersion: '1.0.0',
        adAuthority: 'host',
        capabilities: ['content', 'storage', 'advertising', 'telemetry'],
      },
      content: defaultCastleCannonEnvelope,
      offer: async () => ({ status: 'completed' }),
    });
    const s = await createSession(h, () => {}, false, true);
    s.action('start');
    shoot(s.v.b, 'solid', 680, 160);
    step(s.v.b, 3);
    shoot(s.v.b, 'solid', 590, 280);
    s.tick(40);
    s.action('ad-bonus');
    await new Promise((r) => setTimeout(r, 0));
    expect(s.v.p.materials).toBe(6);
    s.action('ad-bonus');
    await new Promise((r) => setTimeout(r, 0));
    expect(s.v.p.materials).toBe(6);
    await s.dispose();
    const restored = await createSession(h, () => {}, false, true);
    expect(restored.v.p.bonus).toEqual(['grass-v1']);
    await restored.dispose();
  });
});

describe('reward refusal', () => {
  it.each(['dismissed', 'unavailable', 'failed'] as const)(
    '%s never adds reinforcements',
    async (status) => {
      const h = createInMemoryGameHost({
        session: {
          gameId: 'castle-cannon',
          gameVersion: '1.0.0',
          adAuthority: 'host',
          capabilities: ['content', 'storage', 'advertising', 'telemetry'],
        },
        content: defaultCastleCannonEnvelope,
        offer: async () => ({ status }),
      });
      const s = await createSession(h, () => {}, false, true);
      s.action('start');
      s.tick(70);
      s.action('ad-retry');
      await new Promise((r) => setTimeout(r, 0));
      expect(s.v.b.units).toHaveLength(12);
      expect(s.v.b.result).toBe('lost');
      expect(s.v.adRetry).toBe(false);
      await s.dispose();
    },
  );
});
