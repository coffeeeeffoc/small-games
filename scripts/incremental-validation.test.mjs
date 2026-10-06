import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incrementalPlan } from './incremental-validation.mjs';
import { shellContractTargets } from './validation-plan.mjs';
const packages = [
  { name: 'shared', dir: 'packages/ui' },
  { name: 'a', dir: 'games/local/a', dependencies: { shared: 'workspace:*' } },
  { name: 'b', dir: 'games/local/b' },
  { name: 'c', dir: 'games/local/c', dependencies: { shared: 'workspace:*' } },
  {
    name: 'shell',
    dir: 'apps/shell-web',
    coffeeeeffoc: { role: 'shell' },
    dependencies: { a: 'workspace:*', b: 'workspace:*', c: 'workspace:*' },
  },
];
const games = ['a', 'b', 'c'].map((id) => ({ id, source: `games/local/${id}` }));
const plan = (changedPaths, extra = {}) =>
  incrementalPlan({
    packages,
    games,
    changedPaths,
    readSource: () => 'export const rules = 1;',
    ...extra,
  });
test('Shell-only, game and transitive shared consumer changes select fast Shell contracts; docs do not', () => {
  for (const paths of [
    ['apps/shell-web/src/styles.css'],
    ['games/local/a/rules.mjs'],
    ['packages/ui/index.ts'],
  ])
    assert.deepEqual(
      shellContractTargets(packages, paths).map((pkg) => pkg.name),
      ['shell'],
    );
  assert.deepEqual(shellContractTargets(packages, ['docs/guide.md']), []);
});
test('pure rules retain related static consumers without launching any browser; own unknown code checks only its game', () => {
  assert.deepEqual(plan(['games/local/a/rules.mjs']).browser_ids, []);
  assert.deepEqual(plan(['games/local/a/app.js']).browser_ids, ['a']);
  assert.deepEqual(plan(['games/local/b/styles.css']).browser_ids, ['b']);
});
test('shared UI follows actual dependency closure, excluding unrelated games', () => {
  assert.deepEqual(plan(['packages/ui/index.ts']).browser_ids, ['a', 'c']);
});
test('structured single/multiple registrations check only registered games, including wiring outside Shell', () => {
  for (const ids of [['b'], ['a', 'c']]) {
    const fileScopes = new Map([
      ['apps/shell-web/src/standalone-games.json', ids.map((id) => `games/local/${id}`)],
      ['pnpm-lock.yaml', []],
    ]);
    assert.deepEqual(plan([...fileScopes.keys()], { fileScopes }).browser_ids, ids);
    assert.equal(plan([...fileScopes.keys()], { fileScopes }).full, false);
  }
});
test('generic logic in the same Shell directory still exercises reviewed navigation families', () => {
  const withSamples = [
    ...games,
    { id: 'letters-words2', source: 'games/local/letters-words2' },
    { id: 'xiangqi-five', source: 'games/submodules/xiangqi-five' },
  ];
  assert.deepEqual(
    plan(['apps/shell-web/src/StandaloneGame.tsx'], { games: withSamples }).browser_ids,
    ['letters-words2', 'xiangqi-five'],
  );
});
test('unknown shared paths block with a classification gap, never silently expand to all games', () => {
  assert.throws(() => plan(['platforms/new-shared.js']), /scope undefined.*no automatic full/);
});

test('real registration parser feeds narrow single/multiple-game browser selection', async () => {
  const { registrationFileScopes } = await import('./pages-registration-scope.mjs');
  const registry = 'apps/shell-web/src/standalone-games.json';
  const entries = games.map((game) => ({
    ...game,
    title: game.id,
    description: '',
    output: 'dist',
  }));
  for (const ids of [['b'], ['a', 'c']]) {
    const readBase = () => JSON.stringify(entries.filter((game) => !ids.includes(game.id)));
    const readHead = () => JSON.stringify(entries);
    const fileScopes = registrationFileScopes({
      changedPaths: [registry],
      readBase,
      readHead,
      gameSources: games.map((game) => game.source),
    });
    assert.deepEqual(plan([registry], { fileScopes }).browser_ids, ids);
  }
});

test('per-game literal adapters are narrow, executable changes in the same file remain shared', async () => {
  const { entryAdapterFileScopes } = await import('./incremental-validation.mjs');
  const file = 'apps/shell-web/scripts/standalone-game-entry.mjs';
  const source = (marker, body = 'return id;') =>
    `export const markers = { a: '${marker}', b: '#home' };\nexport const homeControls = { a: '#start' };\nexport const legacyEntryIds = ['b'];\nexport function entry(id) { ${body} }`;
  const context = { games, changedPaths: [file], readBase: () => source('#board') };
  const narrowed = entryAdapterFileScopes({ ...context, readHead: () => source('#home') });
  assert.deepEqual(plan([file], { fileScopes: narrowed }).browser_ids, ['a']);
  const shared = entryAdapterFileScopes({
    ...context,
    readHead: () => source('#home', 'return id + 1;'),
  });
  assert.equal(shared.has(file), false);
});

test('unrecognized Shell registry or task graph edits cannot silently become generic navigation samples', () => {
  for (const file of [
    'apps/shell-web/src/standalone-games.json',
    'apps/shell-web/src/game-meta.json',
    'apps/shell-web/package.json',
  ])
    assert.throws(() => plan([file]), /registration scope undefined/);
});
