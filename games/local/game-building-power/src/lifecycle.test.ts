import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import type { CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import type { RewardOutcome } from '@coffeeeeffoc/game-contract';
import { buildingPowerCanvasDefinition, defaultBuildingPowerEnvelope } from './index.js';
import { newProgress, readProgress } from './progress.js';
import * as simulation from './simulation.js';
import type { ViewState } from './view.js';

const observed = vi.hoisted(() => ({ ui: null as ViewState | null }));
vi.mock('./view.js', () => ({
  WIDTH: 390,
  HEIGHT: 844,
  COMPACT_HEIGHT: 630,
  draw: (_ctx: unknown, ui: ViewState) => {
    observed.ui = ui;
    const ids =
      ui.screen === 'lobby'
        ? ['start']
        : ui.screen === 'paused'
          ? ['resume', 'retry', 'menu']
          : ui.screen === 'result'
            ? ['retry', 'menu', 'rescue', 'bonus']
            : [
                'grid',
                'solar',
                'pause',
                'battery',
                'defer',
                ...ui.rooms.filter((r) => r.status !== 'idle').map((r) => `room:${r.id}`),
              ];
    return ids.map((id, i) => ({ id, x: 10, y: 10 + i * 60, w: 100, h: 54, label: id }));
  },
}));

function host() {
  return createInMemoryGameHost({
    session: {
      gameId: 'building-power',
      gameVersion: '1.0.0',
      capabilities: ['content', 'storage', 'advertising', 'telemetry'],
      adAuthority: 'none',
    },
    content: defaultBuildingPowerEnvelope,
  });
}
async function mount(gameHost = host()) {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  let input: ((e: CanvasPointerEvent) => void) | undefined,
    action: ((id: string) => void) | undefined;
  const context = new Proxy({}, { get: () => () => undefined }) as CanvasRenderingContext2D;
  const stop = vi.fn();
  const instance = await buildingPowerCanvasDefinition.mount(
    {
      canvas: { width: 390, height: 844, getContext: () => context },
      onTap: () => stop,
      onPointer(fn) {
        input = fn;
        return stop;
      },
      onAction(fn) {
        action = fn;
        return stop;
      },
    },
    gameHost,
  );
  return {
    instance,
    stop,
    action: (id: string) => action?.(id),
    input: (event: CanvasPointerEvent) => input?.(event),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  observed.ui = null;
});
describe('lifecycle and transactional input', () => {
  it('connects directly on a room tap and disconnects on the next tap', async () => {
    vi.useFakeTimers();
    const game = await mount();
    game.action('start');
    // The first room hit in this input fixture is at y=310; no source is selected.
    game.input({ phase: 'down', x: 30, y: 330, pointerId: 1 });
    game.input({ phase: 'up', x: 30, y: 330, pointerId: 1 });
    expect(observed.ui!.load).toBe(780);
    expect(observed.ui!.rooms.find((r) => r.id === 'l1-r1')!.source).toBe('grid');
    game.action('room:l1-r1');
    expect(observed.ui!.load).toBe(80);
    game.action('room:l1-r1');
    expect(observed.ui!.load).toBe(780);
    await game.instance.dispose();
  });
  it('freezes background time, requires resume, and disposes input/timers', async () => {
    vi.useFakeTimers();
    const game = await mount();
    game.action('start');
    vi.advanceTimersByTime(1050);
    const before = observed.ui!.remaining;
    game.instance.pause();
    vi.advanceTimersByTime(120000);
    game.instance.resume();
    expect(observed.ui!.screen).toBe('paused');
    expect(observed.ui!.remaining).toBe(before);
    game.action('resume');
    vi.advanceTimersByTime(1100);
    expect(observed.ui!.remaining).toBeLessThan(before);
    await game.instance.dispose();
    expect(game.stop).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps power unchanged until a legal drop, including cancellation and multi-touch', async () => {
    vi.useFakeTimers();
    const game = await mount();
    game.action('start');
    const room = observed.ui!.rooms.find((r) => r.status === 'waiting')!;
    game.input({ phase: 'down', x: 30, y: 30, pointerId: 1 });
    game.input({ phase: 'move', x: 30, y: 330, pointerId: 1 });
    expect(observed.ui!.load).toBe(80);
    game.input({ phase: 'up', x: 30, y: 330, pointerId: 2 });
    expect(observed.ui!.load).toBe(80);
    game.input({ phase: 'cancel', x: 30, y: 330, pointerId: 1 });
    expect(observed.ui!.load).toBe(80);
    game.action('grid');
    game.action(`room:${room.id}`);
    expect(observed.ui!.load).toBeGreaterThan(80);
    const connected = observed.ui!.load;
    game.input({ phase: 'down', x: 30, y: 330, pointerId: 1 });
    game.input({ phase: 'move', x: 200, y: 820, pointerId: 1 });
    game.input({ phase: 'up', x: 200, y: 820, pointerId: 1 });
    expect(observed.ui!.load).toBe(connected);
    await game.instance.dispose();
  });
  it('rejects malformed saves instead of overwriting them', () => {
    const good = newProgress();
    expect(readProgress({ ...good })).toEqual(good);
    const old = { ...good, version: 1, stars: Array(20).fill(3), best: Array(20).fill(1000) };
    const migrated = readProgress(old);
    expect(migrated.stars.every((n) => n === 0)).toBe(true);
    expect(migrated.legacyScores?.best).toEqual(old.best);
    expect(readProgress(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
    expect(() => readProgress({ ...good, unlocked: 20 })).toThrow();
    expect(() => readProgress({ ...good, coins: -1 })).toThrow();
    expect(() => readProgress({ ...good, stars: [3] })).toThrow();
  });
  it.each(['completed', 'dismissed', 'failed', 'unavailable'] as const)(
    'settles %s rescue once and freezes while the host is pending',
    async (status) => {
      vi.useFakeTimers();
      let resolve!: (value: RewardOutcome) => void;
      const offer = vi.fn(
        () =>
          new Promise<RewardOutcome>((done) => {
            resolve = done;
          }),
      );
      const gameHost = createInMemoryGameHost({
        session: {
          gameId: 'building-power',
          gameVersion: '1.0.0',
          adAuthority: 'host',
          capabilities: ['content', 'storage', 'advertising', 'telemetry'],
        },
        content: defaultBuildingPowerEnvelope,
        offer,
      });
      await gameHost.storage.write('building-power:progress', { ...newProgress(), unlocked: 1 });
      const game = await mount(gameHost);
      game.action('start');
      vi.advanceTimersByTime(8100);
      for (const id of observed.ui!.rooms.filter((r) => r.status === 'waiting').map((r) => r.id)) {
        game.action('grid');
        game.action(`room:${id}`);
      }
      vi.advanceTimersByTime(1500);
      expect(observed.ui!.screen).toBe('result');
      expect(observed.ui!.canRescue).toBe(true);
      const time = observed.ui!.remaining;
      game.action('rescue');
      game.action('rescue');
      vi.advanceTimersByTime(20000);
      expect(offer).toHaveBeenCalledTimes(1);
      expect(observed.ui!.remaining).toBe(time);
      resolve({ status });
      await vi.advanceTimersByTimeAsync(1);
      if (status === 'completed') game.action('rescue');
      expect(offer).toHaveBeenCalledTimes(1);
      expect(observed.ui!.screen).toBe(status === 'completed' ? 'paused' : 'result');
      expect(observed.ui!.assisted).toBe(status === 'completed');
      if (status === 'completed')
        expect(observed.ui!.load).toBeLessThanOrEqual(observed.ui!.capacity);
      await game.instance.dispose();
    },
  );
  it('awards win coins and optional bonus once without changing the standard best', async () => {
    vi.useFakeTimers();
    const offer = vi.fn(async () => ({ status: 'completed' as const }));
    const gameHost = createInMemoryGameHost({
      session: {
        gameId: 'building-power',
        gameVersion: '1.0.0',
        adAuthority: 'host',
        capabilities: ['content', 'storage', 'advertising', 'telemetry'],
      },
      content: defaultBuildingPowerEnvelope,
      offer,
    });
    const game = await mount(gameHost);
    game.action('start');
    // Settlement is a controller concern; the browser smoke plays a full real-input shift.
    vi.spyOn(simulation, 'step').mockImplementation((state) => {
      state.requests.forEach((r) => {
        r.status = 'completed';
        r.source = null;
      });
      state.completed = state.requests.length;
      state.result = 'won';
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(observed.ui!.won).toBe(true);
    const before = readProgress((await gameHost.storage.read('building-power:progress'))!.value);
    game.action('bonus');
    game.action('bonus');
    await vi.advanceTimersByTimeAsync(1);
    game.action('bonus');
    await vi.advanceTimersByTimeAsync(1);
    const after = readProgress((await gameHost.storage.read('building-power:progress'))!.value);
    expect(after.coins).toBe(before.coins + 30);
    expect(after.best).toEqual(before.best);
    expect(offer).toHaveBeenCalledTimes(1);
    game.action('menu');
    expect(observed.ui!.remaining).toBe(90);
    expect(observed.ui!.levelIndex).toBe(1);
    await game.instance.dispose();
  });
});
