import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ShellApp } from '../src/ShellApp.js';
import { gameRouteHash, parseGameRoute } from '../src/game-route.js';
import { gameShareUrl } from '../src/game-sharing.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('opens nine concrete play entries, retaining modes in frames, independent links and reloads', async () => {
  const entries = [
    ['carding-car', '一圈冲刺', 'mode=sprint'],
    ['cops-robbers', '两侧夹击', 'mode=quick&level=1&role=pursuer&rule=standard'],
    ['cops-robbers-realtime', '双街协作', 'mode=quick&level=3&role=cop&first=none&rule=standard'],
    ['letters-words2', '海岸小岛', 'mini=shore&v=1'],
    ['vibeJam-myself-history-guess', '江港三幕', 'route=harbor&v=1'],
    ['xiangqi-five', '炮阵连招', 'challenge=cannon-cross'],
    ['travel-bund', '桥畔寻迹', 'route=bridges'],
    ['night-overwatch', '60秒热身', 'mission=training-60'],
    ['wulong-city', '乌龙称重', 'challenge=25'],
  ];
  window.history.replaceState(null, '', '/?playerToken=shell-only');
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ShellApp runtimeClient={false} />));
    for (const [id, label, query] of entries) {
      const button = [
        ...container.querySelectorAll<HTMLButtonElement>('.play-choices button'),
      ].find((item) => item.textContent?.startsWith(label));
      expect(button).toBeDefined();
      await act(async () => button!.click());
      const path = `/games/${id}/index.html?${query}`;
      expect(window.location.hash).toBe(`#/games/${id}?${query}`);
      expect(container.querySelector('iframe')?.getAttribute('src')).toBe(path);
      if (id === 'letters-words2' || id === 'xiangqi-five') {
        expect(container.querySelector('main')?.getAttribute('data-immersive')).toBe('true');
        expect(container.querySelector('nav a')).toBeNull();
      } else {
        expect(container.querySelector('a')?.getAttribute('href')).toBe(path);
      }
      // A fresh mount sees exactly the same mode; Shell account data stays on the parent.
      await act(async () => root.render(<ShellApp key={id} runtimeClient={false} />));
      expect(container.querySelector('iframe')?.getAttribute('src')).toBe(path);
      expect(window.location.search).toBe('?playerToken=shell-only');
      await act(async () => container.querySelector<HTMLButtonElement>('nav button')!.click());
    }
  } finally {
    await act(async () => root.unmount());
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  }
});

it('rejects malformed routes and isolates public parameters for each Game', () => {
  for (const hash of ['#/games/%', '#/games/..%2Fprivate', '#/games/a/b', '#/games/x#other'])
    expect(parseGameRoute(hash)).toBeUndefined();
  expect(parseGameRoute('#/games/letters-words2?mini=dawn&v=1&token=private')).toEqual({
    id: 'letters-words2',
    search: 'mini=dawn&v=1',
  });
  expect(parseGameRoute('#/games/letters-words2?mini=dawn&mini=shore&v=1')?.search).toBe('');
  expect(parseGameRoute(`#/games/letters-words2?mini=${'x'.repeat(3000)}`)?.search).toBe('');
  expect(gameRouteHash('night-overwatch', 'mission=training-60&playerId=secret')).toBe(
    '#/games/night-overwatch?mission=training-60',
  );
  expect(gameRouteHash('office', 'mission=training-60&token=private')).toBe('#/games/office');
  // Before a frame loads, or if it navigates away, sharing still retains its selected mode.
  const entry = 'https://example.com/small-games/games/letters-words2/index.html?mini=shore&v=1';
  expect(gameShareUrl('letters-words2', `${entry}&token=private`)).toBe(entry);
  expect(gameShareUrl('letters-words2', entry, 'about:blank')).toBe(entry);
});
