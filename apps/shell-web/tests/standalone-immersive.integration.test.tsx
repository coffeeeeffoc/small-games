import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { StandaloneGame } from '../src/StandaloneGame.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ink = 'ink-is-everything';
const displayState = (screen = 'playing') => ({
  type: 'small-games:display-state',
  gameId: ink,
  screen,
});

async function mounted(id = ink) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const exit = vi.fn();
  await act(async () => root.render(<StandaloneGame id={id} title="Test Game" onExit={exit} />));
  const frame = container.querySelector('iframe')!;
  const origin = new URL(frame.src, window.location.href).origin;
  const send = async (data: unknown, source = frame.contentWindow, from = origin) => {
    await act(async () =>
      window.dispatchEvent(new MessageEvent('message', { data, source, origin: from })),
    );
  };
  const dispose = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return { container, root, frame, send, exit, dispose, origin };
}

it.each([
  'retreat-rally',
  'chase-thief',
  'orbit-atelier',
  'ink-is-everything',
  'ball-roguelite',
  'xiangqi-five',
  'letters-words2',
  'wulong-city',
])(
  'lets the %s frame hide its navigation during play, restore home exit, and exit normally',
  async (id) => {
    const { container, send, exit, dispose } = await mounted(id);
    try {
      const nav = container.querySelector('nav')!;
      expect(container.querySelector('main')?.getAttribute('data-immersive')).toBe('true');
      expect(container.querySelector('main')?.getAttribute('data-game-id')).toBe(id);
      expect(nav.hidden).toBe(false);
      expect(nav.querySelectorAll('button')).toHaveLength(id === 'xiangqi-five' ? 2 : 1);
      expect(nav.querySelector('a,strong,[data-game-fullscreen]')).toBeNull();
      expect(nav.querySelector('button')?.textContent).toBe('返回目录');
      expect(nav.querySelector('.game-share button')?.textContent ?? null).toBe(
        id === 'xiangqi-five' ? '分享游戏' : null,
      );
      await send({ ...displayState(), gameId: id });
      expect(container.querySelector('main')?.getAttribute('data-screen')).toBe('playing');
      expect(nav.hidden).toBe(true);
      await send({ ...displayState('home'), gameId: id });
      expect(container.querySelector('main')?.getAttribute('data-screen')).toBe('home');
      expect(nav.hidden).toBe(false);
      await act(async () => nav.querySelector('button')!.click());
      expect(exit).toHaveBeenCalledOnce();
    } finally {
      await dispose();
    }
  },
);

it('rejects forged source, origin, game ID and malformed display messages', async () => {
  const { container, frame, send, dispose, origin } = await mounted();
  try {
    const nav = container.querySelector('nav')!;
    await send(displayState(), window, origin);
    expect(nav.hidden).toBe(false);
    await send(displayState(), frame.contentWindow, 'https://untrusted.example');
    expect(nav.hidden).toBe(false);
    for (const data of [
      { ...displayState(), gameId: 'wulong-city' },
      { ...displayState(), type: 'other-message' },
      displayState('paused'),
      { ...displayState(), screen: true },
      { ...displayState(), extra: true },
      ['small-games:display-state', ink, 'playing'],
      null,
      'playing',
    ]) {
      await send(data);
      expect(nav.hidden).toBe(false);
      expect(container.querySelector('main')?.getAttribute('data-screen')).toBe('home');
    }
    await send(displayState());
    expect(nav.hidden).toBe(true);
    await send(displayState('home'), window);
    expect(nav.hidden).toBe(true);
    await send(displayState('home'), frame.contentWindow, 'https://untrusted.example');
    expect(nav.hidden).toBe(true);
  } finally {
    await dispose();
  }
});

it('restores the ink home exit when the iframe reloads', async () => {
  const { container, frame, send, dispose } = await mounted();
  try {
    await send(displayState());
    expect(container.querySelector('nav')!.hidden).toBe(true);
    await act(async () => frame.dispatchEvent(new Event('load')));
    expect(container.querySelector('nav')!.hidden).toBe(false);
    expect(container.querySelector('main')?.getAttribute('data-screen')).toBe('home');
  } finally {
    await dispose();
  }
});

it('restores the street chase home exit after play and iframe reload', async () => {
  const { container, frame, send, dispose, origin } = await mounted('chase-thief');
  const state = { type: 'small-games:display-state', gameId: 'chase-thief', screen: 'playing' };
  try {
    const nav = container.querySelector('nav')!;
    await send(state, window, origin);
    expect(nav.hidden).toBe(false);
    await send(state, frame.contentWindow, 'https://untrusted.example');
    expect(nav.hidden).toBe(false);
    await send({ ...state, extra: true });
    expect(nav.hidden).toBe(false);
    await send(state);
    expect(nav.hidden).toBe(true);
    await act(async () => frame.dispatchEvent(new Event('load')));
    expect(nav.hidden).toBe(false);
    expect(container.querySelector('main')?.getAttribute('data-screen')).toBe('home');
  } finally {
    await dispose();
  }
});

it('uses only the word island frame to hide navigation and restores its home on reload', async () => {
  const { container, frame, send, dispose, origin } = await mounted('letters-words2');
  const state = { type: 'small-games:display-state', gameId: 'letters-words2', screen: 'playing' };
  try {
    const nav = container.querySelector('nav')!;
    expect(container.querySelector('main')?.getAttribute('data-game-id')).toBe('letters-words2');
    await send(state, window, origin);
    expect(nav.hidden).toBe(false);
    await send(state, frame.contentWindow, 'https://untrusted.example');
    expect(nav.hidden).toBe(false);
    await send({ ...state, extra: true });
    expect(nav.hidden).toBe(false);
    await send(state);
    expect(nav.hidden).toBe(true);
    await act(async () => frame.dispatchEvent(new Event('load')));
    expect(nav.hidden).toBe(false);
    expect(container.querySelector('main')?.getAttribute('data-screen')).toBe('home');
  } finally {
    await dispose();
  }
});

it('keeps other games navigation and sharing controls after an ink display message', async () => {
  const { container, root, send, exit, dispose } = await mounted();
  try {
    await send(displayState());
    await act(async () =>
      root.render(<StandaloneGame id="weather-command" title="天气指挥所" onExit={exit} />),
    );
    expect(container.querySelector('main')?.hasAttribute('data-immersive')).toBe(false);
    const nav = container.querySelector('nav')!;
    expect(nav.hidden).toBe(false);
    expect(nav.querySelector('strong')?.textContent).toBe('天气指挥所');
    expect(nav.querySelector('[data-game-fullscreen]')).not.toBeNull();
    expect(nav.querySelector('a')?.textContent).toBe('独立打开');
    expect(
      [...nav.querySelectorAll('button')].some((button) => button.textContent?.includes('分享')),
    ).toBe(true);
    await send(displayState());
    expect(nav.hidden).toBe(false);
  } finally {
    await dispose();
  }
});
