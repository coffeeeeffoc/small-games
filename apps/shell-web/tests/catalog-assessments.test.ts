import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import standalone from '../src/standalone-games.json';
import assessmentData from '../src/game-assessments.json';
import { builtInGameRegistry } from '../src/registry.js';
import {
  assessments,
  catalogStateUrl,
  emptyFilters,
  matchesAssessment,
  readCatalogState,
  rolloutGroups,
} from '../src/catalog-assessments.js';

const heldIds =
  'cultivation cricket office arena building-power night-merge fishing h5-security letters-words tower-defense-game multi-battle puzzle travel travel-bund-25d travel2 one-stroke-course hold-tight-acrobats balloon-movers weather-command merge-front off-camera precision-demolition afterimage-arena ghost-shift-manager rule-thief chase-thief retreat-rally'.split(
    ' ',
  );

it('covers every registered and on-disk Game once and preserves all 27 user decisions', () => {
  const ids = [...builtInGameRegistry, ...standalone].map((g) => g.id).sort();
  expect(ids).toHaveLength(67);
  expect(assessmentData.games.map((g) => g.id).sort()).toEqual(ids);
  expect(Object.keys(assessments).sort()).toEqual(ids);
  expect(new Set(ids).size).toBe(ids.length);
  expect(
    Object.values(assessments)
      .filter((g) => g.disposition === 'hold')
      .map((g) => g.id)
      .sort(),
  ).toEqual(heldIds.sort());
  const root = resolve(process.cwd(), '../..');
  const directories = ['games/local', 'games/submodules'].flatMap((parent) =>
    readdirSync(`${root}/${parent}`, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${parent}/${entry.name}`),
  );
  expect(
    Object.values(assessments)
      .map((g) => g.source)
      .sort(),
  ).toEqual(directories.sort());
  for (const game of Object.values(assessments)) {
    expect(game.strengths.length).toBeGreaterThan(0);
    expect(game.weaknesses.length).toBeGreaterThan(0);
    expect(game.improvements.length).toBeGreaterThan(0);
    expect(game.platforms).toContain(game.primaryPlatform);
    expect(game.evidence.every((path) => existsSync(`${root}/${path}`))).toBe(true);
    expect(game.potential).not.toContain('hit');
    if (heldIds.includes(game.id)) {
      expect(game.schedule).toBe('hold');
      expect(game.potential).toEqual(
        ['chase-thief', 'retreat-rally'].includes(game.id) ? ['none'] : ['low'],
      );
    } else expect(game.potential).toContain('potential');
  }
  expect(assessments['travel-bund'].disposition).toBe('potential');
});

it('exhaustively partitions 67 games into 7 previous, 13 current, 20 later and 27 held with the latest user decisions', () => {
  const games = Object.values(assessments);
  const scheduled = rolloutGroups.flatMap(([tab]) => {
    const matches = games.filter((game) => matchesAssessment(game, { ...emptyFilters(), tab }));
    expect(matches).toHaveLength({ previous: 7, current: 13, later: 20, hold: 27 }[tab]);
    return matches.map((game) => game.id);
  });
  expect(scheduled.sort()).toEqual(games.map((game) => game.id).sort());
  expect(new Set(scheduled).size).toBe(67);
  expect(
    games.filter((game) =>
      matchesAssessment(game, { ...emptyFilters(), potential: ['potential'] }),
    ),
  ).toHaveLength(40);
  expect(
    games
      .filter((game) => game.schedule === 'current')
      .map((game) => game.id)
      .sort(),
  ).toEqual(
    'ashfall-front tiny-signals orbit-atelier letters-words2 wulong-city surprise-kept homebound-station waterline-station rescue-team tianxia-chalu out-of-frame fold-the-world two-sided-box'
      .split(' ')
      .sort(),
  );
  for (const game of games) {
    expect(game.scheduleReason).toBeTruthy();
    expect(game.implementationStatus).toBeTruthy();
    if (game.implementationStatus === 'implemented')
      expect(game.delivered.length).toBeGreaterThan(0);
    if (game.schedule === 'hold') expect(game.implementationStatus).toBe('held');
    if (game.schedule === 'later') expect(game.implementationStatus).toBe('deferred');
  }
});

it('combines OR selections inside facets with AND across facets and tabs', () => {
  const filters = {
    ...emptyFilters(),
    potential: ['low', 'potential'],
    genres: ['word', 'racing'],
  };
  expect(matchesAssessment(assessments['letters-words'], filters)).toBe(true);
  expect(matchesAssessment(assessments['carding-car'], filters)).toBe(true);
  expect(matchesAssessment(assessments['cage-rescue'], filters)).toBe(false);
  expect(matchesAssessment(assessments['carding-car'], { ...filters, tab: 'hold' })).toBe(false);
  expect(matchesAssessment(assessments['letters-words'], { ...filters, tab: 'hold' })).toBe(true);
  expect(
    matchesAssessment(assessments['letters-words'], { ...filters, potential: ['potential'] }),
  ).toBe(false);
});

it('round-trips filters without losing unrelated parameters or game routes', () => {
  const state = {
    query: '弹珠 海湾',
    view: 'cards' as const,
    filters: {
      ...emptyFilters(),
      tab: 'current' as const,
      potential: ['potential', 'fun'],
      platforms: ['mobile'],
      genres: ['physics', 'arcade'],
    },
  };
  const path = catalogStateUrl(
    'https://example.com/small-games/?dev=0&playerToken=private#/games/cage-rescue?dev=1',
    state,
  );
  const url = new URL(path, 'https://example.com');
  expect(url.pathname).toBe('/small-games/');
  expect(url.searchParams.get('dev')).toBe('0');
  expect(url.searchParams.get('playerToken')).toBe('private');
  expect(url.hash).toBe('#/games/cage-rescue?dev=1');
  const restored = readCatalogState(url.search);
  expect(restored.query).toBe(state.query);
  expect(restored.view).toBe('cards');
  expect(restored.filters.tab).toBe('current');
  expect(restored.filters.potential.sort()).toEqual(state.filters.potential.sort());
  expect(restored.filters.genres.sort()).toEqual(state.filters.genres.sort());
  expect(
    readCatalogState(
      '?catalogTab=invalid&catalog_potential=low&catalog_potential=low&catalog_potential=garbage&catalogView=wrong',
    ),
  ).toEqual({ query: '', view: 'list', filters: { ...emptyFilters(), potential: ['low'] } });
  const cleared = new URL(
    catalogStateUrl(url.href, { query: '', view: 'list', filters: emptyFilters() }),
    'https://example.com',
  );
  expect(cleared.search).toBe('?dev=0&playerToken=private');
});

it('restores every rollout tab and preserves the old focus URL population', () => {
  for (const [tab] of rolloutGroups) {
    const state = { query: '', view: 'list' as const, filters: { ...emptyFilters(), tab } };
    const url = new URL(catalogStateUrl('https://example.com/', state), 'https://example.com');
    expect(readCatalogState(url.search)).toEqual(state);
  }
  const legacy = readCatalogState('?catalogTab=focus&catalog_platforms=mobile');
  expect(legacy.filters.tab).toBe('previous');
  const previous = Object.values(assessments).filter((game) =>
    matchesAssessment(game, legacy.filters),
  );
  expect(previous.map((game) => game.id).sort()).toEqual(
    [
      'tower-brake',
      'moss-garden',
      'ball-roguelite',
      'ember-bounce',
      'cage-rescue',
      'flick-arena',
      'three-choose-two',
    ].sort(),
  );
  expect(catalogStateUrl('https://example.com/?catalogTab=focus', legacy)).toContain(
    'catalogTab=previous',
  );
});
