import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incrementalPlan, h5AdapterFileScopes } from './incremental-validation.mjs';
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

test('registration classifier changes validate tooling and reviewed navigation, unknown tools block', () => {
  const sampleGames = [
    ...games,
    { id: 'letters-words2', source: 'games/local/letters-words2' },
    { id: 'xiangqi-five', source: 'games/submodules/xiangqi-five' },
  ];
  const selected = plan(['scripts/pages-registration-scope.mjs'], { games: sampleGames });
  assert.equal(selected.validation_tools, true);
  assert.deepEqual(selected.browser_ids, ['letters-words2', 'xiangqi-five']);
  assert.deepEqual(selected.game_sources, []);
  assert.throws(() => plan(['scripts/unreviewed-classifier.mjs']), /scope undefined/);
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

const fullscreenFile = 'scripts/sync-h5-fullscreen.mjs';
const developerFile = 'scripts/test-game-dev-mode.mjs';
const h5Games = [...games, { id: 'orbit-atelier', source: 'games/local/orbit-atelier' }];
const copiesSource = (copies, tail = 'verify(copies);\n') =>
  `const copies = [\n${copies.map((copy) => `  '${copy}',`).join('\n')}\n];\n${tail}`;
const developerSource = (ids, tail = 'render(game);') =>
  `function check(game) {\n  if (\n${ids.map((id) => `    game.id === '${id}'`).join(' ||\n')}\n  ) {\n    ${tail}\n  }\n}\n`;
const copiesBefore = ['games/local/a/fullscreen.js', 'apps/shell-web/public/fullscreen.js'];
const orbitCopy = 'games/local/orbit-atelier/src/fullscreen.js';
const h5Scopes = (file, before, after, catalog = h5Games) =>
  h5AdapterFileScopes({
    changedPaths: [file],
    games: catalog,
    readBase: () => before,
    readHead: () => after,
  });

test('additive H5 fullscreen and developer adapters select only their registered game', () => {
  const base = new Map([
    [fullscreenFile, copiesSource(copiesBefore)],
    [developerFile, developerSource(['a', 'b'])],
  ]);
  const head = new Map([
    [fullscreenFile, copiesSource([orbitCopy, ...copiesBefore])],
    [developerFile, developerSource(['orbit-atelier', 'a', 'b'])],
  ]);
  const fileScopes = h5AdapterFileScopes({
    changedPaths: [...base.keys()],
    games: h5Games,
    readBase: (file) => base.get(file),
    readHead: (file) => head.get(file),
  });
  assert.deepEqual(
    [...fileScopes.values()],
    [['games/local/orbit-atelier'], ['games/local/orbit-atelier']],
  );
  assert.deepEqual(plan([...base.keys()], { games: h5Games, fileScopes }).browser_ids, [
    'orbit-atelier',
  ]);
  const multiple = h5Scopes(
    fullscreenFile,
    copiesSource(copiesBefore),
    copiesSource([
      copiesBefore[0],
      'games/local/c/public/fullscreen.js',
      copiesBefore[1],
      orbitCopy,
    ]),
  );
  assert.deepEqual(multiple.get(fullscreenFile), ['games/local/c', 'games/local/orbit-atelier']);
});

test('H5 adapters reject deletion, renaming, reordering, duplicates and unknown registration', () => {
  const invalidCopies = [
    [orbitCopy, copiesBefore[0]],
    [orbitCopy, ...copiesBefore.toReversed()],
    [orbitCopy, ...copiesBefore, orbitCopy],
    ['games/local/a/src/fullscreen.js', copiesBefore[1], orbitCopy],
    [...copiesBefore, 'games/local/missing/fullscreen.js'],
    [...copiesBefore, 'apps/shell-web/src/fullscreen.js'],
    [...copiesBefore, '/games/local/orbit-atelier/fullscreen.js'],
    [...copiesBefore, 'games/local/orbit-atelier/../a/fullscreen.js'],
    [...copiesBefore, 'games/local/orbit-atelier/./fullscreen.js'],
    [...copiesBefore, 'games/local/orbit-atelier//fullscreen.js'],
    [...copiesBefore, 'games/local/orbit-atelier/src/other.js'],
  ];
  for (const copies of invalidCopies)
    assert.equal(
      h5Scopes(fullscreenFile, copiesSource(copiesBefore), copiesSource(copies)).has(
        fullscreenFile,
      ),
      false,
      JSON.stringify(copies),
    );
  for (const ids of [
    ['orbit-atelier', 'a'],
    ['orbit-atelier', 'b', 'a'],
    ['orbit-atelier', 'a', 'b', 'orbit-atelier'],
    ['orbit-atelier', 'a', 'missing'],
  ])
    assert.equal(
      h5Scopes(developerFile, developerSource(['a', 'b']), developerSource(ids)).has(developerFile),
      false,
      JSON.stringify(ids),
    );
  for (const catalog of [
    [...h5Games, h5Games[0]],
    [...h5Games, { id: 'other', source: h5Games[0].source }],
    h5Games.map((game) =>
      game.id === 'orbit-atelier' ? { ...game, source: 'games/local/../outside' } : game,
    ),
  ])
    assert.equal(
      h5Scopes(
        fullscreenFile,
        copiesSource(copiesBefore),
        copiesSource([orbitCopy, ...copiesBefore]),
        catalog,
      ).has(fullscreenFile),
      false,
    );
});

test('H5 literal parsing rejects executable, ambiguous and disguised data without evaluating it', () => {
  const validCopies = copiesSource([orbitCopy, ...copiesBefore]);
  const invalidCopies = [
    validCopies.replace(`'${orbitCopy}'`, '`' + orbitCopy + '`'),
    validCopies.replace(`'${orbitCopy}'`, `'games/local/\\x6frbit-atelier/src/fullscreen.js'`),
    validCopies.replace(`'${orbitCopy}',`, `/* new game */ '${orbitCopy}',`),
    validCopies.replace(`'${orbitCopy}'`, `...['${orbitCopy}']`),
    validCopies.replace(`'${orbitCopy}'`, `(globalThis.__h5ScopeEvaluated = true)`),
    validCopies.replace(`'${orbitCopy}',`, `'${orbitCopy}',,`),
    validCopies + 'function duplicate() { const copies = []; }\n',
    `/* ${validCopies} */\n`,
    `const fixture = ${JSON.stringify(validCopies)};\n`,
  ];
  for (const after of invalidCopies)
    assert.equal(
      h5Scopes(fullscreenFile, copiesSource(copiesBefore), after).has(fullscreenFile),
      false,
    );
  const validDeveloper = developerSource(['orbit-atelier', 'a', 'b']);
  for (const after of [
    validDeveloper.replace(' ||', ' &&'),
    validDeveloper.replace(
      "game.id === 'orbit-atelier'",
      "game.id === 'orbit-atelier' || enabled()",
    ),
    validDeveloper.replace("game.id === 'orbit-atelier'", 'game.id === getId()'),
    validDeveloper.replace("game.id === 'orbit-atelier'", "other.id === 'orbit-atelier'"),
    validDeveloper.replace("game.id === 'orbit-atelier'", "(game.id === 'orbit-atelier')"),
    validDeveloper.replace("'orbit-atelier'", "'\\x6frbit-atelier'"),
    validDeveloper.replace("'orbit-atelier'", '`orbit-atelier`'),
    validDeveloper.replace("'orbit-atelier'", "/* new game */ 'orbit-atelier'"),
    validDeveloper + developerSource(['a', 'b']).replace('check', 'other'),
    `/* ${validDeveloper} */\n`,
    `const fixture = ${JSON.stringify(validDeveloper)};\n`,
  ])
    assert.equal(
      h5Scopes(developerFile, developerSource(['a', 'b']), after).has(developerFile),
      false,
    );
  assert.equal(globalThis.__h5ScopeEvaluated, undefined);
});

test('H5 changes outside literal ranges remain unknown and block incremental publication', () => {
  for (const [file, before, after] of [
    [
      fullscreenFile,
      copiesSource(copiesBefore),
      copiesSource([orbitCopy, ...copiesBefore], 'verify(copies, true);\n'),
    ],
    [
      fullscreenFile,
      copiesSource(copiesBefore),
      copiesSource([orbitCopy, ...copiesBefore]) + '// changed outside literal\n',
    ],
    [
      fullscreenFile,
      copiesSource(copiesBefore),
      copiesSource([orbitCopy, ...copiesBefore]).replaceAll('\n', '\r\n'),
    ],
    [
      developerFile,
      developerSource(['a', 'b']),
      developerSource(['orbit-atelier', 'a', 'b'], 'other(game);'),
    ],
    [
      developerFile,
      developerSource(['a', 'b']),
      developerSource(['orbit-atelier', 'a', 'b']) + '\n',
    ],
  ]) {
    const fileScopes = h5Scopes(file, before, after);
    assert.equal(fileScopes.has(file), false);
    assert.throws(() => plan([file], { games: h5Games, fileScopes }), /scope undefined/);
  }
});
