import { describe, it, expect, vi } from 'vitest';
import { createBrowserGameHost, createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { createDuelSession } from './duel-session.js';
import { newProgress } from './progress.js';
describe('portrait Creator session contract', () => {
  it.each(['practice', 'campaign'])(
    '%s returns directly to confirmation, cancels held inputs and survives lifecycle',
    async (mode) => {
      const s = await createDuelSession(createInMemoryGameHost(), () => {});
      if (mode === 'practice') s.practice();
      else {
        s.action('campaign');
        s.action('campaign-level:0');
      }
      s.input('down', 1, 200, 500, 'fire');
      s.tick(0.2);
      s.action('leave');
      const time = s.v.duel.time;
      expect(s.v.screen).toBe('confirm');
      expect(s.v.duel.fighters[0].guns[0].charge).toBeNull();
      s.pause();
      s.resume();
      s.tick(0.2);
      expect(s.v.screen).toBe('confirm');
      expect(s.v.duel.time).toBe(time);
      s.input('up', 1, 200, 500, 'fire');
      expect(s.v.duel.shells).toHaveLength(0);
      s.action('resume');
      s.tick(0.1);
      expect(s.v.duel.time).toBeGreaterThan(time);
      s.action('scope');
      s.input('down', 2, 50, 400, null);
      s.input('move', 2, 80, 360, null);
      expect(s.v.scopeX).toBeGreaterThan(0);
      expect(s.v.scopeY).toBeGreaterThan(0);
      s.action('leave');
      s.action('leave-confirm');
      expect(s.v.screen).toBe('home');
      await s.dispose();
    },
  );
  it('keeps the actual browser GameHost envelope and existing materials/skin', async () => {
    const p = newProgress();
    p.materials = 83;
    p.owned = [0, 2];
    p.skin = 2;
    const memory = new Map([
      ['small-games:castle-cannon:progress', JSON.stringify({ value: p, version: '3' })],
    ]);
    const host = createBrowserGameHost({
      storage: {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => memory.set(k, v),
        removeItem: (k) => memory.delete(k),
      },
    });
    const s = await createDuelSession(host, () => {});
    expect(s.v.p.materials).toBe(83);
    expect(s.v.p.skin).toBe(2);
    s.action('sound');
    await s.dispose();
    const record = JSON.parse(memory.get('small-games:castle-cannon:progress')!);
    expect(record.value.materials).toBe(83);
    expect(record.value.sound).toBe(false);
    expect(record.version).toBe('4');
  });
  it('remote authoritative updates continue behind confirmation', async () => {
    const streams: { onmessage: ((e: { data: string }) => void) | null }[] = [];
    class Stream {
      onmessage = null;
      onerror = null;
      close() {}
      constructor() {
        streams.push(this);
      }
    }
    vi.stubGlobal('location', { origin: 'https://castle.test', protocol: 'https:' });
    vi.stubGlobal('EventSource', Stream);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ token: 'a'.repeat(48) }))),
    );
    const s = await createDuelSession(createInMemoryGameHost(), () => {});
    try {
      s.action('start');
      await new Promise((r) => setTimeout(r, 0));
      const state = structuredClone(s.v.duel);
      const send = () =>
        streams[0]?.onmessage?.({
          data: JSON.stringify({ kind: 'state', matchId: 'remote', mode: 'human', side: 1, state }),
        });
      send();
      expect(s.online).toBe(true);
      s.action('leave');
      state.time = 18;
      send();
      expect(s.v.screen).toBe('confirm');
      expect(s.v.duel.time).toBe(18);
      s.pause();
      s.resume();
      expect(s.v.screen).toBe('confirm');
    } finally {
      await s.dispose();
      vi.unstubAllGlobals();
    }
  });
});
