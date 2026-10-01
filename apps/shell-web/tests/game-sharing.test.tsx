import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { GameShare } from '../src/GameShare.js';
import { gameShareUrl } from '../src/game-sharing.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const entry = 'https://example.com/small-games/games/letters-words2/index.html';
afterEach(() => vi.unstubAllGlobals());

it('keeps the published subpath and same-game daily challenge, stripping credentials and hash', () => {
  expect(
    gameShareUrl(
      'letters-words2',
      entry,
      `${entry}?daily=2026-10-01&v=1&token=secret&room=private#account`,
    ),
  ).toBe(`${entry}?daily=2026-10-01&v=1`);
  expect(gameShareUrl('letters-words2', entry, 'https://other.example/?daily=2026-10-01')).toBe(
    entry,
  );
  expect(gameShareUrl('letters-words2', entry, `${entry}/other?daily=2026-10-01`)).toBe(entry);
  expect(gameShareUrl('letters-words2', entry, `${entry}?daily=2026-10-01&daily=2026-10-02`)).toBe(
    entry,
  );
  expect(gameShareUrl('letters-words2', entry, `${entry}?daily=${'x'.repeat(1000)}`)).toBe(entry);
  expect(gameShareUrl('letters-words2', entry, 'not a URL')).toBe(entry);
});

it('retains only the selected Game public parameters', () => {
  const cops = entry.replace('letters-words2', 'cops-robbers');
  expect(
    gameShareUrl(
      'cops-robbers',
      cops,
      `${cops}?mode=challenge&level=4&rule=relay&daily=2026-10-01&playerToken=secret`,
    ),
  ).toBe(`${cops}?mode=challenge&level=4&rule=relay`);
  expect(gameShareUrl('unknown', entry, `${entry}?daily=2026-10-01`)).toBe(entry);
});

it('shows a selected manual link after clipboard failure and never reports cancellation as copying', async () => {
  const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
  const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
  vi.stubGlobal('navigator', { clipboard: { writeText }, share });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  async function click(label: string) {
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === label,
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
  }
  try {
    await act(async () =>
      root.render(
        <GameShare
          gameId="letters-words2"
          title="词屿"
          entryUrl={entry}
          currentUrl={() => `${entry}?daily=2026-10-01&token=secret`}
        />,
      ),
    );
    await click('分享游戏');
    await click('复制链接');
    expect(writeText).toHaveBeenCalledWith(`${entry}?daily=2026-10-01`);
    const input = container.querySelector('input')!;
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(container.textContent).toContain('手动复制');
    await click('发给朋友');
    expect(container.textContent).toContain('已取消分享');
    expect(container.textContent).not.toContain('已复制');
    writeText.mockResolvedValue(undefined);
    await click('复制链接');
    expect(container.textContent).toContain('链接已复制');
    await click('关闭');
    expect(container.querySelector('input')).toBeNull();
    expect(document.activeElement?.textContent).toBe('分享游戏');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
