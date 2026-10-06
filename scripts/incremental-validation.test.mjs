import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  incrementalPlan,
  developerModeFileScopes,
  nativeWorkspaceFileScopes,
  nativeToolConsumers,
  h5AdapterFileScopes,
} from './incremental-validation.mjs';
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
test('shard planning and measured timing changes select tool checks without any game browser', () => {
  const sampleGames = [
    ...games,
    { id: 'letters-words2', source: 'games/local/letters-words2' },
    { id: 'xiangqi-five', source: 'games/submodules/xiangqi-five' },
  ];
  for (const file of [
    'scripts/pages-regression-shards.mjs',
    'scripts/pages-regression-shards.test.mjs',
    'scripts/pages-regression-timings.json',
  ]) {
    const selected = plan([file], { games: sampleGames });
    assert.equal(selected.validation_tools, true);
    assert.equal(selected.full, false);
    assert.deepEqual(selected.browser_ids, []);
    assert.deepEqual(selected.game_sources, []);
  }
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

test('unrecognized Shell registry or task graph edits cannot silently become generic navigation samples', () => {
  for (const file of [
    'apps/shell-web/src/standalone-games.json',
    'apps/shell-web/src/game-meta.json',
    'apps/shell-web/package.json',
  ])
    assert.throws(() => plan([file]), /registration scope undefined/);
});

const nativeEvidenceProducer = {
  name: '@coffeeeeffoc/game-building-power',
  dir: 'games/local/game-building-power',
  scripts: { 'test:rules': 'vitest run src/simulation.test.ts' },
};
test('native smoke selects both actual native hosts and generates candidate replay evidence once before host smoke', async () => {
  const nativePackages = nativeToolConsumers.map(({ dir, smoke }) => ({
    name: dir.split('/').at(-1),
    dir,
    scripts: { build: 'build', typecheck: 'types', lint: 'lint', test: 'vitest run', smoke },
  }));
  const result = plan(['scripts/native-game-smoke.mjs'], {
    packages: [...packages, ...nativePackages],
  });
  assert.deepEqual(result.consumer_sources, ['apps/shell-minigame', 'apps/shell-bilibili']);
  assert.deepEqual(result.browser_ids, []);
  const { runIncrementalToolChecks } = await import('./validate-tree.mjs');
  const calls = [];
  runIncrementalToolChecks({
    plan: result,
    packages: [...nativePackages, nativeEvidenceProducer],
    root: '/snapshot',
    env: {},
    execute: (...args) => calls.push(args),
  });
  assert.deepEqual(
    calls.map((call) => call[1]),
    [
      ['--filter', '@coffeeeeffoc/game-building-power', 'test:rules'],
      ['--filter', 'shell-minigame', 'test'],
      ['--filter', 'shell-minigame', 'smoke'],
      ['--filter', 'shell-bilibili', 'test'],
      ['--filter', 'shell-bilibili', 'smoke'],
    ],
  );
  assert.throws(() => plan(['scripts/native-game-smoke.mjs']), /Unreviewed native tool consumer/);
  assert.throws(() => plan(['scripts/new-game-smoke.mjs']), /scope undefined/);
  for (const evidencePackages of [
    nativePackages,
    [...nativePackages, { ...nativeEvidenceProducer, scripts: { 'test:rules': 'vitest run' } }],
    [...nativePackages, { ...nativeEvidenceProducer, name: 'unreviewed-producer' }],
  ]) {
    const rejectedCalls = [];
    assert.throws(
      () =>
        runIncrementalToolChecks({
          plan: result,
          packages: evidencePackages,
          root: '/snapshot',
          env: {},
          execute: (...args) => rejectedCalls.push(args),
        }),
      /Unreviewed native replay evidence producer/,
    );
    assert.deepEqual(rejectedCalls, []);
  }
  const failedCalls = [];
  assert.throws(
    () =>
      runIncrementalToolChecks({
        plan: result,
        packages: [...nativePackages, nativeEvidenceProducer],
        root: '/snapshot',
        env: {},
        execute: (...args) => {
          failedCalls.push(args);
          throw new Error('Rule witness generation failed');
        },
      }),
    /Rule witness generation failed/,
  );
  assert.deepEqual(
    failedCalls.map((call) => call[1]),
    [['--filter', '@coffeeeeffoc/game-building-power', 'test:rules']],
  );
});

const devModeFile = 'scripts/test-game-dev-mode.mjs';
const devGames = [
  'ink-is-everything',
  'ball-roguelite',
  'xiangqi-five',
  'letters-words2',
  'wulong-city',
  'orbit-atelier',
].map((id) => ({ id, source: `games/local/${id}` }));
const devSource = (ids, updated = false) => `const shared = 1;
        if (
${ids.map((id) => `          game.id === '${id}'`).join(' ||\n')}
        ) {
          await expect(page.locator('.standalone-page')).toHaveAttribute('data-immersive', 'true');
          await expect(page.getByRole('button', { name: '返回目录', exact: true })).${updated ? 'toHaveCount(1)' : 'toBeVisible()'};
          await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);
        } else {
          sharedCheck();
        }
  await page.goto(\`\${origin}/independent/wulong-city/?dev\`);
${updated ? "  await page.locator('#start-game').tap();\n" : ''}  await sharedMobileChecks();
`;
test('developer-mode game guards select every old/new assertion consumer and retain navigation samples', async () => {
  const context = {
    changedPaths: [devModeFile],
    games: devGames,
    readBase: () => devSource(devGames.slice(0, 3).map((game) => game.id)),
    readHead: () =>
      devSource(
        devGames.map((game) => game.id),
        true,
      ),
  };
  const fileScopes = developerModeFileScopes(context);
  assert.deepEqual(
    fileScopes.get(devModeFile),
    devGames.map((game) => game.source),
  );
  const result = plan([devModeFile], { games: devGames, fileScopes });
  assert.deepEqual(result.browser_ids, devGames.map((game) => game.id).sort());
  assert.deepEqual(result.developer_mode_ids, result.browser_ids);
  assert.deepEqual(result.consumer_sources, ['apps/shell-web']);
  const calls = [];
  const { runIncrementalToolChecks } = await import('./validate-tree.mjs');
  runIncrementalToolChecks({
    plan: result,
    packages,
    root: '/snapshot',
    env: { KEEP: 'yes' },
    execute: (...args) => calls.push(args),
  });
  assert.deepEqual(calls[0][1], [devModeFile]);
  assert.equal(calls[0][3].DEV_MODE_GAME_IDS, result.developer_mode_ids.join(','));
  assert.equal(calls[0][3].KEEP, 'yes');
  for (const readHead of [
    () =>
      devSource(
        devGames.map((game) => game.id),
        true,
      ).replace('const shared = 1;', 'const shared = 2;'),
    () =>
      devSource(
        devGames.map((game) => game.id),
        true,
      ).replace('toHaveCount(1)', 'toHaveCount(0)'),
    () => devSource(['unknown-game'], true),
    () =>
      devSource(
        devGames.slice(1).map((game) => game.id),
        true,
      ),
    () =>
      devSource(
        devGames.toReversed().map((game) => game.id),
        true,
      ),
    () => devSource([...devGames.map((game) => game.id), devGames[0].id], true),
    () =>
      devSource(
        devGames.map((game) => game.id),
        true,
      ).replaceAll('\n', '\r\n'),
    () =>
      devSource(
        devGames.map((game) => game.id),
        true,
      ).replace("game.id === 'wulong-city'", 'globalEnabled()'),
  ]) {
    const rejected = developerModeFileScopes({ ...context, readHead });
    assert.equal(rejected.has(devModeFile), false);
    assert.throws(
      () => plan([devModeFile], { games: devGames, fileScopes: rejected }),
      /scope undefined/,
    );
  }
});

function nativeWiringFixture() {
  const shell = 'apps/shell-minigame/package.json';
  const game = 'games/local/a/package.json';
  const lock = 'pnpm-lock.yaml';
  const manifest = {
    name: 'native-shell',
    scripts: { build: 'build' },
    dependencies: { engine: 'workspace:*' },
  };
  const gameManifest = {
    name: 'a',
    coffeeeeffoc: { role: 'game' },
    devDependencies: { test: '1' },
  };
  const before = {
    [shell]: JSON.stringify(manifest),
    [game]: JSON.stringify(gameManifest),
    [lock]:
      "---\nlockfileVersion: '9.0'\nimporters:\n  .: {}\n---\nlockfileVersion: '9.0'\n\nimporters:\n\n  apps/shell-minigame:\n    dependencies:\n      engine:\n        specifier: workspace:*\n        version: link:../../packages/engine\n\n  games/local/a:\n    devDependencies:\n      test:\n        specifier: 1\n        version: 1\n\npackages:\n  test@1: {integrity: ORIGINAL}\n\nsnapshots:\n  test@1: {}\n",
  };
  const after = {
    [shell]: JSON.stringify({
      ...manifest,
      dependencies: { ...manifest.dependencies, a: 'workspace:*' },
    }),
    [game]: JSON.stringify({
      ...gameManifest,
      exports: { './canvas': './native/canvas.js' },
      dependencies: { '@coffeeeeffoc/game-contract': 'workspace:*' },
    }),
    [lock]: before[lock]
      .replace(
        '      engine:',
        '      a:\n        specifier: workspace:*\n        version: link:../../games/local/a\n      engine:',
      )
      .replace(
        '  games/local/a:\n',
        "  games/local/a:\n    dependencies:\n      '@coffeeeeffoc/game-contract':\n        specifier: workspace:*\n        version: link:../../../packages/game-contract\n",
      ),
  };
  const read = (files) => (file) => {
    assert(Object.hasOwn(files, file));
    return files[file];
  };
  return {
    before,
    after,
    shell,
    game,
    lock,
    read,
    context: {
      changedPaths: Object.keys(after),
      games,
      packages: [
        ...packages,
        { name: '@coffeeeeffoc/game-contract', dir: 'packages/game-contract' },
      ],
      readBase: read(before),
      readHead: read(after),
    },
  };
}
test('existing-game native wiring proves both new workspace links and all remaining lock bytes', () => {
  const fixture = nativeWiringFixture();
  const fileScopes = nativeWorkspaceFileScopes(fixture.context);
  assert.deepEqual(fileScopes.get(fixture.lock), ['games/local/a']);
  assert.deepEqual(plan([fixture.lock], { fileScopes }).browser_ids, ['a']);
  const crlf = nativeWorkspaceFileScopes({
    ...fixture.context,
    readHead: (file) => fixture.after[file].replaceAll('\n', '\r\n'),
  });
  assert.deepEqual(crlf.get(fixture.lock), ['games/local/a']);
});
test('unproven lock/manifests fail closed: no external updates, extra resolutions, mismatched links or missing baseline', () => {
  const fixture = nativeWiringFixture();
  const mutateJson = (file, mutate) => ({
    ...fixture.after,
    [file]: JSON.stringify(mutate(JSON.parse(fixture.after[file]))),
  });
  const candidates = [
    {
      ...fixture.after,
      [fixture.lock]: fixture.after[fixture.lock].replace('ORIGINAL', 'UPDATED'),
    },
    {
      ...fixture.after,
      [fixture.lock]: fixture.after[fixture.lock].replace(
        'link:../../games/local/a',
        'link:../../games/local/b',
      ),
    },
    { ...fixture.after, [fixture.lock]: fixture.after[fixture.lock] + '\nunknown: true\n' },
    {
      ...fixture.after,
      [fixture.lock]: fixture.after[fixture.lock].replace(
        '  apps/shell-minigame:',
        '  apps/shell-minigame: {}\n\n  apps/shell-minigame:',
      ),
    },
    mutateJson(fixture.shell, (value) => ({ ...value, version: 'changed' })),
    mutateJson(fixture.shell, (value) => ({
      ...value,
      dependencies: { ...value.dependencies, a: '^1.0.0' },
    })),
    mutateJson(fixture.game, (value) => ({ ...value, exports: { './canvas': './other.js' } })),
    mutateJson(fixture.game, (value) => ({
      ...value,
      dependencies: { ...value.dependencies, unproven: 'workspace:*' },
    })),
    mutateJson(fixture.game, (value) => ({ ...value, devDependencies: { test: '2' } })),
  ];
  for (const candidate of candidates) {
    const fileScopes = nativeWorkspaceFileScopes({
      ...fixture.context,
      readHead: fixture.read(candidate),
    });
    assert.equal(fileScopes.has(fixture.lock), false);
    assert.throws(() => plan([fixture.lock], { fileScopes }), /scope undefined/);
  }
  assert.equal(
    nativeWorkspaceFileScopes({
      ...fixture.context,
      readBase: (file) => {
        assert(file !== fixture.game);
        return fixture.before[file];
      },
    }).has(fixture.lock),
    false,
  );
  assert.equal(
    nativeWorkspaceFileScopes({ ...fixture.context, changedPaths: [fixture.lock] }).has(
      fixture.lock,
    ),
    false,
  );
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

test('scoped platform consumers traverse actual intermediate package dependencies and exclude unrelated games', async () => {
  const { affectedPackages } = await import('./validation-plan.mjs');
  const graph = [
    { name: 'platform', dir: 'platforms/alipay' },
    { name: 'middle', dir: 'packages/middle', dependencies: { platform: 'workspace:*' } },
    { name: 'host', dir: 'apps/shell-minigame', dependencies: { middle: 'workspace:*' } },
    { name: 'unrelated', dir: 'games/local/unrelated' },
  ];
  const selected = plan(['pnpm-lock.yaml'], {
    packages: graph,
    games: [],
    fileScopes: new Map([['pnpm-lock.yaml', ['platforms/alipay']]]),
  });
  assert.deepEqual(selected.consumer_sources, ['platforms/alipay']);
  assert.deepEqual(
    affectedPackages(
      graph,
      selected.consumer_sources.map((dir) => dir + '/package.json'),
    ).map((pkg) => pkg.name),
    ['platform', 'middle', 'host'],
  );
  assert.deepEqual(selected.game_sources, []);
  assert.throws(
    () =>
      plan(['pnpm-lock.yaml', 'platforms/competition/unknown.js'], {
        packages: graph,
        games: [],
        fileScopes: new Map([['pnpm-lock.yaml', ['platforms/alipay']]]),
      }),
    /scope undefined.*unknown/,
  );
});

test('first-nine classifier tooling recognizes only exact source/test files; adjacent names remain unknown', () => {
  for (const file of [
    'scripts/nine-native-scope.mjs',
    'scripts/nine-native-scope.test.mjs',
    'scripts/nine-lock-scope.mjs',
    'scripts/nine-lock-scope.test.mjs',
  ]) {
    assert.equal(plan([file]).validation_tools, true);
  }
  for (const file of [
    'scripts/nine-native-scope.extra.mjs',
    'scripts/nine-lock-scope-new.mjs',
    'scripts/nine-native-scope.test.other.mjs',
  ]) {
    assert.throws(() => plan(['scripts/nine-native-scope.mjs', file]), /scope undefined/);
  }
});

test('actual native changes select channel builds without unrelated H5; H5-only does not select native', async () => {
  const { readFileSync } = await import('node:fs');
  const actual = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url)),
  );
  const pkgs = actual.map((game) => ({ dir: game.source }));
  pkgs.push(...['apps/shell-minigame', 'platforms/alipay'].map((dir) => ({ dir })));
  const run = (changedPaths) => incrementalPlan({ games: actual, packages: pkgs, changedPaths });
  const native = run(['games/local/travel-bund/native/input.ts']);
  assert.deepEqual(native.browser_ids, []);
  assert.equal(native.nine_native_targets.length, 5);
  assert(native.nine_native_travel_contract);
  const shared = run(['games/local/travel-bund/src/physics.ts']);
  assert.deepEqual(shared.browser_ids, ['travel-bund']);
  assert.equal(shared.nine_native_targets.length, 5);
  for (const file of ['src/main.tsx', 'src/styles.css', 'index.html']) {
    const h5 = run(['games/local/travel-bund/' + file]);
    assert.deepEqual(h5.nine_native_targets, []);
    assert.deepEqual(h5.browser_ids, ['travel-bund']);
  }
  const platform = run(['platforms/alipay/native-resources.mjs']);
  assert.deepEqual(platform.browser_ids, []);
  assert.equal(platform.nine_native_targets.length, 2);
  assert(platform.nine_native_targets.every((target) => target.platform === 'alipay'));
});

test('Word native bundle contract and native entry select native without H5', async () => {
  const { readFileSync } = await import('node:fs');
  const actual = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url)),
  );
  const pkgs = actual.map((game) => ({ dir: game.source }));
  for (const file of [
    'games/local/letters-words2/tests/native-bundle.test.mjs',
    'games/local/letters-words2/native.js',
  ]) {
    const result = incrementalPlan({ games: actual, packages: pkgs, changedPaths: [file] });
    assert.deepEqual(result.browser_ids, []);
    assert.equal(result.nine_native_targets.length, 5);
    assert(result.nine_native_targets.every((target) => target.game === 'letters-words2'));
  }
});

test('all five competition renderers select their actual H5 consumer and all five native channels', async () => {
  const { readFileSync } = await import('node:fs');
  const actual = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url)),
  );
  const pkgs = actual.map((game) => ({ dir: game.source }));
  const entries = [
    ['cops-robbers', 'src/competition-renderer.js'],
    ['cops-robbers-realtime', 'src/competition-renderer.js'],
    ['letters-words2', 'competition-renderer.js'],
    ['vibeJam-myself-history-guess', 'competition-renderer.js'],
    ['xiangqi-five', 'competition-renderer.js'],
  ];
  for (const [id, relative] of entries) {
    const game = actual.find((game) => game.id === id);
    const result = incrementalPlan({
      games: actual,
      packages: pkgs,
      changedPaths: [game.source + '/' + relative],
    });
    assert.deepEqual(result.browser_ids, [id]);
    assert.deepEqual(result.nine_native_targets.map((target) => target.platform).sort(), [
      'alipay',
      'bilibili',
      'douyin',
      'kuaishou',
      'wechat',
    ]);
    assert(result.nine_native_targets.every((target) => target.game === id));
  }
});

test('shared competition protocol modules select all actual H5 consumers and native dependencies', async () => {
  const { readFileSync } = await import('node:fs');
  const { nineNativeFileScopes } = await import('./nine-native-scope.mjs');
  const { workspacePackages } = await import('./validation-plan.mjs');
  const actual = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url)),
  );
  const pkgs = await workspacePackages(new URL('../', import.meta.url).pathname);
  const readSource = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const file of ['platforms/competition/client.js', 'platforms/competition/format.js']) {
    const context = {
      games: actual,
      packages: pkgs,
      changedPaths: [file],
      readBase: readSource,
      readHead: readSource,
    };
    const fileScopes = nineNativeFileScopes(context);
    const result = incrementalPlan({ ...context, fileScopes, readSource });
    assert.deepEqual(result.browser_ids, [
      ...(file.endsWith('client.js') ? ['carding-car'] : []),
      'cops-robbers',
      'cops-robbers-realtime',
      'letters-words2',
      'vibeJam-myself-history-guess',
      'xiangqi-five',
    ]);
    assert.equal(result.nine_native_targets.length, file.endsWith('client.js') ? 30 : 25);
    assert.equal(result.nine_native_blocked.length, file.endsWith('client.js') ? 1 : 0);
    for (const variant of [
      {
        readBase: () => {
          throw Error('missing');
        },
      },
      { readHead: () => readSource(file) + "\nimport './unknown-shared.js';" },
      { readHead: () => readSource(file) + '\nrequire(dynamicPath);' },
      { readHead: () => readSource(file) + "\nimport unknown from './unknown-shared.js';" },
    ])
      assert.equal(nineNativeFileScopes({ ...context, ...variant }).size, 0);
  }
});

test('developer helper follows actual sync producer copy list or fails closed instead of losing H5 checks', async () => {
  const { readFileSync } = await import('node:fs');
  const { nineNativeFileScopes } = await import('./nine-native-scope.mjs');
  const { workspacePackages } = await import('./validation-plan.mjs');
  const { devModeTargets } = await import('./sync-game-dev-mode.mjs');
  const root = new URL('../', import.meta.url).pathname;
  const actual = JSON.parse(
    readFileSync(new URL('../apps/shell-web/src/standalone-games.json', import.meta.url)),
  );
  const pkgs = await workspacePackages(root);
  const readSource = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const file = 'platforms/h5/dev-mode.js';
  const context = {
    games: actual,
    packages: pkgs,
    changedPaths: [file],
    readBase: readSource,
    readHead: readSource,
  };
  const fileScopes = nineNativeFileScopes(context);
  const expected = (await devModeTargets(root)).map((target) => target.source);
  assert.deepEqual(fileScopes.get(file)?.sort(), expected.sort());
  const result = incrementalPlan({ ...context, fileScopes, readSource });
  assert.deepEqual(result.browser_ids, actual.map((game) => game.id).sort());
  assert.equal(result.nine_native_targets.length, 10);
  assert.equal(result.nine_native_blocked.length, 2);
  const missing = nineNativeFileScopes({
    ...context,
    readHead: (path) => {
      if (path.endsWith('/index.html')) throw Error('missing references');
      return readSource(path);
    },
  });
  assert.equal(missing.size, 0);
  assert.throws(() => incrementalPlan({ ...context, fileScopes: missing }), /scope undefined/);
});
