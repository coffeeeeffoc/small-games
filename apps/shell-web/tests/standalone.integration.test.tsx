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
      '街区追捕',
      '词屿 · 字母叠叠乐',
      '此时 · 此地',
      '象五子棋',
      '江风入境 · 外滩漫游',
      '夜航守望',
      '乌龙城',
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
      const launch = card!.querySelector<HTMLAnchorElement>('a.game-launch');
      expect(launch?.getAttribute('href')).toBe(`/games/${id}/index.html`);
      await act(async () => launch!.click());
      expect(window.location.hash).toBe(`#/games/${id}`);
      const frame = container.querySelector('iframe');
      expect(frame?.getAttribute('src')).toBe(`/games/${id}/index.html`);
      expect(frame?.title).toBe(title);
      expect(launch?.getAttribute('href')).toBe(frame?.getAttribute('src'));
      if (
        id === 'ink-is-everything' ||
        id === 'ball-roguelite' ||
        id === 'xiangqi-five' ||
        id === 'letters-words2'
      ) {
        expect(container.querySelector('nav a')).toBeNull();
        expect(container.querySelector('main')?.getAttribute('data-immersive')).toBe('true');
      } else {
        expect(container.querySelector('a')?.getAttribute('href')).toBe(frame?.getAttribute('src'));
      }
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

it.each([
  ['/small-games/?dev=1#/games/wulong-city?challenge=26', null, 'challenge=26&dev=1'],
  ['/small-games/#/games/wulong-city?challenge=26&dev', null, 'challenge=26&dev=1'],
  ['/small-games/#/games/wulong-city?challenge=26', 'true', 'challenge=26&dev=1'],
  ['/small-games/?dev=0#/games/wulong-city?challenge=26', 'true', 'challenge=26&dev=0'],
  ['/small-games/?dev=1#/games/wulong-city?challenge=26&dev=0', 'true', 'challenge=26&dev=0'],
])(
  'propagates effective developer mode to the frame and independent link: %s',
  async (url, stored, expected) => {
    window.history.replaceState(null, '', url!);
    if (stored) localStorage.setItem('dev', stored);
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => root.render(<ShellApp runtimeClient={false} />));
      const entry = `/games/wulong-city/index.html?${expected}`;
      expect(container.querySelector('iframe')?.getAttribute('src')).toBe(entry);
      expect(container.querySelector('a')?.getAttribute('href')).toBe(entry);
      expect(window.location.href).toContain('challenge=26');
    } finally {
      await act(async () => root.unmount());
      window.history.replaceState(null, '', '/');
      localStorage.clear();
      window.SmallGamesDev.refresh();
    }
  },
);
