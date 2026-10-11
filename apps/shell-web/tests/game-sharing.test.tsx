import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { GameShare } from '../src/GameShare.js';
import { gameShareUrl, publicGameQuery } from '../src/game-sharing.js';
import { gameRouteHash, parseGameRoute } from '../src/game-route.js';
import { standaloneGameEntry } from '../src/standalone-entry.js';

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
  const river = entry.replace('letters-words2', 'travel-bund');
  expect(
    gameShareUrl(
      'travel-bund',
      river,
      `${river}?route=bridges&renderDetail=original&token=private`,
    ),
  ).toBe(`${river}?route=bridges&renderDetail=original`);
});

const challenges = [
  ['chase-thief', 'chaseChallenge=1&level=canal&time=59.9&mistakes=2'],
  ['retreat-rally', 'rallyChallenge=1&level=crossbow&time=180&survivors=6'],
  ['tiny-signals', 'challenge=1&level=echo&targetMoves=100000'],
  ['orbit-atelier', 'challenge=orbit-24'],
  ['wulong-city', 'challenge=100'],
  ['surprise-kept', 'challenge=birthday-08'],
  ['homebound-station', 'station=3'],
  ['waterline-station', 'station=path-dual-ferry&target=99'],
  ['rescue-team', 'rescueLevel=3'],
  ['out-of-frame', 'challenge=frame-v1&level=mastery-100&targetMs=3600000'],
  ['fold-the-world', 'challenge=fold-v1&level=100&targetFolds=1000'],
  [
    'two-sided-box',
    'challenge=box-v1&level=complete-mechanism&faces=front%2Ctop&targetMoves=10000',
  ],
  ['tower-brake', 'challenge=tower-v1&level=last-descent&targetScore=20000'],
  ['cage-rescue', 'challenge=rescue-v1&level=rescue-06&targetRescued=6&targetCombo=6'],
  ['ball-roguelite', 'challenge=orbit-v1&level=endless&seed=4294967295&targetScore=10000000'],
  ['ember-bounce', 'emberChallenge=1&level=last-light&turns=1000'],
  ['three-choose-two', 'seed=4294967295&variant=refill&targetScore=1000000000'],
  ['flick-arena', 'seed=9007199254740991&layout=cross&targetShots=999'],
  ['moss-garden', 'level=moss-30&targetHints=10000&targetMistakes=10000&targetTime=604800000'],
] as const;

it.each(challenges)(
  'preserves %s through public Shell URLs, standalone entries and sharing',
  (id, query) => {
    // Exact publicChallengeUrl output; the platform's own tests cover its sanitization.
    const shared = new URL(`https://example.com/small-games/#/games/${id}?${query}`);
    expect(shared.search).toBe('');
    expect(shared.hash).toBe(`#/games/${id}?${query}`);
    const route = parseGameRoute(shared.hash)!;
    expect(route).toEqual({ id, search: query });
    expect(gameRouteHash(id, `${query}&dev=1&token=private`)).toBe(shared.hash);
    const standalone = new URL(standaloneGameEntry(route.id, route.search), 'https://example.com');
    expect(standalone.pathname).toBe(`/games/${id}/index.html`);
    expect(standalone.search).toBe(`?${query}`);
    standalone.searchParams.set('dev', '1');
    standalone.searchParams.set('token', 'private');
    expect(new URL(gameShareUrl(id, standalone.href)).search).toBe(`?${query}`);
    expect(new URL(gameShareUrl(id, standalone.href, standalone.href)).search).toBe(`?${query}`);
    for (const key of new URLSearchParams(query).keys()) {
      const duplicated = new URLSearchParams(query);
      duplicated.append(key, duplicated.get(key)!);
      expect(publicGameQuery(id, duplicated.toString())).toBe('');
    }
  },
);

it.each([
  ['tower-brake', 'challenge=tower-v1&level=first-brake&targetScore=0'],
  ['cage-rescue', 'challenge=rescue-v1&level=rescue-01&targetRescued=0&targetCombo=0'],
  ['ball-roguelite', 'challenge=orbit-v1&level=stardust&seed=1&targetScore=0'],
  ['ember-bounce', 'emberChallenge=1&level=first-spark&turns=1'],
  ['three-choose-two', 'seed=0&variant=classic&targetScore=0'],
  ['three-choose-two', 'seed=42'],
  ['flick-arena', 'seed=0&layout=first-push&targetShots=1'],
  ['flick-arena', 'seed=42&layout=triangle'],
  ['moss-garden', 'level=moss-01&targetHints=0&targetMistakes=0&targetTime=0'],
  ['moss-garden', 'level=moss-09'],
])('accepts lower bounds and supported goal-free invitations for %s', (id, query) => {
  expect(publicGameQuery(id, query)).toBe(query);
});

it.each([
  ['chase-thief', 'chaseChallenge=1&level=canal&time=60.1&mistakes=2'],
  ['chase-thief', 'chaseChallenge=1&level=canal&time=10.0'],
  ['retreat-rally', 'rallyChallenge=1&level=valley&time=181&survivors=6'],
  ['retreat-rally', 'rallyChallenge=1&level=valley&time=10&survivors=7'],
  ['tiny-signals', 'challenge=1&level=garden&targetMoves=0'],
  ['orbit-atelier', 'challenge=orbit-25'],
  ['wulong-city', 'challenge=101'],
  ['surprise-kept', 'challenge=birthday-09'],
  ['homebound-station', 'station=4'],
  ['waterline-station', 'station=first-link&target=100'],
  ['rescue-team', 'rescueLevel=0'],
  ['out-of-frame', 'challenge=frame-v1&level=first-still&targetMs=3600001'],
  ['fold-the-world', 'challenge=fold-v1&level=101'],
  ['two-sided-box', 'challenge=box-v1&level=first-turn&faces=front,front'],
  ['two-sided-box', 'challenge=box-v1&level=first-turn&faces=front,top&targetMoves=10001'],
  ['tower-brake', 'challenge=tower-v2&level=first-brake'],
  ['tower-brake', 'challenge=tower-v1&level=unknown'],
  ['tower-brake', 'challenge=tower-v1&level=first-brake&targetScore=20001'],
  ['cage-rescue', 'challenge=rescue-v1&level=rescue-07'],
  ['cage-rescue', 'challenge=rescue-v1&level=rescue-01&targetRescued=7'],
  ['cage-rescue', 'challenge=rescue-v1&level=rescue-01&targetCombo=7'],
  ['ball-roguelite', 'challenge=orbit-v1&level=stardust&seed=0'],
  ['ball-roguelite', 'challenge=orbit-v1&level=stardust&seed=4294967296'],
  ['ball-roguelite', 'challenge=orbit-v1&level=stardust&seed=1&targetScore=10000001'],
  ['ball-roguelite', 'challenge=orbit-v1&level=stardust'],
  ['ember-bounce', 'emberChallenge=2&level=first-spark&turns=1'],
  ['ember-bounce', 'emberChallenge=1&level=first-spark&turns=0'],
  ['ember-bounce', 'emberChallenge=1&level=first-spark&turns=1001'],
  ['ember-bounce', 'emberChallenge=1&level=first-spark'],
  ['three-choose-two', 'seed=4294967296'],
  ['three-choose-two', 'seed=-1'],
  ['three-choose-two', 'seed=1.5'],
  ['three-choose-two', 'seed=1e3'],
  ['three-choose-two', 'seed=0x10'],
  ['three-choose-two', 'seed=%201'],
  ['three-choose-two', 'seed='],
  ['three-choose-two', 'seed=1&variant=unknown'],
  ['three-choose-two', 'seed=1&targetScore=1000000001'],
  ['three-choose-two', 'targetScore=100'],
  ['flick-arena', 'seed=9007199254740992&layout=chain'],
  ['flick-arena', 'seed=1&layout=unknown'],
  ['flick-arena', 'seed=1&layout=edge&targetShots=0'],
  ['flick-arena', 'seed=1&layout=edge&targetShots=1000'],
  ['flick-arena', 'seed=1'],
  ['moss-garden', 'level=moss-00'],
  ['moss-garden', 'level=moss-31'],
  ['moss-garden', 'level=moss-01&targetHints=10001&targetMistakes=0&targetTime=0'],
  ['moss-garden', 'level=moss-01&targetHints=0&targetMistakes=10001&targetTime=0'],
  ['moss-garden', 'level=moss-01&targetHints=0&targetMistakes=0&targetTime=604800001'],
  ['moss-garden', 'level=moss-01&targetHints=0&targetMistakes=0'],
])('rejects incomplete, unsupported or out-of-bounds %s challenges: %s', (id, query) => {
  expect(publicGameQuery(id, query)).toBe('');
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
