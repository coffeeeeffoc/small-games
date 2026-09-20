import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ShellApp } from '../src/ShellApp.js';
import games from '../src/standalone-games.json';
import { builtInGameRegistry } from '../src/registry.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('opens each standalone Game and removes its frame on exit', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ShellApp runtimeClient={false} />));
    const featuredTitles = [
      '浪湾卡丁车',
      '围捕小队',
      '别跑！街区围捕',
      '词屿 · 字母叠叠乐',
      '此时 · 此地',
      '象五子棋',
    ];
    expect(
      [...container.querySelectorAll('article h2')].map((heading) => heading.textContent),
    ).toEqual([
      ...featuredTitles,
      ...[...builtInGameRegistry, ...games]
        .map((game) => game.title)
        .filter((title) => !featuredTitles.includes(title)),
    ]);
    for (const { id, title } of games) {
      const card = [...container.querySelectorAll('article')].find((item) =>
        item.textContent?.includes(title),
      );
      expect(card).toBeDefined();
      await act(async () => card?.querySelector('button')?.click());
      expect(window.location.hash).toBe(`#/games/${id}`);
      const frame = container.querySelector('iframe');
      expect(frame?.getAttribute('src')).toBe(`/games/${id}/index.html`);
      expect(frame?.title).toBe(title);
      expect(container.querySelector('a')?.getAttribute('href')).toBe(frame?.getAttribute('src'));
      await act(async () =>
        container
          .querySelector('nav button')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
      );
      expect(container.querySelector('iframe')).toBeNull();
      expect(window.location.hash).toBe('');
      expect(container.querySelector('[aria-label="Game Catalog"]')).not.toBeNull();
    }
  } finally {
    await act(async () => root.unmount());
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  }
});

it.each(games)('restores standalone Game $id from a shared URL', async ({ id, title }) => {
  window.history.replaceState(null, '', `/small-games/#/games/${id}`);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ShellApp runtimeClient={false} />));
    expect(container.querySelector('iframe')?.title).toBe(title);
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(`/games/${id}/index.html`);
    await act(async () => {
      window.history.replaceState(null, '', '/small-games/');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[aria-label="Game Catalog"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  }
});
