import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { OfficeSample } from '../src/sample/OfficeSample.js';

vi.mock('../src/sample/browser.js', () => ({
  browserSampleTarget: (canvas: HTMLCanvasElement) => ({
    canvas,
    onTap: () => () => undefined,
    loadImage: async () => document.createElement('canvas'),
    dispose() {},
  }),
}));

it('keeps host suspension authoritative over browser focus, visibility and host replacement', async () => {
  const context = {
    save() {},
    restore() {},
    translate() {},
    transform() {},
    scale() {},
    fillRect() {},
    clearRect() {},
    fillText() {},
    drawImage() {},
    measureText: () => ({ width: 0 }),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const target = document.createElement('div');
  const root = createRoot(target);
  let host = createInMemoryGameHost();
  const render = (active: boolean) =>
    act(async () => {
      root.render(createElement(OfficeSample, { host, active }));
    });
  const click = (action: string) =>
    act(async () => {
      const button = target.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      expect(button).not.toBeNull();
      button!.click();
    });
  const foreground = () =>
    act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
  try {
    await render(false);
    await foreground();
    await click('start');
    expect(target.querySelector('[data-action="start"]')).not.toBeNull();
    host = createInMemoryGameHost();
    await render(false);
    await foreground();
    await click('start');
    expect(target.querySelector('[data-action="start"]')).not.toBeNull();
    await render(true);
    await click('start');
    await render(false);
    await foreground();
    await click('resume');
    const paused = target.textContent;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(target.textContent).toBe(paused);
    expect(target.querySelector('[data-action="resume"]')).not.toBeNull();
    await render(true);
    await click('resume');
    expect(target.querySelector('[data-action="resume"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.restoreAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  }
});
