import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GameDefinition, GameHost } from '@coffeeeeffoc/game-contract';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { ShellApp, builtInGameRegistry, type BuiltInGame } from '@coffeeeeffoc/shell-web';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  await act(async () => mountedRoots.splice(0).forEach((root) => root.unmount()));
  vi.restoreAllMocks();
});

function hostFor(game: BuiltInGame, capabilities = game.definition.manifest.capabilities) {
  return createInMemoryGameHost({
    session: {
      gameId: game.id,
      gameVersion: game.definition.manifest.version,
      capabilities: [...capabilities],
    },
    content: game.content,
  });
}

async function renderShell(
  createHost: (game: BuiltInGame) => GameHost = hostFor,
  registry: readonly BuiltInGame[] = builtInGameRegistry,
) {
  const container = document.createElement('div');
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(<ShellApp registry={registry} createHost={createHost} />));
  return container;
}

async function clickButton(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(label),
  );
  expect(button).toBeDefined();
  await act(async () => {
    button?.click();
    await Promise.resolve();
  });
}

describe('Web Shell integration', () => {
  it('opens, pauses, resumes, exits, and re-enters the build-time Game', async () => {
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const container = await renderShell();
    expect(container.querySelector('[aria-label="Game Catalog"]')).not.toBeNull();
    expect(container.textContent).toContain(builtInGameRegistry[0].title);

    await clickButton(container, '进入游戏');
    expect(container.textContent).toContain('三分钟修仙');

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(container.textContent).toContain('修行已暂停');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(container.textContent).not.toContain('修行已暂停');

    await clickButton(container, '返回目录');
    expect(container.querySelector('.game-slot')).toBeNull();
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    await clickButton(container, '进入游戏');
    expect(container.textContent).toContain('三分钟修仙');
    await clickButton(container, '返回目录');
  });

  it('shows a capability incompatibility instead of leaving a partial mount', async () => {
    const container = await renderShell((game) => hostFor(game, ['content']));
    await clickButton(container, '进入游戏');

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('storage');
    expect(container.querySelector('.game-slot')).toBeNull();
  });

  it('does not reveal the Catalog or allow re-entry until disposal completes', async () => {
    let finishDispose!: () => void;
    const dispose = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finishDispose = resolve)))
      .mockResolvedValue(undefined);
    const definition: GameDefinition = {
      manifest: {
        gameId: 'deferred',
        version: '1.0.0',
        gameContractVersion: 1,
        contentSchemaVersion: 1,
        capabilities: [],
        loadModes: ['in-process'],
        entry: 'index.html',
        integrity: 'fixture',
      },
      mount: vi.fn(async (target) => {
        target.textContent = 'Deferred Game';
        return { pause: vi.fn(), resume: vi.fn(), dispose };
      }),
    };
    const game: BuiltInGame = {
      id: 'deferred',
      title: 'Deferred Game',
      description: 'fixture',
      definition,
      content: { gameId: 'deferred', schemaVersion: 1, revision: 0, payload: {} },
    };
    const container = await renderShell(() => ({}) as GameHost, [game]);
    await clickButton(container, '进入游戏');
    await clickButton(container, '返回目录');

    expect(dispose).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('正在返回');
    expect(container.querySelector('[aria-label="Game Catalog"]')).toBeNull();

    await act(async () => {
      finishDispose();
      await Promise.resolve();
    });
    expect(container.querySelector('[aria-label="Game Catalog"]')).not.toBeNull();
    await clickButton(container, '进入游戏');
    expect(definition.mount).toHaveBeenCalledTimes(2);
  });

  it('surfaces a lifecycle transition failure without an unhandled rejection', async () => {
    const definition: GameDefinition = {
      manifest: {
        gameId: 'throwing',
        version: '1.0.0',
        gameContractVersion: 1,
        contentSchemaVersion: 1,
        capabilities: [],
        loadModes: ['in-process'],
        entry: 'index.html',
        integrity: 'fixture',
      },
      async mount() {
        return {
          pause() {
            throw new Error('pause failed');
          },
          resume: vi.fn(),
          dispose: vi.fn(async () => undefined),
        };
      },
    };
    const game: BuiltInGame = {
      id: 'throwing',
      title: 'Throwing Game',
      description: 'fixture',
      definition,
      content: { gameId: 'throwing', schemaVersion: 1, revision: 0, payload: {} },
    };
    const container = await renderShell(() => ({}) as GameHost, [game]);
    await clickButton(container, '进入游戏');

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('pause failed');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });
});
