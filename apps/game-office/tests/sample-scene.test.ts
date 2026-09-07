import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasGameTarget, CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { sampleAudio } from '../src/sample/audio.js';
import { actOfficeSample, createOfficeSample, updateOfficeSample } from '../src/sample/model.js';
import { mountOfficeSample, type OfficeSampleRuntime } from '../src/sample/runtime.js';
import { drawScene, sceneManifest } from '../src/sample/scene.js';

const mounted: OfficeSampleRuntime[] = [];
function sceneSurface() {
  const images = new Map<string, CanvasImageSource>();
  const names = new Map<CanvasImageSource, string>();
  const drawn = new Map<string, { source: number[]; x: number; y: number }>();
  const reliefFrames: number[][] = [];
  let position = { x: 0, y: 0 };
  const stack: (typeof position)[] = [];
  const context = {
    save() {
      stack.push({ ...position });
    },
    restore() {
      position = stack.pop()!;
    },
    translate(x: number, y: number) {
      position.x += x;
      position.y += y;
    },
    scale() {},
    transform() {},
    fillRect() {},
    clearRect() {},
    fillText() {},
    measureText: (text: string) => ({ width: text.length * 7 }),
    drawImage(image: CanvasImageSource, ...values: number[]) {
      const name = names.get(image)!;
      drawn.set(name, { source: values.slice(0, 4), ...position });
      if (name === sceneManifest.clips.relief.image) reliefFrames.push(values.slice(0, 4));
    },
  } as unknown as CanvasRenderingContext2D;
  const target: CanvasGameTarget = {
    canvas: { width: 390, height: 844, getContext: () => context },
    onTap: () => () => undefined,
    async loadImage(path) {
      const name = path.replace(/^office-scene\//, '');
      if (!images.has(name)) {
        const image = document.createElement('canvas');
        images.set(name, image);
        names.set(image, name);
      }
      return images.get(name)!;
    },
  };
  return { target, context, images, drawn, reliefFrames };
}

afterEach(async () => {
  for (const instance of mounted.splice(0)) await instance.dispose();
  vi.useRealTimers();
});

describe('Office scene animation and Foley', () => {
  it('treats a light tap on the shared phone and drawer hotspot as pickup or stop', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const surface = sceneSurface();
    let pointer!: (event: CanvasPointerEvent) => void;
    const runtime = mountOfficeSample(
      {
        ...surface.target,
        onPointer(listener) {
          pointer = listener;
          return () => {
            pointer = () => undefined;
          };
        },
      },
      createInMemoryGameHost(),
    );
    mounted.push(runtime);
    await vi.advanceTimersByTimeAsync(0);
    const phone = sceneManifest.hotspots.phone;
    expect(sceneManifest.hotspots.drawer).toEqual(phone);
    const point = {
      x: phone.x + phone.w / 2,
      y: phone.y + phone.h / 2 + sceneManifest.scene.offsetY,
      pointerId: 3,
    };
    const tap = () => {
      pointer({ ...point, phase: 'down' });
      pointer({ ...point, phase: 'up' });
    };
    runtime.dispatch({ type: 'start' });
    tap();
    expect(runtime.getView().state.phone).toBe('pickup');
    vi.advanceTimersByTime(600);
    expect(runtime.getView().state.phone).toBe('using');
    tap();
    expect(runtime.getView().state).toMatchObject({ phone: 'stowing', phoneProgress: 1 });
    vi.advanceTimersByTime(900);
    expect(runtime.getView().state.phone).toBe('working');
  });

  it('consumes a foreground 500ms clock jump on the next tick instead of discarding time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const runtime = mountOfficeSample(sceneSurface().target, createInMemoryGameHost());
    mounted.push(runtime);
    await vi.advanceTimersByTimeAsync(0);
    runtime.dispatch({ type: 'start' });
    vi.setSystemTime(500);
    vi.advanceTimersToNextTimer();
    expect(runtime.getView().state.elapsed).toBeGreaterThanOrEqual(0.5);
    expect(runtime.getView().state.elapsed).toBeCloseTo(Date.now() / 1000, 7);
  });

  it('freezes the held-phone source frame after being caught, including forced repaints', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const surface = sceneSurface();
    const runtime = mountOfficeSample(surface.target, createInMemoryGameHost());
    mounted.push(runtime);
    await vi.advanceTimersByTimeAsync(0);
    runtime.dispatch({ type: 'start' });
    runtime.dispatch({ type: 'confirm-data', value: 42 });
    runtime.dispatch({ type: 'phone-start' });
    vi.advanceTimersByTime(34_400);
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.getView().state).toMatchObject({ status: 'caught', phone: 'using' });
    const image = sceneManifest.clips.use.image;
    const frozen = surface.drawn.get(image)!.source;
    const elapsed = runtime.getView().state.elapsed;
    vi.advanceTimersByTime(550);
    runtime.dispatch('sound');
    expect(surface.drawn.get(image)!.source).toEqual(frozen);
    expect(runtime.getView().state.elapsed).toBe(elapsed);
  });

  it('plays victory from its first to final pose without advancing the completed game clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const surface = sceneSurface();
    const runtime = mountOfficeSample(surface.target, createInMemoryGameHost());
    mounted.push(runtime);
    await vi.advanceTimersByTimeAsync(0);
    runtime.dispatch({ type: 'start' });
    runtime.dispatch({ type: 'confirm-data', value: 42 });
    runtime.dispatch({ type: 'pc-entertainment' });
    vi.advanceTimersByTime(21_000);
    runtime.dispatch({ type: 'pc-work' });
    vi.advanceTimersByTime(42_000);
    runtime.dispatch({ type: 'answer', value: 42 });
    vi.advanceTimersByTime(27_000);
    const completed = runtime.getView().state;
    expect(completed).toMatchObject({ status: 'won', elapsed: 90 });
    const clip = sceneManifest.clips.relief;
    const source = (index: number) => {
      const frame = clip.frames[index];
      return [frame.x, frame.y, frame.w, frame.h];
    };
    expect(clip.duration).toBe(1.2);
    expect(surface.reliefFrames[0]).toEqual(source(0));
    vi.advanceTimersByTime(clip.duration * 1000);
    expect(surface.reliefFrames.at(-1)).toEqual(source(clip.frames.length - 1));
    expect(new Set(surface.reliefFrames.map((frame) => frame.join(','))).size).toBeGreaterThan(2);
    expect(runtime.getView().state).toBe(completed);
    vi.advanceTimersByTime(5_000);
    expect(runtime.getView().state.elapsed).toBe(90);
  });

  it('moves the approaching and departing boss continuously along the declared path', async () => {
    const surface = sceneSurface();
    const path = sceneManifest.bossPath!;
    expect(path).toBeDefined();
    const delta = { x: path.far.x - path.near.x, y: path.far.y - path.near.y };
    for (const name of ['boss-near', 'boss-leave']) {
      await surface.target.loadImage!(`office-scene/${sceneManifest.clips[name].image}`);
    }
    const state = { ...createOfficeSample(), status: 'playing' as const };
    for (const boss of ['approach', 'leave'] as const) {
      const duration = boss === 'approach' ? 2 : 4;
      const clip = sceneManifest.clips[boss === 'approach' ? 'boss-near' : 'boss-leave'];
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        drawScene(surface.context, surface.images, { ...state, boss }, fraction * duration);
        const drawing = surface.drawn.get(clip.image)!;
        const distance = boss === 'approach' ? 1 - fraction : fraction;
        expect(drawing.x).toBeCloseTo(delta.x * distance, 7);
        expect(drawing.y - sceneManifest.scene.offsetY).toBeCloseTo(delta.y * distance, 7);
      }
    }
  });

  it.each(['phone-stop', 'phone-stop-fast'] as const)(
    'emits one contact at the pose event for %s and stops when muted',
    (type) => {
      const sounds = new Map<
        string,
        { play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }
      >();
      const target: CanvasGameTarget = {
        ...sceneSurface().target,
        createSound(path) {
          const sound = { play: vi.fn(), stop: vi.fn(), dispose() {} };
          sounds.set(path.split('/').at(-1)!, sound);
          return sound;
        },
      };
      const audio = sampleAudio(target);
      audio.initialize();
      let state = actOfficeSample(createOfficeSample(), { type: 'start' });
      state = updateOfficeSample(actOfficeSample(state, { type: 'phone-start' }), 0.6);
      const using = state;
      state = actOfficeSample(state, { type });
      audio.sync(using, state, true, 0);
      const contact = sounds.get('contact.wav')!;
      expect(contact.play).not.toHaveBeenCalled();
      const clip = sceneManifest.clips[type === 'phone-stop-fast' ? 'stow-fast' : 'stow'];
      const contactEvent = clip.events!.find((event) => event.name === 'phone-screen-off')!;
      const threshold = 1 - contactEvent.at / clip.duration;
      for (let index = 0; index < 60; index += 1) {
        const previous = state;
        state = updateOfficeSample(state, 1 / 60);
        audio.sync(previous, state, true, 0);
        if (state.phoneProgress > threshold) expect(contact.play).not.toHaveBeenCalled();
      }
      expect(contact.play).toHaveBeenCalledOnce();
      audio.sync(state, state, true, 0);
      expect(contact.play).toHaveBeenCalledOnce();
      audio.sync(state, state, false, 0);
      expect([...sounds.values()].every((sound) => sound.stop.mock.calls.length > 0)).toBe(true);
      const counts = [...sounds.values()].map((sound) => sound.play.mock.calls.length);
      const next = actOfficeSample(state, { type: 'pc-entertainment' });
      audio.sync(state, next, false, 0);
      expect([...sounds.values()].map((sound) => sound.play.mock.calls.length)).toEqual(counts);
      audio.dispose();
    },
  );
});
