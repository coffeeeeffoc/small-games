import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { mountOfficeSample, type OfficeSampleRuntime } from '../src/sample/runtime.js';
import { sampleControls } from '../src/sample/presentation.js';
import { surface } from './sample-runtime-fixture.js';

// A tiny scene avoids requiring production art while retaining real loading and input timing.
vi.mock('../src/sample/scene.js', () => ({
  sceneManifest: {
    scene: { offsetY: 100 },
    hotspots: {
      monitor: { x: 40, y: 100, w: 100, h: 100 },
      phone: { x: 200, y: 250, w: 60, h: 60 },
      drawer: { x: 290, y: 330, w: 70, h: 60 },
    },
  },
  async loadScene(target: CanvasGameTarget) {
    if (!target.loadImage) throw new Error('No image loader');
    return new Map([['scene', await target.loadImage('office-scene/test.png')]]);
  },
  phoneHotspot() {
    return { x: 200, y: 250, w: 60, h: 60 };
  },
  drawScene(context: CanvasRenderingContext2D, images: Map<string, CanvasImageSource>) {
    context.drawImage(images.get('scene')!, 0, 100);
  },
  pointIn(rect: { x: number; y: number; w: number; h: number }, x: number, y: number) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  },
}));

const instances: OfficeSampleRuntime[] = [];
const flush = () => vi.advanceTimersByTimeAsync(0);

async function setup(fake = surface(), host = createInMemoryGameHost()) {
  const onView = vi.fn<NonNullable<Parameters<typeof mountOfficeSample>[2]>>();
  const runtime = mountOfficeSample(fake.target, host, onView);
  instances.push(runtime);
  await flush();
  return { runtime, fake, host, onView };
}

function start(runtime: OfficeSampleRuntime) {
  runtime.dispatch({ type: 'start' });
  runtime.dispatch({ type: 'confirm-data', value: 42 });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(async () => {
  for (const instance of instances.splice(0)) await instance.dispose();
  vi.useRealTimers();
});

describe('desk sample runtime', () => {
  it('keeps the loaded intro still until an explicit start and uses only its own save key', async () => {
    const { runtime, host } = await setup();
    vi.advanceTimersByTime(50_000);
    expect(runtime.getView()).toMatchObject({
      ready: true,
      state: { status: 'intro', elapsed: 0 },
    });
    expect(await host.storage.read('office:desk-sample:v1')).toBeNull();
    start(runtime);
    vi.advanceTimersByTime(1_000);
    expect(runtime.getView().state.elapsed).toBeCloseTo(1, 1);
  });

  it('offers image retry and does not start time while the scene is unavailable', async () => {
    const image = document.createElement('canvas');
    const load = vi
      .fn<() => Promise<HTMLCanvasElement>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(image);
    const { runtime } = await setup(surface(load));
    expect(runtime.getView()).toMatchObject({ ready: false });
    expect(sampleControls(runtime.getView()).some((item) => item.id === 'retry-load')).toBe(true);
    runtime.dispatch({ type: 'start' });
    vi.advanceTimersByTime(1_000);
    expect(runtime.getView().state.elapsed).toBe(0);
    runtime.dispatch('retry-load');
    await flush();
    expect(runtime.getView()).toMatchObject({ ready: true, error: '', state: { status: 'intro' } });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('stays paused after host resume until the player explicitly continues', async () => {
    const { runtime } = await setup();
    start(runtime);
    runtime.dispatch({ type: 'phone-start' });
    vi.advanceTimersByTime(240);
    runtime.pause();
    const paused = runtime.getView().state;
    vi.advanceTimersByTime(30_000);
    runtime.dispatch({ type: 'resume' });
    expect(runtime.getView().state).toBe(paused);
    runtime.resume();
    vi.advanceTimersByTime(30_000);
    expect(runtime.getView().state).toBe(paused);
    expect(paused).toMatchObject({ status: 'paused', phone: 'stowing', activity: 'none' });
    runtime.dispatch({ type: 'resume' });
    vi.advanceTimersByTime(800);
    expect(runtime.getView().state.phone).toBe('working');
    expect(runtime.getView().state.elapsed - paused.elapsed).toBeCloseTo(0.8, 1);
  });

  it('keeps PC evidence and continuous phone cleanup after a cancelled touch', async () => {
    const { runtime, fake } = await setup(surface(undefined, 780));
    start(runtime);
    fake.pointer('down', 'monitor');
    fake.pointer('up', 'monitor');
    fake.pointer('down', 'phone');
    fake.pointer('up', 'phone');
    vi.advanceTimersByTime(800);
    expect(runtime.getView().state).toMatchObject({ pc: 'entertainment', phone: 'using' });
    fake.pointer('down', 'phone');
    fake.pointer('cancel', 'phone');
    expect(runtime.getView().state).toMatchObject({
      pc: 'entertainment',
      phone: 'stowing',
      phoneProgress: 1,
      activity: 'none',
    });
    vi.advanceTimersByTime(400);
    expect(runtime.getView().state.phoneProgress).toBeGreaterThan(0);
    expect(runtime.getView().state.pc).toBe('entertainment');
    vi.advanceTimersByTime(500);
    expect(runtime.getView().state.phone).toBe('working');
  });

  it('allows a phone-to-drawer drag while ignoring a different pointer', async () => {
    const { runtime, fake } = await setup();
    start(runtime);
    runtime.dispatch({ type: 'phone-start' });
    vi.advanceTimersByTime(800);
    fake.pointer('down', 'phone', 7);
    fake.pointer('up', 'drawer', 8);
    expect(runtime.getView().state.phone).toBe('using');
    fake.pointer('move', 'drawer', 7);
    fake.pointer('up', 'drawer', 7);
    expect(runtime.getView().state).toMatchObject({ phone: 'stowing', phoneProgress: 1 });
    expect(sampleControls(runtime.getView()).find((item) => item.id === 'phone')).toMatchObject({
      label: '正在收好…',
      action: { type: 'phone-stop' },
    });
    vi.advanceTimersByTime(900);
    expect(runtime.getView().state.phone).toBe('working');
  });

  it('does not let repeated input slow the actual elapsed time', async () => {
    const { runtime } = await setup();
    start(runtime);
    for (let index = 0; index < 125; index += 1) {
      vi.advanceTimersByTime(8);
      runtime.dispatch({ type: 'pc-work' });
    }
    expect(runtime.getView().state.elapsed).toBeCloseTo(1, 1);
  });

  it('lets the visible question controls finish outstanding work before answering', async () => {
    const { runtime } = await setup();
    runtime.dispatch({ type: 'start' });
    vi.advanceTimersByTime(63_000);
    const confirm = sampleControls(runtime.getView()).find((item) => item.id === 'confirm');
    expect(confirm?.action).toEqual({ type: 'confirm-data', value: 42 });
    runtime.dispatch(confirm!.action);
    const answer = sampleControls(runtime.getView()).find((item) => item.id === 'answer');
    expect(answer?.action).toEqual({ type: 'answer', value: 42 });
    runtime.dispatch(answer!.action);
    expect(runtime.getView().state).toMatchObject({
      status: 'playing',
      boss: 'leave',
      workConfirmed: true,
    });
  });

  it('never paints, publishes or writes after an image finishes on a disposed runtime', async () => {
    let finish!: (image: HTMLCanvasElement) => void;
    const load = () =>
      new Promise<HTMLCanvasElement>((resolve) => {
        finish = resolve;
      });
    const fake = surface(load);
    const host = createInMemoryGameHost();
    let publications = 0;
    const runtime = mountOfficeSample(fake.target, host, () => {
      publications += 1;
    });
    instances.push(runtime);
    await flush();
    await runtime.dispose();
    const before = { draws: fake.draws(), publications };
    finish(document.createElement('canvas'));
    await flush();
    vi.advanceTimersByTime(100_000);
    runtime.dispatch({ type: 'start' });
    expect({ draws: fake.draws(), publications }).toEqual(before);
    expect(fake.listening()).toBe(false);
    expect(await host.storage.read('office:desk-sample:v1')).toBeNull();
  });

  it.each(['failed', 'pending'] as const)(
    'preserves a %s higher record across restart and merges a later win',
    async (firstSave) => {
      const base = createInMemoryGameHost();
      await base.storage.write('legacy-wallet', { coins: 55 }, null);
      let online = firstSave === 'pending';
      let finish!: () => void;
      let attempts = 0;
      let concurrent = 0;
      let peak = 0;
      const host = {
        ...base,
        storage: {
          ...base.storage,
          write: async (...args: Parameters<typeof base.storage.write>) => {
            attempts += 1;
            concurrent += 1;
            peak = Math.max(peak, concurrent);
            try {
              if (!online) throw new Error('offline');
              if (firstSave === 'pending' && attempts === 1)
                await new Promise<void>((resolve) => {
                  finish = resolve;
                });
              return await base.storage.write(...args);
            } finally {
              concurrent -= 1;
            }
          },
        },
      };
      const { runtime, onView } = await setup(surface(), host);
      start(runtime);
      runtime.dispatch({ type: 'pc-entertainment' });
      vi.advanceTimersByTime(35_000);
      await flush();
      const higherScore = runtime.getView().state.joy;
      expect(higherScore).toBeGreaterThan(21);
      expect(runtime.getView().state.status).toBe('caught');
      if (firstSave === 'pending') {
        runtime.dispatch({ type: 'restart', variant: 0 });
        start(runtime);
        vi.advanceTimersByTime(70_000);
        expect(attempts).toBe(1);
        const published = onView.mock.lastCall![0];
        expect(published.state.status).toBe('caught');
        expect(sampleControls(published).some((item) => item.id === 'restart')).toBe(true);
      }
      runtime.dispatch({ type: 'restart', variant: 0 });
      start(runtime);
      runtime.dispatch({ type: 'pc-entertainment' });
      vi.advanceTimersByTime(21_000);
      runtime.dispatch({ type: 'pc-work' });
      vi.advanceTimersByTime(42_000);
      runtime.dispatch({ type: 'answer', value: 42 });
      vi.advanceTimersByTime(28_000);
      await flush();
      expect(runtime.getView().state.status).toBe('won');
      if (firstSave === 'pending') {
        expect(attempts).toBe(1);
        finish();
      } else {
        expect(runtime.getView().saving).toBe('failed');
        expect(sampleControls(runtime.getView()).some((item) => item.id === 'retry-save')).toBe(
          true,
        );
        online = true;
        runtime.dispatch('retry-save');
      }
      await flush();
      expect(runtime.getView().saving).toBe('saved');
      expect((await base.storage.read('office:desk-sample:v1'))?.value).toEqual({
        version: 1,
        cleared: true,
        bestJoy: higherScore,
      });
      expect((await base.storage.read('legacy-wallet'))?.value).toEqual({ coins: 55 });
      expect(peak).toBe(1);
      runtime.dispatch({ type: 'restart' });
      expect(runtime.getView()).toMatchObject({
        saving: 'idle',
        state: { status: 'intro', joy: 0 },
      });
    },
  );

  it('freezes a genuine caught result and records failure without marking it cleared', async () => {
    const { runtime, host } = await setup();
    start(runtime);
    runtime.dispatch({ type: 'pc-entertainment' });
    vi.advanceTimersByTime(50_000);
    await flush();
    expect(runtime.getView()).toMatchObject({ saving: 'saved', state: { status: 'caught' } });
    expect(runtime.getView().state.elapsed).toBeCloseTo(34.35, 6);
    expect((await host.storage.read('office:desk-sample:v1'))?.value).toMatchObject({
      cleared: false,
    });
  });
});
