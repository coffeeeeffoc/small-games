import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ShellApp } from '../src/ShellApp.js';
import games from '../src/standalone-games.json';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('opens each standalone Game and removes its frame on exit', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ShellApp runtimeClient={false} />));
    for (const { id, title } of games) {
      const card = [...container.querySelectorAll('article')].find((item) =>
        item.textContent?.includes(title),
      );
      expect(card).toBeDefined();
      await act(async () => card?.querySelector('button')?.click());
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
      expect(container.querySelector('[aria-label="Game Catalog"]')).not.toBeNull();
    }
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
  }
});
