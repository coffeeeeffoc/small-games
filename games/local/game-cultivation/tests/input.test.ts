import { afterEach, expect, it, vi } from 'vitest';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { createCultivationSurface } from '../src/canvas/surface.js';
import { defaultCultivationContent } from '../src/content/data.js';
import { canvasContext } from './canvas.fixture.js';
afterEach(() => vi.useRealTimers());
it('keeps native multitouch independent, cancels held actions and freezes background time', async () => {
  vi.useFakeTimers();
  const stop = vi.fn(),
    play = vi.fn();
  const surface = createCultivationSurface(
    {
      canvas: { width: 480, height: 800, getContext: () => canvasContext() },
      onTap: () => () => {},
      onPointer: () => stop,
      createSound: () => ({ play, stop: () => {}, dispose: () => {}, setVolume: () => {} }),
    },
    defaultCultivationContent,
    createInMemoryGameHost(),
  );
  surface.command('start');
  const before = { ...surface.state.player };
  surface.pointer({ phase: 'down', pointerId: 1, x: 110, y: 690 });
  surface.pointer({ phase: 'down', pointerId: 2, x: 403, y: 721 });
  await vi.advanceTimersByTimeAsync(500);
  expect(surface.state.player.x).toBeGreaterThan(before.x);
  expect(surface.state.charge).toBeGreaterThan(0.4);
  surface.pointer({ phase: 'cancel', pointerId: 2, x: 0, y: 0 });
  expect(surface.state.charge).toBeNull();
  expect(surface.state.move.x).toBeGreaterThan(0);
  expect(surface.state.swords).toHaveLength(0);
  surface.pause();
  const elapsed = surface.state.elapsed;
  await vi.advanceTimersByTimeAsync(5000);
  expect(surface.state.elapsed).toBe(elapsed);
  surface.resume();
  surface.pointer({ phase: 'up', pointerId: 2, x: 403, y: 721 });
  expect(surface.state.swords).toHaveLength(0);
  expect(surface.state.move).toEqual({ x: 0, y: 0 });
  surface.state.player = { x: 240, y: 130 };
  surface.keyboard('KeyW', true);
  surface.keyboard('KeyE', true);
  expect(surface.state.scene).toBe('forest');
  expect(surface.state.move).toEqual({ x: 0, y: 0 });
  surface.keyboard('KeyD', true);
  expect(surface.state.move).toEqual({ x: 1, y: 0 });
  surface.keyboard('KeyD', false);
  surface.state.relics = ['shield', 'return'];
  surface.state.pending = 'wood';
  surface.command('mute');
  const choice = surface.buttons.find((b) => b.id === 'relic:0')!;
  surface.pointer({ phase: 'down', pointerId: 3, x: choice.x + 10, y: choice.y + 10 });
  surface.pointer({ phase: 'up', pointerId: 3, x: choice.x + 10, y: choice.y + 10 });
  expect(surface.state.pending).toBeNull();
  expect(surface.state.relics).toEqual(['wood', 'return']);
  surface.command('mute');
  surface.command('pause');
  play.mockClear();
  surface.command('motion');
  surface.pointer({ phase: 'down', pointerId: 4, x: 150, y: 360 });
  expect(play).not.toHaveBeenCalled();
  await surface.dispose();
  await surface.dispose();
  expect(stop).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
