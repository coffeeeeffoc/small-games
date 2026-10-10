import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import standalone from '../src/standalone-games.json';
import { builtInGameRegistry } from '../src/registry.js';
import {
  assessments,
  catalogStateUrl,
  emptyFilters,
  matchesAssessment,
  readCatalogState,
} from '../src/catalog-assessments.js';

const heldIds =
  'cultivation cricket office arena building-power night-merge fishing office-slacking h5-security letters-words tower-defense-game multi-battle puzzle travel travel-bund-25d travel2 one-stroke-course hold-tight-acrobats balloon-movers weather-command merge-front off-camera precision-demolition afterimage-arena ghost-shift-manager rule-thief'.split(
    ' ',
  );

it('covers every registered and on-disk Game once and preserves all 26 user decisions', () => {
  const ids = [...builtInGameRegistry, ...standalone].map((g) => g.id).sort();
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
      expect(game.priority).toBe('hold');
      expect(game.potential).toEqual(['low']);
    } else expect(game.potential).toContain('potential');
  }
  expect(assessments['travel-bund'].disposition).toBe('potential');
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
      tab: 'focus' as const,
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
  expect(restored.filters.tab).toBe('focus');
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
