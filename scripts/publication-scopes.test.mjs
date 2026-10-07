import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reviewedSharedFileScopes,
  competitionConsumers,
  competitionToolPlan,
} from './publication-scopes.mjs';
import { incrementalPlan, developerModeFileScopes } from './incremental-validation.mjs';
import { executeCompetitionChecks } from './run-selected-competition.mjs';

const games = Object.entries(competitionConsumers).map(([id, source]) => ({ id, source }));
const registry =
  'export const competitionGames = ' +
  JSON.stringify(
    Object.fromEntries(
      games.map(({ id, source }) => [
        id,
        { directory: source, renderer: 'renderer.js', title: id },
      ]),
    ),
    null,
    2,
  ) +
  ';';
const packages = [
  ...games.map(({ id, source }) => ({ name: id, dir: source })),
  ...[
    'apps/shell-web',
    'services/runtime-api',
    'apps/shell-minigame',
    'platforms/wechat',
    'platforms/bilibili',
    'platforms/douyin',
    'platforms/kuaishou',
  ].map((dir) => ({ name: dir, dir })),
];
function classify(file, before, after, more = {}) {
  return reviewedSharedFileScopes({
    changedPaths: [file],
    games,
    readBase: () => before,
    readHead: (name) => (name === file ? after : (more[name] ?? registry)),
  });
}
function plan(paths, fileScopes) {
  return incrementalPlan({
    changedPaths: paths,
    packages,
    games,
    fileScopes,
    readSource: () => '',
  });
}

test('CI timeout growth is a bounded configuration change; commands, conditions and reduced budgets block', () => {
  const file = '.github/workflows/ci.yml';
  const before =
    'jobs:\n  quality:\n    timeout-minutes: 20\n    steps:\n      - run: pnpm check:games\n';
  const after = before.replace('20', '40');
  const scopes = classify(file, before, after);
  assert.deepEqual(scopes.get(file), []);
  assert.equal(plan([file], scopes).competition.config_tests, true);
  assert.equal(plan([file], scopes).validation_tools, true);
  for (const bad of [
    after.replace('check:games', 'echo skipped'),
    after.replace('40', '19'),
    after.replace('40', '361'),
    after + '    if: false\n',
    after + '    timeout-minutes: 50\n',
  ]) {
    const rejected = classify(file, before, bad);
    assert.equal(rejected.has(file), false);
    assert.throws(() => plan([file], rejected), /scope undefined/);
  }
});

test('only additive local machine configuration ignores are accepted; source exclusions and negations block', () => {
  const file = '.gitignore',
    before = 'node_modules/\ndist/\n';
  const allowed = classify(
    file,
    before,
    before + '# local\n.codex/config.toml\n.mcp.json.backup.*\n',
  );
  assert.deepEqual(allowed.get(file), []);
  assert.equal(plan([file], allowed).validation_tools, true);
  for (const after of [
    before + 'games/\n',
    before + '!dist/\n',
    'dist/\nnode_modules/\n.codex/config.toml\n',
    before + '.codex/config.toml\n.codex/config.toml\n',
    'node_modules/\n.codex/config.toml\n',
  ])
    assert.equal(classify(file, before, after).has(file), false);
});

test('format exclusions must point to registered byte-identical fullscreen copies with checked sync entries', () => {
  const file = '.prettierignore',
    before = 'node_modules/\n';
  const copy = games[0].source + '/public/fullscreen.js';
  const extra = {
    [copy]: 'canonical',
    'platforms/h5/fullscreen.js': 'canonical',
    'scripts/sync-h5-fullscreen.mjs': `const copies = ['${copy}'];`,
  };
  assert.deepEqual(classify(file, before, before + copy + '\n', extra).get(file), [
    games[0].source,
  ]);
  for (const [after, more] of [
    [before + copy + '\n', { ...extra, [copy]: 'modified' }],
    [before + copy + '\n', { ...extra, 'scripts/sync-h5-fullscreen.mjs': '' }],
    [before + 'games/local/unknown/public/fullscreen.js\n', extra],
    [before + games[0].source + '/src/app.js\n', extra],
  ])
    assert.equal(classify(file, before, after, more).has(file), false);
});

test('competition shared paths select exactly five registry consumers, while letter tests select one game', () => {
  for (const file of [
    'platforms/competition/h5.js',
    'platforms/competition/native.js',
    'scripts/competition-build.mjs',
    'scripts/competition-native-smoke.mjs',
    'scripts/test-competition-dialogs.mjs',
  ]) {
    const scopes = classify(
      file,
      '',
      file === 'scripts/competition-build.mjs' ? registry : 'new implementation',
    );
    assert.deepEqual(scopes.get(file), Object.values(competitionConsumers));
    const result = plan([file], scopes);
    // competition-build imports native.js only for native entries; the H5 branch
    // imports h5.js. Native contracts remain selected without H5 browser targets.
    assert.deepEqual(
      result.browser_ids,
      file === 'platforms/competition/native.js' ? [] : games.map((game) => game.id).sort(),
    );
    assert.equal(result.full, false);
    assert.equal(result.competition.letters, true);
    const native = [
      'platforms/competition/native.js',
      'scripts/competition-build.mjs',
      'scripts/competition-native-smoke.mjs',
    ].includes(file);
    assert.equal(result.competition.native, native);
    assert.equal(result.consumer_sources.includes('platforms/wechat'), native);
  }
  for (const file of [
    'scripts/letters-words2-competition-mobile.browser.mjs',
    'scripts/letters-words2-competition-renderer.test.mjs',
    'scripts/letters-words2-iframe.browser.mjs',
  ]) {
    const scopes = classify(file, '', 'new test');
    const result = plan([file], scopes);
    assert.deepEqual(result.browser_ids, ['letters-words2']);
    assert.equal(result.competition.letters, true);
    assert.equal(result.competition.native, false);
  }
  assert.throws(() => plan(['platforms/competition/new.js'], new Map()), /scope undefined/);
});

test('new or renamed competition consumers and missing native packages remain classification gaps', () => {
  const file = 'platforms/competition/h5.js';
  for (const altered of [
    registry.replace('"cops-robbers":', '"unknown":'),
    registry.replace('games/local/cops-robbers', 'games/local/unmapped'),
    registry.replace('"title":', '"other":'),
  ])
    assert.equal(
      classify(file, '', 'changed', { 'scripts/competition-build.mjs': altered }).has(file),
      false,
    );
  assert.throws(
    () =>
      competitionToolPlan({
        paths: ['platforms/competition/native.js'],
        games,
        packages: [],
        fileScopes: new Map([
          ['platforms/competition/native.js', Object.values(competitionConsumers)],
        ]),
      }),
    /Missing competition consumer/,
  );
});

test('shared dependency closure and explicit shared-runtime consumers are combined', () => {
  const file = 'platforms/competition/h5.js';
  const scopes = classify(file, '', 'changed');
  const result = incrementalPlan({
    changedPaths: [file, 'packages/shared/index.js'],
    fileScopes: scopes,
    games,
    packages: [...packages, { name: 'shared', dir: 'packages/shared' }],
    readSource: () => '',
  });
  assert.deepEqual(result.browser_ids, games.map((game) => game.id).sort());
});

test('competition runner builds each native game on all default platforms before its real smoke and propagates failures', async () => {
  const calls = [];
  await executeCompetitionChecks({
    plan: { h5: true, native: true, letters: true },
    env: { KEEP: 'yes', PLAYWRIGHT_EXECUTABLE_PATH: '/browser' },
    execute: async (args, env) => calls.push({ args, env }),
    serve: async () => ({
      url: 'http://fixture/',
      close: async () => calls.push({ closed: true }),
    }),
  });
  const ids = Object.keys(competitionConsumers);
  for (let i = 0; i < ids.length; i++) {
    assert.deepEqual(calls[i * 2].args, [
      'scripts/competition-build.mjs',
      '--native',
      `--game=${ids[i]}`,
    ]);
    assert.deepEqual(calls[i * 2 + 1].args, [
      'scripts/competition-native-smoke.mjs',
      `--game=${ids[i]}`,
    ]);
  }
  assert.deepEqual(
    calls.slice(10, 14).map((call) => call.args[0]),
    [
      'scripts/test-competition-dialogs.mjs',
      'scripts/letters-words2-competition-renderer.test.mjs',
      'scripts/letters-words2-competition-mobile.browser.mjs',
      'scripts/letters-words2-iframe.browser.mjs',
    ],
  );
  assert.equal(calls[13].env.GAME_URL, 'http://fixture/');
  assert.equal(calls[13].env.PLAYWRIGHT_EXECUTABLE, '/browser');
  assert.equal(calls[13].env.KEEP, 'yes');
  assert.equal(calls[14].closed, true);
  let closed = false;
  await assert.rejects(
    () =>
      executeCompetitionChecks({
        plan: { h5: false, native: false, letters: true },
        execute: async (args) => {
          if (args[0].includes('iframe')) throw new Error('real assertion failed');
        },
        serve: async () => ({
          url: 'http://fixture/',
          close: async () => {
            closed = true;
          },
        }),
      }),
    /real assertion failed/,
  );
  assert.equal(closed, true);
  let count = 0;
  await assert.rejects(
    () =>
      executeCompetitionChecks({
        plan: { h5: false, native: true, letters: false },
        execute: async () => {
          count++;
          throw new Error('build failed');
        },
      }),
    /build failed/,
  );
  assert.equal(count, 1);
});

test('developer-mode exact legacy-to-immersive migration selects new guarded entries without accepting shared edits', () => {
  const file = 'scripts/test-game-dev-mode.mjs';
  const link = `        assert.equal(\n          await page.getByRole('link', { name: '独立打开' }).getAttribute('href'),\n          await page.locator('iframe').getAttribute('src'),\n        );`;
  const suffix = '\n  await page.goto(`${origin}/independent/wulong-city/?dev`);\n';
  const before = 'const shared = 1;\n' + link + suffix;
  const after = `const shared = 1;\n        if (\n          game.id === 'letters-words2' ||\n          game.id === 'xiangqi-five'\n        ) {\n          await expect(page.locator('.standalone-page')).toHaveAttribute('data-immersive', 'true');\n          await expect(page.getByRole('button', { name: '返回目录', exact: true })).toHaveCount(1);\n          await expect(page.getByRole('link', { name: '独立打开' })).toHaveCount(0);\n        } else {\n${link
    .split('\n')
    .map((line) => '  ' + line)
    .join('\n')}\n        }${suffix}  await page.locator('#start-game').tap();\n`;
  const allGames = [...games, { id: 'wulong-city', source: 'games/local/wulong-city' }];
  const context = {
    changedPaths: [file],
    readBase: () => before,
    readHead: () => after,
    games: allGames,
  };
  assert.deepEqual(
    developerModeFileScopes(context).get(file),
    allGames
      .filter((game) => ['letters-words2', 'xiangqi-five', 'wulong-city'].includes(game.id))
      .map((game) => game.source),
  );
  for (const changed of [
    after.replace('shared = 1', 'shared = 2'),
    after.replace('toHaveCount(1)', 'toHaveCount(0)'),
    after.replace("getAttribute('src')", "getAttribute('wrong')"),
  ])
    assert.equal(developerModeFileScopes({ ...context, readHead: () => changed }).has(file), false);
});

test('planning checkout scope accepts only both exact reviewed producer byte changes', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const base = '9180c805c77c15634f47f0aeee1092a5b1043a73';
  const anchor =
    '      - uses: actions/checkout@v5\n        with:\n          fetch-depth: 0\n      - uses: actions/setup-node@v6\n';
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/pages.yml']) {
    const before = execFileSync('git', ['show', `${base}:${file}`], {
      cwd: root,
      encoding: 'utf8',
    });
    const after = before.replace(
      anchor,
      anchor.replace(
        '          fetch-depth: 0\n',
        '          fetch-depth: 0\n          submodules: recursive\n',
      ),
    );
    const scopes = classify(file, before, after);
    assert.deepEqual(scopes.get(file), []);
    assert.equal(plan([file], scopes).validation_tools, true);
    assert.deepEqual(plan([file], scopes).nine_native_targets, []);
    for (const bad of [
      after + '\n',
      after.replace('recursive', 'false'),
      after.replace('fetch-depth: 0', 'fetch-depth: 1'),
      after + '\npermissions:\n  contents: write\n',
      after.replace('node-version: 24.21.0', 'node-version: 22'),
    ]) {
      assert.equal(classify(file, before, bad).has(file), false);
    }
    assert.equal(classify(file, before + '\n', after).has(file), false);
    assert.equal(classify(file, after, before).has(file), false);
  }
});
