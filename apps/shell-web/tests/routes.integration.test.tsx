import { canvasContext } from './canvas.fixture.js';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import {
  ShellApp,
  type BuiltInGame,
  type ShellAppProps,
  type createRuntimeClient,
} from '@coffeeeeffoc/shell-web';

import { fixtureRegistry as builtInGameRegistry } from './game.fixture.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mountedRoots: Array<ReturnType<typeof createRoot>> = [];
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(canvasContext);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => mountedRoots.splice(0).forEach((root) => root.unmount()));
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  localStorage.clear();
});
function hostFor(game: BuiltInGame) {
  return createInMemoryGameHost({
    session: {
      gameId: game.id,
      gameVersion: game.definition.manifest.version,
      capabilities: [...game.definition.manifest.capabilities],
    },
    content: game.content,
  });
}
async function renderShell(props: ShellAppProps = {}) {
  const container = document.createElement('div');
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () =>
    root.render(
      <ShellApp
        registry={builtInGameRegistry}
        createHost={hostFor}
        runtimeClient={false}
        {...props}
      />,
    ),
  );
  return container;
}
async function clickButton(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(label),
  );
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

describe('Web Shell routes', () => {
  it.each([
    ['tower-brake', 'challenge=tower-v1&level=first-brake&targetScore=450'],
    ['cage-rescue', 'challenge=rescue-v1&level=rescue-01&targetRescued=3&targetCombo=2'],
    ['ball-roguelite', 'challenge=orbit-v1&level=stardust&seed=42&targetScore=250'],
    ['ember-bounce', 'emberChallenge=1&level=first-spark&turns=9'],
    ['three-choose-two', 'seed=42&variant=refill&targetScore=100'],
    ['flick-arena', 'seed=42&layout=triangle&targetShots=9'],
    ['moss-garden', 'level=moss-09&targetHints=1&targetMistakes=2&targetTime=5000'],
  ])(
    'opens the full %s challenge from a Shell hash and preserves independent navigation',
    async (id, query) => {
      window.history.replaceState(
        null,
        '',
        `/small-games/?dev=1&seed=999&token=private#/games/${id}?${query}`,
      );
      const container = await renderShell();
      const source = container.querySelector('iframe')?.getAttribute('src');
      expect(source).toBe(`/games/${id}/index.html?${query}&dev=1`);
      const independent = [...container.querySelectorAll('a')].find(
        (link) => link.textContent === '独立打开',
      );
      if (['ember-bounce', 'moss-garden'].includes(id)) {
        expect(independent?.getAttribute('href')).toBe(source);
      } else if (id === 'tower-brake') {
        expect(independent).toBeUndefined();
        expect(container.querySelector('main')?.getAttribute('data-immersive')).toBe('true');
      }
      expect(source).not.toContain('token=');
      expect(source).not.toContain('seed=999');
      await clickButton(container, '返回目录');
      expect(container.querySelector('iframe')).toBeNull();
      expect(window.location.hash).toBe('');
    },
  );

  it('loads only the selected game and ignores its result after leaving the route', async () => {
    const game = builtInGameRegistry[0];
    let finish!: (value: BuiltInGame) => void;
    const mount = vi.fn(game.definition.mount);
    const load = vi.fn(
      () =>
        new Promise<BuiltInGame>((resolve) => {
          finish = resolve;
        }),
    );
    const other = { id: 'other', title: 'Other', description: '', load: vi.fn() };
    const container = await renderShell({
      registry: [{ id: game.id, title: game.title, description: game.description, load }, other],
    });
    expect(load).not.toHaveBeenCalled();
    expect(other.load).not.toHaveBeenCalled();
    const card = [...container.querySelectorAll('article')].find((node) =>
      node.textContent?.includes(game.title),
    )!;
    await clickButton(card, '进入游戏');
    expect(load).toHaveBeenCalledOnce();
    await act(async () => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => finish({ ...game, definition: { ...game.definition, mount } }));
    expect(mount).not.toHaveBeenCalled();
    expect(other.load).not.toHaveBeenCalled();
    expect(container.querySelector('.game-slot, iframe')).toBeNull();
  });

  it.each(builtInGameRegistry)('opens $id directly from its shared URL', async (game) => {
    window.history.replaceState(null, '', `/small-games/#/games/${game.id}`);
    const container = await renderShell();
    expect(container.querySelector('nav strong')?.textContent).toBe(game.title);
    expect(container.querySelector('.game-slot')).not.toBeNull();
    await clickButton(container, '返回目录');
    expect(window.location.pathname).toBe('/small-games/');
    expect(window.location.hash).toBe('');
    expect(container.querySelector('[aria-label="Game Catalog"]')).not.toBeNull();
  });

  it.each([
    '#/games/cultivation',
    '#/games/cricket',
    '#/games/office',
    '#/games/arena',
    '#/games/building-power',
    '#/games/missing',
    '#/games/%E0%A4%A',
    '#/games/../../other',
    '#unrelated',
  ])('shows the Catalog for an unknown or malformed route: %s', async (hash) => {
    window.history.replaceState(null, '', `/small-games/${hash}`);
    const container = await renderShell();
    expect(container.querySelector('[aria-label="Game Catalog"]')).not.toBeNull();
    expect(container.querySelector('.game-slot, iframe')).toBeNull();
  });

  it('waits for the published Catalog before launching a shared URL', async () => {
    const game = builtInGameRegistry[0];
    window.history.replaceState(null, '', `/#/games/${game.id}`);
    let finishCatalog!: (entries: Array<{ gameId: string }>) => void;
    const session = vi.fn().mockRejectedValue(new Error('fixture fallback'));
    const runtimeClient = {
      catalog: vi.fn(() => new Promise((resolve) => (finishCatalog = resolve))),
      session,
      storage: vi.fn(),
    } as unknown as ReturnType<typeof createRuntimeClient>;
    const container = await renderShell({ registry: [game], runtimeClient });
    expect(container.querySelector('.game-slot')).toBeNull();
    await act(async () => finishCatalog([{ gameId: game.id }]));
    expect(session).toHaveBeenCalledOnce();
    expect(container.querySelector('nav strong')?.textContent).toBe(game.title);
  });

  it('ignores a pending launch after browser navigation returns to the Catalog', async () => {
    const game = builtInGameRegistry[0];
    let rejectSession!: (reason: Error) => void;
    const runtimeClient = {
      catalog: vi.fn().mockResolvedValue([{ gameId: game.id }]),
      session: vi.fn(() => new Promise((_resolve, reject) => (rejectSession = reject))),
      storage: vi.fn(),
    } as unknown as ReturnType<typeof createRuntimeClient>;
    const container = await renderShell({ registry: [game], runtimeClient });
    const card = [...container.querySelectorAll('article')].find(
      (entry) => entry.querySelector('h2')?.textContent === game.title,
    );
    expect(card).toBeDefined();
    await clickButton(card!, '进入游戏');
    await act(async () => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => rejectSession(new Error('late failure')));
    expect(container.querySelector('[aria-label="Game Catalog"]')).not.toBeNull();
    expect(container.querySelector('.game-slot')).toBeNull();
    expect(container.textContent).not.toContain('目标版本不可用');
  });
});
