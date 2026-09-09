import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ShellApp } from '../src/ShellApp.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('opens each standalone Game and removes its frame on exit', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ShellApp runtimeClient={false} />));
    for (const [id, title] of [
      ['tower-defense-game', '月森守卫'],
      ['xiangqi-five', '象五子棋'],
      ['office-slacking', '工位偷闲 · 第一人称'],
    ]) {
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
