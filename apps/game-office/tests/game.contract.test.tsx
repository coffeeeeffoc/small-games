import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostError, type GameHost, type GameInstance } from '@coffeeeeffoc/game-contract';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { defaultOfficeEnvelope, officeGameDefinition } from '@coffeeeeffoc/game-office';
import * as scene from '../src/first-person/runtime.js';

const instances: GameInstance[] = [];
function gameHost() {
  return createInMemoryGameHost({
    session: { gameId: 'office', gameVersion: '2.0.0', capabilities: ['content', 'storage'] },
    content: defaultOfficeEnvelope,
  });
}
function button(target: HTMLElement, text: string) {
  const value = [...target.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(text),
  );
  if (!value) throw new Error(`Missing button: ${text}`);
  return value;
}
const click = (target: HTMLElement, text: string) =>
  act(async () => {
    button(target, text).click();
  });
const advance = (milliseconds: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
async function mount(host = gameHost()) {
  const target = document.createElement('div');
  document.body.append(target);
  let instance!: GameInstance;
  await act(async () => {
    instance = await officeGameDefinition.mount(target, host);
  });
  instances.push(instance);
  return { target, instance };
}

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const context = {
    clearRect() {},
    fillRect() {},
    fillText() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    fill() {},
    stroke() {},
    createRadialGradient: () => ({ addColorStop() {} }),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 800, 450),
  );
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => {
    for (const instance of instances.splice(0)) await instance.dispose();
  });
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

describe('first-person Office Game Contract', () => {
  it('runs the actual scene, respects host suspension, disposes, and can enter again', async () => {
    const { target, instance } = await mount();
    expect(target.querySelector('[aria-label="打工人摸鱼记 · 第一人称办公室"]')).not.toBeNull();
    expect(target.querySelector('canvas')?.width).toBe(800);
    await click(target, '悄悄进入办公室');
    expect(target.textContent).toContain('别让老板发现你迟到了');
    await act(async () => {
      instance.pause();
    });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      button(target, '继续潜入').click();
    });
    expect(button(target, '继续潜入').disabled).toBe(true);
    const paused = target.textContent;
    await advance(1200);
    expect(target.textContent).toBe(paused);
    await act(async () => {
      instance.resume();
    });
    expect(target.querySelector('.office-result')).toBeNull();
    await click(target, '暂停');
    await advance(300);
    await click(target, '继续潜入');
    await act(async () => {
      await instance.dispose();
    });
    expect(target.childElementCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    const again = await mount();
    expect(again.target.textContent).toContain('悄悄进入办公室');
  });

  it('clears keyboard keys held across host suspension before accepting another direction', async () => {
    const mounted = vi.spyOn(scene, 'mountOfficeScene');
    const { target, instance } = await mount();
    const result = mounted.mock.results[0];
    if (result.type !== 'return') throw new Error('Office runtime did not mount');
    const runtime = result.value;
    await click(target, '悄悄进入办公室');
    const canvas = target.querySelector('canvas')!;
    await act(async () => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    });
    await advance(100);
    await act(async () => {
      instance.pause();
    });
    const position = { ...runtime.getView().state.player };
    await act(async () => {
      instance.resume();
    });
    await act(async () => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    });
    await advance(150);
    expect(runtime.getView().state.player.x).toBe(position.x);
    expect(runtime.getView().state.player.z).toBe(position.z);
    expect(runtime.getView().state.player.yaw).toBeGreaterThan(position.yaw);
  });

  it('keeps the scene paused while browsing the week and waits for an explicit resume', async () => {
    const mounted = vi.spyOn(scene, 'mountOfficeScene');
    const { target } = await mount();
    const result = mounted.mock.results[0];
    if (result.type !== 'return') throw new Error('Office runtime did not mount');
    const runtime = result.value;
    await click(target, '悄悄进入办公室');
    await act(async () => {
      target.querySelector<HTMLButtonElement>('[aria-label="打开一周场景表"]')!.click();
    });
    const paused = structuredClone(runtime.getView().state);
    await act(async () => {
      for (const code of ['Escape', 'KeyW'])
        target
          .querySelector('canvas')!
          .dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    });
    await advance(250);
    expect(runtime.getView().state).toEqual(paused);
    expect(runtime.getView().state.status).toBe('paused');
    await act(async () => {
      target.querySelector<HTMLButtonElement>('[aria-label="关闭场景表"]')!.click();
    });
    expect(runtime.getView().state.status).toBe('paused');
    await click(target, '继续潜入');
    expect(runtime.getView().state.status).toBe('playing');
  });

  it('rejects missing capabilities, foreign identities, future schemas, and retired content', async () => {
    const base = gameHost();
    const cases: Array<[GameHost, string]> = [
      [{ ...base, session: { ...base.session, capabilities: [] } }, 'CAPABILITY_MISSING'],
      [{ ...base, session: { ...base.session, gameId: 'arena' } }, 'INVALID_INPUT'],
      [
        { ...base, content: { load: async () => ({ ...defaultOfficeEnvelope, gameId: 'arena' }) } },
        'INVALID_INPUT',
      ],
      [
        {
          ...base,
          content: { load: async () => ({ ...defaultOfficeEnvelope, schemaVersion: 3 }) },
        },
        'CONTENT_INCOMPATIBLE',
      ],
      [
        {
          ...base,
          content: {
            load: async () => ({
              ...defaultOfficeEnvelope,
              schemaVersion: 1,
              payload: { experience: 'classic', days: [] },
            }),
          },
        },
        'INVALID_INPUT',
      ],
    ];
    for (const [host, code] of cases) {
      const target = document.createElement('div');
      await expect(officeGameDefinition.mount(target, host)).rejects.toMatchObject({ code });
      expect(target.childElementCount).toBe(0);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the first scene playable when storage is unavailable', async () => {
    const base = gameHost();
    const host = {
      ...base,
      storage: {
        async read() {
          throw new HostError({ code: 'OFFLINE', message: 'offline' });
        },
        async write() {
          throw new HostError({ code: 'OFFLINE', message: 'offline' });
        },
      },
    };
    const { target } = await mount(host);
    await click(target, '悄悄进入办公室');
    await advance(200);
    expect(target.textContent).toContain('别让老板发现你迟到了');
    expect(target.querySelector('[role="alert"]')).toBeNull();
  });

  it('reports unavailable Canvas instead of silently mounting an empty game', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const { target } = await mount();
    expect(target.querySelector('[role="alert"]')?.textContent).toContain('Canvas');
  });

  it('keeps touch controls after denied gyro permission and ignores a late grant after disposal', async () => {
    vi.stubGlobal('isSecureContext', true);
    const requestPermission = vi.fn(async () => 'denied');
    vi.stubGlobal(
      'DeviceOrientationEvent',
      class extends Event {
        static requestPermission = requestPermission;
      },
    );
    const subscriptions = vi.spyOn(window, 'addEventListener');
    const { target, instance } = await mount();
    await click(target, '体感视角');
    expect(target.textContent).toContain('未获得体感权限，可拖动转头');
    expect(button(target, '体感视角').getAttribute('aria-pressed')).toBe('false');
    let grant!: (value: string) => void;
    requestPermission.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          grant = resolve;
        }),
    );
    await click(target, '体感视角');
    await act(async () => {
      await instance.dispose();
    });
    await act(async () => {
      grant('granted');
      await Promise.resolve();
    });
    expect(subscriptions.mock.calls.some(([type]) => type === 'deviceorientation')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
