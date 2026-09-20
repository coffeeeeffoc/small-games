import { canvasContext } from './canvas.fixture.js';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import {
  ShellApp,
  builtInGameRegistry,
  type BuiltInGame,
  type ShellAppProps,
  type createRuntimeClient,
} from '@coffeeeeffoc/shell-web';

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
    root.render(<ShellApp createHost={hostFor} runtimeClient={false} {...props} />),
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
  it('renders a cricket animation frame after opening its shared URL', async () => {
    const frames = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    window.history.replaceState(null, '', '/#/games/cricket');
    const container = await renderShell();
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(frames).toHaveBeenCalled();
    await act(async () => frames.mock.calls.at(-1)![0](16));
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

  it.each(['#/games/missing', '#/games/%E0%A4%A', '#/games/../../other', '#unrelated'])(
    'shows the Catalog for an unknown or malformed route: %s',
    async (hash) => {
      window.history.replaceState(null, '', `/small-games/${hash}`);
      const container = await renderShell();
      expect(container.querySelector('[aria-label="Game Catalog"]')).not.toBeNull();
      expect(container.querySelector('.game-slot, iframe')).toBeNull();
    },
  );

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
