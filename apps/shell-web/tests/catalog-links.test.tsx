import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { GameCatalog } from '../src/GameCatalog.js';
import { builtInGameRegistry } from '../src/registry.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mountedRoots: Array<ReturnType<typeof createRoot>> = [];

afterEach(async () => {
  await act(async () => mountedRoots.splice(0).forEach((root) => root.unmount()));
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  window.SmallGamesDev.refresh();
});

async function renderCatalog(view: 'list' | 'cards' = 'list', disabled = false) {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onLaunch = vi.fn();
  mountedRoots.push(root);
  await act(async () =>
    root.render(
      <GameCatalog
        registry={builtInGameRegistry}
        query=""
        view={view}
        onQuery={vi.fn()}
        onView={vi.fn()}
        onLaunch={onLaunch}
        disabled={disabled}
      />,
    ),
  );
  const launch = container.querySelector<HTMLAnchorElement>(
    '[data-game-id="carding-car"] a.game-launch',
  )!;
  expect(launch).not.toBeNull();
  return { container, launch, onLaunch };
}

it.each(['list', 'cards'] as const)(
  'keeps ordinary activation in the Shell and preserves native link gestures in %s view',
  async (view) => {
    const { container, launch, onLaunch } = await renderCatalog(view, true);
    expect(
      container.querySelector<HTMLButtonElement>('[data-game-id="cultivation"] button.game-launch')
        ?.disabled,
    ).toBe(true);
    expect(launch.getAttribute('href')).toBe('/games/carding-car/index.html');
    async function dispatch(type: string, init: MouseEventInit = {}) {
      let preventedByCatalog = false;
      // Observe React's cancellation, then suppress jsdom's unsupported navigation.
      container.addEventListener(
        type,
        (event) => {
          preventedByCatalog = event.defaultPrevented;
          event.preventDefault();
        },
        { once: true },
      );
      await act(async () =>
        launch.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })),
      );
      return preventedByCatalog;
    }
    for (const detail of [1, 0]) {
      expect(await dispatch('click', { detail })).toBe(true);
      expect(onLaunch).toHaveBeenCalledExactlyOnceWith('carding-car');
      onLaunch.mockClear();
    }
    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
      { button: 2 },
    ]) {
      expect(await dispatch('click', init)).toBe(false);
      expect(onLaunch).not.toHaveBeenCalled();
    }
    for (const [type, button] of [
      ['auxclick', 1],
      ['contextmenu', 2],
    ] as const) {
      expect(await dispatch(type, { button })).toBe(false);
      expect(onLaunch).not.toHaveBeenCalled();
    }
  },
);

const modes: Array<{
  label: string;
  url: string;
  stored?: string;
  blockedStorage?: boolean;
  query: string;
}> = [
  { label: 'default', url: '/small-games/?playerToken=shell-only', query: '' },
  { label: 'URL enabled', url: '/small-games/?dev=1&playerToken=shell-only', query: '?dev=1' },
  { label: 'storage enabled', url: '/small-games/', stored: 'true', query: '?dev=1' },
  { label: 'explicitly disabled', url: '/small-games/?dev=0', stored: 'true', query: '?dev=0' },
  {
    label: 'route overrides page URL',
    url: '/small-games/?dev=1#/games/carding-car?dev=0',
    stored: 'true',
    query: '?dev=0',
  },
  { label: 'unavailable storage', url: '/small-games/', blockedStorage: true, query: '' },
  {
    label: 'URL enabled with unavailable storage',
    url: '/small-games/?dev=1',
    blockedStorage: true,
    query: '?dev=1',
  },
];

it.each(modes)('propagates $label developer mode into catalog links', async (mode) => {
  window.history.replaceState(null, '', mode.url);
  if (mode.stored) localStorage.setItem('dev', mode.stored);
  if (mode.blockedStorage)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
  const { launch } = await renderCatalog();
  expect(launch.getAttribute('href')).toBe(`/games/carding-car/index.html${mode.query}`);
});
